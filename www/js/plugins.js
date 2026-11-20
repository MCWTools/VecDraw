'use strict';
/* =========================================================
   VecDraw – plugin system (khai báo bằng JSON, không chạy code lạ)
   type "export-folder": thêm nút export ra thư mục textures/<tên_project>/ với hậu tố map
   ========================================================= */
const BUILTIN_PLUGINS = [{
  'vecdraw-plugin': 1, id: 'texturepack-export', name: 'TexturePack Folder Export', version: '1.0',
  description: 'Export layer thành PNG + map hậu tố (_n, _s, _e) vào textures/<project>/',
  type: 'export-folder', menuLabel: 'Export in TexturePack folder', folder: 'textures/{name}', format: 'png',
  maps: [
    { id: 'base', label: 'Base (texture chính)', suffix: '', match: [] },
    { id: 'normal', label: 'Normal map', suffix: '_n', match: ['normal', '_n'] },
    { id: 'specular', label: 'Specular / PBR', suffix: '_s', match: ['spec', 'rough', 'metal', '_s'] },
    { id: 'emissive', label: 'Emissive', suffix: '_e', match: ['emis', 'glow', '_e'] }
  ]
}];
const Plugins = {
  list() { try { return JSON.parse(localStorage.getItem('vd_plugins') || '[]'); } catch (_) { return []; } },
  save(a) { localStorage.setItem('vd_plugins', JSON.stringify(a)); },
  validate(o) {
    if (!o || o['vecdraw-plugin'] !== 1 || !o.id || !o.name) throw new Error('Không phải file plugin VecDraw');
    if (o.type !== 'export-folder') throw new Error('Loại plugin chưa hỗ trợ: ' + o.type);
    if (!Array.isArray(o.maps) || !o.maps.length) throw new Error('Plugin thiếu danh sách maps');
    const maps = o.maps.map((m, i) => ({
      id: String(m.id || 'm' + i).replace(/[^a-z0-9_]/gi, ''), label: String(m.label || m.id || 'map').slice(0, 40),
      suffix: String(m.suffix || '').toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 24), match: (m.match || []).map(x => String(x).toLowerCase()).slice(0, 10)
    }));
    return { 'vecdraw-plugin': 1, id: String(o.id).replace(/[^a-z0-9_.-]/gi, ''), name: String(o.name).slice(0, 60), version: String(o.version || '1'), description: String(o.description || ''), type: o.type, menuLabel: String(o.menuLabel || o.name).slice(0, 50), folder: String(o.folder || 'textures/{name}').toLowerCase().replace(/[^a-z0-9_{}./-]/g, ''), format: 'png', maps };
  },
  install(o) { const p = this.validate(o), a = this.list().filter(x => x.id !== p.id); a.push(p); this.save(a); return p; },
  remove(id) { this.save(this.list().filter(x => x.id !== id)); }
};

/* ---------- tên file: lowercase, _ thay khoảng trắng, bỏ ký tự lạ ---------- */
function slug(s) {
  return String(s || 'texture').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().trim()
    .replace(/\s+/g, '_').replace(/[^a-z0-9_.-]/g, '').replace(/_+/g, '_').replace(/^[_.-]+|[_.-]+$/g, '') || 'texture';
}

/* ---------- zip store-only (fallback khi trình duyệt không có chọn thư mục) ---------- */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
async function makeZip(entries) {
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  for (const e of entries) {
    const data = new Uint8Array(await e.blob.arrayBuffer()), name = enc.encode(e.path), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
    parts.push(lh.buffer, name, data);
    const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    cen.push(ch.buffer, name); off += 30 + name.length + data.length;
  }
  let cl = 0; for (const c of cen) cl += c.byteLength || c.length;
  const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, cl, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...cen, end.buffer], { type: 'application/zip' });
}
async function writeFolderFiles(entries, folder) {
  const FS = Native.isNative && Capacitor.Plugins.Filesystem;
  if (FS) {
    try { await FS.requestPermissions(); } catch (_) { }
    for (const e of entries) {
      const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(e.blob); });
      await FS.writeFile({ path: 'VecDraw/' + e.path, data, directory: 'DOCUMENTS', recursive: true });
    }
    return 'Documents/VecDraw/' + folder;
  }
  if (window.showDirectoryPicker) {
    const root = await window.showDirectoryPicker({ mode: 'readwrite' });
    for (const e of entries) {
      const segs = e.path.split('/'); let dir = root;
      for (const s of segs.slice(0, -1)) dir = await dir.getDirectoryHandle(s, { create: true });
      const fh = await dir.getFileHandle(segs[segs.length - 1], { create: true }), w = await fh.createWritable(); await w.write(e.blob); await w.close();
    }
    return folder;
  }
  const z = await makeZip(entries), a = document.createElement('a'); a.href = URL.createObjectURL(z); a.download = slug(folder.split('/').pop()) + '_textures.zip'; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  return folder + ' (zip)';
}

