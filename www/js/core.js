'use strict';
/* =========================================================
   VecDraw – core: utils, model, geometry, history, render, storage
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hypot = Math.hypot;
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}
function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
function rng(seed) {
  let a = (seed | 0) || 1;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/* ---------- colors ---------- */
function hex2rgb(h) { h = (h || '#000').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgb2hex(r, g, b) { return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); }
function hsv2rgb(h, s, v) { const f = (n, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0); return [f(5) * 255, f(3) * 255, f(1) * 255]; }
function rgb2hsv(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return [h, mx ? d / mx : 0, mx]; }

/* ---------- icons (inline svg, offline) ---------- */
const ICON_P = {
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
  redo: '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
  more: '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  select: '<path d="M4 3l7.07 17 2.51-7.39L21 10.1 4 3z"/>',
  poly: '<polygon points="12 3 21 9.5 17.5 20 6.5 20 3 9.5" stroke-dasharray="3 2.5"/><circle cx="12" cy="3" r="1.6" fill="currentColor"/><circle cx="21" cy="9.5" r="1.6" fill="currentColor"/><circle cx="17.5" cy="20" r="1.6" fill="currentColor"/><circle cx="6.5" cy="20" r="1.6" fill="currentColor"/><circle cx="3" cy="9.5" r="1.6" fill="currentColor"/>',
  free: '<path d="M3 17c3-9 6-9 8-4s5 4 10-6"/><circle cx="21" cy="7" r="1.5" fill="currentColor"/>',
  pencil: '<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  brush: '<path d="M18.37 2.63L14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3z"/><path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7"/>',
  eraser: '<path d="M20 20H9l-5.3-5.3a2 2 0 0 1 0-2.8l8.2-8.2a2 2 0 0 1 2.8 0l5.6 5.6a2 2 0 0 1 0 2.8L12 20"/><path d="M7 13l6 6"/>',
  bucket: '<path d="M12 2.7l5.7 5.7a8 8 0 1 1-11.4 0z"/>',
  drop: '<path d="M12 2.7l5.7 5.7a8 8 0 1 1-11.4 0z"/>',
  dropper: '<path d="M20.5 3.5a2.1 2.1 0 0 0-3 0l-3 3-1-1-1.5 1.5 6 6 1.5-1.5-1-1 3-3a2.1 2.1 0 0 0 0-3z"/><path d="M13 8l-9 9v3h3l9-9"/>',
  smudge: '<path d="M3 14c3-7 6 5 9-1s6 0 9-5"/><path d="M3 19h18"/>',
  blur: '<circle cx="12" cy="12" r="8" stroke-dasharray="2.2 2.8"/><circle cx="12" cy="12" r="3.5"/>',
  hand: '<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>',
  fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
  up: '<polyline points="18 15 12 9 6 15"/>',
  down: '<polyline points="6 9 12 15 18 9"/>',
  mergedown: '<path d="M12 3v12"/><polyline points="7 11 12 16 17 11"/><line x1="5" y1="20" x2="19" y2="20"/>',
  fliph: '<path d="M12 3v18"/><path d="M8 7L3 12l5 5z"/><path d="M16 7l5 5-5 5z"/>',
  flipv: '<path d="M3 12h18"/><path d="M7 8l5-5 5 5z"/><path d="M7 16l5 5 5-5z"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/>',
  back: '<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  node: '<circle cx="12" cy="12" r="3"/><path d="M3 12h6M15 12h6"/>',
  warp: '<path d="M4 6c5-3 11 3 16 0v12c-5 3-11-3-16 0z"/>',
  vec: '<path d="M4 20L20 4"/><rect x="2" y="18" width="4" height="4"/><rect x="18" y="2" width="4" height="4"/>',
  ras: '<rect x="3" y="3" width="18" height="18"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  chevup: '<polyline points="6 15 12 9 18 15"/>'
};
const ic = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_P[n] || ''}</svg>`;

/* =========================================================
   State
   ========================================================= */
let doc = null, REV = 1, liveStroke = null;
const view = { s: 1, ox: 0, oy: 0 };
// style cho shape (vector + shape tools của raster)
const ST = { mode: 'line', color: '#1a1a1a', grad: false, color2: '#ff5b6b', gAngle: 0, width: 6, opacity: 1, brush: 'pen', closed: true, curve: false, free: 'auto' };
// style cho raster brush
const RS = { size: 14, hard: 0.7, opacity: 1, style: 'soft', eSize: 30, eHard: 0.6, eOp: 1, sSize: 36, sStr: 0.55, bSize: 36, bStr: 0.5, tol: 24, contig: true, all: false };
// vector eraser
const VE = { strength: 1, all: false };

const BLENDS = [['source-over', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'], ['darken', 'Darken'], ['lighten', 'Lighten'], ['color-dodge', 'Color dodge'], ['color-burn', 'Color burn'], ['hard-light', 'Hard light'], ['soft-light', 'Soft light'], ['difference', 'Difference'], ['exclusion', 'Exclusion'], ['hue', 'Hue'], ['saturation', 'Saturation'], ['color', 'Color'], ['luminosity', 'Luminosity']];

/* =========================================================
   Model
   ========================================================= */
function newLayer(d, type, name) {
  const l = { id: uid(), name, type, visible: true, locked: false, opacity: 1, blend: 'source-over', blur: 0, rev: ++REV };
  if (type === 'vec') l.shapes = [];
  else if (type === 'ras') l.canvas = mkCanvas(d.w, d.h);
  else if (type === 'img') { l.img = null; l.src = null; l.iw = 1; l.ih = 1; l.corners = [[0, 0], [1, 0], [1, 1], [0, 1]]; l.smooth = true; }
  return l;
}
function nextLayerName(d) { let n = d.layers.length + 1; const names = new Set(d.layers.map(l => l.name)); while (names.has('Layer ' + n)) n++; return 'Layer ' + n; }
/* z-order: mọi shape có z tăng dần; doc.zmax = z cao nhất đã cấp (shape mới luôn cao hơn) */
const nextZ = () => (doc.zmax = (doc.zmax || 0) + 1);
function newDoc(o) {
  const d = { id: uid(), name: o.name || 'Untitled', type: o.type, w: o.w, h: o.h, bg: o.bg === undefined ? '#ffffff' : o.bg, layers: [], active: null, created: Date.now(), zmax: 0 };
  const L = newLayer(d, d.type === 'vector' ? 'vec' : 'ras', 'Layer 1');
  d.layers.push(L); d.active = L.id;
  return d;
}
const layerById = id => doc && doc.layers.find(l => l.id === id);
const activeLayer = () => layerById(doc.active);
const touch = l => { l.rev = ++REV; };

/* =========================================================
   History (snapshot cho cấu trúc / vector, patch cho pixel)
   ========================================================= */
const Hist = { u: [], r: [], bytes: 0 };
function cloneLayer(l) { const c = Object.assign({}, l); if (l.corners) c.corners = l.corners.map(p => p.slice()); return c; }
function snap() { return { layers: doc.layers.map(cloneLayer), active: doc.active, w: doc.w, h: doc.h, bg: doc.bg }; }
function restoreSnap(s) {
  doc.layers = s.layers.map(cloneLayer); doc.active = s.active; doc.w = s.w; doc.h = s.h; doc.bg = s.bg;
  for (const l of doc.layers) l.rev = ++REV;
  if (typeof sel !== 'undefined' && sel && !selShape()) sel = null;
  if (doc.mapping && typeof applyRefProps === 'function') applyRefProps();
}
function histReset() { Hist.u = []; Hist.r = []; Hist.bytes = 0; }
function pushHist(e, key) {
  if (key && Hist.u.length) {
    const t = Hist.u[Hist.u.length - 1];
    if (t.key === key && t.kind === 'doc' && e.kind === 'doc' && Date.now() - t.t < 1500) { t.after = e.after; t.t = Date.now(); Hist.r.length = 0; afterHist(); return; }
  }
  e.key = key; e.t = Date.now(); Hist.u.push(e); Hist.r.length = 0; Hist.bytes += e.bytes || 0;
  const maxN = doc && doc.type === 'raster' ? 400 : 1500;
  while (Hist.u.length > maxN || Hist.bytes > 350e6) { const o = Hist.u.shift(); Hist.bytes -= (o.bytes || 0); }
  afterHist();
}
function withHist(fn, key) { const before = snap(); const r = fn(); pushHist({ kind: 'doc', before, after: snap() }, key); return r; }
function applyHist(e, back) {
  if (e.kind === 'doc') restoreSnap(back ? e.before : e.after);
  else { const l = layerById(e.layerId); if (l && l.canvas) { l.canvas.getContext('2d').putImageData(back ? e.before : e.after, e.x, e.y); touch(l); } }
}
function undo() {
  if (typeof pend !== 'undefined' && pend && pend.pts.length) { pend.redo.push(pend.pts.pop()); if (!pend.pts.length) { pend.redo = pend.redo; } requestRender(); uiRefresh(); return; }
  const e = Hist.u.pop(); if (!e) return; applyHist(e, true); Hist.r.push(e); afterHist(true);
}
function redo() {
  if (typeof pend !== 'undefined' && pend && pend.redo.length) { pend.pts.push(pend.redo.pop()); requestRender(); uiRefresh(); return; }
  const e = Hist.r.pop(); if (!e) return; applyHist(e, false); Hist.u.push(e); afterHist(true);
}
function afterHist(structural) { markDirty(); requestRender(); uiRefresh(structural); }

/* =========================================================
   Geometry – shape = {id,nodes:[[x,y,corner]],closed,mode,color,...}
   ========================================================= */
function segs(nodes, closed) {
  const n = nodes.length, out = [], cnt = closed ? n : n - 1;
  for (let i = 0; i < cnt; i++) {
    const a = nodes[i], b = nodes[(i + 1) % n];
    const pa = (i > 0 || closed) ? nodes[(i - 1 + n) % n] : a;
    const nb = (i + 2 < n || closed) ? nodes[(i + 2) % n] : b;
    const straight = !!(a[2] && b[2]);
    let c1, c2;
    if (!straight) {
      c1 = a[2] ? [a[0], a[1]] : [a[0] + (b[0] - pa[0]) / 6, a[1] + (b[1] - pa[1]) / 6];
      c2 = b[2] ? [b[0], b[1]] : [b[0] - (nb[0] - a[0]) / 6, b[1] - (nb[1] - a[1]) / 6];
    }
    out.push({ a, b, c1, c2, straight });
  }
  return out;
}

/* Bo góc: chỉ bo những góc nhọn nằm giữa 2 cạnh thẳng; cung = 1 đoạn Bezier tiếp xúc đúng 2 cạnh */
function segsOf(s) {
  const base = segs(s.nodes, s.closed), r = +s.round || 0, n = s.nodes.length;
  if (!(r > 0) || n < 3 || base.length < 2) return base;
  const nd = s.nodes, cut = new Array(n).fill(0), info = new Array(n).fill(null);
  const along = (p, q, d) => { const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [p[0] + (q[0] - p[0]) * d / L, p[1] + (q[1] - p[1]) * d / L, 1]; };
  for (let i = 0; i < n; i++) {
    if (!s.closed && (i === 0 || i === n - 1)) continue;
    const V = nd[i], A = nd[(i - 1 + n) % n], B = nd[(i + 1) % n];
    if (!(V[2] && A[2] && B[2])) continue;
    const lu = Math.hypot(A[0] - V[0], A[1] - V[1]), lw = Math.hypot(B[0] - V[0], B[1] - V[1]);
    if (lu < 1e-6 || lw < 1e-6) continue;
    const cos = Math.max(-1, Math.min(1, ((A[0] - V[0]) * (B[0] - V[0]) + (A[1] - V[1]) * (B[1] - V[1])) / (lu * lw))), phi = Math.acos(cos);
    if (phi > 3.1 || phi < 0.02) continue;
    const d = Math.min(r / Math.tan(phi / 2), lu / 2, lw / 2);
    if (d < 1e-4) continue;
    const f = (4 / 3) * Math.tan((Math.PI - phi) / 4) * Math.tan(phi / 2), P1 = along(V, A, d), P2 = along(V, B, d);
    cut[i] = d; info[i] = { P1, P2, c1: [P1[0] + (V[0] - P1[0]) * f, P1[1] + (V[1] - P1[1]) * f], c2: [P2[0] + (V[0] - P2[0]) * f, P2[1] + (V[1] - P2[1]) * f] };
  }
  const out = [];
  for (let i = 0; i < base.length; i++) {
    const g = base[i], j = (i + 1) % n;
    if (info[i]) out.push({ a: info[i].P1, b: info[i].P2, c1: info[i].c1, c2: info[i].c2, straight: false });
    if (g.straight) out.push({ a: info[i] ? info[i].P2 : g.a, b: info[j] ? info[j].P1 : g.b, straight: true });
    else out.push(g);
  }
  return out;
}
function bez(g, t) {
  const u = 1 - t, a = g.a, b = g.b, c1 = g.c1, c2 = g.c2, w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
  return [w0 * a[0] + w1 * c1[0] + w2 * c2[0] + w3 * b[0], w0 * a[1] + w1 * c1[1] + w2 * c2[1] + w3 * b[1]];
}
const GC = new WeakMap();
const gcache = s => { let c = GC.get(s); if (!c) { c = {}; GC.set(s, c); } return c; };
const invalidate = s => GC.delete(s);
function getPath(s) {
  const c = gcache(s); if (c.p) return c.p;
  const p = new Path2D(), n = s.nodes.length;
  if (n) {
    const SG = n > 1 ? segsOf(s) : null, st = SG ? SG[0].a : s.nodes[0];
    p.moveTo(st[0], st[1]);
    if (n === 1) p.lineTo(s.nodes[0][0] + 0.01, s.nodes[0][1]);
    else {
      for (const g of SG) { if (g.straight) p.lineTo(g.b[0], g.b[1]); else p.bezierCurveTo(g.c1[0], g.c1[1], g.c2[0], g.c2[1], g.b[0], g.b[1]); }
      if (s.closed) p.closePath();
    }
  }
  c.p = p; return p;
}
function getFlat(s) {
  const c = gcache(s); if (c.fl) return c.fl;
  const out = [], n = s.nodes.length;
  if (n === 1) out.push([s.nodes[0][0], s.nodes[0][1]]);
  else if (n > 1) {
    const SG = segsOf(s); out.push([SG[0].a[0], SG[0].a[1]]);
    for (const g of SG) { if (g.straight) out.push([g.b[0], g.b[1]]); else for (let k = 1; k <= 12; k++) out.push(bez(g, k / 12)); }
  }
  c.fl = out; return out;
}
function getBBox(s) {
  const c = gcache(s); if (c.bb) return c.bb;
  let x0 = 1e12, y0 = 1e12, x1 = -1e12, y1 = -1e12;
  for (const p of getFlat(s)) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  if (x0 > x1) { x0 = y0 = x1 = y1 = 0; }
  c.bb = { x0, y0, x1, y1 }; return c.bb;
}
function shapeBox(s) {
  const b = getBBox(s), pad = (s.mode === 'line' ? s.width / 2 : 0) + 1.5;
  return [[b.x0 - pad, b.y0 - pad], [b.x1 + pad, b.y0 - pad], [b.x1 + pad, b.y1 + pad], [b.x0 - pad, b.y1 + pad]];
}
function densify(pts, step) {
  if (pts.length < 2) return pts.slice();
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return out;
}
function getPencil(s) {
  const c = gcache(s); if (c.pc) return c.pc;
  const r = rng(s.seed || 1), dens = densify(getFlat(s), Math.max(2, s.width * 0.6)), passes = [];
  for (let k = 0; k < 3; k++) {
    const amp = s.width * (k === 0 ? 0.06 : 0.17), p = new Path2D();
    dens.forEach((q, i) => { const x = q[0] + (r() - .5) * 2 * amp, y = q[1] + (r() - .5) * 2 * amp; i ? p.lineTo(x, y) : p.moveTo(x, y); });
    if (dens.length === 1) p.lineTo(dens[0][0] + .01, dens[0][1]);
    if (s.closed && dens.length > 2) p.closePath();
    passes.push({ p, w: s.width * (k === 0 ? 0.8 : 0.42), a: k === 0 ? 0.62 : 0.45, dash: k === 0 ? null : [s.width * (0.8 + r() * 2.4), s.width * (0.15 + r() * 0.9)] });
  }
  c.pc = passes; return passes;
}
function getPaint(c, s) {
  if (!s.grad) return s.color;
  const b = getBBox(s), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, r = (hypot(b.x1 - b.x0, b.y1 - b.y0) / 2) || 1, a = (s.gAngle || 0) * Math.PI / 180;
  const g = c.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  g.addColorStop(0, s.color); g.addColorStop(1, s.color2 || s.color); return g;
}
function drawShape(c, s) {
  if (!s.nodes.length) return;
  const p = getPath(s);
  c.save();
  c.globalAlpha = s.opacity;
  const paint = getPaint(c, s);
  if (s.mode === 'fill') { c.fillStyle = paint; c.fill(p); }
  else {
    c.strokeStyle = paint; c.lineWidth = s.width;
    c.lineCap = s.brush === 'marker' ? 'butt' : 'round'; c.lineJoin = s.brush === 'marker' ? 'miter' : 'round'; c.miterLimit = 3;
    if (s.brush === 'pencil') {
      const base = c.globalAlpha;
      for (const ps of getPencil(s)) { c.globalAlpha = base * ps.a; c.lineWidth = ps.w; c.lineCap = 'round'; c.setLineDash(ps.dash || []); c.stroke(ps.p); }
    } else {
      if (s.brush === 'dashed') c.setLineDash([s.width * 2.4, s.width * 1.6]);
      else if (s.brush === 'dotted') { c.setLineDash([0.01, s.width * 1.9]); c.lineCap = 'round'; }
      c.stroke(p);
    }
  }
  c.restore();
}
const HC = document.createElement('canvas').getContext('2d');
function hitShape(s, x, y, tol) {
  if (!s.nodes.length) return false;
  const p = getPath(s);
  if (s.mode === 'fill') { if (HC.isPointInPath(p, x, y)) return true; HC.lineWidth = tol * 2; return HC.isPointInStroke(p, x, y); }
  HC.lineWidth = Math.max(s.width, tol * 2); HC.lineCap = 'round'; HC.lineJoin = 'round';
  return HC.isPointInStroke(p, x, y);
}
function cloneShape(s) { const c = Object.assign({}, s); c.nodes = s.nodes.map(n => n.slice()); return c; }
function nearestOnPath(s, x, y) {
  let best = null;
  segs(s.nodes, s.closed).forEach((g, i) => {
    for (let k = 0; k <= 24; k++) {
      const t = k / 24, q = g.straight ? [g.a[0] + (g.b[0] - g.a[0]) * t, g.a[1] + (g.b[1] - g.a[1]) * t] : bez(g, t);
      const d = hypot(q[0] - x, q[1] - y);
      if (!best || d < best.d) best = { i, t, x: q[0], y: q[1], d };
    }
  });
  return best;
}
function pointInPoly(p, cs) {
  let inside = false;
  for (let i = 0, j = cs.length - 1; i < cs.length; j = i++) {
    const xi = cs[i][0], yi = cs[i][1], xj = cs[j][0], yj = cs[j][1];
    if ((yi > p.y) !== (yj > p.y) && p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/* ---- Ramer–Douglas–Peucker (trả về index) ---- */
function distSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  if (!l2) return hypot(p[0] - a[0], p[1] - a[1]);
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1);
  return hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function rdpIdx(pts, tol) {
  const n = pts.length; if (n < 3) return pts.map((_, i) => i);
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const st = [[0, n - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = distSeg(pts[i], pts[a], pts[b]); if (d > md) { md = d; mi = i; } }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  const out = []; for (let i = 0; i < n; i++) if (keep[i]) out.push(i); return out;
}
/* ---- freehand -> nodes: tự phát hiện góc gấp / đoạn cong ---- */
function processFreehand(raw, zoom, mode, forceClose) {
  let pts = [raw[0]];
  for (let i = 1; i < raw.length; i++) { const q = raw[i], l = pts[pts.length - 1]; if (hypot(q[0] - l[0], q[1] - l[1]) > 0.4 / zoom) pts.push(q); }
  if (pts.length < 2) return { nodes: [[raw[0][0], raw[0][1], 0]], closed: false };
  let total = 0; for (let i = 1; i < pts.length; i++) total += hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const first = pts[0], last = pts[pts.length - 1];
  let closed = false;
  if (forceClose || (hypot(first[0] - last[0], first[1] - last[1]) < 20 / zoom && total * zoom > 70)) {
    closed = true;
    if (hypot(first[0] - last[0], first[1] - last[1]) < 20 / zoom && pts.length > 3) pts = pts.slice(0, -1);
  }
  const tol = (mode === 'raw' ? 0.8 : mode === 'smooth' ? 3 : mode === 'straight' ? 3.2 : 2.2) / zoom;
  const idx = rdpIdx(pts, tol);
  const nodes = idx.map(i => [pts[i][0], pts[i][1], 0]);
  if (mode === 'straight') nodes.forEach(n => n[2] = 1);
  else if (mode === 'auto') {
    const W = 15 / zoom, n = pts.length;
    const walk = (i, dir) => {
      let acc = 0, j = i;
      for (let k = 0; k < n; k++) {
        const nj = closed ? (j + dir + n) % n : j + dir;
        if (nj < 0 || nj >= n) break;
        acc += hypot(pts[nj][0] - pts[j][0], pts[nj][1] - pts[j][1]); j = nj;
        if (acc >= W) break;
      }
      return pts[j];
    };
    idx.forEach((pi, k) => {
      if (!closed && (k === 0 || k === idx.length - 1)) { nodes[k][2] = 0; return; }
      const b = walk(pi, -1), f = walk(pi, 1), p = pts[pi];
      const v1 = [p[0] - b[0], p[1] - b[1]], v2 = [f[0] - p[0], f[1] - p[1]], l1 = hypot(...v1), l2 = hypot(...v2);
      if (l1 < 1e-9 || l2 < 1e-9) return;
      const cos = clamp((v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2), -1, 1);
      if (Math.acos(cos) > 0.95) nodes[k][2] = 1;   // > ~54° = góc gấp
    });
  }
  if (closed && nodes.length > 2) { const a = nodes[0], b = nodes[nodes.length - 1]; if (hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) nodes.pop(); }
  return { nodes, closed };
}

/* =========================================================
   Rendering
   ========================================================= */
let offC = null, tmpRas = null, checkerPat = null, checkerDpr = 0;
function getOff(W, H) { if (!offC) offC = mkCanvas(W, H); else if (offC.width !== W || offC.height !== H) { offC.width = W; offC.height = H; } return offC; }
function getChecker(c, dpr) {
  if (checkerPat && checkerDpr === dpr) return checkerPat;
  const t = Math.round(8 * dpr), cv = mkCanvas(t * 2, t * 2), x = cv.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, t * 2, t * 2); x.fillStyle = '#d5d8df'; x.fillRect(0, 0, t, t); x.fillRect(t, t, t, t);
  checkerPat = c.createPattern(cv, 'repeat'); checkerDpr = dpr; return checkerPat;
}
function rasSource(L) {
  if (liveStroke && liveStroke.layer === L && liveStroke.sc) {
    if (!tmpRas || tmpRas.width !== L.canvas.width || tmpRas.height !== L.canvas.height) tmpRas = mkCanvas(L.canvas.width, L.canvas.height);
    const x = tmpRas.getContext('2d'); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, tmpRas.width, tmpRas.height);
    x.drawImage(L.canvas, 0, 0);
    x.globalAlpha = liveStroke.opacity; x.globalCompositeOperation = liveStroke.erase ? 'destination-out' : 'source-over';
    x.drawImage(liveStroke.sc, 0, 0);
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    return tmpRas;
  }
  return L.canvas;
}
function tri(c, img, s0, s1, s2, d0, d1, d2, sc) {
  const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3, e = 0.7 / sc;
  const ex = p => { const dx = p[0] - cx, dy = p[1] - cy, l = hypot(dx, dy) || 1; return [p[0] + dx / l * e, p[1] + dy / l * e]; };
  const e0 = ex(d0), e1 = ex(d1), e2 = ex(d2);
  const x0 = s0[0], y0 = s0[1], x1 = s1[0], y1 = s1[1], x2 = s2[0], y2 = s2[1];
  const det = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0); if (!det) return;
  const a = ((d1[0] - d0[0]) * (y2 - y0) - (y1 - y0) * (d2[0] - d0[0])) / det;
  const cc = ((x1 - x0) * (d2[0] - d0[0]) - (d1[0] - d0[0]) * (x2 - x0)) / det;
  const b = ((d1[1] - d0[1]) * (y2 - y0) - (y1 - y0) * (d2[1] - d0[1])) / det;
  const d = ((x1 - x0) * (d2[1] - d0[1]) - (d1[1] - d0[1]) * (x2 - x0)) / det;
  c.save(); c.beginPath(); c.moveTo(e0[0], e0[1]); c.lineTo(e1[0], e1[1]); c.lineTo(e2[0], e2[1]); c.closePath(); c.clip();
  c.transform(a, b, cc, d, d0[0] - a * x0 - cc * y0, d0[1] - b * x0 - d * y0);
  const sx = Math.floor(Math.min(x0, x1, x2)) - 1, sy = Math.floor(Math.min(y0, y1, y2)) - 1;
  const sw = Math.ceil(Math.max(x0, x1, x2)) + 1 - sx, sh = Math.ceil(Math.max(y0, y1, y2)) + 1 - sy;
  c.drawImage(img, sx, sy, sw, sh, sx, sy, sw, sh);
  c.restore();
}
function drawImg(c, L, sc) {
  const img = L.img; if (!img) return;
  const iw = L.iw, ih = L.ih, cs = L.corners;
  const wpx = hypot(cs[1][0] - cs[0][0], cs[1][1] - cs[0][1]) * sc;
  c.imageSmoothingEnabled = !!L.smooth || wpx < iw; c.imageSmoothingQuality = 'high';
  const len = Math.max(1, hypot(cs[1][0] - cs[0][0], cs[1][1] - cs[0][1]));
  const par = Math.abs(cs[0][0] + cs[2][0] - cs[1][0] - cs[3][0]) + Math.abs(cs[0][1] + cs[2][1] - cs[1][1] - cs[3][1]) < 1e-3 * len;
  if (par) {
    c.save();
    c.transform((cs[1][0] - cs[0][0]) / iw, (cs[1][1] - cs[0][1]) / iw, (cs[3][0] - cs[0][0]) / ih, (cs[3][1] - cs[0][1]) / ih, cs[0][0], cs[0][1]);
    c.drawImage(img, 0, 0, iw, ih); c.restore(); return;
  }
  const N = 10, P = (u, v) => [(1 - u) * (1 - v) * cs[0][0] + u * (1 - v) * cs[1][0] + u * v * cs[2][0] + (1 - u) * v * cs[3][0], (1 - u) * (1 - v) * cs[0][1] + u * (1 - v) * cs[1][1] + u * v * cs[2][1] + (1 - u) * v * cs[3][1]];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const u0 = i / N, u1 = (i + 1) / N, v0 = j / N, v1 = (j + 1) / N;
    const d00 = P(u0, v0), d10 = P(u1, v0), d11 = P(u1, v1), d01 = P(u0, v1);
    const s00 = [u0 * iw, v0 * ih], s10 = [u1 * iw, v0 * ih], s11 = [u1 * iw, v1 * ih], s01 = [u0 * iw, v1 * ih];
    tri(c, img, s00, s10, s11, d00, d10, d11, sc); tri(c, img, s00, s11, s01, d00, d11, d01, sc);
  }
}
function paintLayerContent(c, L, m) {
  c.save(); c.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  const sc = hypot(m[0], m[1]);
  if (L.type === 'vec') { for (const s of L.shapes) drawShape(c, s); }
  else if (L.type === 'ras') { c.imageSmoothingEnabled = sc < 2; c.drawImage(rasSource(L), 0, 0); }
  else if (L.type === 'img') drawImg(c, L, sc);
  c.restore();
}
function drawLayer(c, L, m, W, H) {
  if (!L.visible) return;
  if (L.opacity >= 1 && L.blend === 'source-over' && !L.blur) { paintLayerContent(c, L, m); return; }
  const off = getOff(W, H), o = off.getContext('2d');
  o.setTransform(1, 0, 0, 1, 0, 0); o.globalAlpha = 1; o.globalCompositeOperation = 'source-over'; o.filter = 'none'; o.clearRect(0, 0, W, H);
  paintLayerContent(o, L, m);
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = L.opacity; c.globalCompositeOperation = L.blend;
  if (L.blur) c.filter = 'blur(' + (L.blur * hypot(m[0], m[1])) + 'px)';
  c.drawImage(off, 0, 0); c.restore();
}
function drawScene(c, d, m, W, H, o) {
  o = o || {};
  c.save();
  c.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  c.beginPath(); c.rect(0, 0, d.w, d.h);
  if (o.shadow) { c.save(); c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 18 * (o.dpr || 1); c.fillStyle = '#fff'; c.fill(); c.restore(); }
  c.clip();
  c.setTransform(1, 0, 0, 1, 0, 0);
  if (d.bg) { c.fillStyle = d.bg; c.fillRect(0, 0, W, H); }
  else if (o.checker) { c.fillStyle = getChecker(c, o.dpr || 1); c.fillRect(0, 0, W, H); }
  for (const L of d.layers) drawLayer(c, L, m, W, H);
  c.restore();
}
function renderDocToCanvas(d, W, H, o) {
  o = o || {};
  const c = mkCanvas(W, H), x = c.getContext('2d');
  const dd = o.bg === 'white' ? Object.assign({}, d, { bg: '#ffffff' }) : o.bg === 'transparent' ? Object.assign({}, d, { bg: null }) : d;
  const d3 = o.keepRef ? dd : Object.assign({}, dd, { layers: dd.layers.filter(l => !l.ref) });
  drawScene(x, d3, [W / d.w, 0, 0, H / d.h, 0, 0], W, H, {});
  return c;
}
/* cài đặt app (lưu localStorage) */
const Prefs = {
  _d: null,
  all() { if (!this._d) { try { this._d = JSON.parse(localStorage.getItem('vd_prefs') || '{}'); } catch (_) { this._d = {}; } } return this._d; },
  get(k, def) { const v = this.all()[k]; return v === undefined ? def : v; },
  set(k, v) { this.all()[k] = v; try { localStorage.setItem('vd_prefs', JSON.stringify(this._d)); } catch (_) { } }
};
/* layer tham chiếu (ảnh trace / background mapping): chỉ làm mờ để NHÌN, hút màu thì lấy màu thật */
const isRefLike = L => !!(L.ref || L.trace || (L.type === 'img' && L.locked && L.name === 'Ảnh gốc'));
function sampleColorAt(x, y) {
  const c = mkCanvas(1, 1), x2 = c.getContext('2d', { willReadFrequently: true });
  const keepOff = offC; offC = null;
  let sd;
  if (Prefs.get('pickLayerOnly', false)) {
    // chỉ hút trong layer đang chọn (màu thật, không nền); chỗ layer không có gì -> null -> không đổi màu
    const A = doc.layers.find(l => l.id === doc.active);
    if (!A || !A.visible) { offC = keepOff; return null; }
    sd = Object.assign({}, doc, { bg: null, layers: [Object.assign({}, A, { opacity: 1, blend: 'source-over', blur: 0 })] });
  } else sd = Object.assign({}, doc, { layers: doc.layers.map(L => isRefLike(L) ? Object.assign({}, L, { opacity: 1, blend: 'source-over', blur: 0 }) : L) });
  drawScene(x2, sd, [1, 0, 0, 1, -x, -y], 1, 1, {});
  offC = keepOff;
  const d = x2.getImageData(0, 0, 1, 1).data;
  return d[3] < 8 ? null : rgb2hex(d[0], d[1], d[2]);
}

/* ---------- SVG export (vector) ---------- */
function shapeD(s) {
  const n = s.nodes.length; if (!n) return '';
  const f = v => +v.toFixed(2);
  if (n === 1) return `M${f(s.nodes[0][0])} ${f(s.nodes[0][1])} l0.01 0`;
  const SG = segsOf(s); let d = `M${f(SG[0].a[0])} ${f(SG[0].a[1])}`;
  for (const g of SG) d += g.straight ? `L${f(g.b[0])} ${f(g.b[1])}` : `C${f(g.c1[0])} ${f(g.c1[1])} ${f(g.c2[0])} ${f(g.c2[1])} ${f(g.b[0])} ${f(g.b[1])}`;
  return d + (s.closed ? 'Z' : '');
}
function exportSVG(d, W, H, bgOverride) {
  let defs = '', body = '', gi = 0;
  const bg = bgOverride === undefined ? d.bg : bgOverride;
  for (const L of d.layers) {
    if (!L.visible) continue;
    let inner = '';
    if (L.type === 'vec') {
      for (const s of L.shapes) {
        let paint = s.color;
        if (s.grad) {
          const b = getBBox(s), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, r = (hypot(b.x1 - b.x0, b.y1 - b.y0) / 2) || 1, a = (s.gAngle || 0) * Math.PI / 180, id = 'g' + (gi++);
          defs += `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${cx - Math.cos(a) * r}" y1="${cy - Math.sin(a) * r}" x2="${cx + Math.cos(a) * r}" y2="${cy + Math.sin(a) * r}"><stop offset="0" stop-color="${s.color}"/><stop offset="1" stop-color="${s.color2}"/></linearGradient>`;
          paint = `url(#${id})`;
        }
        if (s.mode === 'fill') inner += `<path d="${shapeD(s)}" fill="${paint}" opacity="${s.opacity}"/>`;
        else {
          const dash = s.brush === 'dashed' ? ` stroke-dasharray="${s.width * 2.4} ${s.width * 1.6}"` : s.brush === 'dotted' ? ` stroke-dasharray="0.01 ${s.width * 1.9}"` : '';
          inner += `<path d="${shapeD(s)}" fill="none" stroke="${paint}" stroke-width="${s.width}" stroke-linecap="${s.brush === 'marker' ? 'butt' : 'round'}" stroke-linejoin="${s.brush === 'marker' ? 'miter' : 'round'}"${dash} opacity="${s.opacity * (s.brush === 'pencil' ? 0.85 : 1)}"/>`;
        }
      }
    } else if (L.type === 'img') {
      const cs = L.corners, src = srcOf(L);
      inner += `<image href="${src}" width="${L.iw}" height="${L.ih}" transform="matrix(${(cs[1][0] - cs[0][0]) / L.iw} ${(cs[1][1] - cs[0][1]) / L.iw} ${(cs[3][0] - cs[0][0]) / L.ih} ${(cs[3][1] - cs[0][1]) / L.ih} ${cs[0][0]} ${cs[0][1]})"${L.smooth ? '' : ' style="image-rendering:pixelated"'}/>`;
    }
    const st = `opacity:${L.opacity};` + (L.blend !== 'source-over' ? `mix-blend-mode:${L.blend};` : '') + (L.blur ? `filter:blur(${L.blur}px);` : '');
    body += `<g style="${st}">${inner}</g>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${d.w} ${d.h}"><defs>${defs}<clipPath id="art"><rect width="${d.w}" height="${d.h}"/></clipPath></defs>${bg ? `<rect width="${d.w}" height="${d.h}" fill="${bg}"/>` : ''}<g clip-path="url(#art)">${body}</g></svg>`;
}

