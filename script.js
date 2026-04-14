/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║         VISUAL AUTOMATA DESIGNER — script.js             ║
 * ╠══════════════════════════════════════════════════════════╣
 * ║  CUSTOMISATION GUIDE:                                    ║
 * ║  1. ALPHABET DEFAULTS  → search "§ ALPHABET"             ║
 * ║  2. EDGE GEOMETRY      → search "§ EDGE GEOMETRY"        ║
 * ║  3. SELF-LOOP GEOMETRY → search "§ SELF-LOOP GEOMETRY"   ║
 * ║  4. DFA LAYOUT         → search "§ DFA LAYOUT"           ║
 * ║  5. ANIMATION SPEEDS   → search "§ ANIMATION SPEEDS"     ║
 * ╚══════════════════════════════════════════════════════════╝
 */

// ════════════════════════════════════════════════════════════
// § ANIMATION SPEEDS  (milliseconds)
// Increase values for slower step-through, decrease for faster.
// ════════════════════════════════════════════════════════════
const SPEED = {
  intro:      600,
  stepExpand: 400,
  stepSymbol: 400,
  stepClosure:350,
  stepNew:    350,
  stepEntry:  250,
};

// ════════════════════════════════════════════════════════════
// § EDGE GEOMETRY
// R        : node radius in pixels (must match CSS node width/2)
// CURVE_OFF: how far bidirectional edges bow apart
// ════════════════════════════════════════════════════════════
const GEO = {
  R:         28,
  CURVE_OFF: 36,
};

// ════════════════════════════════════════════════════════════
// § SELF-LOOP GEOMETRY
// LOOP_DIST : how far the loop center sits from the node edge
// LOOP_TANG : tangent offset — controls loop width
// SPREAD    : degrees between adjacent loops on the same state
// ════════════════════════════════════════════════════════════
const LOOP = {
  LOOP_DIST: 28,
  LOOP_TANG: 10,
  SPREAD:    42,
};

// ════════════════════════════════════════════════════════════
// § ALPHABET  — default symbols shown on first load
// ════════════════════════════════════════════════════════════
let userAlphabet = ["a", "b"];

// ─────────────────────────────────────────────
//  ALPHABET EDITOR (sidebar)
// ─────────────────────────────────────────────
function renderAlphabetTags() {
  const container = document.getElementById("alphabet-tags");
  container.innerHTML = "";
  userAlphabet.forEach(sym => {
    const tag = document.createElement("span");
    tag.className = "alpha-tag" + (sym === "ε" ? " epsilon-tag" : "");
    tag.innerHTML = `${sym} <button class="alpha-tag-remove" data-sym="${sym}" title="Remove">×</button>`;
    tag.querySelector("button").addEventListener("click", () => {
      userAlphabet = userAlphabet.filter(s => s !== sym);
      renderAlphabetTags();
    });
    container.appendChild(tag);
  });
}

function addAlphabetSymbol(raw) {
  const sym = raw.trim().replace(/,/g, "");
  if (!sym || sym === "ε") return;
  if (userAlphabet.includes(sym)) return;
  userAlphabet.push(sym);
  renderAlphabetTags();
}

document.getElementById("btn-add-symbol").addEventListener("click", () => {
  const inp = document.getElementById("alphabet-input");
  addAlphabetSymbol(inp.value);
  inp.value = "";
  inp.focus();
});
document.getElementById("alphabet-input").addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    addAlphabetSymbol(e.target.value);
    e.target.value = "";
  }
});

// ─────────────────────────────────────────────
//  DATA MODEL
// ─────────────────────────────────────────────
const nfa = { states: [], start: null, final: [], transitions: [] };

let stateCounter     = 0;

// ─────────────────────────────────────────────
//  UNDO / REDO HISTORY
// ─────────────────────────────────────────────
const MAX_HISTORY = 50;
let undoStack = [];  // array of snapshots (oldest → newest)
let redoStack = [];  // array of snapshots for redo

function snapshotNFA() {
  return {
    states:      nfa.states.map(s => ({ ...s })),
    start:       nfa.start,
    final:       [...nfa.final],
    transitions: nfa.transitions.map(t => ({ ...t })),
    stateCounter,
  };
}

function pushHistory() {
  undoStack.push(snapshotNFA());
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];   // new action clears redo
  refreshUndoRedoBtns();
}

function restoreSnapshot(snap) {
  nfa.states      = snap.states.map(s => ({ ...s }));
  nfa.start       = snap.start;
  nfa.final       = [...snap.final];
  nfa.transitions = snap.transitions.map(t => ({ ...t }));
  stateCounter    = snap.stateCounter;

  // Rebuild DOM nodes
  canvas.querySelectorAll(".state-node").forEach(el => el.remove());
  nfa.states.forEach(s => createStateElement(s));
  drawAllNFAEdges();
  updateNFADisplay();
  setInfo(`${nfa.states.length} state(s) | ${nfa.transitions.length} transition(s)`);
}

function undoAction() {
  if (!undoStack.length) return;
  redoStack.push(snapshotNFA());
  const snap = undoStack.pop();
  restoreSnapshot(snap);
  refreshUndoRedoBtns();
}

function redoAction() {
  if (!redoStack.length) return;
  undoStack.push(snapshotNFA());
  const snap = redoStack.pop();
  restoreSnapshot(snap);
  refreshUndoRedoBtns();
}

function refreshUndoRedoBtns() {
  const undoBtn = document.getElementById("btn-undo");
  const redoBtn = document.getElementById("btn-redo");
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}
let mode             = "idle";
let transitionSource = null;
let isDragging       = false;
let dragTarget       = null;
let dragOffsetX      = 0, dragOffsetY = 0;
let dragMoved        = false;
let dragStartMouseX  = 0, dragStartMouseY = 0;
let stepCounter      = 0;
let liveLineEl       = null;

// ─────────────────────────────────────────────
//  DOM REFS
// ─────────────────────────────────────────────
const canvas              = document.getElementById("canvas");
const svgLayer            = document.getElementById("svg-layer");
const modeLabelEl         = document.getElementById("canvas-mode-label");
const canvasInfoEl        = document.getElementById("canvas-info");
const nfaDataEl           = document.getElementById("nfa-data");
const logContainer        = document.getElementById("log-container");
const dfaTableContainer   = document.getElementById("dfa-table-container");
const cancelTransitionBtn = document.getElementById("btn-cancel-transition");
const dfaPane             = document.getElementById("dfa-pane");
const dfaCanvas           = document.getElementById("dfa-canvas");
const dfaSvgLayer         = document.getElementById("dfa-svg-layer");
const resizerMid          = document.getElementById("resizer-mid");

