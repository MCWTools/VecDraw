'use strict';
/* =========================================================
   VecDraw – view, input, tools
   ========================================================= */
let tool = 'poly', sel = null, pend = null;
const XF = { lock: true, warp: false };
const cv = $('#view'), cx = cv.getContext('2d');
let CW = 1, CH = 1, DPR = 1, rafP = false;

function resizeView() {
  const r = cv.parentElement.getBoundingClientRect();
  if (!r.width || !r.height) return;
  DPR = window.devicePixelRatio || 1; CW = r.width; CH = r.height;
  cv.width = Math.max(1, Math.round(CW * DPR)); cv.height = Math.max(1, Math.round(CH * DPR));
  requestRender();
}
function requestRender() { if (rafP) return; rafP = true; requestAnimationFrame(() => { rafP = false; paint(); }); }
function paint() {
  if (!doc) return;
  cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cv.width, cv.height);
  drawScene(cx, doc, [view.s * DPR, 0, 0, view.s * DPR, view.ox * DPR, view.oy * DPR], cv.width, cv.height, { shadow: true, checker: true, dpr: DPR });
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawOverlay(cx);
  const z = $('#zLabel'); if (z) z.textContent = Math.round(view.s * 100) + '%';
}
function toDoc(clientX, clientY) {
  const r = cv.getBoundingClientRect(), sx = clientX - r.left, sy = clientY - r.top;
  return { sx, sy, x: (sx - view.ox) / view.s, y: (sy - view.oy) / view.s, pressure: 0.5 };
}
const toScr = (x, y) => [x * view.s + view.ox, y * view.s + view.oy];
function fitView() {
  if (!doc) return; resizeView();
  const pad = 26, s = Math.min((CW - pad * 2) / doc.w, (CH - pad * 2) / doc.h);
  view.s = clamp(s, 0.02, 64); view.ox = (CW - doc.w * view.s) / 2; view.oy = (CH - doc.h * view.s) / 2; requestRender();
}
function zoomAt(sx, sy, f) {
  const ns = clamp(view.s * f, 0.02, 64), k = ns / view.s;
  view.ox = sx - (sx - view.ox) * k; view.oy = sy - (sy - view.oy) * k; view.s = ns; requestRender();
}
new ResizeObserver(resizeView).observe($('#stage'));

/* ---------------- pointer input ---------------- */
const ptrs = new Map(); let gest = null, panning = null, activeP = null, lockInput = false;
const keys = { space: false };
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); if (!doc) return;
  try { cv.setPointerCapture(e.pointerId); } catch (_) { }
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) { cancelAction(); startGesture(); return; }
  if (ptrs.size > 2 || lockInput) return;
  if (keys.space || e.button === 1 || e.button === 2 || tool === 'hand') { panning = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy, btn: e.button, moved: false }; return; }
  const p = toDoc(e.clientX, e.clientY); p.pressure = e.pressure || 0.5;
  activeP = e.pointerId; const T = TOOLS[tool]; if (T.down) T.down(p, e);
});
cv.addEventListener('pointermove', e => {
  const pt = ptrs.get(e.pointerId); if (!pt) return;
  pt.x = e.clientX; pt.y = e.clientY;
  if (gest) { updateGesture(); return; }
  if (panning) { const dx = e.clientX - panning.x, dy = e.clientY - panning.y; if (hypot(dx, dy) > 4) panning.moved = true; view.ox = panning.ox + dx; view.oy = panning.oy + dy; requestRender(); return; }
  if (activeP === e.pointerId) { const p = toDoc(e.clientX, e.clientY); p.pressure = e.pressure || 0.5; const T = TOOLS[tool]; if (T.move) T.move(p, e); }
});
function endPtr(e) {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (gest) { if (ptrs.size < 2) { gest = null; lockInput = true; } if (!ptrs.size) lockInput = false; return; }
  if (panning) { const pn = panning; panning = null; if (pn.btn === 2 && !pn.moved) rightClick(); if (!ptrs.size) lockInput = false; return; }
  if (activeP === e.pointerId) {
    activeP = null;
    if (e.type === 'pointercancel') cancelAction();
    else { const p = toDoc(e.clientX, e.clientY); const T = TOOLS[tool]; if (T.up) T.up(p, e); }
  }
  if (!ptrs.size) lockInput = false;
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))); }, { passive: false });
function startGesture() {
  const a = [...ptrs.values()], r = cv.getBoundingClientRect();
  gest = { d0: hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, s0: view.s, mx: (a[0].x + a[1].x) / 2 - r.left, my: (a[0].y + a[1].y) / 2 - r.top, ox: view.ox, oy: view.oy };
}
function updateGesture() {
  const a = [...ptrs.values()]; if (a.length < 2 || !gest) return;
  const r = cv.getBoundingClientRect(), d = hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
  const mx = (a[0].x + a[1].x) / 2 - r.left, my = (a[0].y + a[1].y) / 2 - r.top;
  const ns = clamp(gest.s0 * d / gest.d0, 0.02, 64), k = ns / gest.s0;
  view.s = ns; view.ox = mx - (gest.mx - gest.ox) * k; view.oy = my - (gest.my - gest.oy) * k; requestRender();
}
function cancelAction() { const T = TOOLS[tool]; if (T && T.cancel) T.cancel(); activeP = null; requestRender(); }
function rightClick() { if (pend && pend.pts.length) { pend.pts.pop(); if (!pend.pts.length) pend = null; requestRender(); uiRefresh(); } }

