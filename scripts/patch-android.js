// Chạy sau `npx cap add android`: chỉnh manifest / theme / icon.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'android', 'app', 'src', 'main');

// 1) Manifest: quyền ghi file (Android <= 12) + legacy storage
const manPath = path.join(root, 'AndroidManifest.xml');
let man = fs.readFileSync(manPath, 'utf8');
if (!man.includes('WRITE_EXTERNAL_STORAGE')) {
  man = man.replace(
    '</manifest>',
    '    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="32" />\n' +
      '    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />\n</manifest>'
  );
}
if (!man.includes('requestLegacyExternalStorage')) {
  man = man.replace('<application', '<application android:requestLegacyExternalStorage="true"');
}
fs.writeFileSync(manPath, man);

// 2) Theme: không bị status bar đè lên app trên Android 15+
const stylePath = path.join(root, 'res', 'values', 'styles.xml');
if (fs.existsSync(stylePath)) {
  let s = fs.readFileSync(stylePath, 'utf8');
  if (!s.includes('windowOptOutEdgeToEdgeEnforcement')) {
    s = s.replace(
      /(<style name="AppTheme\.NoActionBar"[^>]*>)/,
      '$1\n        <item name="android:windowOptOutEdgeToEdgeEnforcement">true</item>'
    );
    fs.writeFileSync(stylePath, s);
  }
}

// 3) Icon: ghi đè mipmap bằng icon trong resources/
const dens = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const fgDens = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
for (const d of Object.keys(dens)) {
  const dir = path.join(root, 'res', 'mipmap-' + d);
  const ic = path.join(__dirname, '..', 'resources', `icon-${dens[d]}.png`);
  const fg = path.join(__dirname, '..', 'resources', `icon-fg-${fgDens[d]}.png`);
  if (fs.existsSync(ic) && fs.existsSync(dir)) {
    fs.copyFileSync(ic, path.join(dir, 'ic_launcher.png'));
    fs.copyFileSync(ic, path.join(dir, 'ic_launcher_round.png'));
  }
  if (fs.existsSync(fg) && fs.existsSync(dir)) {
    fs.copyFileSync(fg, path.join(dir, 'ic_launcher_foreground.png'));
  }
}
const bgXml = path.join(root, 'res', 'values', 'ic_launcher_background.xml');
if (fs.existsSync(bgXml)) {
  fs.writeFileSync(
    bgXml,
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#14151A</color>\n</resources>\n'
  );
}
// 4) Plugin SAF tự viết: CREATE_DOCUMENT (export 1 file) + OPEN_DOCUMENT_TREE (export cả thư mục)
const javaDir = path.join(root, 'java', 'com', 'vecdraw', 'app');
fs.mkdirSync(javaDir, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'SafPlugin.java'), path.join(javaDir, 'SafPlugin.java'));
fs.writeFileSync(path.join(javaDir, 'MainActivity.java'),
  'package com.vecdraw.app;\n\nimport android.os.Bundle;\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(SafPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n}\n');
console.log('Android patched.');
