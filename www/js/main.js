'use strict';
/* Khởi động + chặn UI mặc định của trình duyệt */
['contextmenu', 'dragstart', 'gesturestart', 'gesturechange'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { capture: true, passive: false }));
document.addEventListener('selectstart', e => { const t = e.target; if (!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'))) e.preventDefault(); }, true);
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', e => e.preventDefault());

window.addEventListener('DOMContentLoaded', async () => {
  $$('[data-i]').forEach(e => e.innerHTML = ic(e.dataset.i));
  try { await dbOpen(); } catch (e) { toast('Không mở được kho lưu trữ: ' + e.message, 5000); }
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (_) { }
  $('#btnNewVec').onclick = () => newProjectDialog('vector');
  $('#btnNewRas').onclick = () => newProjectDialog('raster');
  $('#btnOpenFile').onclick = openFileFromHome;
  $('#btnTrace').onclick = async () => { const f = await pickFile('image/*'); if (f) traceFromImage(f); };
  $('#btnHome').onclick = goHome;
  $('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
  $('#btnLayers').onclick = () => toggleLayersPanel();
  $('#btnMenu').onclick = editorMenu;
  $('#projName').onclick = settingsDialog;
  $('#btnAppSettings').onclick = appSettings;
  $('#zFit').onclick = fitView;
  $('#zIn').onclick = () => zoomAt(CW / 2, CH / 2, 1.4);
  $('#zOut').onclick = () => zoomAt(CW / 2, CH / 2, 1 / 1.4);
  $('#optToggle').onclick = () => { const p = $('#optPanel'); p.classList.toggle('collapsed'); $('#optToggle').classList.toggle('flip', p.classList.contains('collapsed')); setTimeout(resizeView, 30); };
  document.addEventListener('visibilitychange', () => { if (document.hidden && doc) saveNow(); });
  window.addEventListener('pagehide', () => { if (doc) saveNow(); });
  window.addEventListener('resize', () => setTimeout(resizeView, 50));
  Native.init();
  showHome();
});