/* ---------------- tool plumbing ---------------- */
function setTool(id) {
  if (!TOOLS[id]) return;
  if (tool === 'poly' && id !== 'poly' && pend) commitPending(true);
  cancelAction();
  tool = id; if (id !== 'select') sel = null;
  uiRefresh(true); requestRender();
}
function setActive(id) { if (doc.active !== id) { doc.active = id; uiRefresh(true); } }
function checkEditable(L) {
  if (!L) return false;
  if (L.ref) { toast('Background tham chiếu được bảo vệ 🔒 (chỉ ẩn/hiện + opacity)'); return false; }
  if (L.locked) { toast('Layer đang khoá 🔒'); return false; }
  if (!L.visible) { toast('Layer đang ẩn'); return false; }
  return true;
}
function newShape(nodes, closed, seed) {
  return { id: uid(), nodes, closed, mode: ST.mode, color: ST.color, grad: ST.grad, color2: ST.color2, gAngle: ST.gAngle, width: ST.width, opacity: ST.opacity, brush: ST.brush, round: ST.round || 0, seed: seed || ((Math.random() * 1e9) | 0) };
}
function commitShape(s) {
  let L = activeLayer(); if (!checkEditable(L)) return false;
  if (doc.type === 'vector') {
    withHist(() => {
      if (L.type !== 'vec') { const N = newLayer(doc, 'vec', nextLayerName(doc)); insertLayerAbove(N); L = N; toast('Tạo layer vector mới để vẽ'); }
      s.z = nextZ(); L.shapes = L.shapes.concat([s]); touch(L);
    });
  } else {
    if (L.type === 'img') { withHist(() => rasterizeInPlace(L)); toast('Đã rasterize layer ảnh để vẽ lên'); }
    const b = getBBox(s), pad = (s.mode === 'line' ? s.width : 0) + 4;
    rasterOp(L, { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }, x => drawShape(x, s));
  }
  requestRender(); uiRefresh(); return true;
}

/* ---------------- polygon (click points) ---------------- */
function pendShape() {
  if (!pend || !pend.pts.length) return null;
  const fill = ST.mode === 'fill';
  return newShape(pend.pts.map(p => [p[0], p[1], ST.curve ? 0 : 1]), fill || ST.closed, pend.seed);
}
function commitPending(silent) {
  if (!pend) return false;
  const n = pend.pts.length, fill = ST.mode === 'fill';
  if ((fill && n < 3) || (!fill && n < 2)) { if (!silent) toast(fill ? 'Fill cần ít nhất 3 điểm' : 'Cần ít nhất 2 điểm'); return false; }
  const s = pendShape(); pend = null;
  const ok = commitShape(s); requestRender(); uiRefresh(true); return ok;
}
function cancelPending() { pend = null; requestRender(); uiRefresh(true); }
function pendPop() { if (pend && pend.pts.length) { pend.redo.push(pend.pts.pop()); if (!pend.pts.length) pend = null; requestRender(); uiRefresh(true); } }
function restyleLive() { requestRender(); }
function nearestPt(pts, p, tolDoc) { let bi = -1, bd = tolDoc; pts.forEach((q, i) => { const d = hypot(q[0] - p.x, q[1] - p.y); if (d <= bd) { bd = d; bi = i; } }); return bi; }

const polyTool = {
  drag: null, tap: null,
  down(p) {
    if (pend) { const i = nearestPt(pend.pts, p, 18 / view.s); if (i >= 0) { this.drag = { i }; return; } }
    this.tap = { sx: p.sx, sy: p.sy };
  },
  move(p) {
    if (this.drag) { const q = pend.pts[this.drag.i]; q[0] = p.x; q[1] = p.y; requestRender(); }
    else if (this.tap && hypot(p.sx - this.tap.sx, p.sy - this.tap.sy) > 9) this.tap = null;
  },
  up(p) {
    if (this.drag) { this.drag = null; return; }
    if (this.tap) {
      this.tap = null;
      const L = activeLayer(); if (!checkEditable(L)) return;
      if (!pend) pend = { pts: [], redo: [], seed: (Math.random() * 1e9) | 0 };
      pend.pts.push([p.x, p.y]); pend.redo = [];
      requestRender(); uiRefresh(true);
    }
  },
  cancel() { this.drag = null; this.tap = null; }
};

/* ---------------- freehand (đè kéo, tự nhận góc/cong) ---------------- */
const freeTool = {
  raw: null, lastS: null,
  down(p) { if (!checkEditable(activeLayer())) return; this.raw = [[p.x, p.y]]; this.lastS = [p.sx, p.sy]; },
  move(p, e) {
    if (!this.raw) return;
    const evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
    for (const ev of (evs.length ? evs : [e])) {
      const q = toDoc(ev.clientX, ev.clientY);
      if (hypot(q.sx - this.lastS[0], q.sy - this.lastS[1]) >= 1.5) { this.raw.push([q.x, q.y]); this.lastS = [q.sx, q.sy]; }
    }
    requestRender();
  },
  up(p) {
    const raw = this.raw; this.raw = null; if (!raw) return;
    const fill = ST.mode === 'fill';
    const res = processFreehand(raw, view.s, ST.free, fill);
    if (fill && res.nodes.length < 3) { toast('Vẽ vòng kín để fill'); requestRender(); return; }
    { const fs = newShape(res.nodes, fill || res.closed); fs.round = 0; commitShape(fs); }
  },
  cancel() { this.raw = null; },
  overlay(c) {
    if (!this.raw || this.raw.length < 1) return;
    const idx = rdpIdx(this.raw, 0.6 / view.s), nodes = idx.map(i => [this.raw[i][0], this.raw[i][1], 0]);
    const s = newShape(nodes, ST.mode === 'fill', 7); c.save();
    c.setTransform(DPR * view.s, 0, 0, DPR * view.s, view.ox * DPR, view.oy * DPR); drawShape(c, s); c.restore();
  }
};

