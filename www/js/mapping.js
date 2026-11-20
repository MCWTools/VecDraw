'use strict';
/* =========================================================
   VecDraw V2 – Mapping mode (Map Editor)
   - project mapping gắn với 1 texture project nguồn
   - mỗi tab map (normal/height/...) có stack layer riêng
   - background tham chiếu: layer được bảo vệ, chỉ ẩn/hiện + opacity, không bao giờ export
   ========================================================= */
const MAP_TABS = [
  { id: 'normal', label: 'Normal', asset: 'Normal Map', suffix: '_normal', bg: '#8080ff' },
  { id: 'height', label: 'Height', asset: 'Height Map', suffix: '_height', bg: '#000000' },
  { id: 'metallic', label: 'Metallic', asset: 'Metallic Map', suffix: '_metallic', bg: '#000000' },
  { id: 'roughness', label: 'Roughness', asset: 'Roughness Map', suffix: '_roughness', bg: '#808080' },
  { id: 'ao', label: 'AO', asset: 'Ambient Occlusion', suffix: '_ao', bg: '#ffffff' },
  { id: 'emission', label: 'Emission', asset: 'Emission Map', suffix: '_emission', bg: '#000000' }
];
const BASE_ASSET = { id: 'base', label: 'Base', asset: 'Base Color', suffix: '' };

/* ---------- background reference ---------- */
function mkRefLayer(d, canvas) {
  return {
    id: uid(), name: 'Background (reference)', type: 'img', ref: true, locked: true, visible: d.mapping.ref.visible, opacity: d.mapping.ref.opacity,
    blend: 'source-over', blur: 0, rev: ++REV, img: canvas, src: null, iw: canvas.width, ih: canvas.height,
    corners: [[0, 0], [d.w, 0], [d.w, d.h], [0, d.h]], smooth: !(canvas.width <= 128 && canvas.height <= 128)
  };
}
async function renderSource(d) {
  const m = d.mapping, sd = m.sourceId ? await dbGet('data', m.sourceId) : null;
  if (!sd) return { canvas: mkCanvas(d.w, d.h), stamp: 0, missing: true };
  const src = await deserializeDoc(sd);
  return { canvas: renderDocToCanvas(src, d.w, d.h, { bg: 'keep' }), stamp: sd.updated || 0 };
}
async function attachRef(d) {
  const m = d.mapping, r = await renderSource(d);
  m.refCanvas = r.canvas; m.refStamp = r.stamp; m.missing = !!r.missing;
  for (const t of MAP_TABS) {
    const s = m.sets[t.id] || (m.sets[t.id] = { layers: [], active: null });
    s.layers = s.layers.filter(l => !l.ref);
    if (!s.layers.length) s.layers.push(newLayer(d, 'ras', 'Layer 1'));
    s.layers.unshift(mkRefLayer(d, r.canvas));
    if (!s.layers.find(l => l.id === s.active)) s.active = s.layers[s.layers.length - 1].id;
    if (m.bgs[t.id] === undefined) m.bgs[t.id] = t.bg;
  }
  if (!MAP_TABS.some(t => t.id === m.cur)) m.cur = 'normal';
  d.layers = m.sets[m.cur].layers; d.active = m.sets[m.cur].active; d.bg = m.bgs[m.cur];
}
function applyRefProps() {
  if (!doc || !doc.mapping) return;
  const r = doc.mapping.ref;
  for (const k in doc.mapping.sets) for (const l of doc.mapping.sets[k].layers) if (l.ref) { l.visible = r.visible; l.opacity = r.opacity; touch(l); }
  for (const l of doc.layers) if (l.ref) { l.visible = r.visible; l.opacity = r.opacity; touch(l); }
}
function setRefProp(k, v) {
  if (k !== 'visible' && k !== 'opacity') return;
  doc.mapping.ref[k] = v; applyRefProps(); markDirty(); requestRender();
  if (k === 'visible') uiRefresh();
}
async function syncRef(manual) {
  if (!doc || !doc.mapping) return;
  const m = doc.mapping; if (!m.sourceId) return;
  try {
    const sd = await dbGet('data', m.sourceId);
    if (!sd) { if (manual) toast('Texture gốc không còn tồn tại'); return; }
    if (!manual && (sd.updated || 0) === m.refStamp) return;
    const r = await renderSource(doc);
    // cập nhật nội dung canvas dùng chung (giữ nguyên object để mọi tab thấy ngay)
    const c = m.refCanvas; c.getContext('2d').clearRect(0, 0, c.width, c.height); c.getContext('2d').drawImage(r.canvas, 0, 0);
    m.refStamp = r.stamp; for (const k in m.sets) for (const l of m.sets[k].layers) if (l.ref) touch(l);
    requestRender(); if (manual) toast('Background đã đồng bộ với texture gốc ✓');
  } catch (e) { console.warn(e); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncRef(false); });