/* ---------- export dialog ---------- */
function openFolderExport(plugin, d) {
  const name = slug(d.name), isV = d.type === 'vector';
  const sets = {}, suf = {}, on = {};
  plugin.maps.forEach(m => {
    suf[m.id] = m.suffix; on[m.id] = true; sets[m.id] = new Set();
    if (m.id !== 'base' && m.match.length) d.layers.forEach(l => { const n = l.name.toLowerCase(); if (m.match.some(t => n.includes(t))) sets[m.id].add(l.id); });
  });
  let W = d.w, H = d.h, transparent = true;
  const iw = el('input', { type: 'number', class: 'num', value: W, min: 1, inputmode: 'numeric', disabled: !isV });
  const ih = el('input', { type: 'number', class: 'num', value: H, min: 1, inputmode: 'numeric', disabled: !isV });
  iw.addEventListener('input', () => { W = Math.max(1, Math.round(+iw.value) || 1); H = Math.max(1, Math.round(W * d.h / d.w)); ih.value = H; });
  ih.addEventListener('input', () => { H = Math.max(1, Math.round(+ih.value) || 1); W = Math.max(1, Math.round(H * d.w / d.h)); iw.value = W; });
  const preview = el('div', { class: 'note' }), refresh = () => {
    const assigned = new Set(); plugin.maps.forEach(m => { if (m.id !== 'base' && on[m.id]) sets[m.id].forEach(i => assigned.add(i)); });
    const lines = plugin.maps.filter(m => on[m.id] && (m.id === 'base' || sets[m.id].size)).map(m => `${plugin.folder.replace('{name}', name)}/${name}${suf[m.id]}.png`);
    preview.textContent = lines.join('\n'); preview.style.whiteSpace = 'pre-wrap'; preview.style.fontFamily = 'monospace';
  };
  const rows = plugin.maps.map(m => {
    const isBase = m.id === 'base';
    const sin = el('input', { type: 'text', class: 'txt', value: suf[m.id], style: 'width:90px', maxlength: 24, disabled: isBase });
    sin.addEventListener('input', () => { suf[m.id] = sin.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''); refresh(); });
    const chips = isBase ? el('div', { class: 'note' }, 'Gồm mọi layer đang hiện chưa gán cho map khác') :
      el('div', { class: 'chips' }, d.layers.slice().reverse().map(l => { const b = el('button', { class: 'pill' + (sets[m.id].has(l.id) ? ' on' : ''), onclick: () => { sets[m.id].has(l.id) ? sets[m.id].delete(l.id) : sets[m.id].add(l.id); b.classList.toggle('on'); refresh(); } }, l.name); return b; }));
    return el('div', { class: 'maprow' }, el('div', { class: 'orow' }, el('b', null, m.label), el('span', { class: 'spacer' }), el('span', { class: 'lab2' }, 'Hậu tố'), sin), chips);
  });
  refresh();
  const body = el('div', { class: 'form' }, el('div', { class: 'note' }, 'Gán layer cho từng map (tự gán theo tên layer, ví dụ layer tên "normal" → _n). Map không có layer sẽ bị bỏ qua.'), ...rows,
    el('label', null, 'Kích thước xuất (px)' + (isV ? '' : ' — cố định theo project')), el('div', { class: 'sizerow' }, iw, el('span', null, '×'), ih),
    O.toggle('Nền trong suốt', () => transparent, v => transparent = v), el('label', null, 'Sẽ tạo file'), preview);
  openModal(plugin.menuLabel, body, [{ label: 'Huỷ' }, {
    label: 'Export', kind: 'primary', fn: async () => {
      const assigned = new Set(); plugin.maps.forEach(m => { if (m.id !== 'base') sets[m.id].forEach(i => assigned.add(i)); });
      const folder = plugin.folder.replace('{name}', name), entries = [];
      try {
        for (const m of plugin.maps) {
          if (m.id !== 'base' && !sets[m.id].size) continue;
          const layers = m.id === 'base' ? d.layers.filter(l => l.visible && !assigned.has(l.id)) : d.layers.filter(l => sets[m.id].has(l.id));
          if (!layers.length) continue;
          toast('Đang render ' + m.label + '…', 1200); await new Promise(r => setTimeout(r, 20));
          const dd = Object.assign({}, d, { layers: layers.map(l => Object.assign({}, l, { visible: true })) });
          const c = renderDocToCanvas(dd, W, H, { bg: transparent ? 'transparent' : 'keep' });
          const blob = await new Promise(r => c.toBlob(r, 'image/png'));
          if (!blob) throw new Error('Render thất bại');
          entries.push({ path: `${folder}/${name}${suf[m.id]}.png`, blob });
        }
        if (!entries.length) { toast('Không có gì để export'); return false; }
        const where = await writeFolderFiles(entries, folder);
        toast(`Xong ${entries.length} file → ${where}`, 4500);
      } catch (e) { console.error(e); toast('Export lỗi: ' + e.message, 4000); return false; }
    }
  }]);
}