/* ---------------- select / transform / node edit ---------------- */
let xf = null, lastTap = { t: 0, x: 0, y: 0 };
function selShape() { if (!sel) return null; const L = layerById(sel.lid); if (!L || L.type !== 'vec') return null; return L.shapes.find(s => s.id === sel.sid) || null; }
function currentTarget() {
  const s = selShape();
  if (s) return { kind: 'shape', shape: s, layer: layerById(sel.lid), corners: shapeBox(s) };
  const L = activeLayer();
  if (L && L.type === 'img' && L.visible && !L.ref) return { kind: 'img', layer: L, corners: L.corners };
  return null;
}
function pickAt(p) {
  const tol = 12 / view.s;
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const L = doc.layers[i]; if (!L.visible || L.locked) continue;
    if (L.type === 'vec') { for (let j = L.shapes.length - 1; j >= 0; j--) if (hitShape(L.shapes[j], p.x, p.y, tol)) return { L, s: L.shapes[j] }; }
    else if (L.type === 'img' && pointInPoly(p, L.corners)) return { L };
  }
  return null;
}
function selectShape(L, s) { sel = { lid: L.id, sid: s.id, mode: sel ? sel.mode : 'nodes', ni: -1 }; doc.active = L.id; uiRefresh(true); requestRender(); if (typeof shapeEd !== 'undefined' && shapeEd) shapeEd.sync(); }
function handlePts(cs) {
  const S = cs.map(q => toScr(q[0], q[1])), mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m = [mid(S[0], S[1]), mid(S[1], S[2]), mid(S[2], S[3]), mid(S[3], S[0])];
  let dv = [S[3][0] - S[0][0], S[3][1] - S[0][1]]; const l = hypot(dv[0], dv[1]) || 1; dv = [dv[0] / l, dv[1] / l];
  return { S, m, rot: [m[0][0] - dv[0] * 30, m[0][1] - dv[1] * 30] };
}
function hitHandle(cs, p) {
  const H = handlePts(cs), R = 17, d = (a) => hypot(a[0] - p.sx, a[1] - p.sy);
  if (d(H.rot) < R) return 'rot';
  for (let i = 0; i < 4; i++) if (d(H.S[i]) < R) return 'c' + i;
  for (let i = 0; i < 4; i++) if (d(H.m[i]) < R) return 'e' + i;
  return null;
}
const nz = s => Math.abs(s) < 0.01 ? (s < 0 ? -0.01 : 0.01) : s;
function xformDrag(key, cs0, p0, p, lock, warp) {
  const dx = p.x - p0.x, dy = p.y - p0.y;
  if (key === 'move') return cs0.map(q => [q[0] + dx, q[1] + dy]);
  const cen = [(cs0[0][0] + cs0[2][0]) / 2, (cs0[0][1] + cs0[2][1]) / 2];
  if (key === 'rot') {
    const da = Math.atan2(p.y - cen[1], p.x - cen[0]) - Math.atan2(p0.y - cen[1], p0.x - cen[0]), co = Math.cos(da), si = Math.sin(da);
    return cs0.map(q => { const rx = q[0] - cen[0], ry = q[1] - cen[1]; return [cen[0] + rx * co - ry * si, cen[1] + rx * si + ry * co]; });
  }
  if (warp) {
    if (key[0] === 'c') { const i = +key[1]; return cs0.map((q, j) => j === i ? [q[0] + dx, q[1] + dy] : q.slice()); }
    if (key[0] === 'e') { const i = +key[1], j = (i + 1) % 4; return cs0.map((q, k) => (k === i || k === j) ? [q[0] + dx, q[1] + dy] : q.slice()); }
  }
  let ux = [cs0[1][0] - cs0[0][0], cs0[1][1] - cs0[0][1]], uy = [cs0[3][0] - cs0[0][0], cs0[3][1] - cs0[0][1]];
  const lu = hypot(ux[0], ux[1]) || 1, lv = hypot(uy[0], uy[1]) || 1; ux = [ux[0] / lu, ux[1] / lu]; uy = [uy[0] / lv, uy[1] / lv];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  if (key[0] === 'c') {
    const i = +key[1], o = cs0[(i + 2) % 4], ci = [cs0[i][0] - o[0], cs0[i][1] - o[1]], d = [p.x - o[0], p.y - o[1]];
    let sx, sy;
    if (lock) { sx = sy = dot(d, ci) / (dot(ci, ci) || 1); }
    else { const ai = dot(ci, ux), bi = dot(ci, uy); sx = ai ? dot(d, ux) / ai : 1; sy = bi ? dot(d, uy) / bi : 1; }
    sx = nz(sx); sy = nz(sy);
    return cs0.map(q => { const r = [q[0] - o[0], q[1] - o[1]], a = dot(r, ux) * sx, b = dot(r, uy) * sy; return [o[0] + ux[0] * a + uy[0] * b, o[1] + ux[1] * a + uy[1] * b]; });
  }
  if (key[0] === 'e') {
    const i = +key[1], axis = (i % 2 === 0) ? uy : ux, ea = cs0[i], eb = cs0[(i + 1) % 4], em = [(ea[0] + eb[0]) / 2, (ea[1] + eb[1]) / 2];
    const oi = (i + 2) % 4, oa = cs0[oi], ob = cs0[(oi + 1) % 4], om = [(oa[0] + ob[0]) / 2, (oa[1] + ob[1]) / 2];
    const den = dot([em[0] - om[0], em[1] - om[1]], axis), s = nz(den ? dot([p.x - om[0], p.y - om[1]], axis) / den : 1);
    return cs0.map(q => { const along = dot([q[0] - om[0], q[1] - om[1]], axis), add = along * (s - 1); return [q[0] + axis[0] * add, q[1] + axis[1] * add]; });
  }
  return cs0;
}
function applyAffine(shape, c0, c1, orig) {
  const u0 = [c0[1][0] - c0[0][0], c0[1][1] - c0[0][1]], v0 = [c0[3][0] - c0[0][0], c0[3][1] - c0[0][1]];
  const det = u0[0] * v0[1] - u0[1] * v0[0] || 1e-9;
  const u1 = [c1[1][0] - c1[0][0], c1[1][1] - c1[0][1]], v1 = [c1[3][0] - c1[0][0], c1[3][1] - c1[0][1]];
  orig.forEach((n, i) => {
    const qx = n[0] - c0[0][0], qy = n[1] - c0[0][1];
    const s = (qx * v0[1] - qy * v0[0]) / det, t = (u0[0] * qy - u0[1] * qx) / det;
    shape.nodes[i][0] = c1[0][0] + s * u1[0] + t * v1[0]; shape.nodes[i][1] = c1[0][1] + s * u1[1] + t * v1[1];
  });
  invalidate(shape);
}
function swapClone(L, s) { const c = cloneShape(s); L.shapes = L.shapes.map(x => x === s ? c : x); return c; }
function beginXf(t, key, p) {
  if (!t) return;
  const before = snap(); let shape = null;
  if (t.kind === 'shape') shape = swapClone(t.layer, t.shape);
  xf = { t: Object.assign({}, t, { shape: shape || t.shape }), key, p0: p, s0: [p.sx, p.sy], cs0: t.corners.map(c => c.slice()), before, moved: false, orig: shape ? shape.nodes.map(n => n.slice()) : null };
}
function hitNode(s, p) { let bi = -1, bd = 17; s.nodes.forEach((n, i) => { const q = toScr(n[0], n[1]), d = hypot(q[0] - p.sx, q[1] - p.sy); if (d < bd) { bd = d; bi = i; } }); return bi; }
const lp = { t: 0, fired: false };
const selectTool = {
  down(p, e) {
    xf = null; clearTimeout(lp.t); lp.fired = false;
    const t = currentTarget();
    if (t) {
      if (t.kind === 'shape' && sel.mode === 'nodes') {
        const i = hitNode(t.shape, p);
        if (i >= 0) {
          sel.ni = i; const before = snap(), shape = swapClone(t.layer, t.shape);
          xf = { node: true, t: { kind: 'shape', layer: t.layer, shape }, i, n0: [shape.nodes[i][0], shape.nodes[i][1]], p0: p, s0: [p.sx, p.sy], before, moved: false };
          uiRefresh(); requestRender(); return;
        }
      } else {
        const h = hitHandle(t.corners, p);
        if (h) { beginXf(t, h, p); return; }
      }
    }
    const hit = pickAt(p);
    if (hit) {
      if (hit.s) {
        selectShape(hit.L, hit.s); beginXf(currentTarget(), 'move', p);
        const cx = e ? e.clientX : 0, cy = e ? e.clientY : 0;
        lp.t = setTimeout(() => { if (xf && !xf.moved) { xf = null; lp.fired = true; shapeMenu(cx, cy); } }, 480);
      }
      else { sel = null; setActive(hit.L.id); beginXf(currentTarget(), 'move', p); }
    } else if (sel) { sel = null; uiRefresh(true); if (typeof shapeEd !== 'undefined' && shapeEd) shapeEd.sync(); }
    requestRender();
  },
  move(p) {
    if (!xf) return;
    if (!xf.moved && hypot(p.sx - xf.s0[0], p.sy - xf.s0[1]) < 4) return;
    xf.moved = true; clearTimeout(lp.t);
    if (xf.node) { const n = xf.t.shape.nodes[xf.i]; n[0] = xf.n0[0] + (p.x - xf.p0.x); n[1] = xf.n0[1] + (p.y - xf.p0.y); invalidate(xf.t.shape); touch(xf.t.layer); requestRender(); return; }
    const t = xf.t, warp = t.kind === 'img' && XF.warp, cs = xformDrag(xf.key, xf.cs0, xf.p0, p, XF.lock, warp);
    if (t.kind === 'img') { t.layer.corners = cs; touch(t.layer); }
    else { applyAffine(t.shape, xf.cs0, cs, xf.orig); touch(t.layer); }
    requestRender();
  },
  up(p) {
    clearTimeout(lp.t); if (lp.fired) { lp.fired = false; xf = null; requestRender(); return; }
    const moved = xf && xf.moved;
    if (xf && moved) pushHist({ kind: 'doc', before: xf.before, after: snap() });
    xf = null;
    if (!moved) {
      const now = Date.now(), dbl = now - lastTap.t < 380 && hypot(p.sx - lastTap.x, p.sy - lastTap.y) < 24;
      lastTap = { t: now, x: p.sx, y: p.sy };
      if (dbl) { lastTap.t = 0; doubleTap(p); }
    }
    uiRefresh(); requestRender();
  },
  cancel() { clearTimeout(lp.t); if (xf && xf.moved) { restoreSnap(xf.before); } xf = null; },
  overlay(c) {
    const t = currentTarget(); if (!t) return;
    c.save();
    if (t.kind === 'shape' && sel.mode === 'nodes') {
      const s = t.shape, path = new Path2D();
      segs(s.nodes, s.closed).forEach((g, i) => { const a = toScr(g.a[0], g.a[1]), b = toScr(g.b[0], g.b[1]); if (!i) path.moveTo(a[0], a[1]); if (g.straight) path.lineTo(b[0], b[1]); else { const c1 = toScr(g.c1[0], g.c1[1]), c2 = toScr(g.c2[0], g.c2[1]); path.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], b[0], b[1]); } });
      c.lineWidth = 1.5; c.strokeStyle = 'rgba(91,140,255,.9)'; c.stroke(path);
      s.nodes.forEach((n, i) => {
        const q = toScr(n[0], n[1]); c.fillStyle = i === sel.ni ? '#5b8cff' : '#fff'; c.strokeStyle = '#2b4fb8'; c.lineWidth = 1.6;
        c.beginPath(); if (n[2]) c.rect(q[0] - 6, q[1] - 6, 12, 12); else c.arc(q[0], q[1], 6.5, 0, 6.283); c.fill(); c.stroke();
      });
    } else {
      const H = handlePts(t.corners);
      c.lineWidth = 1.5; c.strokeStyle = '#5b8cff'; c.setLineDash([6, 4]); c.beginPath(); H.S.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath(); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.moveTo(H.m[0][0], H.m[0][1]); c.lineTo(H.rot[0], H.rot[1]); c.stroke();
      c.fillStyle = '#fff'; c.strokeStyle = '#2b4fb8'; c.lineWidth = 1.6;
      const warp = t.kind === 'img' && XF.warp;
      H.S.forEach(q => { c.beginPath(); if (warp) c.arc(q[0], q[1], 8, 0, 6.283); else c.rect(q[0] - 6.5, q[1] - 6.5, 13, 13); c.fill(); c.stroke(); });
      H.m.forEach(q => { c.beginPath(); c.arc(q[0], q[1], 5, 0, 6.283); c.fill(); c.stroke(); });
      c.beginPath(); c.arc(H.rot[0], H.rot[1], 7, 0, 6.283); c.fillStyle = '#5b8cff'; c.fill(); c.stroke();
    }
    c.restore();
  }
};
function doubleTap(p) {
  const s = selShape(); if (!s) return;
  if (sel.mode === 'box') { setSelMode('nodes'); return; }
  const i = hitNode(s, p);
  if (i >= 0) { sel.ni = i; toggleNodeCorner(); return; }
  addNodeAt(s, p.x, p.y);
}
function setSelMode(m) { if (sel) { sel.mode = m; sel.ni = -1; uiRefresh(true); requestRender(); } }
function addNodeAt(s, x, y) {
  const near = nearestOnPath(s, x, y); if (!near || near.d > 16 / view.s) return false;
  const L = layerById(sel.lid), before = snap(), ns = cloneShape(s), a = ns.nodes[near.i], b = ns.nodes[(near.i + 1) % ns.nodes.length];
  ns.nodes.splice(near.i + 1, 0, [near.x, near.y, (a[2] && b[2]) ? 1 : 0]);
  L.shapes = L.shapes.map(q => q === s ? ns : q); touch(L); sel.ni = near.i + 1; pushHist({ kind: 'doc', before, after: snap() }); return true;
}
function toggleNodeCorner() {
  const s = selShape(); if (!s || sel.ni < 0) { toast('Chạm vào 1 điểm trước'); return; }
  const L = layerById(sel.lid), before = snap(), ns = cloneShape(s); ns.nodes[sel.ni][2] = ns.nodes[sel.ni][2] ? 0 : 1;
  L.shapes = L.shapes.map(q => q === s ? ns : q); touch(L); pushHist({ kind: 'doc', before, after: snap() });
}
function deleteNode() {
  const s = selShape(); if (!s || sel.ni < 0) { toast('Chạm vào 1 điểm trước'); return; }
  if (s.nodes.length <= 2) { toast('Cần giữ ≥ 2 điểm'); return; }
  const L = layerById(sel.lid), before = snap(), ns = cloneShape(s); ns.nodes.splice(sel.ni, 1); sel.ni = -1;
  L.shapes = L.shapes.map(q => q === s ? ns : q); touch(L); pushHist({ kind: 'doc', before, after: snap() });
}
function deleteSelected() {
  const s = selShape();
  if (s) { const L = layerById(sel.lid); withHist(() => { L.shapes = L.shapes.filter(x => x !== s); touch(L); }); sel = null; uiRefresh(true); requestRender(); return; }
  const L = activeLayer(); if (L && L.type === 'img') deleteLayer(L.id);
}
function duplicateSelected() {
  const s = selShape(); if (!s) return;
  const L = layerById(sel.lid), c = cloneShape(s); c.id = uid(); c.z = nextZ(); c.nodes.forEach(n => { n[0] += 14; n[1] += 14; });
  withHist(() => { L.shapes = L.shapes.concat([c]); touch(L); }); sel.sid = c.id; uiRefresh(true); requestRender();
}
function zShift(dir) {   // dir>0: ra trước (+), dir<0: ra sau (−) — đổi z với shape kề
  const s = selShape(); if (!s) return; const L = layerById(sel.lid), a = L.shapes.slice(), i = a.indexOf(s), j = i + dir;
  if (j < 0 || j >= a.length) { toast(dir > 0 ? 'Đã ở trên cùng' : 'Đã ở dưới cùng', 900); return; }
  withHist(() => { const p = a[i], q = a[j]; a[i] = Object.assign({}, q, { z: p.z }); a[j] = Object.assign({}, p, { z: q.z }); L.shapes = a; touch(L); });
  requestRender();
}
function reorderSelected(dir) {
  const s = selShape(); if (!s) return;
  if (dir === 'up' || dir === 'down') { zShift(dir === 'up' ? 1 : -1); return; }
  const L = layerById(sel.lid), rest = L.shapes.filter(x => x !== s);
  withHist(() => {
    const z = dir === 'front' ? nextZ() : (rest.length ? Math.min(...rest.map(x => x.z)) - 1 : s.z), n = Object.assign({}, s, { z });
    L.shapes = dir === 'front' ? rest.concat([n]) : [n].concat(rest); touch(L);
  });
  requestRender();
}
function flipSel(h) {
  const s = selShape();
  if (s) {
    const b = getBBox(s), L = layerById(sel.lid), ns = cloneShape(s);
    ns.nodes.forEach(n => { if (h) n[0] = b.x0 + b.x1 - n[0]; else n[1] = b.y0 + b.y1 - n[1]; });
    withHist(() => { L.shapes = L.shapes.map(x => x === s ? ns : x); touch(L); });
  } else {
    const L = activeLayer(); if (!L || L.type !== 'img') return;
    withHist(() => { const c = L.corners; L.corners = (h ? [c[1], c[0], c[3], c[2]] : [c[3], c[2], c[1], c[0]]).map(p => p.slice()); touch(L); });
  }
  requestRender();
}
function editSel(k, v) {
  const s = selShape(); if (!s) return;
  const L = layerById(sel.lid), before = snap(), ns = cloneShape(s);
  if (k === 'curve') ns.nodes.forEach(n => n[2] = v ? 0 : 1); else ns[k] = v;
  L.shapes = L.shapes.map(x => x === s ? ns : x); touch(L);
  pushHist({ kind: 'doc', before, after: snap() }, 'sel:' + k + ':' + s.id); requestRender();
}
function resetImgTransform() {
  const L = activeLayer(); if (!L || L.type !== 'img') return;
  const k = Math.min(doc.w / L.iw, doc.h / L.ih), w = L.iw * k, h = L.ih * k, x = (doc.w - w) / 2, y = (doc.h - h) / 2;
  withHist(() => { L.corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; touch(L); }); requestRender();
}

