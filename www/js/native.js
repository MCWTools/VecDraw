'use strict';
/* Cầu nối Capacitor (Android) <-> trình duyệt */
const Native = (() => {
  const Cap = window.Capacitor;
  const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const P = n => (Cap && Cap.Plugins && Cap.Plugins[n]) || null;
  const b64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  function download(name, blob) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  async function saveBlob(name, blob) {
    const FS = P('Filesystem');
    if (isNative && FS) {
      try {
        try { await FS.requestPermissions(); } catch (_) { }
        const data = await b64(blob);
        await FS.writeFile({ path: 'VecDraw/' + name, data, directory: 'DOCUMENTS', recursive: true });
        toast('Đã lưu: Documents/VecDraw/' + name, 3600); return true;
      } catch (e) { console.warn('Documents save failed', e); return shareBlob(name, blob); }
    }
    download(name, blob); toast('Đã tải: ' + name); return true;
  }
  async function shareBlob(name, blob) {
    const FS = P('Filesystem'), SH = P('Share');
    if (isNative && FS && SH) {
      const data = await b64(blob);
      await FS.writeFile({ path: name, data, directory: 'CACHE' });
      const { uri } = await FS.getUri({ path: name, directory: 'CACHE' });
      await SH.share({ title: name, url: uri, dialogTitle: 'Lưu / chia sẻ ' + name }); return true;
    }
    if (navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type: blob.type })] })) { await navigator.share({ files: [new File([blob], name, { type: blob.type })] }); return true; }
    download(name, blob); return true;
  }
  const Saf = (isNative && Cap.registerPlugin) ? Cap.registerPlugin('Saf') : null;
  const isCancel = e => /cancel/i.test(String((e && e.message) || e));
  /* export 1 file: hộp thoại hệ thống (SAF ACTION_CREATE_DOCUMENT) cho chọn nơi lưu + tên file */
  async function pickSave(name, blob) {
    if (Saf) {
      try { const r = await Saf.createDocument({ name, mime: blob.type || 'application/octet-stream', data: await b64(blob) }); return { ok: true, uri: r.uri }; }
      catch (e) { if (isCancel(e)) return { ok: false, cancelled: true }; throw e; }
    }
    if (window.showSaveFilePicker) {
      try {
        const ext = name.split('.').pop(), h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Image', accept: { [blob.type]: ['.' + ext] } }] });
        const w = await h.createWritable(); await w.write(blob); await w.close(); return { ok: true };
      } catch (e) { if (e && e.name === 'AbortError') return { ok: false, cancelled: true }; throw e; }
    }
    download(name, blob); return { ok: true };
  }
  /* export nhiều file: chọn 1 thư mục (SAF ACTION_OPEN_DOCUMENT_TREE) */
  async function pickDir() {
    if (Saf) { try { const r = await Saf.pickDirectory(); return { native: true, uri: r.uri, label: r.name || r.uri }; } catch (e) { return null; } }
    if (window.showDirectoryPicker) { try { const h = await window.showDirectoryPicker({ mode: 'readwrite' }); return { handle: h, label: h.name }; } catch (_) { return null; } }
    return { zip: true, zipFiles: [], label: 'file .zip tải về' };
  }
  async function listDir(d) {
    if (d.native) return (await Saf.listNames({ uri: d.uri })).names || [];
    if (d.handle) { const n = []; for await (const k of d.handle.keys()) n.push(k); return n; }
    return [];
  }
  async function writeIn(d, name, blob, overwrite) {
    if (d.native) { await Saf.writeToTree({ uri: d.uri, name, mime: blob.type || 'application/octet-stream', data: await b64(blob), overwrite: !!overwrite }); return; }
    if (d.handle) { const fh = await d.handle.getFileHandle(name, { create: true }), w = await fh.createWritable(); await w.write(blob); await w.close(); return; }
    d.zipFiles.push({ path: name, blob });
  }
  async function readIn(d, name) {
    if (d.native) { const r = await Saf.readFromTree({ uri: d.uri, name }); const bin = atob(r.data), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u]); }
    if (d.handle) { const fh = await d.handle.getFileHandle(name); return await fh.getFile(); }
    throw new Error('không đọc được');
  }
  function init() {
    const App = P('App');
    if (isNative && App) App.addListener('backButton', () => { if (!handleBack()) App.exitApp(); });
    else window.addEventListener('popstate', () => handleBack());
  }
  if (isNative) setTimeout(() => { try { if (!Backup.dir() && !Prefs.get('backupAsked', false)) { Prefs.set('backupAsked', true); toast('Mẹo: Cài đặt → "Thư mục sao lưu" để gỡ/cài lại app không mất project', 7000); } } catch (_) { } }, 3000);
  return { isNative, saveBlob, shareBlob, pickSave, pickDir, listDir, writeIn, readIn, init };
})();