/* ---------- tabs ---------- */
function commitTab() {
  const m = doc.mapping, s = m.sets[m.cur];
  s.layers = doc.layers; s.active = doc.active; s.hist = { u: Hist.u, r: Hist.r, bytes: Hist.bytes }; m.bgs[m.cur] = doc.bg;
}
function switchTab(id) {
  const m = doc.mapping; if (m.cur === id) return;
  if (pend) commitPending(true);
  cancelAction(); commitTab();
  m.cur = id; const s = m.sets[id];
  doc.layers = s.layers; doc.active = s.active; doc.bg = m.bgs[id];
  Hist.u = s.hist ? s.hist.u : []; Hist.r = s.hist ? s.hist.r : []; Hist.bytes = s.hist ? s.hist.bytes : 0;
  sel = null; Stroke = null; liveStroke = null; markDirty(); requestRender(); uiRefresh(true);
}
function buildMapTabs() {
  const B = $('#mapTabs'); if (!B) return;
  if (!doc || !doc.mapping) { B.classList.add('hidden'); B.innerHTML = ''; return; }
  B.classList.remove('hidden'); B.innerHTML = '';
  const cur = MAP_TABS.find(t => t.id === doc.mapping.cur);
  B.append(el('div', { class: 'mtabs' }, MAP_TABS.map(t => el('button', { class: 'mtab' + (t.id === cur.id ? ' on' : ''), onclick: () => switchTab(t.id) }, t.label))),
    el('div', { class: 'mexp' }, el('button', { class: 'btn primary sm', onclick: () => exportSingle(cur.id) }, '⬇ Export ' + cur.asset),
      el('button', { class: 'btn sm', onclick: exportCenter }, 'Export Center')));
}

/* ---------- tạo mapping project ---------- */
function mappingDialog(srcId) {
  dbGet('meta', srcId).then(sm => {
    if (!sm) return toast('Không tìm thấy project nguồn');
    const name = el('input', { type: 'text', class: 'txt', value: sm.name }), layout = el('input', { type: 'text', class: 'txt', placeholder: 'vd: blade (có thể bỏ trống)' });
    openModal('Tạo Map Editor', el('div', { class: 'form' },
      el('div', { class: 'note' }, 'Texture gốc "' + sm.name + '" (' + sm.w + '×' + sm.h + ') sẽ hiện làm background tham chiếu ở mọi tab map. Texture gốc không bị thay đổi.'),
      el('label', null, 'Tên project (dùng đặt tên file export)'), name, el('label', null, 'Tên layout (thêm vào tên file để không trùng)'), layout),
      [{ label: 'Huỷ' }, { label: 'Tạo', kind: 'primary', fn: () => createMappingProject(srcId, name.value.trim() || sm.name, layout.value.trim()) }]);
  });
}
async function createMappingProject(srcId, name, layout) {
  const sd = await dbGet('data', srcId); if (!sd) return toast('Project nguồn không tồn tại');
  if (sd.mapping) return toast('Không tạo map từ 1 Map Editor khác');
  if (sd.w * sd.h > 8.4e6) return toast('Texture quá lớn cho Map Editor (tối đa ~2900×2900)', 4000);
  const d = { id: uid(), name, type: 'raster', w: sd.w, h: sd.h, bg: '#8080ff', layers: [], active: null, created: Date.now(), mapping: { sourceId: srcId, layout, cur: 'normal', ref: { visible: true, opacity: 1 }, bgs: {}, sets: {}, refStamp: 0 } };
  await attachRef(d); doc = d; await saveNow(); startEditor(d); toast('Map Editor sẵn sàng — background là texture gốc');
}