/* =========================================================
   Layer operations
   ========================================================= */
function srcOf(L) { if (!L.src && L.img) { const c = mkCanvas(L.iw, L.ih); c.getContext('2d').drawImage(L.img, 0, 0); L.src = c.toDataURL('image/png'); } return L.src; }
function insertLayerAbove(L) { const i = doc.layers.findIndex(l => l.id === doc.active); doc.layers.splice(i + 1, 0, L); doc.active = L.id; }
function addLayer() { return withHist(() => { const L = newLayer(doc, doc.type === 'vector' ? 'vec' : 'ras', nextLayerName(doc)); insertLayerAbove(L); return L; }); }
function deleteLayer(id) {
  const L0 = layerById(id); if (L0 && L0.ref) { toast('Background tham chiếu được bảo vệ'); return; }
  if (doc.layers.filter(l => !l.ref).length <= 1) { toast('Phải còn ít nhất 1 layer'); return; }
  withHist(() => { const i = doc.layers.findIndex(l => l.id === id); doc.layers.splice(i, 1); doc.active = doc.layers[Math.min(i, doc.layers.length - 1)].id; });
}
function duplicateLayer(id) {
  if (layerById(id).ref) { toast('Background tham chiếu được bảo vệ'); return; }
  withHist(() => {
    const L = layerById(id), c = cloneLayer(L); c.id = uid(); c.name = L.name + ' copy'; c.rev = ++REV;
    if (L.type === 'ras') { c.canvas = mkCanvas(L.canvas.width, L.canvas.height); c.canvas.getContext('2d').drawImage(L.canvas, 0, 0); }
    const i = doc.layers.findIndex(l => l.id === id); doc.layers.splice(i + 1, 0, c); doc.active = c.id;
  });
}
function moveLayer(id, dir) {
  const i = doc.layers.findIndex(l => l.id === id), j = i + dir; if (j < 0 || j >= doc.layers.length) return;
  if (doc.layers[i].ref || doc.layers[j].ref) { toast('Background tham chiếu luôn nằm dưới cùng'); return; }
  withHist(() => { const a = doc.layers.slice(); [a[i], a[j]] = [a[j], a[i]]; doc.layers = a; });
}
function clearLayer(id) {
  if (layerById(id).ref) { toast('Background tham chiếu được bảo vệ'); return; }
  withHist(() => { const L = layerById(id); if (L.type === 'vec') L.shapes = []; else if (L.type === 'ras') L.canvas = mkCanvas(doc.w, doc.h); touch(L); if (typeof sel !== 'undefined') sel = null; });
}
function rasterizeInPlace(L) {
  const c = mkCanvas(doc.w, doc.h), x = c.getContext('2d');
  x.save(); paintLayerContent(x, L, [1, 0, 0, 1, 0, 0]); x.restore();
  L.canvas = c; L.type = 'ras'; delete L.img; delete L.src; delete L.corners; delete L.smooth; touch(L);
}
function rasterizeLayer(id) {
  const L = layerById(id); if (!L || L.type !== 'img' || doc.type !== 'raster') return;
  withHist(() => rasterizeInPlace(L));
}
function mergeDown(id) {
  const i = doc.layers.findIndex(l => l.id === id); if (i <= 0) { toast('Không có layer bên dưới'); return; }
  const up = doc.layers[i], lo = doc.layers[i - 1];
  if (up.ref || lo.ref) { toast('Không gộp được với background tham chiếu'); return; }
  withHist(() => {
    if (up.type === 'vec' && lo.type === 'vec') {
      const k = up.opacity; if (up.blend !== 'source-over' || up.blur) toast('Blend/blur của layer trên bị bỏ khi gộp vector');
      lo.shapes = lo.shapes.concat(up.shapes.map(s => k < 1 ? Object.assign({}, s, { opacity: s.opacity * k }) : s)).map(s => Object.assign({}, s, { z: nextZ() }));
      touch(lo);
    } else {
      const sc = doc.type === 'vector' ? Math.min(4, Math.max(1, 2048 / Math.max(doc.w, doc.h))) : 1;
      const W = Math.round(doc.w * sc), H = Math.round(doc.h * sc), c = mkCanvas(W, H), x = c.getContext('2d'), m = [W / doc.w, 0, 0, H / doc.h, 0, 0];
      const lo2 = Object.assign({}, lo, { opacity: 1, blend: 'source-over', blur: 0 });
      drawLayer(x, lo2, m, W, H); drawLayer(x, up, m, W, H);
      if (doc.type === 'raster') { lo.type = 'ras'; lo.canvas = c; delete lo.img; delete lo.src; delete lo.corners; }
      else {
        toast('Gộp layer ảnh → kết quả thành ảnh (không còn vector)');
        delete lo.shapes; delete lo.canvas; lo.type = 'img'; lo.img = c; lo.src = null; lo.iw = W; lo.ih = H; lo.smooth = true; lo.corners = [[0, 0], [doc.w, 0], [doc.w, doc.h], [0, doc.h]];
      }
      touch(lo);
    }
    doc.layers.splice(i, 1); doc.active = lo.id;
  });
}
function loadImage(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Không đọc được ảnh')); im.src = src; }); }
function fileToDataURL(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); }); }
async function addImageLayerFromSrc(src, name, opts) {
  const im = await loadImage(src);
  const iw = im.naturalWidth || im.width || 1, ih = im.naturalHeight || im.height || 1;
  const L = newLayer(doc, 'img', name || 'Image');
  L.img = im; L.src = src; L.iw = iw; L.ih = ih; L.smooth = !(iw <= 128 && ih <= 128);
  const k = (opts && opts.fill) ? Math.min(doc.w / iw, doc.h / ih) : Math.min(doc.w / iw, doc.h / ih);
  const w = iw * k, h = ih * k, x = (doc.w - w) / 2, y = (doc.h - h) / 2;
  L.corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  if (opts && opts.opacity != null) L.opacity = opts.opacity;
  if (opts && opts.locked) L.locked = true;
  withHist(() => insertLayerAbove(L));
  return L;
}

