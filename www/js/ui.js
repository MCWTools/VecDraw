'use strict';
/* =========================================================
   VecDraw – UI: dialogs, home, toolbar, options, layers, color picker, export/import
   ========================================================= */
const TOOL_DEFS = {
  vector: [['select', 'select', 'Chọn'], ['poly', 'poly', 'Đa giác'], ['free', 'free', 'Vẽ tay'], ['shape', 'shapes', 'Hình'], ['eraser', 'eraser', 'Tẩy'], ['bucket', 'bucket', 'Fill'], ['eyedrop', 'dropper', 'Hút màu'], ['hand', 'hand', 'Kéo']],
  raster: [['select', 'select', 'Transform'], ['brush', 'brush', 'Cọ'], ['poly', 'poly', 'Đa giác'], ['free', 'free', 'Vẽ tay'], ['eraser', 'eraser', 'Tẩy'], ['smudge', 'smudge', 'Nhoè màu'], ['blur', 'blur', 'Blur'], ['bucket', 'bucket', 'Đổ màu'], ['eyedrop', 'dropper', 'Hút màu'], ['hand', 'hand', 'Kéo']]
}
  ; for (const k in TOOL_DEFS) TOOL_DEFS[k] = TOOL_DEFS[k].map(a => ({ id: a[0], icon: a[1], label: a[2] }));

let toastTimer = 0;
function toast(msg, ms) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2300);
}
function setSaveState(s) { const e = $('#saveState'); if (e) { e.textContent = s; e.dataset.s = s; } }

/* ---------------- modal system ---------------- */
const modalStack = [];
function openModal(title, body, actions, opts) {
  opts = opts || {};
  const root = $('#modalRoot'), back = el('div', { class: 'backdrop' });
  const close = () => { const i = modalStack.indexOf(api); if (i >= 0) modalStack.splice(i, 1); back.remove(); if (opts.onClose) opts.onClose(); };
  const box = el('div', { class: 'modal' + (opts.cls ? ' ' + opts.cls : '') },
    title ? el('div', { class: 'mtitle' }, title) : null,
    el('div', { class: 'mbody' }, body),
    actions && actions.length ? el('div', { class: 'mact' }, actions.map(a => el('button', { class: 'btn ' + (a.kind || ''), onclick: async () => { const r = a.fn ? await a.fn() : undefined; if (r !== false) close(); } }, a.label))) : null);
  back.append(box); root.append(back);
  back.addEventListener('pointerdown', e => { if (e.target === back && !opts.sticky) close(); });
  const api = { close, box }; modalStack.push(api); return api;
}
function askConfirm(title, msg, okLabel, danger) {
  return new Promise(res => {
    let done = false; const fin = v => { if (!done) { done = true; res(v); } };
    openModal(title, el('div', { class: 'msg' }, msg), [{ label: 'Huỷ', fn: () => fin(false) }, { label: okLabel || 'OK', kind: danger ? 'danger' : 'primary', fn: () => fin(true) }], { onClose: () => fin(false) });
  });
}
function askText(title, value, ph) {
  return new Promise(res => {
    let done = false; const fin = v => { if (!done) { done = true; res(v); } };
    const inp = el('input', { type: 'text', class: 'txt', value: value || '', placeholder: ph || '' });
    const m = openModal(title, inp, [{ label: 'Huỷ', fn: () => fin(null) }, { label: 'OK', kind: 'primary', fn: () => fin(inp.value.trim() || null) }], { onClose: () => fin(null) });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { fin(inp.value.trim() || null); m.close(); } });
    setTimeout(() => { inp.focus(); inp.select(); }, 50);
  });
}
function actionSheet(title, items) {
  const list = el('div', { class: 'asheet' }, items.filter(Boolean).map(it => el('button', { class: 'arow' + (it.danger ? ' danger' : ''), onclick: () => { m.close(); setTimeout(it.fn, 30); } }, it.icon ? el('span', { class: 'ai', html: ic(it.icon) }) : null, el('span', null, it.label))));
  const m = openModal(title, list, null, { cls: 'sheetmodal' }); return m;
}

/* ---------------- control builders ---------------- */
const O = {
  seg(opts, get, set) {
    const w = el('div', { class: 'seg' }), upd = () => $$('button', w).forEach(b => b.classList.toggle('on', b.dataset.v === String(get())));
    opts.forEach(([v, lab]) => w.append(el('button', { 'data-v': v, onclick: () => { set(v); upd(); } }, lab))); upd(); return w;
  },
  slider(label, min, max, step, get, set, fmt) {
    const v = get(), out = el('span', { class: 'val' }, fmt ? fmt(v) : v), inp = el('input', { type: 'range', min, max, step, value: v });
    inp.addEventListener('input', () => { const x = parseFloat(inp.value); out.textContent = fmt ? fmt(x) : x; set(x); });
    return el('label', { class: 'ctl slider' }, el('span', { class: 'lab' }, label), inp, out);
  },
  toggle(label, get, set) {
    const b = el('button', { class: 'pill' + (get() ? ' on' : ''), onclick: () => { const v = !get(); set(v); b.classList.toggle('on', v); } }, label); return b;
  },
  color(get, set, label, alpha, onDone) {
    const sw = el('span', { class: 'sw', style: 'background:' + get() });
    return el('button', { class: 'colorbtn', onclick: () => openColorPicker(get(), v => { set(v); sw.style.background = v; }, { alpha, onDone }) }, sw, label ? el('span', null, label) : null);
  },
  note(t) { return el('div', { class: 'note' }, t); },
  row(...c) { return el('div', { class: 'orow' }, ...c); }
};
const pct = v => Math.round(v * 100) + '%';

