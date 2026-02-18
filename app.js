/* Living Dex — Pokéball Dex (no build tools, works on GitHub Pages)
   Data: PokéAPI
*/

const POKEAPI = "https://pokeapi.co/api/v2";
const TOTAL = 1025;

const els = {
  intro: document.getElementById("intro"),
  introBar: document.getElementById("introBar"),
  introHint: document.getElementById("introHint"),
  progressText: document.getElementById("progressText"),

  toggleViewBtn: document.getElementById("toggleViewBtn"),
  carouselView: document.getElementById("carouselView"),
  listView: document.getElementById("listView"),

  searchInput: document.getElementById("searchInput"),
  segBtns: Array.from(document.querySelectorAll(".seg__btn")),

  carousel: document.getElementById("carousel"),
  track: document.getElementById("track"),
  jumpLeft: document.getElementById("jumpLeft"),
  jumpRight: document.getElementById("jumpRight"),

  dexName: document.getElementById("dexName"),
  dexMeta: document.getElementById("dexMeta"),
  sprite: document.getElementById("sprite"),
  types: document.getElementById("types"),
  genus: document.getElementById("genus"),
  flavor: document.getElementById("flavor"),
  caughtBadge: document.getElementById("caughtBadge"),
  catchBtn: document.getElementById("catchBtn"),
  catchBtnText: document.getElementById("catchBtnText"),

  gameBtns: document.getElementById("gameBtns"),
  encHeader: document.getElementById("encHeader"),
  encList: document.getElementById("encList"),

  listGrid: document.getElementById("listGrid"),
};

const LS_KEY = "LivingDex:caught:v1";