/* ---------------- eraser (vector: xoá/làm mờ cả hình) ---------------- */
const vEraser = {
  before: null, done: null, changed: false, last: null,
  down(p) {
    this.before = snap(); this.done = new Set(); this.changed = false; this.last = p; this.hit(p.x, p.y);
  },
  move(p) {
    if (!this.before) return;
    const d = hypot(p.x - this.last.x, p.y - this.last.y), step = 5 / view.s, n = Math.max(1, Math.ceil(d / step));
    for (let i = 1; i <= n; i++) this.hit(this.last.x + (p.x - this.last.x) * i / n, this.last.y + (p.y - this.last.y) * i / n);
    this.last = p;
  },
  up() { if (this.before && this.changed) pushHist({ kind: 'doc', before: this.before, after: snap() }); this.before = null; },
  cancel() { if (this.before && this.changed) restoreSnap(this.before); this.before = null; requestRender(); },
  hit(x, y) {
    const tol = 9 / view.s, layers = VE.all ? doc.layers.slice().reverse() : [activeLayer()];
    for (const L of layers) {
      if (!L || L.type !== 'vec' || !L.visible || L.locked) continue;
      for (let j = L.shapes.length - 1; j >= 0; j--) {
        const s = L.shapes[j]; if (this.done.has(s.id)) continue;
        if (hitShape(s, x, y, tol)) {
          this.done.add(s.id);
          const no = s.opacity * (1 - VE.strength);
          if (VE.strength >= 0.99 || no < 0.04) L.shapes = L.shapes.filter(q => q !== s);
          else L.shapes = L.shapes.map(q => q === s ? Object.assign({}, s, { opacity: no }) : q);
          touch(L); this.changed = true; requestRender(); return;
        }
      }
    }
  }
};