/* ---------------- options panel ---------------- */
function buildOptions() {
  const P = $('#optPanel'); P.innerHTML = ''; if (!doc) return;
  const s = selShape(), useSel = tool === 'select' && s;
  const G = k => { if (!useSel) return ST[k]; const cs = selShape() || s; return k === 'curve' ? cs.nodes.every(n => !n[2]) : cs[k]; };
  const S = (k, v) => { if (useSel) editSel(k, v); else { ST[k] = v; requestRender(); } };
  const add = (...c) => P.append(O.row(...c));
  const shapeControls = (isPoly) => {
    const brushMode = tool === 'free' && !useSel && ST.fmode === 'brush', modeNow = brushMode ? 'line' : G('mode');
    if (tool === 'free' && !useSel) {
      const bk = null;
      add(O.seg([['lasso', 'Lasso'], ['brush', 'Brush']], () => ST.fmode, v => { ST.fmode = v; buildOptions(); }), ...(brushMode ? [] : [O.seg([['fill', 'Tô kín'], ['line', 'Chỉ viền']], () => ST.mode, v => { ST.mode = v; buildOptions(); })]),
        O.color(() => G('color'), v => S('color', v), 'Màu', { get: () => G('opacity'), set: v => S('opacity', v) }),
        gradBtn({ get: G, set: S, valid: () => !selShape() }, buildOptions));
    } else
    add(O.seg([['fill', 'Fill'], ['line', 'Line']], () => G('mode'), v => { S('mode', v); buildOptions(); }),
      O.color(() => G('color'), v => S('color', v), 'Màu', { get: () => G('opacity'), set: v => S('opacity', v) }),
      gradBtn({ get: G, set: S, valid: useSel ? (sid => () => { const q = selShape(); return !!q && q.id === sid; })(s.id) : () => !selShape() }, buildOptions));
    if (modeNow === 'line') {
      add(O.slider('Độ dày', 1, 150, 1, () => G('width'), v => S('width', v), v => v));
      add(O.seg([['pen', 'Pen'], ['pencil', 'Pencil'], ['marker', 'Marker'], ['dashed', 'Đứt'], ['dotted', 'Chấm']], () => G('brush'), v => S('brush', v)));
    }
    add(O.slider('Trong suốt', 5, 100, 1, () => Math.round(G('opacity') * 100), v => S('opacity', v / 100), v => v + '%'));
    if (isPoly) add(O.slider('Bo góc', 0, clamp(Math.round(Math.min(doc.w, doc.h) / 4), 20, 300), 1, () => G('round') || 0, v => S('round', v), v => v ? v + 'px' : 'Tắt'));
    const t = [];
    if (modeNow === 'line' && !(tool === 'free' && !useSel)) t.push(O.toggle('Nối đầu-cuối', () => G('closed'), v => S('closed', v)));
    if (isPoly) t.push(O.toggle('Cong mượt', () => useSel ? G('curve') : ST.curve, v => { if (useSel) editSel('curve', v); else { ST.curve = v; requestRender(); } }));
    if (tool === 'free' && !brushMode) t.push(O.seg([['auto', 'Tự động'], ['smooth', 'Mượt'], ['straight', 'Thẳng'], ['raw', 'Thô']], () => ST.free, v => { ST.free = v; }));
    if (t.length) add(...t);
  };
  if (useSel) {
    shapeControls(true);
    if (s && s.gen) {
      const gk = () => (selShape() || s).gen || {};
      add(O.slider('Scale', 10, 400, 1, () => gk().sc || 100, v => genScale(v), v => v + '%'));
      if (s.gen.kind === 'saw') {
        add(O.slider('Số răng', 1, 60, 1, () => gk().n, v => genSet('n', v)), O.slider('Nghiêng', -90, 90, 1, () => gk().skew || 0, v => genSet('skew', v), v => v + '°'));
        add(O.slider('Độ cao', 2, Math.max(200, Math.round(doc.h)), 1, () => Math.round(gk().h), v => genSet('h', v), v => v + 'px'), O.slider('Độ dài', 10, Math.max(400, Math.round(doc.w * 1.5)), 1, () => Math.round(gk().len), v => genSet('len', v), v => v + 'px'));
        add(O.note('Chấm trên hình = từng răng, kéo từng chấm để chỉnh riêng (đổi thông số ở trên sẽ dựng lại răng cưa). Xoay ở nút "Sửa hình" / Khung.'));
      } else if (s.gen.kind === 'circle') add(O.note('Chỉ có 4 chấm để kéo méo hình tròn.'));
    }
    if (s) add(O.note('Kéo chấm = sửa điểm · kéo thân hình = di chuyển · chạm đúp vào cạnh = thêm điểm · nút "Khung" = resize / xoay')); }
  else if (tool === 'select') {
    const L = activeLayer();
    if (L && L.type === 'img') {
      add(O.toggle('Pixel (không làm mượt)', () => !L.smooth, v => { setLayerProp(L.id, 'smooth', !v); }));
      add(O.note('Kéo trong ảnh để di chuyển · góc = resize · chấm xanh = xoay · bật Warp ở thanh trên để kéo méo từng góc'));
    } else add(O.note(doc.type === 'vector' ? 'Chạm vào 1 hình để chọn. Chạm đúp để sửa từng điểm.' : 'Chọn layer ảnh (import) để transform / warp.'));
  }
  else if (tool === 'poly') { shapeControls(true); add(O.note('Chạm để thêm điểm · kéo điểm để chỉnh · ✓ hoặc Enter để vẽ')); }
  else if (tool === 'shape') {
    add(O.seg([['rect', 'Chữ nhật'], ['circle', 'Tròn'], ['saw', 'Răng cưa']], () => ST.shape, v => { ST.shape = v; }));
    shapeControls(false); add(O.note('Kéo trên canvas để tạo (hoặc chạm 1 cái = cỡ mặc định). Tạo xong tự chuyển sang Chọn để kéo điểm / chỉnh thông số.'));
  }
  else if (tool === 'free') { shapeControls(false); }
  else if (tool === 'brush') {
    add(O.seg([['soft', 'Cọ'], ['pencil', 'Pencil'], ['air', 'Phun'], ['pixel', 'Pixel']], () => RS.style, v => { RS.style = v; buildOptions(); }), O.color(() => ST.color, v => { ST.color = v; }, 'Màu'));
    add(O.slider('Cỡ', 1, 300, 1, () => RS.size, v => RS.size = v));
    if (RS.style === 'soft') add(O.slider('Độ cứng', 0, 100, 1, () => Math.round(RS.hard * 100), v => RS.hard = v / 100, v => v + '%'));
    add(O.slider('Trong suốt', 5, 100, 1, () => Math.round(RS.opacity * 100), v => RS.opacity = v / 100, v => v + '%'));
  }
  else if (tool === 'eraser') {
    if (doc.type === 'vector') {
      add(O.slider('Độ xoá', 5, 100, 5, () => Math.round(VE.strength * 100), v => VE.strength = v / 100, v => v + '%'), O.toggle('Mọi layer', () => VE.all, v => VE.all = v));
      add(O.note('Chạm / quẹt qua hình: xoá cả hình. Độ xoá < 100% = chỉ làm mờ (hình vẫn còn).'));
    } else {
      add(O.slider('Cỡ', 1, 300, 1, () => RS.eSize, v => RS.eSize = v));
      add(O.slider('Độ cứng', 0, 100, 1, () => Math.round(RS.eHard * 100), v => RS.eHard = v / 100, v => v + '%'));
      add(O.slider('Độ xoá', 5, 100, 1, () => Math.round(RS.eOp * 100), v => RS.eOp = v / 100, v => v + '%'));
      add(O.note('Chỉ xoá layer đang chọn, các layer dưới vẫn giữ nguyên.'));
    }
  }
  else if (tool === 'smudge') { add(O.slider('Cỡ', 4, 300, 1, () => RS.sSize, v => RS.sSize = v), O.slider('Lực', 5, 100, 1, () => Math.round(RS.sStr * 100), v => RS.sStr = v / 100, v => v + '%')); add(O.note('Kéo để trộn / làm nhoè màu giữa các vùng.')); }
  else if (tool === 'blur') { add(O.slider('Cỡ', 4, 300, 1, () => RS.bSize, v => RS.bSize = v), O.slider('Lực', 5, 100, 1, () => Math.round(RS.bStr * 100), v => RS.bStr = v / 100, v => v + '%')); }
  else if (tool === 'bucket') {
    if (doc.type === 'raster') {
      add(O.color(() => ST.color, v => { ST.color = v; }, 'Màu'));
      add(O.slider('Dung sai', 0, 100, 1, () => RS.tol, v => RS.tol = v), O.slider('Trong suốt', 5, 100, 1, () => Math.round(ST.opacity * 100), v => ST.opacity = v / 100, v => v + '%'));
      add(O.toggle('Liền vùng', () => RS.contig, v => RS.contig = v), O.toggle('Lấy mẫu mọi layer', () => RS.all, v => RS.all = v));
    } else {
      add(O.color(() => ST.color, v => { ST.color = v; }, 'Màu', { get: () => ST.opacity, set: v => ST.opacity = v }),
        gradBtn({ get: k => ST[k], set: (k, v) => { ST[k] = v; }, valid: () => true }, buildOptions));
      add(O.slider('Trong suốt', 5, 100, 1, () => Math.round(ST.opacity * 100), v => ST.opacity = v / 100, v => v + '%'));
      add(O.slider('Bo góc', 0, clamp(Math.round(Math.min(doc.w, doc.h) / 4), 20, 300), 1, () => ST.round || 0, v => ST.round = v, v => v ? v + 'px' : 'Tắt'), O.toggle('Cong mượt', () => ST.curve, v => { ST.curve = v; }));
      add(O.slider('Khe hở', 0, 14, 1, () => VF.gap, v => VF.gap = v, v => v + 'px')); add(O.note('Chạm vào vùng trống khép kín bởi nét vẽ = tô vùng đó thành 1 đa giác bình thường (nằm sau nét, chọn lại để sửa điểm/màu). Chạm vào hình có sẵn = đổi sang màu này.')); }
  }
  else if (tool === 'eyedrop') add(O.color(() => ST.color, v => { ST.color = v; }, 'Màu'), O.note('Chạm / kéo trên canvas để hút màu.'));
  else if (tool === 'hand') add(O.note('Kéo để di chuyển canvas. (2 ngón: zoom + di chuyển ở mọi tool)'));
}