/* ---------- tên file + render ---------- */
function mapFileName(d, asset, ext) {
  const lay = d.mapping.layout ? '_' + slug(d.mapping.layout) : '';
  return slug(d.name) + lay + asset.suffix + '.' + ext;
}
function canvasBlob(c, ext) {
  let src = c;
  if (ext === 'jpg') { src = mkCanvas(c.width, c.height); const x = src.getContext('2d'); x.fillStyle = '#000000'; x.fillRect(0, 0, c.width, c.height); x.drawImage(c, 0, 0); }
  return new Promise(r => src.toBlob(r, ext === 'jpg' ? 'image/jpeg' : 'image/png', 0.95));
}
async function renderMapBlob(d, id, ext) {
  if (id === 'base') { const r = await renderSource(d); return canvasBlob(r.canvas, ext); }
  const m = d.mapping, cur = id === m.cur;
  const layers = (cur ? d.layers : m.sets[id].layers).filter(l => !l.ref), bg = cur ? d.bg : m.bgs[id];
  const c = renderDocToCanvas(Object.assign({}, d, { layers, bg }), d.w, d.h, { bg: 'keep' });
  return canvasBlob(c, ext);
}
const assetOf = id => id === 'base' ? BASE_ASSET : MAP_TABS.find(t => t.id === id);
const fmtSeg = (get, set) => O.seg([['png', 'PNG'], ['jpg', 'JPG']], get, set);

/* ---------- export 1 map: Storage Access Framework (chọn nơi lưu + tên file) ---------- */
function exportSingle(tabId) {
  const d = doc, t = assetOf(tabId); let ext = 'png';
  const prev = el('div', { class: 'note mono' }), upd = () => { prev.textContent = mapFileName(d, t, ext); };
  upd();
  openModal('Export ' + t.asset, el('div', { class: 'form' }, el('label', null, 'Định dạng'), fmtSeg(() => ext, v => { ext = v; upd(); }),
    el('label', null, 'Tên file đề xuất'), prev,
    el('div', { class: 'note' }, 'PNG giữ trong suốt. JPG: vùng trong suốt được lấp màu đen. Background tham chiếu không bao giờ được export. Bạn sẽ chọn nơi lưu và đổi tên ở hộp thoại hệ thống.')),
    [{ label: 'Huỷ' }, {
      label: 'Chọn nơi lưu…', kind: 'primary', fn: async () => {
        try {
          toast('Đang tạo ' + t.asset + '…', 1500); await new Promise(r => setTimeout(r, 20));
          const blob = await renderMapBlob(d, tabId, ext); if (!blob) throw new Error('Render thất bại');
          const r = await Native.pickSave(mapFileName(d, t, ext), blob);
          if (r.cancelled) return false; toast('Đã export ✓');
        } catch (e) { console.error(e); toast('Export lỗi: ' + (e.message || e), 4000); return false; }
      }
    }]);
}