/* ---------------- raster brush engine ---------------- */
let Stroke = null, strokeC = null, stampCache = { key: '', c: null };
function getStrokeCanvas() { if (!strokeC || strokeC.width !== doc.w || strokeC.height !== doc.h) strokeC = mkCanvas(doc.w, doc.h); return strokeC; }
function softStamp(color, size, hard) {
  const d = Math.max(2, Math.ceil(size) + 2), key = color + '|' + d + '|' + hard.toFixed(2);
  if (stampCache.key === key) return stampCache.c;
  const c = mkCanvas(d, d), x = c.getContext('2d'), r = size / 2, cc = d / 2, [R, G, B] = hex2rgb(color);
  const inner = clamp(Math.min(r * hard, r - 0.8), 0, r);
  const g = x.createRadialGradient(cc, cc, inner, cc, cc, Math.max(r, inner + 0.01));
  g.addColorStop(0, `rgba(${R},${G},${B},1)`); g.addColorStop(1, `rgba(${R},${G},${B},0)`);
  x.fillStyle = g; x.fillRect(0, 0, d, d);
  stampCache = { key, c }; return c;
}
function radialMask(d) {
  const c = mkCanvas(d, d), x = c.getContext('2d'), r = d / 2, g = x.createRadialGradient(r, r, r * 0.3, r, r, r);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, d, d); return c;
}
function prepRasLayer() {
  const L = activeLayer(); if (!checkEditable(L)) return null;
  if (doc.type !== 'raster') return null;
  if (L.type === 'img') { withHist(() => rasterizeInPlace(L)); toast('Đã rasterize layer ảnh để vẽ lên'); }
  return L.type === 'ras' ? L : null;
}
function beginRasStroke(kind, p) {
  const L = prepRasLayer(); if (!L) return false;
  const S = { kind, layer: L, last: p, acc: 0, rect: { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 } };
  S.pre = mkCanvas(L.canvas.width, L.canvas.height); S.pre.getContext('2d').drawImage(L.canvas, 0, 0);
  if (kind === 'brush' || kind === 'eraser') {
    S.sc = getStrokeCanvas(); S.sc.getContext('2d').clearRect(0, 0, S.sc.width, S.sc.height);
    if (kind === 'brush') { S.size = RS.size; S.hard = RS.hard; S.op = RS.opacity; } else { S.size = RS.eSize; S.hard = RS.eHard; S.op = RS.eOp; }
    liveStroke = { layer: L, sc: S.sc, erase: kind === 'eraser', opacity: S.op };
  } else if (kind === 'smudge') { S.size = RS.sSize; S.str = RS.sStr; }
  else { S.size = RS.bSize; S.str = RS.bStr; }
  Stroke = S; stampStroke(p.x, p.y); return true;
}
function stampStroke(x, y) {
  const S = Stroke, r = S.size / 2 + 2, R = S.rect;
  R.x0 = Math.min(R.x0, x - r); R.y0 = Math.min(R.y0, y - r); R.x1 = Math.max(R.x1, x + r); R.y1 = Math.max(R.y1, y + r);
  if (S.kind === 'brush' || S.kind === 'eraser') {
    const sc = S.sc.getContext('2d'), color = S.kind === 'eraser' ? '#000000' : ST.color;
    if (S.kind === 'brush' && RS.style === 'pencil') {
      sc.fillStyle = color; const n = Math.max(2, Math.round(S.size * 0.7));
      for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, rr = (S.size / 2) * Math.sqrt(Math.random()); sc.globalAlpha = 0.35 + Math.random() * 0.55; sc.beginPath(); sc.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, Math.max(0.5, S.size * 0.06 + Math.random() * S.size * 0.05), 0, 6.283); sc.fill(); }
      sc.globalAlpha = 1;
    } else if (S.kind === 'brush' && RS.style === 'pixel') {
      const s = Math.max(1, Math.round(S.size)); sc.fillStyle = color; sc.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
    } else {
      const air = S.kind === 'brush' && RS.style === 'air', st = softStamp(color, S.size, air ? 0 : S.hard);
      sc.globalAlpha = air ? 0.14 : 1; sc.drawImage(st, x - st.width / 2, y - st.height / 2); sc.globalAlpha = 1;
    }
    return;
  }
  const L = S.layer, lc = L.canvas.getContext('2d'), d = Math.ceil(S.size), h = d / 2;
  if (!S.tmp) { S.tmp = mkCanvas(d, d); S.tc = S.tmp.getContext('2d'); S.mask = radialMask(d); }
  if (S.kind === 'smudge') {
    if (!S.carry) { S.carry = mkCanvas(d, d); S.cc = S.carry.getContext('2d'); S.cc.drawImage(L.canvas, x - h, y - h, d, d, 0, 0, d, d); return; }
    S.tc.globalCompositeOperation = 'source-over'; S.tc.globalAlpha = 1; S.tc.clearRect(0, 0, d, d); S.tc.drawImage(S.carry, 0, 0);
    S.tc.globalCompositeOperation = 'destination-in'; S.tc.globalAlpha = S.str; S.tc.drawImage(S.mask, 0, 0); S.tc.globalAlpha = 1; S.tc.globalCompositeOperation = 'source-over';
    lc.drawImage(S.tmp, x - h, y - h);
    S.cc.globalAlpha = 0.5; S.cc.drawImage(L.canvas, x - h, y - h, d, d, 0, 0, d, d); S.cc.globalAlpha = 1;
  } else {
    S.tc.globalCompositeOperation = 'source-over'; S.tc.globalAlpha = 1; S.tc.clearRect(0, 0, d, d);
    S.tc.filter = 'blur(' + Math.max(1, S.size * 0.1) + 'px)'; S.tc.drawImage(L.canvas, x - h, y - h, d, d, 0, 0, d, d); S.tc.filter = 'none';
    S.tc.globalCompositeOperation = 'destination-in'; S.tc.globalAlpha = S.str; S.tc.drawImage(S.mask, 0, 0); S.tc.globalAlpha = 1; S.tc.globalCompositeOperation = 'source-over';
    lc.drawImage(S.tmp, x - h, y - h);
  }
}
function strokeTo(p) {
  const S = Stroke; if (!S) return;
  const dx = p.x - S.last.x, dy = p.y - S.last.y, dist = hypot(dx, dy); if (dist < 0.01) return;
  const pixel = S.kind === 'brush' && RS.style === 'pixel';
  const step = pixel ? 1 : Math.max(0.6, S.size * (S.kind === 'brush' && RS.style === 'air' ? 0.08 : 0.1));
  let t = S.acc;
  while (t <= dist) { stampStroke(S.last.x + dx * (t / dist), S.last.y + dy * (t / dist)); t += step; }
  S.acc = t - dist; S.last = p;
}
function endRasStroke() {
  const S = Stroke; Stroke = null; liveStroke = null; if (!S) return;
  const L = S.layer, W = L.canvas.width, H = L.canvas.height, R = clampRect(S.rect, W, H), x = L.canvas.getContext('2d');
  if (!R.w || !R.h) return;
  if (S.sc) {
    x.save(); x.globalAlpha = S.op; x.globalCompositeOperation = S.kind === 'eraser' ? 'destination-out' : 'source-over';
    x.drawImage(S.sc, R.x, R.y, R.w, R.h, R.x, R.y, R.w, R.h); x.restore();
    S.sc.getContext('2d').clearRect(R.x, R.y, R.w, R.h);
  }
  const before = S.pre.getContext('2d').getImageData(R.x, R.y, R.w, R.h), after = x.getImageData(R.x, R.y, R.w, R.h);
  pushPatch(L, R, before, after);
}
function cancelRasStroke() {
  const S = Stroke; Stroke = null; liveStroke = null; if (!S) return;
  if (!S.sc) { const x = S.layer.canvas.getContext('2d'); x.clearRect(0, 0, S.layer.canvas.width, S.layer.canvas.height); x.drawImage(S.pre, 0, 0); touch(S.layer); }
  requestRender();
}
function rasTool(kind) {
  return {
    on: false,
    down(p) { this.on = beginRasStroke(kind, p); requestRender(); },
    move(p, e) {
      if (!this.on) return;
      const evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
      for (const ev of (evs.length ? evs : [e])) strokeTo(toDoc(ev.clientX, ev.clientY));
      requestRender();
    },
    up(p) { if (!this.on) return; strokeTo(p); endRasStroke(); this.on = false; requestRender(); uiRefresh(); },
    cancel() { if (this.on) cancelRasStroke(); this.on = false; }
  };
}
const rasEraser = rasTool('eraser');