/* ---------------- toolbar / bars ---------------- */
function buildToolbar() {
  const T = $('#toolbar'); T.innerHTML = '';
  TOOL_DEFS[doc.type].forEach(t => T.append(el('button', { class: 'tb' + (tool === t.id ? ' on' : ''), 'data-id': t.id, onclick: () => setTool(t.id) }, el('span', { class: 'ti', html: ic(t.icon) }), el('span', { class: 'tl' }, t.label))));
}
function buildPendBar() {
  const B = $('#pendBar'), show = tool === 'poly' && pend && pend.pts.length;
  B.classList.toggle('hidden', !show); if (!show) return;
  B.innerHTML = '';
  B.append(el('span', { class: 'cnt' }, pend.pts.length + ' điểm'),
    el('button', { class: 'fb', title: 'Xoá điểm cuối', onclick: pendPop, html: ic('back') }),
    el('button', { class: 'fb', title: 'Huỷ', onclick: cancelPending, html: ic('x') }),
    el('button', { class: 'fb ok', title: 'Vẽ (Enter)', onclick: () => commitPending(), html: ic('check') }));
}
function buildSelBar() {
  const B = $('#selBar'), t = tool === 'select' ? currentTarget() : null;
  B.classList.toggle('hidden', !t); if (!t) return;
  B.innerHTML = '';
  const fb = (icon, title, fn, on) => el('button', { class: 'fb' + (on ? ' on' : ''), title, onclick: fn, html: ic(icon) });
  if (t.kind === 'shape') {
    B.append(el('button', { class: 'fb txt' + (sel.mode === 'box' ? ' on' : ''), onclick: () => setSelMode('box') }, 'Khung'),
      el('button', { class: 'fb txt' + (sel.mode === 'nodes' ? ' on' : ''), onclick: () => setSelMode('nodes') }, 'Điểm'));
    if (sel.mode === 'nodes') B.append(el('button', { class: 'fb txt', onclick: toggleNodeCorner }, 'Góc/Mượt'), el('button', { class: 'fb txt', onclick: deleteNode }, 'Xoá điểm'));
    else B.append(fb('copy', 'Nhân đôi', duplicateSelected), fb('chevup', 'Lên trên cùng', () => reorderSelected('front')), fb('down', 'Xuống dưới cùng', () => reorderSelected('back')), fb('fliph', 'Lật ngang', () => flipSel(true)), fb('flipv', 'Lật dọc', () => flipSel(false)), el('button', { class: 'fb txt' + (XF.lock ? ' on' : ''), onclick: () => { XF.lock = !XF.lock; buildSelBar(); } }, 'Giữ tỉ lệ'));
    B.append(fb('trash', 'Xoá hình', deleteSelected));
  } else {
    B.append(el('button', { class: 'fb txt' + (XF.lock ? ' on' : ''), onclick: () => { XF.lock = !XF.lock; buildSelBar(); } }, 'Giữ tỉ lệ'),
      el('button', { class: 'fb txt' + (XF.warp ? ' on' : ''), onclick: () => { XF.warp = !XF.warp; buildSelBar(); requestRender(); } }, 'Warp'),
      fb('fliph', 'Lật ngang', () => flipSel(true)), fb('flipv', 'Lật dọc', () => flipSel(false)), fb('rotate', 'Reset transform', resetImgTransform));
    if (doc.type === 'raster') B.append(el('button', { class: 'fb txt', onclick: () => { rasterizeLayer(t.layer.id); toast('Đã rasterize'); } }, 'Rasterize'));
    B.append(fb('trash', 'Xoá layer ảnh', deleteSelected));
  }
}
function uiRefresh(full) {
  if (!doc) return;
  $('#btnUndo').disabled = !(Hist.u.length || (pend && pend.pts.length));
  $('#btnRedo').disabled = !(Hist.r.length || (pend && pend.redo.length));
  $$('#toolbar .tb').forEach(b => b.classList.toggle('on', b.dataset.id === tool));
  buildPendBar(); buildSelBar(); buildMapTabs();
  nudgeSync();
  if (!sliderBusy) { if (full) buildOptions(); buildLayers(); }
}
let sliderBusy = false;
document.addEventListener('pointerdown', e => { if (e.target && e.target.type === 'range') sliderBusy = true; }, true);
['pointerup', 'pointercancel'].forEach(ev => document.addEventListener(ev, () => { sliderBusy = false; }, true));

/* ---------------- layers panel ---------------- */
function setLayerProp(id, k, v) {
  const L = layerById(id); if (!L) return; if (L.ref) { setRefProp(k, v); return; } const before = snap(); L[k] = v; touch(L);
  pushHist({ kind: 'doc', before, after: snap() }, 'lp:' + id + ':' + k); requestRender();
}
function toggleLayersPanel(force) {
  const P = $('#layersPanel'), show = force === undefined ? P.classList.contains('hidden') : force;
  P.classList.toggle('hidden', !show); $('#btnLayers').classList.toggle('on', show); if (show) buildLayers(); setTimeout(resizeView, 30);
}
function buildLayers() {
  const P = $('#layersPanel'); if (!doc || P.classList.contains('hidden')) return;
  P.innerHTML = '';
  const act = activeLayer();
  const ib = (icon, title, fn, dis) => el('button', { class: 'ib sm', title, onclick: fn, disabled: dis, html: ic(icon) });
  P.append(el('div', { class: 'lhead' }, el('b', null, 'Layers'), el('span', { class: 'spacer' }), ib('x', 'Đóng', () => toggleLayersPanel(false))));
  const idx = doc.layers.indexOf(act);
  const isRef = !!(act && act.ref), below = idx > 0 ? doc.layers[idx - 1] : null;
  P.append(el('div', { class: 'ltools' },
    ib('plus', 'Layer mới', () => { addLayer(); }),
    ib('image', 'Import ảnh vào layer mới', () => importImageFlow()),
    ib('copy', 'Nhân đôi layer', () => duplicateLayer(act.id), isRef),
    ib('mergedown', 'Gộp xuống dưới', () => mergeDown(act.id), idx <= 0 || isRef || (below && below.ref)),
    ib('up', 'Đưa lên', () => moveLayer(act.id, 1), idx >= doc.layers.length - 1 || isRef),
    ib('down', 'Đưa xuống', () => moveLayer(act.id, -1), idx <= 0 || isRef || (below && below.ref)),
    ib('eraser', 'Xoá sạch nội dung layer', async () => { if (await askConfirm('Xoá sạch layer?', 'Toàn bộ nội dung layer "' + act.name + '" sẽ bị xoá (có thể Undo).', 'Xoá', true)) clearLayer(act.id); }, isRef),
    ib('trash', 'Xoá layer', () => deleteLayer(act.id), isRef)));
  const list = el('div', { class: 'llist' });
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const L = doc.layers[i];
    const row = el('div', { class: 'lrow' + (L.id === doc.active ? ' sel' : ''), 'data-id': L.id, onclick: e => { if (e.target.closest('button,.handle')) return; doc.active = L.id; if (tool === 'select') sel = null; uiRefresh(true); requestRender(); } },
      el('button', { class: 'ib sm' + (L.visible ? '' : ' dim'), onclick: () => { setLayerProp(L.id, 'visible', !L.visible); }, html: ic(L.visible ? 'eye' : 'eyeoff') }),
      L.ref ? el('span', { class: 'ib sm on', title: 'Được bảo vệ', html: ic('lock') }) : el('button', { class: 'ib sm' + (L.locked ? ' on' : ' dim'), onclick: () => { setLayerProp(L.id, 'locked', !L.locked); }, html: ic(L.locked ? 'lock' : 'unlock') }),
      el('span', { class: 'ltype', html: ic(L.type === 'vec' ? 'vec' : L.type === 'ras' ? 'ras' : 'image') }),
      el('span', { class: 'lname' }, L.name),
      L.ref ? el('span', { class: 'hspace' }) : el('span', { class: 'handle', title: 'Kéo để sắp xếp', html: ic('menu') }));
    list.append(row);
  }
  P.append(list);
  bindLayerDrag(list);
  if (act && act.ref) {
    P.append(el('div', { class: 'lprops' }, O.slider('Opacity background', 0, 100, 1, () => Math.round(act.opacity * 100), v => setRefProp('opacity', v / 100), v => v + '%'), el('div', { class: 'note' }, 'Layer tham chiếu từ texture gốc: không vẽ / xoá / di chuyển được. Ẩn hoặc đổi opacity chỉ ảnh hưởng hiển thị, không ảnh hưởng file export.')));
  } else if (act) {
    const nm = el('input', { type: 'text', class: 'txt', value: act.name });
    nm.addEventListener('change', () => setLayerProp(act.id, 'name', nm.value.trim() || act.name));
    const bl = el('select', { class: 'sel' }, BLENDS.map(([v, n]) => el('option', { value: v, selected: v === act.blend }, n)));
    bl.addEventListener('change', () => setLayerProp(act.id, 'blend', bl.value));
    P.append(el('div', { class: 'lprops' }, nm,
      O.slider('Trong suốt layer', 0, 100, 1, () => Math.round(act.opacity * 100), v => setLayerProp(act.id, 'opacity', v / 100), v => v + '%'),
      el('label', { class: 'ctl' }, el('span', { class: 'lab' }, 'Blend'), bl),
      O.slider('Blur layer', 0, 40, 0.5, () => act.blur, v => setLayerProp(act.id, 'blur', v), v => v)));
  }
}
function bindLayerDrag(list) {
  list.addEventListener('pointerdown', e => {
    const h = e.target.closest('.handle'); if (!h) return;
    e.preventDefault(); const row = h.closest('.lrow'); const before = snap();
    row.classList.add('drag'); try { h.setPointerCapture(e.pointerId); } catch (_) { }
    const move = ev => {
      const rows = $$('.lrow', list).filter(r => r !== row);
      let ref = null;
      for (const r of rows) { const b = r.getBoundingClientRect(); if (ev.clientY < b.top + b.height / 2) { ref = r; break; } }
      if (ref) { if (row.nextSibling !== ref) list.insertBefore(row, ref); } else if (list.lastChild !== row) list.append(row);
    };
    const up = () => {
      h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
      row.classList.remove('drag');
      const order = $$('.lrow', list).map(r => r.dataset.id).reverse(), map = new Map(doc.layers.map(l => [l.id, l]));
      const nl = order.map(id => map.get(id)); const same = nl.every((l, i) => l === doc.layers[i]);
      if (doc.layers[0] && doc.layers[0].ref && !(nl[0] && nl[0].ref)) { buildLayers(); toast('Background tham chiếu luôn nằm dưới cùng'); return; }
      if (!same) { doc.layers = nl; pushHist({ kind: 'doc', before, after: snap() }); } else buildLayers();
    };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
  });
}