/* ---------- menu hooks ---------- */
function pluginMenuItems(getDoc) {
  return Plugins.list().filter(p => p.type === 'export-folder').map(p => ({ icon: 'download', label: p.menuLabel, fn: async () => { const d = await getDoc(); if (d) openFolderExport(p, d); } }));
}

/* ---------- plugin manager ---------- */
function pluginManager() {
  const body = el('div', { class: 'form' });
  const draw = () => {
    body.innerHTML = '';
    const inst = Plugins.list();
    body.append(el('label', null, 'Đã cài'));
    if (!inst.length) body.append(el('div', { class: 'note' }, 'Chưa có plugin nào.'));
    inst.forEach(p => body.append(el('div', { class: 'orow maprow' }, el('div', null, el('b', null, p.name + ' '), el('span', { class: 'lab2' }, 'v' + p.version), el('div', { class: 'note' }, p.description || p.menuLabel)), el('span', { class: 'spacer' }),
      el('button', { class: 'btn danger', onclick: async () => { if (await askConfirm('Gỡ plugin?', `Gỡ "${p.name}"? Menu export tương ứng sẽ biến mất.`, 'Gỡ', true)) { Plugins.remove(p.id); draw(); } } }, 'Gỡ'))));
    body.append(el('label', null, 'Có sẵn'));
    BUILTIN_PLUGINS.filter(b => !inst.some(p => p.id === b.id)).forEach(b => body.append(el('div', { class: 'orow maprow' }, el('div', null, el('b', null, b.name), el('div', { class: 'note' }, b.description)), el('span', { class: 'spacer' }), el('button', { class: 'btn primary', onclick: () => { Plugins.install(b); toast('Đã cài ' + b.name); draw(); } }, 'Cài'))));
    body.append(el('button', { class: 'btn', onclick: async () => { const f = await pickFile('*/*'); if (!f) return; try { const p = Plugins.install(JSON.parse(await f.text())); toast('Đã cài ' + p.name); draw(); } catch (e) { toast('Lỗi plugin: ' + e.message, 4000); } } }, 'Cài plugin từ file (.json)…'));
  };
  draw(); openModal('Plugins', body, [{ label: 'Đóng' }]);
}

window.addEventListener('DOMContentLoaded', () => {
  // chuột phải / bấm giữ trên card project
  $('#projectGrid').addEventListener('contextmenu', e => { const c = e.target.closest('.card'); if (c && window.homeMetas) { const m = window.homeMetas.find(x => x.id === c.dataset.id); if (m) projectMenu(m); } });
});