// ─────────────────────────────────────────────
//  SVG SETUP — one <defs> + one <g#edges-layer> per SVG
// ─────────────────────────────────────────────
function initSVG(svgEl, pfx) {
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = `
    <marker id="${pfx}arr"       markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="var(--edge-color)"/></marker>
    <marker id="${pfx}arr-start" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="var(--start-color)"/></marker>
    <marker id="${pfx}arr-live"  markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="var(--accent2)"/></marker>
    <marker id="${pfx}arr-dfa"   markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="var(--accent2)"/></marker>
  `;
  svgEl.appendChild(defs);
  const layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  layer.id = `${pfx}edges-layer`;
  svgEl.appendChild(layer);
}
initSVG(svgLayer,    "nfa-");
initSVG(dfaSvgLayer, "dfa-");

const getEdgesLayer  = pfx => document.getElementById(`${pfx}edges-layer`);
const clearEdgesLayer= pfx => { const el = getEdgesLayer(pfx); if (el) el.innerHTML = ""; };
const svgEl          = tag  => document.createElementNS("http://www.w3.org/2000/svg", tag);

// ─────────────────────────────────────────────
//  RUBBER-BAND LIVE LINE
// ─────────────────────────────────────────────
function showLiveLine(fromState) {
  removeLiveLine();
  liveLineEl = svgEl("line");
  liveLineEl.setAttribute("x1", fromState.x); liveLineEl.setAttribute("y1", fromState.y);
  liveLineEl.setAttribute("x2", fromState.x); liveLineEl.setAttribute("y2", fromState.y);
  liveLineEl.setAttribute("stroke", "var(--accent2)");
  liveLineEl.setAttribute("stroke-width", "2");
  liveLineEl.setAttribute("stroke-dasharray", "6 3");
  liveLineEl.setAttribute("marker-end", "url(#nfa-arr-live)");
  svgLayer.appendChild(liveLineEl);
}
function updateLiveLine(x, y) { if (liveLineEl) { liveLineEl.setAttribute("x2", x); liveLineEl.setAttribute("y2", y); } }
function removeLiveLine()      { if (liveLineEl) { liveLineEl.remove(); liveLineEl = null; } }

// ─────────────────────────────────────────────
//  MODE
// ─────────────────────────────────────────────
function setMode(m) {
  mode = m;
  modeLabelEl.textContent = {
    idle: "MODE: IDLE",
    settingStart: "MODE: CLICK STATE → SET AS START",
    settingFinal: "MODE: CLICK STATE → TOGGLE FINAL",
    addingTransitionFrom: "MODE: CLICK TARGET STATE  (canvas to cancel)",
    converting: "MODE: CONVERTING…"
  }[m] || "MODE: IDLE";

  cancelTransitionBtn.style.display = (m === "addingTransitionFrom") ? "flex" : "none";
  document.getElementById("btn-set-start").classList.toggle("active", m === "settingStart");
  document.getElementById("btn-set-final").classList.toggle("active",  m === "settingFinal");

  if (m !== "addingTransitionFrom") {
    removeLiveLine();
    canvas.removeEventListener("mousemove", onCanvasMouseMove);
    if (transitionSource) {
      const el = document.getElementById(`node-${transitionSource}`);
      if (el) el.classList.remove("selected");
      transitionSource = null;
    }
  }
}

// ─────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────
function updateNFADisplay() {
  nfaDataEl.textContent = JSON.stringify({
    states: nfa.states.map(s => s.id), start: nfa.start, final: nfa.final,
    transitions: nfa.transitions.map(t => ({ from: t.from, to: t.to, symbol: t.symbol }))
  }, null, 2);
}
const sleep        = ms  => new Promise(r => setTimeout(r, ms));
const getStateById = id  => nfa.states.find(s => s.id === id);
const setInfo      = txt => { canvasInfoEl.textContent = txt; };