/* ---------------- bucket (raster flood fill / vector recolor) ---------------- */
function floodFill(px, py) {
  const L = prepRasLayer(); if (!L) return;
  const W = doc.w, H = doc.h; px = Math.floor(px); py = Math.floor(py);
  if (px < 0 || py < 0 || px >= W || py >= H) return;
  const src = RS.all ? renderDocToCanvas(doc, W, H, { bg: 'keep' }).getContext('2d').getImageData(0, 0, W, H) : L.canvas.getContext('2d').getImageData(0, 0, W, H);
  const d = src.data, i0 = (py * W + px) * 4, r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2], a0 = d[i0 + 3], tol = RS.tol / 100 * 255 * 2;
  const match = i => Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) + Math.abs(d[i + 3] - a0) <= tol;
  const mask = new Uint8Array(W * H); let minx = px, maxx = px, miny = py, maxy = py;
  if (RS.contig) {
    const stack = [px, py];
    while (stack.length) {
      const y = stack.pop(), x = stack.pop();
      if (mask[y * W + x] || !match((y * W + x) * 4)) continue;
      let xl = x, xr = x;
      while (xl > 0 && !mask[y * W + xl - 1] && match((y * W + xl - 1) * 4)) xl--;
      while (xr < W - 1 && !mask[y * W + xr + 1] && match((y * W + xr + 1) * 4)) xr++;
      for (let k = xl; k <= xr; k++) mask[y * W + k] = 1;
      if (xl < minx) minx = xl; if (xr > maxx) maxx = xr; if (y < miny) miny = y; if (y > maxy) maxy = y;
      for (const ny of [y - 1, y + 1]) {
        if (ny < 0 || ny >= H) continue; let inSpan = false;
        for (let k = xl; k <= xr; k++) { const ok = !mask[ny * W + k] && match((ny * W + k) * 4); if (ok && !inSpan) { stack.push(k, ny); inSpan = true; } else if (!ok) inSpan = false; }
      }
    }
  } else {
    minx = W; maxx = 0; miny = H; maxy = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (match((y * W + x) * 4)) { mask[y * W + x] = 1; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  }
  if (maxx < minx) return;
  const x0 = Math.max(0, minx - 1), y0 = Math.max(0, miny - 1), x1 = Math.min(W - 1, maxx + 1), y1 = Math.min(H - 1, maxy + 1), w = x1 - x0 + 1, h = y1 - y0 + 1;
  const out = new ImageData(w, h), [R, G, B] = hex2rgb(ST.color);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x + x0, Y = y + y0; let on = mask[Y * W + X];
    if (!on) on = (X > 0 && mask[Y * W + X - 1]) || (X < W - 1 && mask[Y * W + X + 1]) || (Y > 0 && mask[(Y - 1) * W + X]) || (Y < H - 1 && mask[(Y + 1) * W + X]);
    if (on) { const o = (y * w + x) * 4; out.data[o] = R; out.data[o + 1] = G; out.data[o + 2] = B; out.data[o + 3] = 255; }
  }
  const tc = mkCanvas(w, h); tc.getContext('2d').putImageData(out, 0, 0);
  rasterOp(L, { x0, y0, x1: x1 + 1, y1: y1 + 1 }, x => { x.globalAlpha = ST.opacity; x.drawImage(tc, x0, y0); });
  requestRender();
}
function recolorAt(p) {
  const hit = pickAt(p); if (!hit || !hit.s) { toast('Chạm vào 1 hình vector để đổi màu'); return; }
  const s = hit.s, ns = Object.assign({}, s, { color: ST.color });
  withHist(() => { hit.L.shapes = hit.L.shapes.map(q => q === s ? ns : q); touch(hit.L); }); requestRender();
}
function pickColor(p) {
  const c = sampleColorAt(p.x, p.y); if (!c) return;
  ST.color = c; uiRefresh(true);
}