/* ---------------- sao lưu project ra thư mục ngoài (không bị xoá khi gỡ app) ---------------- */
const Backup = (() => {
  const dir = () => { const d = Prefs.get('backupDir', null); return d && d.uri ? { native: true, uri: d.uri, label: d.label } : null; };
  const fname = (id, name) => safeName(name) + '__' + id + '.vdraw';
  const pending = new Map(); let timer = 0, lastErr = '';
  const blobOf = data => new Blob([JSON.stringify(data)], { type: 'application/json' });
  function queue(data) {
    if (!dir() || !Prefs.get('autoBackup', true) || !data || !data.id) return;
    pending.set(data.id, data); clearTimeout(timer); timer = setTimeout(flush, 5000);
  }
  async function flush() {
    const d = dir(); if (!d) return;
    for (const [id, data] of [...pending]) {
      pending.delete(id);
      try { await Native.writeIn(d, fname(id, data.name), blobOf(data), true); lastErr = ''; } catch (e) { lastErr = String((e && e.message) || e); console.warn('backup', e); }
    }
  }
  async function choose() {
    const r = await Native.pickDir(); if (!r || !r.native) { if (r) toast('Chỉ chọn được thư mục trên app Android'); return null; }
    Prefs.set('backupDir', { uri: r.uri, label: r.label }); return r;
  }
  async function all() {
    const d = dir(); if (!d) { toast('Chưa chọn thư mục sao lưu'); return 0; }
    let n = 0, bad = 0;
    for (const data of await dbGetAll('data')) { try { await Native.writeIn(d, fname(data.id, data.name), blobOf(data), true); n++; } catch (e) { bad++; lastErr = String((e && e.message) || e); } }
    return bad ? -bad : n;
  }
  /* khôi phục: đọc mọi file .vdraw trong thư mục, project nào chưa có (theo id) thì thêm lại */
  async function restore() {
    const d = dir(); if (!d) { toast('Chưa chọn thư mục sao lưu'); return null; }
    const names = (await Native.listDir(d)).filter(x => /\.vdraw$/i.test(x)), have = new Set((await dbGetAll('meta')).map(m => m.id));
    let added = 0, skipped = 0, failed = 0;
    for (const nm of names) {
      try {
        const o = JSON.parse(await (await Native.readIn(d, nm)).text());
        if (!o || !o.id || !o.layers) { failed++; continue; }
        if (have.has(o.id)) { skipped++; continue; }
        const dd = await deserializeDoc(o), thumb = await makeThumb(dd);
        await dbPut('data', o);
        await dbPut('meta', { id: dd.id, name: dd.name, type: dd.type, w: dd.w, h: dd.h, updated: Date.now(), thumb, bg: dd.bg, mapping: !!dd.mapping });
        have.add(o.id); added++;
      } catch (e) { failed++; console.warn('restore', nm, e); }
    }
    return { added, skipped, failed, total: names.length };
  }
  return { dir, queue, flush, choose, all, restore, err: () => lastErr };
})();