// ─────────────────────────────────────────────
//  LOG
// ─────────────────────────────────────────────
function clearLog() { logContainer.innerHTML = ""; stepCounter = 0; }
function addLogStep(html, type = "normal") {
  const ph = logContainer.querySelector(".log-placeholder");
  if (ph) ph.remove();
  stepCounter++;
  const div = document.createElement("div");
  div.className = "log-step" + (type !== "normal" ? ` step-${type}` : "");
  div.innerHTML = `<span class="step-num">Step ${stepCounter}:</span> ${html}`;
  logContainer.appendChild(div);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// ─────────────────────────────────────────────
//  STATE NODES
// ─────────────────────────────────────────────
function createStateElement(state) {
  const el = document.createElement("div");
  el.className = "state-node"; el.id = `node-${state.id}`;
  el.textContent = state.id;
  el.style.left = state.x + "px"; el.style.top = state.y + "px";
  el.addEventListener("mousedown", onStateMouseDown);
  el.addEventListener("click",     onStateClick);
  el.addEventListener("dblclick",  onStateDoubleClick);
  canvas.appendChild(el);
  updateStateStyle(state.id);
}
function updateStateStyle(id) {
  const state = getStateById(id); if (!state) return;
  const el = document.getElementById(`node-${id}`); if (!el) return;
  el.classList.toggle("is-start", state.isStart);
  el.classList.toggle("is-final", state.isFinal);
}
function updateStatePosition(id) {
  const state = getStateById(id); if (!state) return;
  const el = document.getElementById(`node-${id}`); if (!el) return;
  el.style.left = state.x + "px"; el.style.top = state.y + "px";
}

// ─────────────────────────────────────────────
//  ADD STATE
// ─────────────────────────────────────────────
function addState() {
  pushHistory();
  const id = `q${stateCounter++}`;
  const rect = canvas.getBoundingClientRect();
  const x = Math.max(50, Math.min(rect.width  - 50, rect.width /2 + (Math.random()-.5)*200));
  const y = Math.max(50, Math.min(rect.height - 50, rect.height/2 + (Math.random()-.5)*150));
  const state = { id, x, y, isStart: false, isFinal: false };
  nfa.states.push(state);
  createStateElement(state);
  updateNFADisplay();
  setInfo(`${nfa.states.length} state(s) | ${nfa.transitions.length} transition(s)`);
}

// ─────────────────────────────────────────────
//  DRAG
// ─────────────────────────────────────────────
function onStateMouseDown(e) {
  if (e.button !== 0) return; e.stopPropagation();
  dragTarget = e.currentTarget; dragMoved = false;
  dragStartMouseX = e.clientX; dragStartMouseY = e.clientY;
  const id = dragTarget.id.replace("node-", ""), state = getStateById(id);
  const rect = canvas.getBoundingClientRect();
  dragOffsetX = e.clientX - rect.left - state.x;
  dragOffsetY = e.clientY - rect.top  - state.y;
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup",   onMouseUp);
}
function onMouseMove(e) {
  if (!dragTarget) return;
  if (!dragMoved && (Math.abs(e.clientX-dragStartMouseX)>4 || Math.abs(e.clientY-dragStartMouseY)>4)) {
    dragMoved = true; isDragging = true;
  }
  if (!dragMoved) return;
  const id = dragTarget.id.replace("node-", ""), state = getStateById(id);
  const rect = canvas.getBoundingClientRect();
  state.x = Math.max(40, Math.min(rect.width -40, e.clientX - rect.left - dragOffsetX));
  state.y = Math.max(40, Math.min(rect.height-40, e.clientY - rect.top  - dragOffsetY));
  updateStatePosition(id);
  drawAllNFAEdges();
  if (mode === "addingTransitionFrom" && transitionSource === id) showLiveLine(state);
}
function onMouseUp() {
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup",   onMouseUp);
  setTimeout(() => { isDragging = false; }, 10);
  dragTarget = null;
}

// ─────────────────────────────────────────────
//  DOUBLE-CLICK → START TRANSITION
// ─────────────────────────────────────────────
function onStateDoubleClick(e) {
  e.stopPropagation();
  if (isDragging) return;
  if (mode === "settingStart" || mode === "settingFinal" || mode === "converting") return;
  const id = e.currentTarget.id.replace("node-", "");
  if (mode === "addingTransitionFrom") setMode("idle");
  transitionSource = id;
  e.currentTarget.classList.add("selected");
  setMode("addingTransitionFrom");
  showLiveLine(getStateById(id));
  setInfo(`Drawing transition FROM ${id} — click the target state`);
  canvas.addEventListener("mousemove", onCanvasMouseMove);
}
function onCanvasMouseMove(e) {
  if (mode !== "addingTransitionFrom") { canvas.removeEventListener("mousemove", onCanvasMouseMove); return; }
  const rect = canvas.getBoundingClientRect();
  updateLiveLine(e.clientX - rect.left, e.clientY - rect.top);
}

// ─────────────────────────────────────────────
//  SINGLE-CLICK → mode actions
// ─────────────────────────────────────────────
function onStateClick(e) {
  e.stopPropagation();
  if (isDragging) return;
  const id = e.currentTarget.id.replace("node-", "");

  if (mode === "settingStart") {
    pushHistory();
    nfa.states.forEach(s => { s.isStart = false; updateStateStyle(s.id); });
    const state = getStateById(id);
    state.isStart = true; nfa.start = id;
    updateStateStyle(id); updateNFADisplay(); drawAllNFAEdges();
    setMode("idle"); setInfo(`Start state → ${id}`);
    return;
  }
  if (mode === "settingFinal") {
    pushHistory();
    const state = getStateById(id);
    state.isFinal = !state.isFinal;
    nfa.final = state.isFinal ? [...new Set([...nfa.final,id])] : nfa.final.filter(f=>f!==id);
    updateStateStyle(id); updateNFADisplay();
    setMode("idle"); setInfo(`${id} is ${state.isFinal?"now":"no longer"} a final state`);
    return;
  }
  if (mode === "addingTransitionFrom") {
    canvas.removeEventListener("mousemove", onCanvasMouseMove);
    removeLiveLine();
    const srcEl = document.getElementById(`node-${transitionSource}`);
    if (srcEl) srcEl.classList.remove("selected");
    const from = transitionSource;
    transitionSource = null; setMode("idle");
    showSymbolModal(from, id);
  }
}

// ─────────────────────────────────────────────
//  SYMBOL MODAL
//  – chips come from userAlphabet + ε
//  – typing a symbol NOT in the alphabet (or ε) shows an error
// ─────────────────────────────────────────────
function showSymbolModal(from, to) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const allSymbols = [...userAlphabet, "ε"];
  const chipsHTML  = allSymbols.map(sym =>
    `<span class="symbol-chip${sym==="ε"?" epsilon-chip":""}" data-sym="${sym}">${sym}</span>`
  ).join("");

  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">Add Transition</div>
      <div class="modal-subtitle">${from} &rarr; ${to} — click a chip or type a symbol</div>
      <div class="symbol-chips">${chipsHTML}</div>
      <input class="modal-input" id="symbol-input" maxlength="8"
             placeholder="click chip or type…" autofocus />
      <div class="modal-error" id="modal-error"></div>
      <div class="modal-actions">
        <button class="modal-btn" id="modal-cancel">Cancel</button>
        <button class="modal-btn confirm" id="modal-confirm">Add →</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input    = overlay.querySelector("#symbol-input");
  const errorEl  = overlay.querySelector("#modal-error");
  input.focus();

  // Chip click → fill input + highlight chip
  overlay.querySelectorAll(".symbol-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      input.value = chip.dataset.sym;
      errorEl.textContent = "";
      overlay.querySelectorAll(".symbol-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
    });
  });

  // Typing → remove chip highlight, clear error
  input.addEventListener("input", () => {
    errorEl.textContent = "";
    overlay.querySelectorAll(".symbol-chip").forEach(c => c.classList.remove("active"));
    const v = input.value.trim();
    const match = overlay.querySelector(`.symbol-chip[data-sym="${v}"]`);
    if (match) match.classList.add("active");
  });

  function confirm() {
    const sym = input.value.trim();
    if (!sym) { input.focus(); return; }

    // ── Alphabet enforcement ──
    // Allow only symbols that are in userAlphabet OR ε
    if (sym !== "ε" && !userAlphabet.includes(sym)) {
      errorEl.textContent = `"${sym}" is not in your alphabet. Add it in the ALPHABET section first, or use ε.`;
      input.select();
      return;
    }

    document.body.removeChild(overlay);
    pushHistory();
    nfa.transitions.push({ from, to, symbol: sym });
    drawAllNFAEdges();
    updateNFADisplay();
    setInfo(`${nfa.states.length} state(s) | ${nfa.transitions.length} transition(s)`);
  }
  function cancel() { document.body.removeChild(overlay); setInfo(""); }

  overlay.querySelector("#modal-confirm").addEventListener("click", confirm);
  overlay.querySelector("#modal-cancel").addEventListener("click", cancel);
  input.addEventListener("keydown", e => { if (e.key==="Enter") confirm(); if (e.key==="Escape") cancel(); });
}

