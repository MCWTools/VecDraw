package com.vecdraw.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/** Storage Access Framework: hộp thoại lưu file + chọn thư mục của Android. */
@CapacitorPlugin(name = "Saf")
public class SafPlugin extends Plugin {

    /** Export 1 file: ACTION_CREATE_DOCUMENT (người dùng chọn nơi lưu + tên file). */
    @PluginMethod
    public void createDocument(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(call.getString("mime", "application/octet-stream"));
        i.putExtra(Intent.EXTRA_TITLE, call.getString("name", "file"));
        startActivityForResult(call, i, "createResult");
    }

    @ActivityCallback
    private void createResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("cancelled");
            return;
        }
        try {
            Uri uri = result.getData().getData();
            byte[] bytes = Base64.decode(call.getString("data", ""), Base64.DEFAULT);
            OutputStream os = getContext().getContentResolver().openOutputStream(uri, "wt");
            os.write(bytes);
            os.close();
            JSObject o = new JSObject();
            o.put("uri", uri.toString());
            call.resolve(o);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    /** Export nhiều file: ACTION_OPEN_DOCUMENT_TREE (chọn 1 thư mục). */
    @PluginMethod
    public void pickDirectory(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, i, "treeResult");
    }

    @ActivityCallback
    private void treeResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("cancelled");
            return;
        }
        Uri tree = result.getData().getData();
        try {   // giữ quyền truy cập thư mục này lâu dài (kể cả sau khi mở lại app)
            getContext().getContentResolver().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (Exception ignored) { }
        JSObject o = new JSObject();
        o.put("uri", tree.toString());
        o.put("name", tree.getLastPathSegment());
        call.resolve(o);
    }

    @PluginMethod
    public void listNames(PluginCall call) {
        try {
            Uri tree = Uri.parse(call.getString("uri"));
            Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            Cursor c = getContext().getContentResolver().query(children, new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null);
            JSArray arr = new JSArray();
            if (c != null) {
                while (c.moveToNext()) arr.put(c.getString(0));
                c.close();
            }
            JSObject o = new JSObject();
            o.put("names", arr);
            call.resolve(o);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    @PluginMethod
    public void writeToTree(PluginCall call) {
        try {
            Uri tree = Uri.parse(call.getString("uri"));
            String name = call.getString("name");
            String mime = call.getString("mime", "application/octet-stream");
            boolean overwrite = Boolean.TRUE.equals(call.getBoolean("overwrite", false));
            ContentResolver cr = getContext().getContentResolver();
            String treeId = DocumentsContract.getTreeDocumentId(tree);
            Uri parent = DocumentsContract.buildDocumentUriUsingTree(tree, treeId);
            Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, treeId);
            Uri existing = null;
            Cursor c = cr.query(children, new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null);
            if (c != null) {
                while (c.moveToNext()) {
                    if (name.equals(c.getString(1))) existing = DocumentsContract.buildDocumentUriUsingTree(tree, c.getString(0));
                }
                c.close();
            }
            if (existing != null) {
                if (!overwrite) { call.reject("exists"); return; }
                DocumentsContract.deleteDocument(cr, existing);
            }
            Uri f = DocumentsContract.createDocument(cr, parent, mime, name);
            if (f == null) { call.reject("create failed"); return; }
            OutputStream os = cr.openOutputStream(f, "wt");
            os.write(Base64.decode(call.getString("data", ""), Base64.DEFAULT));
            os.close();
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    /** Đọc 1 file trong thư mục đã chọn theo tên -> base64. */
    @PluginMethod
    public void readFromTree(PluginCall call) {
        try {
            Uri tree = Uri.parse(call.getString("uri"));
            String name = call.getString("name");
            ContentResolver cr = getContext().getContentResolver();
            Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            Uri found = null;
            Cursor c = cr.query(children, new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null);
            if (c != null) {
                while (c.moveToNext()) {
                    if (name != null && name.equals(c.getString(1))) { found = DocumentsContract.buildDocumentUriUsingTree(tree, c.getString(0)); break; }
                }
                c.close();
            }
            if (found == null) { call.reject("not found"); return; }
            InputStream is = cr.openInputStream(found);
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
            is.close();
            JSObject o = new JSObject();
            o.put("data", Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP));
            call.resolve(o);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }
}