function loadCaught(){
  try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveCaught(set){
  localStorage.setItem(LS_KEY, JSON.stringify(Array.from(set)));
}
let caught = loadCaught();

let dexIndex = []; // [{id, name}]
let currentIndex = 0;
let filterMode = "all";
let viewMode = "carousel"; // carousel | list

// Caches (avoid re-fetch)
const cachePokemon = new Map();   // id -> pokemon json
const cacheSpecies = new Map();   // id -> species json
const cacheEnc = new Map();       // id -> encounter json

// ----- Audio (no external files) -----
let audioCtx = null;
function beep({freq=440, dur=0.08, type="sine", gain=0.06}={}){
  try{
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }catch{}
}
function catchSfx(){
  beep({freq: 740, dur: 0.06, type:"square", gain:0.05});
  setTimeout(()=>beep({freq: 540, dur: 0.07, type:"square", gain:0.05}), 60);
  setTimeout(()=>beep({freq: 920, dur: 0.06, type:"triangle", gain:0.05}), 130);
}

// ----- Helpers -----
const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
const pad3 = (n)=>String(n).padStart(4,"0");
const cap = (s)=>s ? s.replace(/-/g," ") : s;

function setIntro(pct, hint){
  els.introBar.style.width = `${pct}%`;
  if(hint) els.introHint.textContent = hint;
}

function spriteUrlFromId(id){
  // PokeAPI official artwork sometimes missing; use sprite
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
}

async function fetchJson(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function getPokemon(id){
  if(cachePokemon.has(id)) return cachePokemon.get(id);
  const j = await fetchJson(`${POKEAPI}/pokemon/${id}`);
  cachePokemon.set(id, j);
  return j;
}
async function getSpecies(id){
  if(cacheSpecies.has(id)) return cacheSpecies.get(id);
  const j = await fetchJson(`${POKEAPI}/pokemon-species/${id}`);
  cacheSpecies.set(id, j);
  return j;
}
async function getEncounters(id){
  if(cacheEnc.has(id)) return cacheEnc.get(id);
  const j = await fetchJson(`${POKEAPI}/pokemon/${id}/encounters`);
  cacheEnc.set(id, j);
  return j;
}

function pickEnglishFlavor(species){
  const entries = species.flavor_text_entries || [];
  const en = entries.filter(e=>e.language?.name==="en");
  const pick = en[en.length-1] || entries[0];
  if(!pick) return "No flavor text found.";
  return (pick.flavor_text || "").replace(/\f/g," ").replace(/\s+/g," ").trim();
}
function pickEnglishGenus(species){
  const g = (species.genera||[]).find(x=>x.language?.name==="en");
  return g ? g.genus : "—";
}

function updateProgress(){
  const caughtCount = caught.size;
  els.progressText.textContent = `${caughtCount}/${TOTAL} caught • ${TOTAL-caughtCount} missing`;
}

// ----- UI: Carousel building -----
const CHIP_W = 86;
const GAP = 12;

function buildTrack(){
  els.track.innerHTML = "";
  const frag = document.createDocumentFragment();
  for(const p of dexIndex){
    const chip = document.createElement("div");
    chip.className = "pokeChip";
    chip.dataset.id = String(p.id);
    chip.dataset.name = p.name;

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = p.name;
    img.src = spriteUrlFromId(p.id);

    const num = document.createElement("div");
    num.className = "num";
    num.textContent = `#${pad3(p.id)}`;

    chip.appendChild(img);
    chip.appendChild(num);

    chip.addEventListener("click", ()=>{
      const idx = p.id - 1;
      goToIndex(idx, true);
    });

    frag.appendChild(chip);
  }
  els.track.appendChild(frag);
  paintCaughtMarks();
  updateCenterStyles();
}

function paintCaughtMarks(){
  const chips = els.track.querySelectorAll(".pokeChip");
  chips.forEach(ch=>{
    const id = Number(ch.dataset.id);
    ch.classList.toggle("is-caught", caught.has(id));
  });
}

let trackX = 0; // translateX
let isDragging = false;
let dragStartX = 0;
let trackStartX = 0;

function maxScrollX(){
  // track content width - carousel width
  const totalW = dexIndex.length * (CHIP_W + GAP) - GAP + 44; // rough padding
  const viewW = els.carousel.clientWidth;
  return Math.max(0, totalW - viewW);
}

function setTrackX(x){
  const maxX = maxScrollX();
  trackX = clamp(x, -maxX, 0);
  els.track.style.transform = `translateX(${trackX}px)`;
  updateCenterStyles();
  maybeUpdateSelectionFromCenter();
}

function centerX(){
  return els.carousel.getBoundingClientRect().left + els.carousel.clientWidth/2;
}

function chipCenterX(chip){
  const r = chip.getBoundingClientRect();
  return r.left + r.width/2;
}

function updateCenterStyles(){
  const chips = els.track.querySelectorAll(".pokeChip");
  const cx = centerX();
  let best = null;
  let bestDist = Infinity;

  chips.forEach(ch=>{
    const d = Math.abs(chipCenterX(ch) - cx);
    if(d < bestDist){ bestDist = d; best = ch; }
    ch.classList.toggle("is-center", d < 22);
  });

  if(best){
    const id = Number(best.dataset.id);
    currentIndex = id - 1;
  }
}

let lastSelectedId = null;
function maybeUpdateSelectionFromCenter(){
  const id = currentIndex + 1;
  if(id !== lastSelectedId){
    lastSelectedId = id;
    renderDex(id);
  }
}

function goToIndex(idx, animate=false){
  idx = clamp(idx, 0, dexIndex.length-1);
  const targetId = idx + 1;

  // compute where that chip should be so its center aligns with carousel center
  const cx = els.carousel.clientWidth/2;
  const leftPadding = 22; // from CSS padding (approx)
  const chipLeft = leftPadding + idx * (CHIP_W + GAP);
  const chipCenter = chipLeft + CHIP_W/2;
  const desiredX = cx - chipCenter;
  if(animate){
    animateTrackTo(desiredX);
  }else{
    setTrackX(desiredX);
  }
}

function animateTrackTo(x){
  const from = trackX;
  const to = clamp(x, -maxScrollX(), 0);
  const start = performance.now();
  const dur = 320;

  function ease(t){ return 1 - Math.pow(1-t,3); }
  function tick(now){
    const p = clamp((now-start)/dur, 0, 1);
    const v = from + (to-from)*ease(p);
    setTrackX(v);
    if(p<1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// Drag / wheel
els.carousel.addEventListener("pointerdown", (e)=>{
  isDragging = true;
  els.carousel.setPointerCapture(e.pointerId);
  dragStartX = e.clientX;
  trackStartX = trackX;
});
els.carousel.addEventListener("pointermove", (e)=>{
  if(!isDragging) return;
  const dx = e.clientX - dragStartX;
  setTrackX(trackStartX + dx);
});
els.carousel.addEventListener("pointerup", ()=>{
  isDragging = false;
  snapToNearest();
});
els.carousel.addEventListener("pointercancel", ()=>{
  isDragging = false;
  snapToNearest();
});
els.carousel.addEventListener("wheel", (e)=>{
  e.preventDefault();
  setTrackX(trackX - e.deltaY * 0.8 - e.deltaX * 0.8);
  wheelSnapDebounced();
},{passive:false});

let wheelTimer = null;
function wheelSnapDebounced(){
  if(wheelTimer) clearTimeout(wheelTimer);
  wheelTimer = setTimeout(()=>snapToNearest(), 140);
}

function snapToNearest(){
  // snap to currentIndex
  goToIndex(currentIndex, true);
}

els.jumpLeft.addEventListener("click", ()=> goToIndex(currentIndex - 1, true));
els.jumpRight.addEventListener("click", ()=> goToIndex(currentIndex + 1, true));

// ----- Dex render -----
function setCaughtUI(id){
  const is = caught.has(id);
  els.caughtBadge.classList.toggle("is-on", is);
  els.catchBtnText.textContent = is ? "RELEASE" : "CATCH";
}

function setTypes(types){
  els.types.innerHTML = "";
  for(const t of types){
    const pill = document.createElement("div");
    pill.className = "typePill";
    pill.textContent = t.type.name;
    els.types.appendChild(pill);
  }
}

function normalizeGameName(game){
  // make buttons look nicer
  return cap(game).replace(/\bversion\b/i,"").trim();
}

function buildEncounterUI(enc){
  // enc is array from /pokemon/{id}/encounters
  // group by version
  const byVersion = new Map();

  for(const loc of enc){
    const locName = loc.location_area?.name || "unknown-area";
    const vds = loc.version_details || [];
    for(const vd of vds){
      const v = vd.version?.name || "unknown";
      if(!byVersion.has(v)) byVersion.set(v, []);
      byVersion.get(v).push({
        area: locName,
        methods: vd.encounter_details?.map(ed=>ed.method?.name).filter(Boolean) || [],
        min: Math.min(...(vd.encounter_details||[]).map(ed=>ed.min_level).filter(n=>Number.isFinite(n)) ),
        max: Math.max(...(vd.encounter_details||[]).map(ed=>ed.max_level).filter(n=>Number.isFinite(n)) ),
        chance: Math.max(...(vd.encounter_details||[]).map(ed=>ed.chance).filter(n=>Number.isFinite(n)) ),
      });
    }
  }

  // buttons
  els.gameBtns.innerHTML = "";
  els.encList.innerHTML = "";
  els.encHeader.textContent = byVersion.size ? "Pick a game to see locations." : "No encounter location data found for this Pokémon.";

  const versions = Array.from(byVersion.keys()).sort((a,b)=>a.localeCompare(b));
  let active = versions[0] || null;

  function renderVersion(v){
    els.encList.innerHTML = "";
    const rows = byVersion.get(v) || [];
    els.encHeader.textContent = `${normalizeGameName(v)} • ${rows.length} location area(s)`;

    // unique by area
    const seen = new Set();
    const unique = [];
    for(const r of rows){
      if(seen.has(r.area)) continue;
      seen.add(r.area);
      unique.push(r);
    }

    unique.slice(0, 120).forEach(r=>{
      const row = document.createElement("div");
      row.className = "locRow";
      const name = document.createElement("div");
      name.className = "locName";
      name.textContent = cap(r.area);

      const meta = document.createElement("div");
      meta.className = "locMeta";
      const method = r.methods.length ? `Method: ${r.methods.map(cap).join(", ")}` : "Method: —";
      const lvl = (Number.isFinite(r.min) && Number.isFinite(r.max)) ? `Lv: ${r.min}-${r.max}` : "Lv: —";
      const chance = Number.isFinite(r.chance) ? `Chance: ${r.chance}%` : "Chance: —";
      meta.textContent = `${method} • ${lvl} • ${chance}`;

      row.appendChild(name);
      row.appendChild(meta);
      els.encList.appendChild(row);
    });

    if(unique.length > 120){
      const more = document.createElement("div");
      more.className = "small";
      more.style.padding = "6px 2px 0";
      more.textContent = `Showing 120 of ${unique.length} areas (to keep it fast).`;
      els.encList.appendChild(more);
    }
  }

  versions.forEach(v=>{
    const b = document.createElement("button");
    b.className = "gameBtn" + (v===active ? " is-on" : "");
    b.type = "button";
    b.textContent = normalizeGameName(v);
    b.addEventListener("click", ()=>{
      active = v;
      Array.from(els.gameBtns.children).forEach(x=>x.classList.remove("is-on"));
      b.classList.add("is-on");
      renderVersion(v);
    });
    els.gameBtns.appendChild(b);
  });

  if(active) renderVersion(active);
}

async function renderDex(id){
  try{
    // skeleton
    els.dexName.textContent = "Loading…";
    els.dexMeta.textContent = `#${pad3(id)}`;
    els.sprite.src = spriteUrlFromId(id);
    els.genus.textContent = "—";
    els.flavor.textContent = "—";
    els.types.innerHTML = "";
    els.gameBtns.innerHTML = "";
    els.encList.innerHTML = "";
    els.encHeader.textContent = "Loading encounter data…";

    setCaughtUI(id);

    const [p, s] = await Promise.all([getPokemon(id), getSpecies(id)]);
    els.dexName.textContent = p.name;
    els.dexMeta.textContent = `#${pad3(id)} • ${cap(s.generation?.name || "unknown gen")}`;
    setTypes(p.types || []);
    els.genus.textContent = pickEnglishGenus(s);
    els.flavor.textContent = pickEnglishFlavor(s);

    // encounters are heavy; fetch after main info
    const enc = await getEncounters(id);
    buildEncounterUI(enc);

    // update caught marker on chip
    paintCaughtMarks();
  }catch(e){
    els.flavor.textContent = `Error loading data. (${String(e)})`;
    els.encHeader.textContent = "Could not load encounter data.";
  }
}

// ----- Catch toggling -----
els.catchBtn.addEventListener("click", ()=>{
  const id = currentIndex + 1;
  if(caught.has(id)){
    caught.delete(id);
    beep({freq: 240, dur: 0.08, type:"sine", gain:0.05});
  }else{
    caught.add(id);
    catchSfx();
  }
  saveCaught(caught);
  setCaughtUI(id);
  paintCaughtMarks();
  updateProgress();
  rebuildList(); // keep list view updated
});

// ----- List view -----
function rebuildList(){
  els.listGrid.innerHTML = "";
  const q = (els.searchInput.value || "").trim().toLowerCase();

  const items = dexIndex.filter(p=>{
    const isCaught = caught.has(p.id);
    if(filterMode==="caught" && !isCaught) return false;
    if(filterMode==="missing" && isCaught) return false;
    if(!q) return true;
    if(String(p.id)===q) return true;
    return p.name.includes(q);
  });

  const frag = document.createDocumentFragment();
  for(const p of items){
    const row = document.createElement("div");
    row.className = "listItem" + (caught.has(p.id) ? " is-caught" : "");
    row.dataset.id = String(p.id);

    const img = document.createElement("img");
    img.loading="lazy";
    img.src = spriteUrlFromId(p.id);
    img.alt = p.name;

    const t = document.createElement("div");
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = p.name;

    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = `#${pad3(p.id)} ${caught.has(p.id) ? "• caught" : "• missing"}`;

    t.appendChild(name);
    t.appendChild(sub);

    row.appendChild(img);
    row.appendChild(t);

    row.addEventListener("click", ()=>{
      // jump to carousel
      setView("carousel");
      goToIndex(p.id - 1, true);
      beep({freq: 520, dur: 0.05, type:"triangle", gain:0.04});
    });

    frag.appendChild(row);
  }

  els.listGrid.appendChild(frag);
}

// ----- Filters / search / view toggle -----
function setFilter(mode){
  filterMode = mode;
  els.segBtns.forEach(b=>b.classList.toggle("is-on", b.dataset.filter===mode));
  rebuildList();
}
els.segBtns.forEach(b=>{
  b.addEventListener("click", ()=>setFilter(b.dataset.filter));
});

els.searchInput.addEventListener("input", ()=>{
  // list reacts immediately; carousel can jump if exact id
  rebuildList();
  const q = (els.searchInput.value||"").trim().toLowerCase();
  const asNum = Number(q);
  if(Number.isFinite(asNum) && asNum>=1 && asNum<=TOTAL){
    goToIndex(asNum-1, true);
  }else{
    const hit = dexIndex.find(p=>p.name===q);
    if(hit) goToIndex(hit.id-1, true);
  }
});

function setView(mode){
  viewMode = mode;
  const isCarousel = mode==="carousel";
  els.carouselView.classList.toggle("view--on", isCarousel);
  els.listView.classList.toggle("view--on", !isCarousel);
  els.toggleViewBtn.textContent = isCarousel ? "List View" : "Carousel View";
}
els.toggleViewBtn.addEventListener("click", ()=>{
  setView(viewMode==="carousel" ? "list" : "carousel");
});

// ----- Boot -----
async function boot(){
  setIntro(6, "Connecting to PokéAPI…");
  updateProgress();

  // Fetch index list
  setIntro(18, "Loading Pokédex index (1025)…");
  const list = await fetchJson(`${POKEAPI}/pokemon?limit=${TOTAL}&offset=0`);
  dexIndex = (list.results || []).map((r, i)=>({ id: i+1, name: r.name }));

  setIntro(34, "Building carousel…");
  buildTrack();

  setIntro(52, "Building list view…");
  rebuildList();

  setIntro(66, "Centering #0001…");
  goToIndex(0, false);

  // Gentle boot sfx
  beep({freq: 330, dur: 0.06, type:"sine", gain:0.04});
  setTimeout(()=>beep({freq: 520, dur: 0.06, type:"sine", gain:0.04}), 70);

  setIntro(92, "Ready.");
  setTimeout(()=>{
    els.intro.classList.add("is-off");
    setTimeout(()=>els.intro.remove(), 650);
  }, 260);
}

boot().catch((e)=>{
  els.introHint.textContent = `Boot failed: ${String(e)}`;
});