// ─────────────────────────────────────────────
//  NFA EDGE DRAWING
//
//  Core fix for double-arrow bug:
//  Instead of drawing one path per transition (which causes two
//  separate curved paths when A→B and B→A both exist), we first
//  GROUP all transitions by their unordered state pair.
//  For each pair, all symbols going the same direction share ONE
//  path. Bidirectional pairs each get their own curved arc.
//  Result: exactly ONE path per direction per state pair.
// ─────────────────────────────────────────────
function drawAllNFAEdges() {
  clearEdgesLayer("nfa-");
  const layer = getEdgesLayer("nfa-");

  // Start arrow
  if (nfa.start) {
    const s = getStateById(nfa.start);
    if (s) layer.appendChild(makeStartArrow(s, "nfa-"));
  }

  // ── Separate self-loops from inter-state transitions ──
  const selfLoopMap   = {};  // stateId → [sym, ...]
  const pairMap       = {};  // "A→B"   → [sym, ...]   (directed)

  nfa.transitions.forEach(t => {
    if (!getStateById(t.from) || !getStateById(t.to)) return;
    if (t.from === t.to) {
      if (!selfLoopMap[t.from]) selfLoopMap[t.from] = [];
      selfLoopMap[t.from].push(t.symbol);
    } else {
      const key = `${t.from}→${t.to}`;
      if (!pairMap[key]) pairMap[key] = [];
      pairMap[key].push(t.symbol);
    }
  });

  // Self-loops
  Object.entries(selfLoopMap).forEach(([id, syms]) => {
    const state = getStateById(id); if (!state) return;
    syms.forEach((sym, idx) => layer.appendChild(makeSelfLoop(state, sym, idx, syms.length, "nfa-")));
  });

  // Inter-state edges — one arc per direction, label = joined symbols
  // For bidirectional pairs: the canonical direction (A < B lexically) gets
  // side +1, and the reverse gets side -1, so arcs bow to opposite sides.
  Object.entries(pairMap).forEach(([key, syms]) => {
    const [fromId, toId] = key.split("→");
    const from = getStateById(fromId), to = getStateById(toId);
    if (!from || !to) return;
    const hasReverse = (`${toId}→${fromId}`) in pairMap;
    const label = syms.join(", ");
    // Assign a stable side: canonical (smaller id first) → +1, reverse → -1
    const side = hasReverse ? (fromId <= toId ? 1 : -1) : false;
    layer.appendChild(makeEdge(from, to, label, side, "nfa-"));
  });
}

// ─────────────────────────────────────────────
//  EDGE CONSTRUCTORS
// ─────────────────────────────────────────────