/* =========================================================
   Raster helpers (patch history)
   ========================================================= */
function clampRect(r, W, H) {
  const x0 = clamp(Math.floor(r.x0), 0, W), y0 = clamp(Math.floor(r.y0), 0, H), x1 = clamp(Math.ceil(r.x1), 0, W), y1 = clamp(Math.ceil(r.y1), 0, H);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}
function pushPatch(L, rect, before, after) {
  pushHist({ kind: 'patch', layerId: L.id, x: rect.x, y: rect.y, before, after, bytes: rect.w * rect.h * 8 });
  touch(L);
}
function rasterOp(L, r, fn) {
  const R = clampRect(r, L.canvas.width, L.canvas.height); if (!R.w || !R.h) return;
  const x = L.canvas.getContext('2d', { willReadFrequently: false });
  const before = x.getImageData(R.x, R.y, R.w, R.h);
  x.save(); fn(x); x.restore();
  const after = x.getImageData(R.x, R.y, R.w, R.h);
  pushPatch(L, R, before, after);
}

/* =========================================================
   Storage: IndexedDB + (de)serialize
   ========================================================= */
const DB = { db: null };
function dbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('vecdraw', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('meta', { keyPath: 'id' }); d.createObjectStore('data', { keyPath: 'id' }); };
    r.onsuccess = () => { DB.db = r.result; res(); };
    r.onerror = () => rej(r.error);
  });
}
const dbReq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const dbGetAll = s => dbReq(DB.db.transaction(s).objectStore(s).getAll());
const dbGet = (s, id) => dbReq(DB.db.transaction(s).objectStore(s).get(id));
const dbPut = (s, v) => new Promise((res, rej) => { const t = DB.db.transaction(s, 'readwrite'); t.objectStore(s).put(v); t.oncomplete = res; t.onerror = () => rej(t.error); });
const dbDel = (s, id) => new Promise((res, rej) => { const t = DB.db.transaction(s, 'readwrite'); t.objectStore(s).delete(id); t.oncomplete = res; t.onerror = () => rej(t.error); });