/* ---------- Export Center: nhiều map → 1 thư mục (ACTION_OPEN_DOCUMENT_TREE) ---------- */
function choose3(title, msg) {
  return new Promise(res => {
    let done = false; const fin = v => { if (!done) { done = true; res(v); } };
    openModal(title, el('div', { class: 'msg' }, msg), [{ label: 'Huỷ', fn: () => fin('cancel') }, { label: 'Bỏ qua file trùng', fn: () => fin('skip') }, { label: 'Ghi đè', kind: 'danger', fn: () => fin('overwrite') }], { onClose: () => fin('cancel'), sticky: true });
  });
}
function exportCenter() {
  const d = doc; commitTab();
  let ext = 'png'; const on = {}; const items = [BASE_ASSET, ...MAP_TABS]; items.forEach(t => on[t.id] = true);
  const layout = el('input', { type: 'text', class: 'txt', value: d.mapping.layout || '', placeholder: 'Layout (tuỳ chọn)' });
  const list = el('div', { class: 'maplist' });
  const draw = () => {
    list.innerHTML = '';
    items.forEach(t => list.append(el('button', { class: 'maprowb' + (on[t.id] ? ' on' : ''), onclick: () => { on[t.id] = !on[t.id]; draw(); } },
      el('span', { class: 'chk' }, on[t.id] ? '✓' : ''), el('span', { class: 'mn' }, t.asset), el('span', { class: 'mf' }, mapFileName(d, t, ext)))));
  };
  layout.addEventListener('input', () => { d.mapping.layout = layout.value.trim(); markDirty(); draw(); });
  draw();
  openModal('Project Export Center', el('div', { class: 'form' }, el('label', null, 'Định dạng'), fmtSeg(() => ext, v => { ext = v; draw(); }),
    el('label', null, 'Layout'), layout, el('label', null, 'Chọn map cần export'), list,
    el('div', { class: 'note' }, 'Bấm Export Selected → chọn 1 thư mục đích duy nhất, tất cả file được ghi vào đó.')),
    [{ label: 'Đóng' }, {
      label: 'Export Selected', kind: 'primary', fn: () => {
        const ids = items.filter(t => on[t.id]).map(t => t.id); if (!ids.length) { toast('Chưa chọn map nào'); return false; }
        runBatch(d, ids, ext); return true;
      }
    }]);
}
async function runBatch(d, ids, ext) {
  const bar = el('div', { class: 'pbar' }, el('div', { class: 'pfill' })), txt = el('div', { class: 'note' }, 'Bắt đầu…');
  const prog = openModal('Đang export…', el('div', { class: 'form' }, bar, txt), null, { sticky: true });
  const setP = (i, n, msg) => { bar.firstChild.style.width = Math.round(i / n * 100) + '%'; txt.textContent = msg; };
  const files = [], result = { ok: [], skipped: [], failed: [] };
  try {
    for (let i = 0; i < ids.length; i++) {
      const t = assetOf(ids[i]), name = mapFileName(d, t, ext);
      setP(i, ids.length * 2, `Đang tạo ${i + 1}/${ids.length}: ${name}`); await new Promise(r => setTimeout(r, 15));
      try { const blob = await renderMapBlob(d, ids[i], ext); if (!blob) throw new Error('render'); files.push({ name, blob }); } catch (e) { result.failed.push(name + ' (render)'); }
    }
    setP(ids.length, ids.length * 2, 'Chọn thư mục đích…');
    const dir = await Native.pickDir();
    if (!dir) { prog.close(); toast('Đã huỷ export'); return; }
    let existing = []; try { existing = await Native.listDir(dir); } catch (_) { }
    const clash = files.filter(f => existing.includes(f.name)); let overwrite = false;
    if (clash.length) {
      const c = await choose3('File đã tồn tại', `${clash.length} file đã có trong thư mục:\n` + clash.map(f => f.name).join('\n') + '\n\nGhi đè hay bỏ qua các file trùng?');
      if (c === 'cancel') { prog.close(); toast('Đã huỷ export'); return; }
      overwrite = c === 'overwrite';
    }
    for (let i = 0; i < files.length; i++) {
      const f = files[i]; setP(ids.length + i, ids.length * 2, `Đang ghi ${i + 1}/${files.length}: ${f.name}`);
      if (existing.includes(f.name) && !overwrite) { result.skipped.push(f.name); continue; }
      try { await Native.writeIn(dir, f.name, f.blob, overwrite); result.ok.push(f.name); } catch (e) { result.failed.push(f.name + ' (' + (e.message || e) + ')'); }
    }
    if (dir.zip && dir.zipFiles.length) { const z = await makeZip(dir.zipFiles.map(f => ({ path: f.path, blob: f.blob }))); const a = document.createElement('a'); a.href = URL.createObjectURL(z); a.download = slug(d.name) + '_maps.zip'; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
    setP(1, 1, 'Hoàn tất'); prog.close();
    openModal('Export hoàn tất', el('div', { class: 'form' },
      el('div', { class: 'msg' }, `Thư mục: ${dir.label}\n✓ ${result.ok.length} file đã ghi · ${result.skipped.length} bỏ qua · ${result.failed.length} lỗi`.split('\n').map(l => el('div', null, l))),
      result.ok.length ? el('div', { class: 'note mono' }, result.ok.join('\n')) : null,
      result.skipped.length ? el('div', { class: 'note mono' }, 'Bỏ qua:\n' + result.skipped.join('\n')) : null,
      result.failed.length ? el('div', { class: 'note mono', style: 'color:var(--danger)' }, 'Lỗi:\n' + result.failed.join('\n')) : null), [{ label: 'Đóng', kind: 'primary' }]);
  } catch (e) { console.error(e); prog.close(); toast('Export lỗi: ' + (e.message || e), 4500); }
}