function makeEdge(from, to, label, curved, prefix, curveMag) {
  const { R, CURVE_OFF } = GEO;
  const off = curveMag !== undefined ? curveMag : CURVE_OFF;
  const g   = svgEl("g");
  const dx  = to.x - from.x, dy = to.y - from.y;
  const dist= Math.sqrt(dx*dx + dy*dy) || 1;
  const ux  = dx/dist, uy = dy/dist;
  const x1  = from.x + ux*R,       y1 = from.y + uy*R;
  const x2  = to.x   - ux*(R+6),   y2 = to.y   - uy*(R+6);

  let d, lx, ly;
  if (curved) {
    const mx0 = (x1+x2)/2, my0 = (y1+y2)/2;
    const isHoriz = Math.abs(dx) >= Math.abs(dy);
    const mx = mx0 + (isHoriz ? 0 : off * curved);
    const my = my0 + (isHoriz ? off * curved : 0);
    d = `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
    // Label at t=0.5 on the quadratic bezier: (x1+2*mx+x2)/4, (y1+2*my+y2)/4
    lx = (x1 + 2*mx + x2) / 4;
    ly = (y1 + 2*my + y2) / 4;
  } else {
    d = `M ${x1} ${y1} L ${x2} ${y2}`;
    lx = (x1+x2)/2; ly = (y1+y2)/2 - 10;
  }

  const path = svgEl("path");
  path.setAttribute("d", d);
  path.setAttribute("stroke",       "var(--edge-color)");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("fill",         "none");
  path.setAttribute("marker-end",   `url(#${prefix}arr)`);
  g.appendChild(path);
  appendLabel(g, lx, ly, label);
  return g;
}

function makeSelfLoop(state, symbol, idx, total, prefix) {
  const { R } = GEO;
  const { LOOP_DIST, LOOP_TANG, SPREAD } = LOOP;
  const g = svgEl("g");

  // Fan angles: idx=0→-90°, idx=1→-90+SPREAD, idx=2→-90-SPREAD, etc.
  const angleDeg = -90 + (idx === 0 ? 0 : Math.ceil(idx / 2) * SPREAD * (idx % 2 === 1 ? 1 : -1));
  const angleRad  = angleDeg * Math.PI / 180;

  const ax  = state.x + R * Math.cos(angleRad);
  const ay  = state.y + R * Math.sin(angleRad);
  const lcx = state.x + (R + LOOP_DIST) * Math.cos(angleRad);
  const lcy = state.y + (R + LOOP_DIST) * Math.sin(angleRad);

  const perpRad = angleRad + Math.PI / 2;
  const p1x = ax + Math.cos(perpRad)*LOOP_TANG, p1y = ay + Math.sin(perpRad)*LOOP_TANG;
  const p2x = ax - Math.cos(perpRad)*LOOP_TANG, p2y = ay - Math.sin(perpRad)*LOOP_TANG;

  const cp1x = lcx + Math.cos(perpRad)*LOOP_TANG*2, cp1y = lcy + Math.sin(perpRad)*LOOP_TANG*2;
  const cp2x = lcx - Math.cos(perpRad)*LOOP_TANG*2, cp2y = lcy - Math.sin(perpRad)*LOOP_TANG*2;

  const path = svgEl("path");
  path.setAttribute("d",            `M ${p1x} ${p1y} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2x} ${p2y}`);
  path.setAttribute("stroke",       "var(--edge-color)");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("fill",         "none");
  path.setAttribute("marker-end",   `url(#${prefix}arr)`);
  g.appendChild(path);

  appendLabel(g, lcx, lcy, symbol);
  return g;
}

function makeStartArrow(state, prefix) {
  const g = svgEl("g"), line = svgEl("line");
  line.setAttribute("x1", state.x-55); line.setAttribute("y1", state.y);
  line.setAttribute("x2", state.x-30); line.setAttribute("y2", state.y);
  line.setAttribute("stroke",       "var(--start-color)");
  line.setAttribute("stroke-width", "2");
  line.setAttribute("marker-end",   `url(#${prefix}arr-start)`);
  g.appendChild(line);
  return g;
}

function appendLabel(g, x, y, text) {
  const w   = Math.max(18, text.length * 6.5 + 8);
  const bg  = svgEl("rect");
  bg.setAttribute("x", x - w/2); bg.setAttribute("y", y - 8);
  bg.setAttribute("width", w);   bg.setAttribute("height", 15);
  bg.setAttribute("rx", 3);
  bg.setAttribute("fill",         "var(--edge-label-bg)");
  bg.setAttribute("stroke",       "var(--border)");
  bg.setAttribute("stroke-width", "1");
  g.appendChild(bg);

  const txt = svgEl("text");
  txt.setAttribute("x", x); txt.setAttribute("y", y);
  txt.setAttribute("text-anchor",        "middle");
  txt.setAttribute("dominant-baseline",  "middle");
  txt.setAttribute("font-family",        "'JetBrains Mono', monospace");
  txt.setAttribute("font-size",          "10");
  txt.setAttribute("fill", (text === "ε" || text.includes("ε")) ? "var(--accent)" : "var(--text-secondary)");
  txt.textContent = text;
  g.appendChild(txt);
}

// ─────────────────────────────────────────────
//  HIGHLIGHT HELPERS
// ─────────────────────────────────────────────
function highlightStates(ids)  { ids.forEach(id => { const el = document.getElementById(`node-${id}`); if (el) el.classList.add("highlighted"); }); }
function clearHighlights()     { canvas.querySelectorAll(".state-node.highlighted").forEach(el => el.classList.remove("highlighted")); }

// ─────────────────────────────────────────────
//  NFA → DFA  (Subset Construction)
// ─────────────────────────────────────────────
function epsilonClosure(stateIds) {
  const closure = new Set(stateIds), stack = [...stateIds];
  while (stack.length) {
    const cur = stack.pop();
    nfa.transitions.filter(t => t.from===cur && t.symbol==="ε")
      .forEach(t => { if (!closure.has(t.to)) { closure.add(t.to); stack.push(t.to); } });
  }
  return [...closure].sort();
}
function move(stateIds, sym) {
  const r = new Set();
  stateIds.forEach(id => nfa.transitions.filter(t=>t.from===id && t.symbol===sym).forEach(t=>r.add(t.to)));
  return [...r].sort();
}
function getAlphabet() { return [...userAlphabet].sort(); }

const fmtSet  = ids => (!ids||ids.length===0) ? "∅" : `{${ids.join(", ")}}`;
const dfaName = ids => (!ids||ids.length===0) ? "∅" : `{${ids.join(",")}}`;

async function subsetConstruction() {
  clearLog();
  dfaTableContainer.innerHTML = '<div class="log-placeholder">Building DFA…</div>';
  setMode("converting");

  const alphabet = getAlphabet();
  if (!nfa.start)          { addLogStep("No start state defined.",          "highlight"); setMode("idle"); return null; }
  if (!nfa.states.length)  { addLogStep("No states defined.",               "highlight"); setMode("idle"); return null; }
  if (!alphabet.length)    { addLogStep("Alphabet is empty. Add symbols.",   "highlight"); setMode("idle"); return null; }

  addLogStep(`NFA: states=${fmtSet(nfa.states.map(s=>s.id))}, start=<b>${nfa.start}</b>, final=${fmtSet(nfa.final)}, Σ={${alphabet.join(",")}}.`, "highlight");
  await sleep(SPEED.intro);
  addLogStep(`<b>Subset construction</b>: each DFA state = set of NFA states. Names keep original IDs.`, "highlight");
  await sleep(SPEED.intro);

  const startClosure = epsilonClosure([nfa.start]);
  addLogStep(`DFA start: ε-closure(${nfa.start}) = <b>${fmtSet(startClosure)}</b>.`, "highlight");
  highlightStates(startClosure); await sleep(SPEED.intro); clearHighlights();

  const dfaStates = [], dfaTrans = [], seen = new Map();
  function newDFA(nfaSet) {
    const name = dfaName(nfaSet), isFin = nfaSet.some(s=>nfa.final.includes(s));
    const ds   = { name, nfaStates: nfaSet, isStart: false, isFinal: isFin };
    dfaStates.push(ds); seen.set(name, ds); return ds;
  }
  const startDFA = newDFA(startClosure); startDFA.isStart = true;
  addLogStep(`DFA start = <b>${startDFA.name}</b>${startDFA.isFinal?" ★ (contains NFA final)":""}.`, "dfa");
  await sleep(SPEED.stepExpand);

  const queue = [startDFA];
  while (queue.length) {
    const cur = queue.shift();
    addLogStep(`━━ Expanding <b>${cur.name}</b> ━━`, "highlight");
    await sleep(SPEED.stepExpand);

    for (const sym of alphabet) {
      await sleep(SPEED.stepSymbol);
      const moved = move(cur.nfaStates, sym);
      if (!moved.length) {
        addLogStep(`  On <b>'${sym}'</b>: move=∅ → dead state ∅.`, "transition");
        dfaTrans.push({ from: cur.name, to: "∅", symbol: sym }); continue;
      }
      addLogStep(`  On <b>'${sym}'</b>: move=${fmtSet(cur.nfaStates)}→<b>${fmtSet(moved)}</b>.`, "transition");
      highlightStates(moved); await sleep(SPEED.stepClosure); clearHighlights();

      const closure = epsilonClosure(moved);
      const added   = closure.filter(s=>!moved.includes(s));
      if (added.length) {
        addLogStep(`  ε-closure(${fmtSet(moved)})=<b>${fmtSet(closure)}</b> (+${fmtSet(added)} via ε).`, "transition");
        highlightStates(closure); await sleep(SPEED.stepClosure); clearHighlights();
      } else {
        addLogStep(`  ε-closure=<b>${fmtSet(closure)}</b> (no ε-arrows).`, "transition");
      }

      const cname = dfaName(closure);
      let tgt;
      if (seen.has(cname)) {
        tgt = seen.get(cname);
        addLogStep(`  State <b>${cname}</b> exists — reuse.`, "dfa");
      } else {
        tgt = newDFA(closure); queue.push(tgt);
        addLogStep(`  → <b>New</b> state <b>${tgt.name}</b>${tgt.isFinal?" ★":""}.`, "dfa");
        await sleep(SPEED.stepNew);
      }
      dfaTrans.push({ from: cur.name, to: tgt.name, symbol: sym });
      addLogStep(`  ✔ δ(<b>${cur.name}</b>, '${sym}')=<b>${tgt.name}</b>.`, "dfa");
      await sleep(SPEED.stepEntry);
    }
  }

  const needsDead  = dfaTrans.some(t=>t.to==="∅");
  const finalNames = dfaStates.filter(s=>s.isFinal).map(s=>s.name);
  addLogStep(`<b>Done.</b> ${dfaStates.length} DFA state(s)${needsDead?" + ∅":""}. Finals: ${fmtSet(finalNames)}.`, "highlight");
  setMode("idle");
  return { states: dfaStates, transitions: dfaTrans, alphabet, needsDead };
}

// ─────────────────────────────────────────────
//  DFA TABLE
// ─────────────────────────────────────────────
function renderDFATable(dfa) {
  if (!dfa) return;
  const { states, transitions: tr, alphabet, needsDead } = dfa;
  const rows = [...states];
  if (needsDead) rows.push({ name:"∅", nfaStates:[], isStart:false, isFinal:false });

  const table = document.createElement("table"); table.className = "dfa-table";
  const thead = document.createElement("thead"), hrow = document.createElement("tr");
  const th0 = document.createElement("th"); th0.textContent = "DFA State"; hrow.appendChild(th0);
  alphabet.forEach(sym => { const th = document.createElement("th"); th.textContent=`on '${sym}'`; hrow.appendChild(th); });
  thead.appendChild(hrow); table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach(s => {
    const row = document.createElement("tr");
    const td0 = document.createElement("td");
    td0.textContent = (s.isStart?"→ ":"") + (s.isFinal?"★ ":"") + s.name;
    if (s.isStart) td0.classList.add("is-start"); if (s.isFinal) td0.classList.add("is-final");
    row.appendChild(td0);
    alphabet.forEach(sym => {
      const td = document.createElement("td");
      const t  = tr.find(t=>t.from===s.name && t.symbol===sym);
      td.textContent = t ? t.to : "∅";
      if (!t || t.to==="∅") td.classList.add("dead-state");
      row.appendChild(td);
    });
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  dfaTableContainer.innerHTML = "";
  dfaTableContainer.appendChild(table);
}

// ─────────────────────────────────────────────
// § DFA LAYOUT
// Controls how DFA states are laid out in the diagram pane.
// NODE_MIN_SIZE : minimum node diameter
// SPACING_X/Y   : horizontal/vertical gap between nodes
// ─────────────────────────────────────────────
const DFA_LAYOUT = {
  NODE_MIN_SIZE: 80,
  SPACING_X:     230,
  SPACING_Y:     160,
};

function renderDFADiagram() {
  // Read exclusively from the finished DOM table — ground truth.
  const table = dfaTableContainer.querySelector("table");
  if (!table) return;

  dfaPane.style.display    = "flex";
  resizerMid.style.display = "block";
  dfaCanvas.querySelectorAll(".dfa-node").forEach(el => el.remove());
  clearEdgesLayer("dfa-");

  // 1. Parse table header → alphabet symbols
  const syms = [...table.querySelectorAll("thead th")]
    .slice(1)
    .map(th => th.textContent.replace(/on '|'/g, "").trim());

  // 2. Parse each row → state metadata + transitions
  const states = [];   // { name, isStart, isFinal, isDead }
  const edges  = [];   // { from, to, label } — label already merged per pair later

  table.querySelectorAll("tbody tr").forEach(row => {
    const cells = [...row.querySelectorAll("td")];
    const raw   = cells[0].textContent.trim();
    const isStart = raw.includes("→");
    const isFinal = raw.includes("★");
    const name    = raw.replace("→", "").replace("★", "").trim();
    states.push({ name, isStart, isFinal, isDead: name === "∅" });

    syms.forEach((sym, i) => {
      const to = (cells[i + 1] || {}).textContent?.trim() || "∅";
      edges.push({ from: name, to, sym });
    });
  });

  // 3. Layout — BFS from start, left to right, one column per BFS level
  const rect      = dfaCanvas.getBoundingClientRect();
  const W         = DFA_LAYOUT.SPACING_X;
  const H         = DFA_LAYOUT.SPACING_Y;
  const startNode = states.find(s => s.isStart);

  // Build adjacency excluding self-loops and ∅ target (don't affect column depth)
  const adj = {};
  states.forEach(s => { adj[s.name] = []; });
  edges.forEach(e => {
    if (e.to !== "∅" && e.from !== e.to && !adj[e.from].includes(e.to))
      adj[e.from].push(e.to);
  });

  // BFS
  const col = {};
  const q   = [];
  if (startNode) { col[startNode.name] = 0; q.push(startNode.name); }
  for (let i = 0; i < q.length; i++) {
    adj[q[i]].forEach(nb => {
      if (col[nb] === undefined) { col[nb] = col[q[i]] + 1; q.push(nb); }
    });
  }

  // Anything not reached goes in next columns; ∅ always last
  let next = Object.values(col).length ? Math.max(...Object.values(col)) + 1 : 0;
  states.forEach(s => { if (col[s.name] === undefined && !s.isDead) col[s.name] = next++; });
  states.forEach(s => { if (s.isDead) col[s.name] = next; });

  // Group by column
  const byCol = {};
  states.forEach(s => {
    const c = col[s.name] ?? 0;
    (byCol[c] = byCol[c] || []).push(s);
  });

  // Assign pixel positions — centered in canvas
  const numCols = Math.max(...Object.keys(byCol).map(Number)) + 1;
  const totalW  = (numCols - 1) * W;
  const startX  = Math.max(90, rect.width / 2 - totalW / 2);
  const pos     = {};

  Object.entries(byCol).forEach(([c, group]) => {
    const x    = startX + Number(c) * W;
    const totalH = (group.length - 1) * H;
    const startY = Math.max(70, rect.height / 2 - totalH / 2);
    group.forEach((s, r) => { pos[s.name] = { x, y: startY + r * H }; });
  });

  // 4. Draw nodes
  states.forEach(s => {
    const p = pos[s.name]; if (!p) return;
    const el = document.createElement("div");
    el.className = "dfa-node";
    const label = s.name.length > 14 ? s.name.slice(0, 13) + "…" : s.name;
    el.textContent = label;
    el.title = s.name;
    const sz = Math.max(DFA_LAYOUT.NODE_MIN_SIZE, 14 + label.length * 5.5);
    el.style.cssText = `width:${sz}px;height:${sz}px;left:${p.x}px;top:${p.y}px;`;
    if (s.isDead)  el.classList.add("dead");
    if (s.isStart) el.classList.add("is-start");
    if (s.isFinal) el.classList.add("is-final");
    dfaCanvas.appendChild(el);
  });

  // 5. Draw edges
  const layer = getEdgesLayer("dfa-");

  // Start arrow
  if (startNode && pos[startNode.name])
    layer.appendChild(makeStartArrow(pos[startNode.name], "dfa-"));

  // Group edges by directed pair, merging symbols
  const pairMap   = {};  // "A→B" → [sym, ...]
  const loopMap   = {};  // "A"   → [sym, ...]

  edges.forEach(e => {
    if (!pos[e.from] || !pos[e.to]) return;  // skip if no node drawn
    if (e.from === e.to) {
      (loopMap[e.from] = loopMap[e.from] || []).push(e.sym);
    } else {
      const k = `${e.from}→${e.to}`;
      (pairMap[k] = pairMap[k] || []).push(e.sym);
    }
  });

  // Self-loops
  Object.entries(loopMap).forEach(([name, symList]) => {
    const p = pos[name]; if (!p) return;
    symList.forEach((sym, idx) => {
      const g = makeSelfLoop(p, sym, idx, symList.length, "dfa-");
      g.querySelectorAll("path").forEach(path => path.setAttribute("stroke", "var(--accent2)"));
      layer.appendChild(g);
    });
  });

  // Inter-state edges
  Object.entries(pairMap).forEach(([key, symList]) => {
    const [a, b] = key.split("→");
    const pa = pos[a], pb = pos[b];
    if (!pa || !pb) return;
    const hasRev = !!pairMap[`${b}→${a}`];
    const colDist = Math.abs((col[a] ?? 0) - (col[b] ?? 0));
    // Always curve if skipping nodes (colDist > 1), or if bidirectional.
    // Long back-arrows arc upward (negative side) so they clear intermediate nodes.
    let side;
    if (hasRev) {
      side = a <= b ? 1 : -1;
    } else if (colDist > 1) {
      // Arc above the row (negative Y = upward in canvas coords)
      side = -1;
    } else {
      side = false;
    }
    const curveMag = colDist > 1 ? colDist * DFA_LAYOUT.SPACING_X * 0.18 : GEO.CURVE_OFF;
    const g = makeEdge(pa, pb, symList.join(", "), side, "dfa-", curveMag);
    g.querySelectorAll("path,line").forEach(p => p.setAttribute("stroke", "var(--accent2)"));
    layer.appendChild(g);
  });

  document.getElementById("dfa-pane-info").textContent =
    `${states.length} state(s) | ${edges.length} transition(s)`;
}

// ─────────────────────────────────────────────
//  RESET
// ─────────────────────────────────────────────
function resetAll() {
  undoStack = []; redoStack = []; refreshUndoRedoBtns();
  nfa.states=[]; nfa.start=null; nfa.final=[]; nfa.transitions=[];
  stateCounter=0; transitionSource=null;
  canvas.querySelectorAll(".state-node").forEach(el=>el.remove());
  clearEdgesLayer("nfa-");
  removeLiveLine();
  canvas.removeEventListener("mousemove", onCanvasMouseMove);
  dfaPane.style.display="none"; resizerMid.style.display="none";
  dfaCanvas.querySelectorAll(".dfa-node").forEach(el=>el.remove());
  clearEdgesLayer("dfa-");
  clearLog();
  logContainer.innerHTML      = '<div class="log-placeholder">Conversion steps will appear here.</div>';
  dfaTableContainer.innerHTML = '<div class="log-placeholder">DFA transition table will appear here.</div>';
  updateNFADisplay(); setMode("idle"); setInfo("");
}

// ─────────────────────────────────────────────
//  RESIZABLE PANELS
// ─────────────────────────────────────────────
function makeColResizer(rId, leftEl, rightEl) {
  const rz = document.getElementById(rId);
  rz.addEventListener("mousedown", e => {
    e.preventDefault();
    const x0 = e.clientX, l0 = leftEl.getBoundingClientRect().width, r0 = rightEl.getBoundingClientRect().width;
    rz.classList.add("dragging"); document.body.classList.add("resizing");
    const onMove = ev => {
      const d = ev.clientX - x0;
      leftEl.style.width  = Math.max(160, Math.min(500, l0+d)) + "px";
      rightEl.style.width = Math.max(160, Math.min(500, r0-d)) + "px";
    };
    const onUp = () => { rz.classList.remove("dragging"); document.body.classList.remove("resizing"); document.removeEventListener("mousemove",onMove); document.removeEventListener("mouseup",onUp); };
    document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
  });
}

function makeRowResizer(rId, topEl, botEl) {
  const rz = document.getElementById(rId);
  rz.addEventListener("mousedown", e => {
    e.preventDefault();
    const y0 = e.clientY, t0 = topEl.getBoundingClientRect().height, b0 = botEl.getBoundingClientRect().height;
    rz.classList.add("dragging"); document.body.classList.add("resizing-row");
    const onMove = ev => {
      const d = ev.clientY - y0;
      topEl.style.flex = `0 0 ${Math.max(80, Math.min(t0+b0-80, t0+d))}px`;
      botEl.style.flex = `0 0 ${Math.max(80, Math.min(t0+b0-80, b0-d))}px`;
    };
    const onUp = () => { rz.classList.remove("dragging"); document.body.classList.remove("resizing-row"); document.removeEventListener("mousemove",onMove); document.removeEventListener("mouseup",onUp); };
    document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
  });
}

makeColResizer("resizer-left",  document.getElementById("sidebar"),    document.getElementById("center-col"));
makeColResizer("resizer-right", document.getElementById("center-col"), document.getElementById("log-panel"));
makeRowResizer("resizer-mid",   document.getElementById("nfa-pane"),   document.getElementById("dfa-pane"));

// ─────────────────────────────────────────────
//  BUTTON LISTENERS
// ─────────────────────────────────────────────
document.getElementById("btn-add-state").addEventListener("click", () => { if (mode==="converting") return; setMode("idle"); addState(); });
document.getElementById("btn-set-start").addEventListener("click", () => { setMode(mode==="settingStart"?"idle":"settingStart"); setInfo("Click a state to mark it as start."); });
document.getElementById("btn-set-final").addEventListener("click", () => { setMode(mode==="settingFinal"?"idle":"settingFinal"); setInfo("Click a state to toggle final."); });
document.getElementById("btn-cancel-transition").addEventListener("click", () => { canvas.removeEventListener("mousemove",onCanvasMouseMove); setMode("idle"); setInfo(""); });
document.getElementById("btn-undo").addEventListener("click", () => { if (mode==="converting") return; setMode("idle"); undoAction(); });
document.getElementById("btn-redo").addEventListener("click", () => { if (mode==="converting") return; setMode("idle"); redoAction(); });
document.getElementById("btn-convert").addEventListener("click", async () => {
  if (mode==="converting") return;
  const result = await subsetConstruction();
  renderDFATable(result);
  renderDFADiagram();
});
document.getElementById("btn-reset").addEventListener("click", resetAll);

canvas.addEventListener("click", e => {
  if (e.target !== canvas && e.target !== svgLayer) return;
  if (mode === "addingTransitionFrom") { canvas.removeEventListener("mousemove",onCanvasMouseMove); setMode("idle"); setInfo(""); }
});

// ─────────────────────────────────────────────
//  THEME DROPDOWN
//  Reads the <select> value and sets data-theme on <html>.
//  To add a theme: add a [data-theme="name"] block in styles.css
//  and a matching <option> in index.html.
// ─────────────────────────────────────────────
const themeSelect = document.getElementById("theme-select");
themeSelect.addEventListener("change", () => {
  document.documentElement.setAttribute("data-theme", themeSelect.value);
});
// Set initial value to match the default data-theme on <html>
themeSelect.value = document.documentElement.getAttribute("data-theme") || "dark-lab";

// ─────────────────────────────────────────────
//  KEYBOARD SHORTCUTS  (Ctrl/Cmd + Z / Y / Shift+Z)
// ─────────────────────────────────────────────
document.addEventListener("keydown", e => {
  // Ignore when typing in an input or textarea
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === "z" && !e.shiftKey) { e.preventDefault(); if (mode !== "converting") { setMode("idle"); undoAction(); } }
  if (ctrl && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); if (mode !== "converting") { setMode("idle"); redoAction(); } }
});

// ─────────────────────────────────────────────
//  DEMO NFA
// ─────────────────────────────────────────────
function buildDemoNFA() {
  const rect = canvas.getBoundingClientRect();
  const cx = rect.width/2||400, cy = rect.height/2||200;

  [
    { id:"q0", x:cx-180, y:cy,     isStart:true,  isFinal:false },
    { id:"q1", x:cx,     y:cy-80,  isStart:false, isFinal:false },
    { id:"q2", x:cx+180, y:cy,     isStart:false, isFinal:true  },
  ].forEach(s => { nfa.states.push(s); createStateElement(s); });

  stateCounter=3; nfa.start="q0"; nfa.final=["q2"];
  nfa.transitions = [
    { from:"q0", to:"q1", symbol:"0" },
    { from:"q1", to:"q2", symbol:"1" },
    { from:"q0", to:"q2", symbol:"ε" },
    { from:"q1", to:"q1", symbol:"0" },
  ];

  drawAllNFAEdges();
  updateNFADisplay();
  renderAlphabetTags();
  setInfo("Double-click a state to draw a transition from it");
}

window.addEventListener("load", () => setTimeout(buildDemoNFA, 80));

// ─────────────────────────────────────────────
//  TAB SWITCHING
// ─────────────────────────────────────────────
(function initTabs() {
  const tabBtns   = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.toggle('active', b === btn));
      tabPanels.forEach(p => p.classList.toggle('active', p.id === target));
    });
  });
})();