/* ---------------- tool table ---------------- */
const TOOLS = {
  select: selectTool, poly: polyTool, free: freeTool, hand: {},
  brush: rasTool('brush'), smudge: rasTool('smudge'), blur: rasTool('blur'),
  eraser: {
    E() { return doc.type === 'vector' ? vEraser : rasEraser; },
    down(p) { this.E().down(p); }, move(p, e) { const E = this.E(); if (E.move) E.move(p, e); },
    up(p) { const E = this.E(); if (E.up) E.up(p); }, cancel() { vEraser.cancel(); rasEraser.cancel(); }
  },
  bucket: { down(p) { if (doc.type === 'vector') recolorAt(p); else floodFill(p.x, p.y); } },
  eyedrop: { down(p) { pickColor(p); }, move(p) { pickColor(p); } }
};

/* ---------------- overlay drawing ---------------- */
function drawOverlay(c) {
  if (pend && pend.pts.length && tool === 'poly') drawPending(c);
  const T = TOOLS[tool]; if (T && T.overlay) T.overlay(c);
}
function drawPending(c) {
  const sh = pendShape();
  if (sh) { c.save(); c.setTransform(DPR * view.s, 0, 0, DPR * view.s, view.ox * DPR, view.oy * DPR); drawShape(c, sh); c.restore(); }
  const P = pend.pts.map(p => toScr(p[0], p[1])), willClose = ST.mode === 'fill' || ST.closed;
  const path = new Path2D(); P.forEach((q, i) => i ? path.lineTo(q[0], q[1]) : path.moveTo(q[0], q[1]));
  if (P.length >= 3 && willClose) path.closePath();
  c.save(); c.lineJoin = 'round';
  c.lineWidth = 3.4; c.strokeStyle = 'rgba(255,255,255,.95)'; c.stroke(path);
  c.lineWidth = 1.8; c.strokeStyle = '#2b6fff'; c.setLineDash([7, 6]); c.stroke(path); c.setLineDash([]);
  P.forEach((q, i) => {
    c.beginPath(); c.arc(q[0], q[1], i === 0 ? 8 : 6, 0, 6.283); c.fillStyle = i === 0 ? '#27c46b' : '#fff'; c.fill();
    c.lineWidth = 2; c.strokeStyle = '#2b6fff'; c.stroke();
  });
  c.restore();
}