function canvasToDataURL(c) {
  return new Promise((res, rej) => c.toBlob(b => { if (!b) return rej(new Error('toBlob failed')); const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); }, 'image/png'));
}
async function serLayers(list) {
  const layers = [];
  for (const l of list) {
    if (l.ref) continue;
    const o = { id: l.id, name: l.name, type: l.type, visible: l.visible, locked: l.locked, opacity: l.opacity, blend: l.blend, blur: l.blur };
    if (l.trace) o.trace = true;
    if (l.type === 'vec') o.shapes = l.shapes;
    else if (l.type === 'img') { o.src = srcOf(l); o.corners = l.corners; o.smooth = l.smooth; o.iw = l.iw; o.ih = l.ih; }
    else { if (!l._png || l._pngRev !== l.rev) { l._png = await canvasToDataURL(l.canvas); l._pngRev = l.rev; } o.png = l._png; }
    layers.push(o);
  }
  return layers;
}
async function serializeDoc(d) {
  if (d.mapping && d === doc && typeof commitTab === 'function') commitTab();
  const o = { v: 1, id: d.id, name: d.name, type: d.type, w: d.w, h: d.h, bg: d.bg, active: d.active, layers: d.mapping ? [] : await serLayers(d.layers), created: d.created, updated: Date.now(), zmax: d.zmax || 0 };
  if (d.mapping) {
    const m = d.mapping, sets = {};
    for (const k in m.sets) sets[k] = { active: m.sets[k].active, layers: await serLayers(m.sets[k].layers) };
    o.mapping = { sourceId: m.sourceId, layout: m.layout, cur: m.cur, ref: m.ref, bgs: m.bgs, sets };
  }
  return o;
}
async function desLayers(arr, d) {
  const out = [];
  for (const s of arr) {
    const l = { id: s.id || uid(), name: s.name, type: s.type, visible: s.visible !== false, locked: !!s.locked, opacity: s.opacity == null ? 1 : s.opacity, blend: s.blend || 'source-over', blur: s.blur || 0, rev: ++REV };
    if (s.trace) l.trace = true;
    if (s.type === 'vec') { l.shapes = (s.shapes || []).map(sh => Object.assign({ id: uid(), closed: false, mode: 'line', color: '#000000', grad: false, color2: '#ffffff', gAngle: 0, width: 4, opacity: 1, brush: 'pen', seed: 1 }, sh));
      l.shapes.forEach(sh => { if (sh.z == null) sh.z = (d.zmax = (d.zmax || 0) + 1); else if (sh.z > (d.zmax || 0)) d.zmax = sh.z; }); }
    else if (s.type === 'img') { l.src = s.src; l.img = await loadImage(s.src); l.iw = s.iw || l.img.naturalWidth; l.ih = s.ih || l.img.naturalHeight; l.corners = s.corners; l.smooth = s.smooth !== false; }
    else { l.canvas = mkCanvas(d.w, d.h); if (s.png) { const im = await loadImage(s.png); l.canvas.getContext('2d').drawImage(im, 0, 0); } l._png = s.png; l._pngRev = l.rev; }
    out.push(l);
  }
  return out;
}
async function deserializeDoc(o) {
  const d = { id: o.id || uid(), name: o.name || 'Untitled', type: o.type, w: o.w, h: o.h, bg: o.bg === undefined ? '#ffffff' : o.bg, layers: [], active: o.active, created: o.created || Date.now(), zmax: o.zmax || 0 };
  if (o.mapping) {
    const m = o.mapping; d.mapping = { sourceId: m.sourceId, layout: m.layout || '', cur: m.cur || 'normal', ref: m.ref || { visible: true, opacity: 1 }, bgs: m.bgs || {}, sets: {}, refStamp: 0 };
    for (const k in (m.sets || {})) d.mapping.sets[k] = { active: m.sets[k].active, layers: await desLayers(m.sets[k].layers, d) };
    await attachRef(d); return d;
  }
  d.layers = await desLayers(o.layers, d);
  if (!d.layers.length) d.layers.push(newLayer(d, d.type === 'vector' ? 'vec' : 'ras', 'Layer 1'));
  if (!d.layers.find(l => l.id === d.active)) d.active = d.layers[d.layers.length - 1].id;
  return d;
}
async function makeThumb(d) {
  const k = 260 / Math.max(d.w, d.h), W = Math.max(1, Math.round(d.w * k)), H = Math.max(1, Math.round(d.h * k));
  const c = renderDocToCanvas(d, W, H, { bg: d.bg ? 'keep' : 'transparent' });
  return c.toDataURL('image/png');
}
let saving = false, saveAgain = false, saveTimer = 0, dirty = false;
function markDirty() { dirty = true; setSaveState('…'); clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 1400); }
async function saveNow() {
  if (!doc) return;
  if (saving) { saveAgain = true; return; }
  saving = true; clearTimeout(saveTimer);
  const d = doc;
  try {
    dirty = false;
    const data = await serializeDoc(d);
    const thumb = await makeThumb(d);
    await dbPut('data', data);
    await dbPut('meta', { id: d.id, name: d.name, type: d.type, w: d.w, h: d.h, updated: Date.now(), thumb, bg: d.bg, mapping: !!d.mapping });
    if (doc === d && !dirty) setSaveState('✓');
  } catch (e) { console.error(e); setSaveState('!'); toast('Lỗi lưu: ' + e.message); }
  saving = false;
  if (saveAgain) { saveAgain = false; saveNow(); }
}