// ─────────────────────────────────────────────
//  PARTICLE BACKGROUND
//  Reads CSS variables from the root element so
//  particle colours follow theme changes automatically.
//  No conversion logic touched.
// ─────────────────────────────────────────────
(function initParticles() {
  const cvs = document.getElementById('particle-canvas');
  if (!cvs) return;
  const ctx = cvs.getContext('2d');

  const COUNT       = 55;   // number of particles
  const MAX_DIST    = 140;  // max distance to draw a connecting line
  const SPEED_SCALE = 0.28; // particle drift speed

  let W, H, particles;

  function getThemeColors() {
    const style = getComputedStyle(document.documentElement);
    // Use accent and border-bright as the particle colours
    return {
      dot:  style.getPropertyValue('--border-bright').trim()  || '#2e3447',
      line: style.getPropertyValue('--border').trim()         || '#1e2230',
    };
  }

  function resize() {
    W = cvs.width  = window.innerWidth;
    H = cvs.height = window.innerHeight;
  }

  function makeParticle() {
    return {
      x:  Math.random() * W,
      y:  Math.random() * H,
      vx: (Math.random() - 0.5) * SPEED_SCALE,
      vy: (Math.random() - 0.5) * SPEED_SCALE,
      r:  Math.random() * 1.5 + 0.8,
    };
  }

  function init() {
    resize();
    particles = Array.from({ length: COUNT }, makeParticle);
  }

  function tick() {
    ctx.clearRect(0, 0, W, H);
    const col = getThemeColors();

    // Move
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;
    }

    // Connections
    ctx.lineWidth = 0.6;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MAX_DIST) {
          const alpha = (1 - dist / MAX_DIST) * 0.45;
          ctx.strokeStyle = col.line;
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    // Dots
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = col.dot;
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', resize);
  init();
  tick();
})();