/* ---------------- keyboard ---------------- */
window.addEventListener('keydown', e => {
  const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  if (e.key === 'Enter' && typeof colorPickerOpen === 'function' && colorPickerOpen()) { e.preventDefault(); closeColorPicker(); if (pend) commitPending(); return; }
  if (typing && t.type !== 'range' && t.type !== 'checkbox') { return; }
  if (!doc || $('#editor').classList.contains('hidden')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow().then(() => toast('Đã lưu')); return; }
  if (e.key === 'Enter') { if (pend) { e.preventDefault(); commitPending(); } return; }
  if (e.key === 'Escape') { if (pend) cancelPending(); else if (sel) { sel = null; uiRefresh(true); requestRender(); } return; }
  if (e.key === 'Backspace' || e.key === 'Delete') {
    if (pend) { e.preventDefault(); pendPop(); return; }
    if (tool === 'select' && sel) { e.preventDefault(); if (sel.mode === 'nodes' && sel.ni >= 0) deleteNode(); else deleteSelected(); }
    return;
  }
  if (e.key === ' ') { keys.space = true; e.preventDefault(); return; }
  if (mod) return;
  const map = { v: 'select', p: 'poly', d: 'free', e: 'eraser', b: 'brush', g: 'bucket', i: 'eyedrop', h: 'hand', s: 'smudge', u: 'blur' };
  const id = map[e.key.toLowerCase()];
  if (id && toolAvailable(id)) setTool(id);
});
window.addEventListener('keyup', e => { if (e.key === ' ') keys.space = false; });
function toolAvailable(id) { return TOOL_DEFS[doc.type].some(t => t.id === id); }

/* chuột phải trên shape (chế độ Chọn) -> menu; giữ lâu cảm ứng xử lý ở selectTool */
cv.addEventListener('contextmenu', e => {
  e.preventDefault(); if (!doc || tool !== 'select' || doc.type !== 'vector' || ctxMenu) return;
  const hit = pickAt(toDoc(e.clientX, e.clientY));
  if (hit && hit.s) { xf = null; selectShape(hit.L, hit.s); shapeMenu(e.clientX, e.clientY); }
});
