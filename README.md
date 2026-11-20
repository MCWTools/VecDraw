# VecDraw

App vẽ vector + normal (HTML/JS, offline) bọc bằng Capacitor để build APK Android.

## Build APK bằng GitHub
1. Tạo repo GitHub, push toàn bộ thư mục này lên nhánh `main`.
2. Tab **Actions** → workflow *Build Android APK* tự chạy (~5–8 phút).
3. Tải APK ở **Releases** (`VecDraw.apk`) ngay trên điện thoại, hoặc ở Artifacts của lần chạy. Cài đặt (cho phép "cài từ nguồn không xác định").

## Chạy thử trên máy tính
`npx http-server www -p 8080` rồi mở http://localhost:8080

## Lưu file
- Project tự lưu trong bộ nhớ app (IndexedDB). Xoá project luôn có hộp thoại xác nhận.
- Export ảnh / file `.vdraw` lưu vào `Documents/VecDraw/` (hoặc bấm *Chia sẻ* để chọn nơi lưu).

## V2 – Mapping mode (Map Editor)
- Menu project (⋯ / chuột phải / bấm giữ) → **Tạo Map Editor** từ 1 texture project.
- 6 tab: Normal, Height, Metallic, Roughness, AO, Emission — mỗi tab có layer riêng và nút **Export <Map>** riêng (hộp thoại lưu file của Android – SAF).
- Background tham chiếu = texture gốc, layer được bảo vệ (chỉ ẩn/hiện + opacity), luôn đồng bộ với project gốc, không bao giờ được export.
- **Export Center**: chọn nhiều map → chọn 1 thư mục (ACTION_OPEN_DOCUMENT_TREE) → ghi hết, có tiến trình + tổng kết, hỏi trước khi ghi đè.
- Tên file: chữ thường, `_` thay khoảng trắng: `wooden_sword.png`, `wooden_sword_normal.png`, `..._ao.png`, thêm layout: `wooden_sword_blade_normal.png`.

## Plugin
Home → 🧩 Plugins → cài "TexturePack Folder Export" (hoặc file `plugins/*.json`). Menu project có thêm **Export in TexturePack folder** → `textures/<project>/<project>.png`, `_n`, `_s`, `_e`.