/* ---------------- color picker ---------------- */
let cp = null;
const PALETTE = ['#000000', '#444444', '#888888', '#cccccc', '#ffffff', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#00acc1', '#1e88e5', '#5e35b1', '#d81b60', '#6d4c41', '#8bc34a', '#ffcc80'];
function recentColors() { try { return JSON.parse(localStorage.getItem('vd_recent') || '[]'); } catch (_) { return []; } }
function pushRecent(c) { try { const r = recentColors().filter(x => x !== c); r.unshift(c); localStorage.setItem('vd_recent', JSON.stringify(r.slice(0, 14))); } catch (_) { } }
function colorPickerOpen() { return !!cp; }
function closeColorPicker() { if (cp) cp.close(); }
/* Bảng chọn màu: overlay vuông 1:1 theo toạ độ chia theo tỉ lệ (0..1) của overlay
   ô SV (chọn đậm/nhạt+sáng/tối): x 0.01–0.90, y 0.01–0.90   · slider màu (hue): x 0.91–0.99, y 0.01–0.90
   slider đậm nhạt (alpha):       x 0.01–0.90, y 0.91–0.99   · ô màu đang chọn + hút màu: 0.91–0.99 × 0.91–0.99 */
function openColorPicker(hex, onChange, opts) {
  closeColorPicker(); opts = opts || {};
  const al = opts.alpha || null;
  let [h, s, v] = rgb2hsv(...hex2rgb(hex)), a = al ? clamp(+al.get(), 0, 1) : 1;
  const R = (cls, x0, y0, x1, y1) => el('div', { class: 'cp2r ' + cls, style: `left:${x0 * 100}%;top:${y0 * 100}%;width:${(x1 - x0) * 100}%;height:${(y1 - y0) * 100}%` });
  const sv = R('cp2sv', 0.01, 0.01, 0.9, 0.9), hu = R('cp2hu', 0.91, 0.01, 0.99, 0.9), at = R('cp2al', 0.01, 0.91, 0.9, 0.99), sw = R('cp2sw', 0.91, 0.91, 0.99, 0.99);
  const knob = el('div', { class: 'cp2knob' }), hthumb = el('div', { class: 'cp2bar h' }), athumb = el('div', { class: 'cp2bar a' });
  sv.append(knob); hu.append(hthumb); at.append(athumb);
  const swFill = el('div', { class: 'cp2swfill' }), swIco = el('span', { class: 'cp2ico', html: ic('dropper') });
  sw.append(swFill, swIco);
  if (!al) at.classList.add('off');
  const root = el('div', { class: 'cp2' }, sv, hu, at, sw);
  const cur = () => rgb2hex(...hsv2rgb(h, s, v));
  const paint = () => {
    const c = cur(), [r, g, b] = hex2rgb(c);
    sv.style.backgroundImage = `linear-gradient(to top,#000,rgba(0,0,0,0)),linear-gradient(to right,#fff,hsl(${h},100%,50%))`;
    knob.style.left = (s * 100) + '%'; knob.style.top = ((1 - v) * 100) + '%'; knob.style.background = c;
    hthumb.style.top = (h / 360 * 100) + '%';
    at.style.backgroundImage = `linear-gradient(to right,rgba(${r},${g},${b},0),rgb(${r},${g},${b})),repeating-conic-gradient(#8a8f9c 0 25%,#c9ccd4 0 50%)`;
    at.style.backgroundSize = '100% 100%,14px 14px'; athumb.style.left = (a * 100) + '%';
    swFill.style.background = `linear-gradient(rgba(${r},${g},${b},${a}),rgba(${r},${g},${b},${a})),repeating-conic-gradient(#8a8f9c 0 25%,#c9ccd4 0 50%) 0 0/10px 10px`;
    swIco.style.color = (v > 0.6 && s < 0.5) ? '#222' : '#fff';
  };
  const emit = () => { paint(); onChange(cur()); if (al) al.set(a); };
  const drag = (elx, fn, onDown, onUp) => {
    elx.addEventListener('pointerdown', e => {
      if (elx.classList.contains('off')) return;
      e.preventDefault(); e.stopPropagation(); elx.setPointerCapture(e.pointerId); if (onDown) onDown();
      const rect = elx.getBoundingClientRect(), pos = ev => fn(clamp((ev.clientX - rect.left) / rect.width, 0, 1), clamp((ev.clientY - rect.top) / rect.height, 0, 1));
      pos(e);
      const mv = ev => pos(ev), up = () => { elx.removeEventListener('pointermove', mv); elx.removeEventListener('pointerup', up); elx.removeEventListener('pointercancel', up); if (onUp) onUp(); };
      elx.addEventListener('pointermove', mv); elx.addEventListener('pointerup', up); elx.addEventListener('pointercancel', up);
    });
  };
  drag(sv, (x, y) => { s = x; v = 1 - y; emit(); }, () => knob.classList.add('drag'), () => knob.classList.remove('drag'));
  drag(hu, (x, y) => { h = y * 360; emit(); });
  drag(at, (x) => { a = x; emit(); });
  // ô màu đang chọn: bấm vào để chuyển sang chế độ chạm đâu lấy màu đó
  sw.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); startPick(m.box.parentNode, c => { [h, s, v] = rgb2hsv(...hex2rgb(c)); emit(); }); });
  const m = openModal(null, root, null, { cls: 'cp2m', onClose: () => { pushRecent(cur()); cp = null; if (opts.alpha && doc) buildOptions(); if (opts.onDone) opts.onDone(); } });
  cp = { close: m.close }; paint();
}
/* Chế độ hút màu: ẩn overlay, chạm bất kỳ đâu trên hình để lấy màu rồi quay lại overlay */
function startPick(back, apply) {
  back.style.display = 'none';
  let down = false;
  const hint = el('div', { class: 'pickhint' }, el('span', null, '💧 Chạm vào bất kỳ đâu trên hình để lấy màu'), el('button', { class: 'btn sm', onclick: () => stop() }, 'Huỷ'));
  document.body.append(hint);
  const sample = e => { if (!doc) return; const p = toDoc(e.clientX, e.clientY); if (p.x < 0 || p.y < 0 || p.x > doc.w || p.y > doc.h) return; const c = sampleColorAt(p.x, p.y); if (c) apply(c); };
  const pd = e => {
    if (hint.contains(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    if (e.target === cv) { down = true; sample(e); }
  };
  const pm = e => { if (down) sample(e); };
  const pu = e => { if (down) { down = false; stop(); } };
  const ck = e => { if (!hint.contains(e.target)) { e.preventDefault(); e.stopPropagation(); } };
  function stop() {
    window.removeEventListener('pointerdown', pd, true); window.removeEventListener('pointermove', pm, true); window.removeEventListener('pointerup', pu, true); window.removeEventListener('click', ck, true);
    hint.remove(); back.style.display = '';
  }
  window.addEventListener('pointerdown', pd, true); window.addEventListener('pointermove', pm, true); window.addEventListener('pointerup', pu, true); window.addEventListener('click', ck, true);
}

/* ---------------- home ---------------- */
function fmtDate(t) { const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`; }
async function showHome() {
  doc = null; $('#editor').classList.add('hidden'); $('#home').classList.remove('hidden');
  const grid = $('#projectGrid'); grid.innerHTML = '';
  let list = []; try { list = (await dbGetAll('meta')).sort((a, b) => b.updated - a.updated); } catch (e) { console.error(e); }
  window.homeMetas = list;
  $('#emptyHint').classList.toggle('hidden', list.length > 0);
  for (const m of list) {
    const card = el('div', { class: 'card', 'data-id': m.id, onclick: e => { if (e.target.closest('.cmore')) return; openProject(m.id); } },
      el('div', { class: 'cthumb' + (m.bg ? '' : ' chk'), style: m.bg ? 'background:' + m.bg : '' }, m.thumb ? el('img', { src: m.thumb, draggable: 'false' }) : null),
      el('div', { class: 'cinfo' }, el('div', { class: 'cname' }, m.name), el('div', { class: 'cmeta' }, el('span', { class: 'badge ' + m.type }, m.mapping ? 'MAPS' : m.type === 'vector' ? 'VECTOR' : 'NORMAL'), ` ${m.w}×${m.h} · ${fmtDate(m.updated)}`)),
      el('button', { class: 'ib cmore', html: ic('more'), onclick: () => projectMenu(m) }));
    grid.append(card);
  }
}
function projectMenu(m) {
  actionSheet(m.name, [
    { icon: 'edit', label: 'Mở', fn: () => openProject(m.id) },
    { icon: 'edit', label: 'Đổi tên', fn: async () => { const n = await askText('Đổi tên project', m.name); if (n) { const d = await dbGet('data', m.id); d.name = n; m.name = n; await dbPut('data', d); await dbPut('meta', m); showHome(); } } },
    { icon: 'copy', label: 'Nhân đôi', fn: async () => { const d = await dbGet('data', m.id), id = uid(); d.id = id; d.name = m.name + ' copy'; d.updated = Date.now(); await dbPut('data', d); await dbPut('meta', Object.assign({}, m, { id, name: d.name, updated: d.updated })); showHome(); toast('Đã nhân đôi'); } },
    { icon: 'download', label: 'Xuất file project (.vdraw) vào máy', fn: async () => { const d = await dbGet('data', m.id); await Native.saveBlob(safeName(m.name) + '.vdraw', new Blob([JSON.stringify(d)], { type: 'application/json' })); } },
    m.mapping ? { icon: 'layers', label: 'Mở Map Editor (đã có)', fn: () => openProject(m.id) } : { icon: 'layers', label: 'Tạo Map Editor (Normal/Height/…) từ texture này', fn: () => mappingDialog(m.id) },
    ...(m.mapping ? [] : pluginMenuItems(async () => deserializeDoc(await dbGet('data', m.id)))),
    { icon: 'trash', label: 'Xoá project', danger: true, fn: async () => { if (await askConfirm('Xoá project?', `"${m.name}" sẽ bị xoá vĩnh viễn khỏi máy. Không thể hoàn tác.`, 'Xoá', true)) { await dbDel('data', m.id); await dbDel('meta', m.id); showHome(); toast('Đã xoá'); } } }
  ]);
}
const safeName = n => (n || 'vecdraw').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);
async function openProject(id) {
  try { const o = await dbGet('data', id); if (!o) return toast('Không tìm thấy project'); startEditor(await deserializeDoc(o)); }
  catch (e) { console.error(e); toast('Lỗi mở project: ' + e.message); }
}
function startEditor(d) {
  doc = d; histReset(); sel = null; pend = null; Stroke = null; liveStroke = null; dirty = false;
  tool = d.type === 'vector' ? 'poly' : 'brush';
  $('#home').classList.add('hidden'); $('#editor').classList.remove('hidden');
  $('#projName').textContent = d.name; $('#layersPanel').classList.add('hidden'); $('#btnLayers').classList.remove('on');
  buildToolbar(); buildOptions(); resizeView(); fitView(); uiRefresh(true); setSaveState('✓');
  if (window.innerWidth > 900) toggleLayersPanel(true);
  requestRender();
}
async function goHome() { if (!doc) return; if (pend) commitPending(true); closeColorPicker(); await saveNow(); showHome(); }

/* ---------------- new project ---------------- */
function newProjectDialog(type) {
  const isV = type === 'vector', max = isV ? 8192 : 4096;
  let w = isV ? 1024 : 1024, h = isV ? 1024 : 1024, transparent = false;
  const name = el('input', { type: 'text', class: 'txt', value: isV ? 'Vector project' : 'Normal project' });
  const iw = el('input', { type: 'number', class: 'num', value: w, min: 1, max, inputmode: 'numeric' }), ih = el('input', { type: 'number', class: 'num', value: h, min: 1, max, inputmode: 'numeric' });
  const box = el('div', { class: 'ratiobox' }), info = el('div', { class: 'note' });
  const upd = () => {
    w = clamp(Math.round(+iw.value) || 1, 1, max); h = clamp(Math.round(+ih.value) || 1, 1, max);
    const k = 120 / Math.max(w, h); box.style.width = Math.max(4, w * k) + 'px'; box.style.height = Math.max(4, h * k) + 'px';
    box.classList.toggle('chk', transparent); info.textContent = `${w} × ${h} px · tỉ lệ ${(w / h).toFixed(3)}:1` + (isV ? ' (artboard — vector phóng to thoải mái, export size tuỳ ý)' : ` · ~${((w * h * 4) / 1048576).toFixed(1)} MB / layer`);
  };
  iw.addEventListener('input', upd); ih.addEventListener('input', upd);
  const presets = (isV ? [[1024, 1024], [512, 512], [16, 16], [64, 64], [1920, 1080], [1080, 1920], [2048, 2048], [4096, 4096]] : [[16, 16], [32, 32], [64, 64], [128, 128], [512, 512], [1024, 1024], [1920, 1080], [2048, 2048]])
    .map(([a, b]) => el('button', { class: 'pill', onclick: () => { iw.value = a; ih.value = b; upd(); } }, a + '×' + b));
  const bgT = O.toggle('Nền trong suốt', () => transparent, v => { transparent = v; upd(); });
  upd();
  const body = el('div', { class: 'form' }, el('label', null, 'Tên'), name,
    el('label', null, 'Kích thước (px)'), el('div', { class: 'sizerow' }, iw, el('span', null, '×'), ih),
    el('div', { class: 'chips' }, presets), el('div', { class: 'ratiowrap' }, box), info, bgT);
  openModal(isV ? 'Vector project mới' : 'Normal project mới', body, [{ label: 'Huỷ' }, {
    label: 'Tạo', kind: 'primary', fn: async () => {
      upd(); if (!isV && w * h > 16.8e6) { toast('Tối đa ~16 triệu pixel (4096×4096)'); return false; }
      const d = newDoc({ name: name.value.trim() || 'Untitled', type, w, h, bg: transparent ? null : '#ffffff' }); doc = d; await saveNow(); startEditor(d);
    }
  }]);
}

/* ---------------- file import ---------------- */
function pickFile(accept) {
  return new Promise(res => { const i = $('#fileInput'); i.value = ''; i.accept = accept || ''; i.onchange = () => res(i.files[0] || null); i.click(); });
}
async function sniffFile(file) {
  const looksProject = /\.(vdraw|json)$/i.test(file.name) || file.type === 'application/json';
  if (looksProject) { try { const o = JSON.parse(await file.text()); if (o && o.layers && o.type) return { kind: 'project', o }; } catch (_) { } }
  if (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name)) return { kind: 'image' };
  try { const o = JSON.parse(await file.text()); if (o && o.layers && o.type) return { kind: 'project', o }; } catch (_) { }
  return { kind: 'unknown' };
}
async function openFileFromHome() {
  const f = await pickFile('*/*'); if (!f) return;
  const k = await sniffFile(f);
  if (k.kind === 'project') {
    try { const o = k.o; o.id = uid(); const d = await deserializeDoc(o); doc = d; await saveNow(); startEditor(d); toast('Đã mở project'); } catch (e) { toast('File project lỗi: ' + e.message); }
  } else if (k.kind === 'image') { await traceFromImage(f, true); }
  else toast('Không nhận ra loại file này');
}
async function traceFromImage(file) {
  try {
    const src = await fileToDataURL(file), im = await loadImage(src);
    const iw = im.naturalWidth || 512, ih = im.naturalHeight || 512, k = 1024 / Math.max(iw, ih), W = Math.round(iw * k), H = Math.round(ih * k);
    const d = newDoc({ name: 'Trace ' + file.name.replace(/\.[^.]+$/, ''), type: 'vector', w: W, h: H });
    const L = newLayer(d, 'img', 'Ảnh gốc'); L.img = im; L.src = src; L.iw = iw; L.ih = ih; L.smooth = !(iw <= 128 && ih <= 128);
    L.corners = [[0, 0], [W, 0], [W, H], [0, H]]; L.opacity = 0.55; L.locked = true; L.trace = true; d.layers.unshift(L);
    doc = d; await saveNow(); startEditor(d); toast('Ảnh nằm ở layer dưới (mờ, đã khoá) — hút màu vẫn lấy đúng màu gốc. Chấm điểm để vẽ vector lên trên!', 4200);
  } catch (e) { toast('Không mở được ảnh: ' + e.message); }
}
async function importImageFlow() {
  const f = await pickFile('image/*,.svg'); if (!f) return;
  try {
    const src = await fileToDataURL(f);
    await addImageLayerFromSrc(src, f.name.replace(/\.[^.]+$/, ''));
    setTool('select'); toggleLayersPanel(true); toast('Đã tạo layer mới — kéo/resize/xoay, bật Warp để kéo méo', 3200);
  } catch (e) { toast('Import lỗi: ' + e.message); }
}
async function importProjectFlow() {
  const f = await pickFile('*/*'); if (!f) return;
  const k = await sniffFile(f);
  if (k.kind === 'image') { const src = await fileToDataURL(f); await addImageLayerFromSrc(src, f.name.replace(/\.[^.]+$/, '')); setTool('select'); return; }
  if (k.kind !== 'project') return toast('Không phải file project/ảnh');
  try {
    const o = k.o; if (o.type !== doc.type) return toast('Khác loại project (vector/normal) — hãy mở từ menu chính');
    const d2 = await deserializeDoc(o);
    withHist(() => {
      for (const l of d2.layers) {
        l.id = uid(); l.rev = ++REV;
        if (l.type === 'ras') { const c = mkCanvas(doc.w, doc.h); c.getContext('2d').drawImage(l.canvas, 0, 0); l.canvas = c; delete l._png; }
        doc.layers.push(l);
      }
      doc.active = d2.layers[d2.layers.length - 1].id;
    });
    toast('Đã import ' + d2.layers.length + ' layer');
  } catch (e) { toast('Lỗi import: ' + e.message); }
}

/* ---------------- export ---------------- */
async function exportBlob(fmt, W, H, bg, q) {
  if (fmt === 'svg') return new Blob([exportSVG(doc, W, H, bg === 'transparent' ? null : bg === 'white' ? '#ffffff' : undefined)], { type: 'image/svg+xml' });
  const c = renderDocToCanvas(doc, W, H, { bg: fmt === 'jpg' ? (bg === 'transparent' || bg === 'white' || !doc.bg ? 'white' : 'keep') : bg });
  return new Promise(res => c.toBlob(res, fmt === 'jpg' ? 'image/jpeg' : 'image/png', q));
}
function exportDialog() {
  const isV = doc.type === 'vector';
  const st = { fmt: 'png', w: doc.w, h: doc.h, lock: true, bg: 'keep', q: 0.92 };
  const iw = el('input', { type: 'number', class: 'num', value: st.w, min: 1, inputmode: 'numeric' }), ih = el('input', { type: 'number', class: 'num', value: st.h, min: 1, inputmode: 'numeric' });
  const info = el('div', { class: 'note' }), ratio = doc.w / doc.h;
  const upd = () => { info.textContent = `Xuất ${st.fmt === 'svg' ? 'SVG' : st.w + ' × ' + st.h + ' px (' + ((st.w * st.h) / 1e6).toFixed(2) + ' MP)'}`; };
  iw.disabled = ih.disabled = !isV;
  iw.addEventListener('input', () => { st.w = Math.max(1, Math.round(+iw.value) || 1); if (st.lock) { st.h = Math.max(1, Math.round(st.w / ratio)); ih.value = st.h; } upd(); });
  ih.addEventListener('input', () => { st.h = Math.max(1, Math.round(+ih.value) || 1); if (st.lock) { st.w = Math.max(1, Math.round(st.h * ratio)); iw.value = st.w; } upd(); });
  const setScale = k => { st.w = Math.round(doc.w * k); st.h = Math.round(doc.h * k); iw.value = st.w; ih.value = st.h; upd(); };
  const qRow = el('div', { class: 'hidden' }), q = O.slider('Chất lượng JPG', 40, 100, 1, () => Math.round(st.q * 100), v => st.q = v / 100, v => v + '%'); qRow.append(q);
  const fmtSeg = O.seg(isV ? [['png', 'PNG'], ['jpg', 'JPG'], ['svg', 'SVG']] : [['png', 'PNG'], ['jpg', 'JPG']], () => st.fmt, v => { st.fmt = v; qRow.classList.toggle('hidden', v !== 'jpg'); sizeBox.classList.toggle('hidden', v === 'svg'); upd(); });
  const lockT = O.toggle('Khoá tỉ lệ', () => st.lock, v => { st.lock = v; });
  const sizeBox = el('div', null, el('label', null, 'Kích thước xuất (px)' + (isV ? '' : ' — Normal project: cố định')), el('div', { class: 'sizerow' }, iw, el('span', null, '×'), ih),
    isV ? el('div', { class: 'chips' }, el('span', { class: 'lab2' }, 'Nhanh:'), [0.5, 1, 2, 4, 8].map(k => el('button', { class: 'pill', onclick: () => setScale(k) }, '×' + k)), lockT) : null);
  const bgSeg = O.seg([['keep', 'Giữ nền'], ['white', 'Nền trắng'], ['transparent', 'Trong suốt']], () => st.bg, v => st.bg = v);
  upd();
  const run = async (share) => {
    if (st.fmt !== 'svg') {
      if (st.w > 16384 || st.h > 16384 || st.w * st.h > 100e6) { toast('Quá lớn: tối đa 16384 px/cạnh và 100 MP'); return false; }
    }
    toast('Đang render…', 1500); await new Promise(r => setTimeout(r, 30));
    try {
      const blob = await exportBlob(st.fmt, st.w, st.h, st.bg, st.q); if (!blob) throw new Error('Render thất bại (quá lớn?)');
      const name = safeName(doc.name) + (st.fmt === 'svg' ? '' : `_${st.w}x${st.h}`) + '.' + st.fmt;
      if (share) await Native.shareBlob(name, blob); else await Native.saveBlob(name, blob);
    } catch (e) { console.error(e); toast('Export lỗi: ' + e.message); return false; }
  };
  openModal('Export ảnh', el('div', { class: 'form' }, el('label', null, 'Định dạng'), fmtSeg, qRow, sizeBox, el('label', null, 'Nền'), bgSeg, info),
    [{ label: 'Đóng' }, { label: 'Chia sẻ', fn: () => run(true) }, { label: 'Lưu vào máy', kind: 'primary', fn: () => run(false) }]);
}
async function saveProjectFile() {
  await saveNow(); const data = await serializeDoc(doc);
  await Native.saveBlob(safeName(doc.name) + '.vdraw', new Blob([JSON.stringify(data)], { type: 'application/json' }));
}

/* ---------------- gradient editor ---------------- */
let gradEd = null;
function editorsSync() { if (typeof shapeEd !== 'undefined' && shapeEd) shapeEd.sync(); if (gradEd) gradEd.sync(); nudgeSync(); }
/* ---- bàn phím mũi tên: nhích hình / điểm đang chọn theo số pixel ---- */
let nudgeEl = null;
function nudgeMove(dx, dy) {
  const s = selShape(); if (!s) return;
  const st = Math.max(0.1, ST.step || 1);
  if (sel.mode === 'nodes' && sel.ni >= 0 && s.nodes[sel.ni]) {
    editSelNodes(ns => { const n = ns[sel.ni]; n[0] += dx * st; n[1] += dy * st; });
  } else editSelNodes(ns => ns.forEach(n => { n[0] += dx * st; n[1] += dy * st; }));
}
function editSelNodes(fn) {
  const s = selShape(); if (!s) return;
  const L = layerById(sel.lid), before = snap(), ns = cloneShape(s); fn(ns.nodes);
  L.shapes = L.shapes.map(x => x === s ? ns : x); touch(L);
  pushHist({ kind: 'doc', before, after: snap() }, 'nudge:' + s.id + ':' + (sel.ni | 0)); requestRender();
}
function nudgeSync() {
  const s = typeof selShape === 'function' && doc && tool === 'select' ? selShape() : null;
  if (!s) { if (nudgeEl) nudgeEl.remove(), nudgeEl = null; return; }
  if (!nudgeEl) {
    const inp = el('input', { type: 'text', inputmode: 'decimal', class: 'txt nstep', value: String(ST.step || 1) });
    inp.addEventListener('change', () => { const x = parseFloat(String(inp.value).replace(',', '.')); ST.step = x > 0 ? x : 1; inp.value = String(ST.step); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } e.stopPropagation(); });
    const ab = (cls, ch, dx, dy) => el('button', { class: 'nb ' + cls, onclick: () => nudgeMove(dx, dy) }, ch);
    nudgeEl = el('div', { class: 'nudge' }, el('div', { class: 'nlab' }), ab('nu', '▲', 0, -1), ab('nl', '◀', -1, 0), inp, ab('nr', '▶', 1, 0), ab('nd', '▼', 0, 1));
    document.body.append(nudgeEl);
  }
  const node = sel.mode === 'nodes' && sel.ni >= 0 && s.nodes[sel.ni];
  $('.nlab', nudgeEl).textContent = node ? 'Điểm · px' : 'Hình · px';
  nudgeEl.classList.toggle('node', !!node);
}
const accStops = acc => shapeStops({ stops: acc.get('stops'), color: acc.get('color'), color2: acc.get('color2') });
const stopsCss = (st, deg) => 'linear-gradient(' + deg + 'deg,' + st.map(s => s.c + ' ' + (s.t * 100).toFixed(1) + '%').join(',') + ')';
function gradColorAt(st, t) {
  st = st.slice().sort((a, b) => a.t - b.t); if (t <= st[0].t) return st[0].c; if (t >= st[st.length - 1].t) return st[st.length - 1].c;
  for (let i = 1; i < st.length; i++) if (t <= st[i].t) { const a = st[i - 1], b = st[i], k = (t - a.t) / ((b.t - a.t) || 1), A = hex2rgb(a.c), B = hex2rgb(b.c); return rgb2hex(A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k); }
  return st[0].c;
}
function gradBtn(acc, onDone) {
  const on = !!acc.get('grad');
  const sw = el('span', { class: 'gsw', style: 'background:' + (on ? stopsCss(accStops(acc), 90) : 'linear-gradient(90deg,#ff0000,#00ff00)') });
  return el('button', { class: 'colorbtn gradbtn' + (on ? ' on' : ''), 'aria-label': 'Gradient', onclick: () => openGradientEditor(acc, onDone) }, sw);
}
function openGradientEditor(acc, onDone) {
  if (gradEd) gradEd.close();
  let uidn = 0;
  const base = acc.get('stops') || acc.get('grad') ? accStops(acc) : [{ t: 0, c: acc.get('color') }, { t: 1, c: acc.get('color') }];
  const S = base.map(s => ({ id: ++uidn, t: s.t, c: s.c })).sort((a, b) => a.t - b.t);
  S[0].t = 0; S[S.length - 1].t = 1;
  const FIRST = S[0].id, LAST = S[S.length - 1].id; let selId = FIRST;
  const sorted = () => S.slice().sort((a, b) => a.t - b.t), curStop = () => S.find(s => s.id === selId) || S[0];
  const ang = () => normDeg(acc.get('gAngle') || 0);
  // UI
  const strip = el('div', { class: 'gstrip' }), marks = el('div', { class: 'gmarks' }), wrap = el('div', { class: 'gstripwrap' }, strip, marks);
  const selSw = el('span', { class: 'sw' }), tLab = el('span', { class: 'zval' });
  const selBtn = el('button', { class: 'colorbtn', onclick: () => pickStop(curStop()) }, selSw, el('span', null, 'Màu điểm'));
  const delBtn = el('button', { class: 'btn', onclick: () => { const c = curStop(); if (c.id === FIRST || c.id === LAST) return; S.splice(S.indexOf(c), 1); selId = FIRST; commit(); } }, 'Xoá điểm');
  const knob = el('i', { class: 'gknob' }), inner = el('div', { class: 'gin' }), deg = el('input', { type: 'text', class: 'txt rotin', value: '0' });
  const dial = el('div', { class: 'gdial' }, inner, knob);
  const tog = O.toggle('Bật gradient', () => !!acc.get('grad'), v => { acc.set('grad', v); if (v) commit(); else paint(); });
  const paint = () => {
    const st = sorted().map(s => ({ t: s.t, c: s.c })), a = ang(), c = curStop();
    strip.style.background = stopsCss(st, 90);
    marks.innerHTML = '';
    sorted().forEach(s => marks.append(el('div', { class: 'gmark' + (s.id === selId ? ' sel' : '') + (s.id === FIRST || s.id === LAST ? ' fixed' : ''), style: 'left:' + (s.t * 100) + '%' }, el('i', { class: 'gline' }), el('b', { class: 'gdot', style: 'background:' + s.c }))));
    selSw.style.background = c.c; tLab.textContent = 't = ' + c.t.toFixed(2);
    delBtn.disabled = c.id === FIRST || c.id === LAST; delBtn.style.opacity = delBtn.disabled ? .4 : 1;
    inner.style.background = stopsCss(st, a + 90);
    const R = 41, rad = a * Math.PI / 180; knob.style.left = (50 + Math.cos(rad) * R) + '%'; knob.style.top = (50 + Math.sin(rad) * R) + '%';
    if (document.activeElement !== deg) deg.value = String(a);
    tog.classList.toggle('on', !!acc.get('grad'));
  };
  const commit = () => { acc.set('stops', sorted().map(s => ({ t: Math.round(s.t * 1000) / 1000, c: s.c }))); if (!acc.get('grad')) acc.set('grad', true); paint(); };
  const pickStop = s => openColorPicker(s.c, v => { s.c = v; commit(); }, { onDone: paint });
  // chạm vào dải: chạm điểm có sẵn = chọn / kéo / (không kéo) mở bảng màu; chạm chỗ trống = thêm điểm mới
  let drag = null;
  wrap.addEventListener('pointerdown', e => {
    e.preventDefault(); wrap.setPointerCapture(e.pointerId);
    const r = wrap.getBoundingClientRect(), x = e.clientX - r.left, t = clamp(x / r.width, 0, 1);
    let hit = null, best = 26; for (const s of S) { const d = Math.abs(s.t * r.width - x); if (d <= best) { best = d; hit = s; } }
    let fresh = false;
    if (!hit) { hit = { id: ++uidn, t, c: gradColorAt(sorted(), t) }; S.push(hit); fresh = true; }
    selId = hit.id; drag = { s: hit, x0: x, moved: false, fresh, w: r.width, left: r.left };
    fresh ? commit() : paint();
  });
  wrap.addEventListener('pointermove', e => {
    if (!drag) return; const x = e.clientX - drag.left;
    if (!drag.moved && Math.abs(x - drag.x0) < 6) return; drag.moved = true;
    if (drag.s.id === FIRST || drag.s.id === LAST) return;
    drag.s.t = clamp(x / drag.w, 0.005, 0.995); commit();
  });
  const endDrag = () => { if (!drag) return; const d = drag; drag = null; if (!d.moved && !d.fresh) pickStop(d.s); };
  wrap.addEventListener('pointerup', endDrag); wrap.addEventListener('pointercancel', () => { drag = null; });
  // vòng tròn xoay gradient: đè vào thì mờ GUI để thấy màu của shape đổi
  const setAng = a => { acc.set('gAngle', normDeg(a)); if (!acc.get('grad')) acc.set('grad', true); paint(); };
  const fromEv = e => {
    const r = dial.getBoundingClientRect(); let a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
    const k = Math.round(a / 45) * 45; if (Math.abs(a - k) < 3) a = k; setAng(a);
  };
  dial.addEventListener('pointerdown', e => {
    e.preventDefault(); dial.setPointerCapture(e.pointerId); m.box.classList.add('fade'); fromEv(e);
    const mv = ev => fromEv(ev), up = () => { dial.removeEventListener('pointermove', mv); dial.removeEventListener('pointerup', up); dial.removeEventListener('pointercancel', up); m.box.classList.remove('fade'); };
    dial.addEventListener('pointermove', mv); dial.addEventListener('pointerup', up); dial.addEventListener('pointercancel', up);
  });
  deg.addEventListener('change', () => { const x = parseFloat(String(deg.value).replace(',', '.')); if (!isNaN(x)) setAng(x); else paint(); });
  deg.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); deg.blur(); } });
  const body = el('div', { class: 'gedit' },
    el('div', { class: 'gtop' }, el('b', null, 'Gradient'), tog),
    wrap, el('div', { class: 'gnote' }, 'Chạm vào dải để thêm điểm màu · chạm điểm để đổi màu · kéo để dời (2 đầu cố định)'),
    el('div', { class: 'gselrow' }, selBtn, tLab, delBtn),
    el('div', { class: 'gdialrow' }, dial, el('div', { class: 'gdialtxt' }, el('span', { class: 'lab' }, 'Xoay gradient'), el('div', { class: 'zrow' }, deg, el('span', { class: 'zval', style: 'min-width:0' }, '°')), el('div', { class: 'gnote' }, 'Kéo vòng tròn để xoay · đè vào là GUI mờ đi'))));
  const m = openModal(null, body, [{ label: 'Xong', kind: 'primary' }], { cls: 'sheetmodal gradmodal', sticky: true, onClose: () => { gradEd = null; if (onDone) onDone(); } });
  gradEd = { close: m.close, sync: () => { if (!acc.valid()) m.close(); } };
  if (!acc.get('grad')) commit(); else paint();
}
/* ---------------- menu chuột phải trên shape + overlay sửa shape ---------------- */
let ctxMenu = null, shapeEd = null;
function closeShapeMenu() { if (ctxMenu) { ctxMenu.el.remove(); document.removeEventListener('pointerdown', ctxMenu.off, true); ctxMenu = null; } }
function shapeMenu(cx, cy) {
  if (!selShape()) return; closeShapeMenu();
  const mk = (ico, label, fn, danger) => el('button', { class: 'cmi' + (danger ? ' danger' : ''), onclick: () => { closeShapeMenu(); setTimeout(fn, 20); } }, el('span', { class: 'ci', html: ic(ico) }), label);
  const m = el('div', { class: 'ctxmenu' }, mk('copy', 'Nhân đôi (lên trên)', duplicateSelected), mk('sliders', 'Thêm tuỳ chọn…', openShapeEditor), mk('trash', 'Xoá hình', deleteSelected, true));
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = clamp(cx, 8, innerWidth - r.width - 8) + 'px'; m.style.top = clamp(cy, 8, innerHeight - r.height - 8) + 'px';
  const off = e => { if (!m.contains(e.target)) closeShapeMenu(); };
  ctxMenu = { el: m, off };
  setTimeout(() => { if (ctxMenu && ctxMenu.el === m) document.addEventListener('pointerdown', off, true); }, 0);
}
function openShapeEditor() {
  if (!selShape()) return; if (shapeEd) shapeEd.close();
  const G = k => { const s = selShape(); return s ? (k === 'curve' ? s.nodes.every(n => !n[2]) : s[k]) : undefined; };
  const E = (k, v) => editSel(k, v);
  const body = el('div', { class: 'sedit' });
  const zlab = el('span', { class: 'zval' });
  const refreshZ = () => { const s = selShape(); if (!s) return; const L = layerById(sel.lid), i = L.shapes.indexOf(s); zlab.textContent = 'Z ' + (s.z == null ? '-' : s.z) + '  ·  ' + (i + 1) + '/' + L.shapes.length; };
  const render = () => {
    const s = selShape(); if (!s) return; body.innerHTML = '';
    const row = (...c) => body.append(O.row(...c)), maxR = clamp(Math.round(Math.min(doc.w, doc.h) / 4), 20, 300);
    row(O.seg([['fill', 'Fill'], ['line', 'Line']], () => G('mode'), v => { E('mode', v); render(); }),
      O.color(() => G('color'), v => E('color', v), 'Màu', { get: () => G('opacity'), set: v => E('opacity', v) }, render),
      gradBtn({ get: G, set: E, valid: (sid => () => { const q = selShape(); return !!q && q.id === sid; })(s.id) }, render));
    row(O.slider('Trong suốt', 5, 100, 1, () => Math.round(G('opacity') * 100), v => E('opacity', v / 100), v => v + '%'));
    if (G('mode') === 'line') { row(O.slider('Độ dày', 1, 150, 1, () => G('width'), v => E('width', v))); row(O.toggle('Nối đầu-cuối', () => G('closed'), v => E('closed', v))); }
    row(O.slider('Bo góc', 0, maxR, 1, () => G('round') || 0, v => E('round', v), v => v ? v + 'px' : 'Tắt'));
    row(O.toggle('Cong mượt', () => G('curve'), v => E('curve', v)));
    const rin = el('input', { type: 'text', class: 'txt rotin', value: String(G('rot') || 0), placeholder: '0' });
    const applyRot = () => { const x = parseFloat(String(rin.value).replace(',', '.')); if (isNaN(x)) { rin.value = String(G('rot') || 0); return; } rotateSelTo(x); rin.value = String(G('rot') || 0); };
    rin.addEventListener('change', applyRot); rin.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); rin.blur(); } });
    row(el('button', { class: 'btn', onclick: () => { flipSel(true); render(); } }, '⇋ Lật ngang'), el('button', { class: 'btn', onclick: () => { flipSel(false); render(); } }, '⇅ Lật dọc'));
    body.append(el('div', { class: 'zrow' }, el('span', { class: 'lab' }, 'Xoay (−179 … 180°)'), rin, el('span', { class: 'zval', style: 'min-width:0' }, '°')));
    body.append(el('div', { class: 'zrow' }, el('span', { class: 'lab' }, 'Z-order'),
      el('button', { class: 'btn zb', onclick: () => { zShift(-1); refreshZ(); } }, '−'), zlab, el('button', { class: 'btn zb', onclick: () => { zShift(1); refreshZ(); } }, '+')));
    body.append(el('div', { class: 'note' }, '− ra sau · + ra trước (đổi chỗ với hình kề bên). Hình mới luôn có Z cao nhất.'));
    refreshZ();
  };
  const m = openModal('Sửa hình', body, [{ label: 'Xong', kind: 'primary' }], { cls: 'sheetmodal shapeed', sticky: true, onClose: () => { shapeEd = null; } });
  shapeEd = { close: m.close, render, sync: () => { if (!selShape()) m.close(); else render(); } };
  render();
}
/* ---------------- cài đặt app (main menu) ---------------- */
function chkRow(label, desc, get, set) {
  const cb = el('input', { type: 'checkbox' }); cb.checked = !!get();
  cb.addEventListener('change', () => set(cb.checked));
  return el('label', { class: 'chkrow' }, cb, el('span', { class: 'ct' }, el('b', null, label), desc ? el('small', null, desc) : null));
}
function backupBlock() {
  const lab = el('div', { class: 'note' }), st = el('div', { class: 'note' });
  const upd = () => { const d = Backup.dir(); lab.textContent = d ? 'Thư mục: ' + decodeURIComponent(String(d.label || d.uri)) : 'Chưa chọn thư mục. Project hiện chỉ nằm trong bộ nhớ của app → gỡ app là MẤT.'; };
  const busy = async (msg, fn) => { st.textContent = msg; try { await fn(); } catch (e) { st.textContent = 'Lỗi: ' + ((e && e.message) || e); } };
  upd();
  return el('div', { class: 'bkblock' }, lab,
    el('button', { class: 'btn', onclick: async () => { const r = await Backup.choose(); upd(); if (r) st.textContent = 'Đã chọn. Bấm "Sao lưu tất cả ngay" để chép project hiện có.'; } }, '📁 Chọn / đổi thư mục sao lưu'),
    chkRow('Tự sao lưu khi lưu project', 'Mỗi lần project tự lưu, 1 bản .vdraw cũng được chép vào thư mục trên (có thể trễ vài giây). Chọn thư mục ở ngoài app (vd Documents/VecDraw) thì gỡ app vẫn còn.', () => Prefs.get('autoBackup', true), v => Prefs.set('autoBackup', v)),
    el('button', { class: 'btn', onclick: () => busy('Đang sao lưu…', async () => { const n = await Backup.all(); st.textContent = n < 0 ? 'Có ' + (-n) + ' project lỗi: ' + Backup.err() : (n === 0 && !Backup.dir()) ? '' : 'Đã sao lưu ' + n + ' project.'; }) }, '💾 Sao lưu tất cả ngay'),
    el('button', { class: 'btn', onclick: () => busy('Đang khôi phục…', async () => { const r = await Backup.restore(); if (!r) { st.textContent = ''; return; } st.textContent = 'Tìm thấy ' + r.total + ' file: thêm lại ' + r.added + ', đã có sẵn ' + r.skipped + (r.failed ? ', lỗi ' + r.failed : '') + '.'; if (r.added && typeof showHome === 'function') showHome(); }) }, '♻️ Khôi phục project từ thư mục'),
    st);
}
function appSettings() {
  const list = el('div', { class: 'setlist' },
    el('div', { class: 'setsec' }, 'Hút màu'),
    chkRow('Hút màu từ layer hiện tại', 'Bật: chỉ layer đang chọn mới được hút (màu thật). Chỗ layer đó trống thì không hút, màu giữ nguyên. Tắt: hút màu theo cả ảnh đang thấy.', () => Prefs.get('pickLayerOnly', false), v => Prefs.set('pickLayerOnly', v)),
    el('div', { class: 'setsec' }, 'Sao lưu project'),
    backupBlock(),
    el('div', { class: 'setsec' }, 'Mở rộng'),
    el('button', { class: 'btn', onclick: () => { if (typeof pluginManager === 'function') pluginManager(); } }, '🧩 Quản lý Plugins'),
    el('div', { class: 'setsec' }, 'Thông tin'),
    el('div', { class: 'note' }, 'VecDraw · dữ liệu project lưu ngay trong máy. Xuất file .vdraw từ menu ⋯ của project để sao lưu.'));
  openModal('Cài đặt', list, [{ label: 'Xong', kind: 'primary' }], { cls: 'setmodal' });
}
/* ---------------- project settings ---------------- */
function settingsDialog() {
  const isV = doc.type === 'vector';
  const name = el('input', { type: 'text', class: 'txt', value: doc.name });
  let bg = doc.bg || '#ffffff', transparent = !doc.bg, w = doc.w, h = doc.h;
  const iw = el('input', { type: 'number', class: 'num', value: w, inputmode: 'numeric' }), ih = el('input', { type: 'number', class: 'num', value: h, inputmode: 'numeric' });
  const body = el('div', { class: 'form' }, el('label', null, 'Tên project'), name,
    el('label', null, 'Nền'), el('div', { class: 'chips' }, O.color(() => bg, v => { bg = v; transparent = false; tgl.classList.remove('on'); }, 'Màu nền'), (window.tgl = O.toggle('Trong suốt', () => transparent, v => { transparent = v; }))),
    isV ? el('label', null, 'Artboard (px)') : el('div', { class: 'note' }, 'Normal project: kích thước cố định ' + doc.w + '×' + doc.h),
    isV ? el('div', { class: 'sizerow' }, iw, el('span', null, '×'), ih) : null);
  const tgl = window.tgl;
  openModal('Cài đặt project', body, [{ label: 'Huỷ' }, {
    label: 'Áp dụng', kind: 'primary', fn: () => {
      withHist(() => {
        doc.name = name.value.trim() || doc.name; doc.bg = transparent ? null : bg;
        if (isV) { doc.w = clamp(Math.round(+iw.value) || doc.w, 1, 8192); doc.h = clamp(Math.round(+ih.value) || doc.h, 1, 8192); }
      }); $('#projName').textContent = doc.name; requestRender();
    }
  }]);
}

/* ---------------- editor menu ---------------- */
function editorMenu() {
  actionSheet(doc.name, [
    { icon: 'save', label: 'Lưu project', fn: async () => { await saveNow(); toast('Đã lưu vào máy ✓'); } },
    { icon: 'image', label: 'Export ảnh (PNG / JPG / SVG)…', fn: exportDialog },
    { icon: 'download', label: 'Lưu file project (.vdraw)', fn: saveProjectFile },
    ...(doc.mapping ? [
      { icon: 'download', label: 'Export ' + MAP_TABS.find(t => t.id === doc.mapping.cur).asset + '…', fn: () => exportSingle(doc.mapping.cur) },
      { icon: 'download', label: 'Export Center (nhiều map → thư mục)…', fn: exportCenter },
      { icon: 'rotate', label: 'Đồng bộ background từ texture gốc', fn: () => syncRef(true) }
    ] : [{ icon: 'layers', label: 'Tạo Map Editor từ project này', fn: async () => { await saveNow(); mappingDialog(doc.id); } }]),
    ...pluginMenuItems(async () => doc),
    { icon: 'upload', label: 'Import ảnh → layer mới', fn: importImageFlow },
    { icon: 'upload', label: 'Import file project / vector…', fn: importProjectFlow },
    { icon: 'sliders', label: 'Cài đặt project', fn: settingsDialog },
    { icon: 'fit', label: 'Vừa màn hình', fn: fitView },
    { icon: 'home', label: 'Về menu chính', fn: goHome }
  ]);
}

/* ---------------- back button ---------------- */
function handleBack() {
  if (modalStack.length) { modalStack[modalStack.length - 1].close(); return true; }
  if (!$('#editor').classList.contains('hidden')) {
    if (pend) { cancelPending(); return true; }
    if (!$('#layersPanel').classList.contains('hidden')) { toggleLayersPanel(false); return true; }
    goHome(); return true;
  }
  return false;
}
