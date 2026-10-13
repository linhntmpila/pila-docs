# PILA Văn bản

Hệ thống quản lý và tra cứu văn bản nội bộ PILA, chạy hoàn toàn trên Cloudflare:

| Thành phần | Công nghệ |
|---|---|
| Backend + API + phục vụ web | 1 Cloudflare Worker (Hono, TypeScript) với Static Assets |
| Metadata văn bản, tìm kiếm | D1 |
| Phiên đăng nhập | KV |
| Tệp văn bản | R2 (KV/D1 không phù hợp để lưu tệp lớn) |
| Đăng nhập | Google OAuth, chỉ chấp nhận `@pila.vn` |

## Tính năng

- **Nhân sự** (mọi tài khoản @pila.vn): trang chủ với văn bản nổi bật và mới cập nhật; tra cứu có tìm kiếm (không phân biệt dấu: "cong van" khớp "Công văn"), lọc theo loại, năm, khoảng ngày, nổi bật; sắp xếp; xem chi tiết, xem trước PDF, tải về.
- **Admin** (email trong `ADMIN_EMAILS`): trang `/admin.html` để đăng, sửa, thay tệp, xoá văn bản và đánh dấu nổi bật. Mọi API ghi đều kiểm tra quyền admin ở server.
- **Tự phân loại** theo tên văn bản: `CV` → Công văn, `HĐ` → Hợp đồng, `QĐ` → Quyết định, `TTr` → Tờ trình (và `TB`, `BB`, `QC`, `KH`, `BC`). Từ khoá xuất hiện sớm nhất trong tên được ưu tiên; không nhận diện được thì là "Khác". Admin có thể chọn tay. Danh sách loại nằm ở `src/classify.ts`.

## Cần thay trước khi dùng thật

- **Logo**: `public/assets/logo.svg` đang là logo tạm. Thay bằng logo PILA chính thức (giữ tên tệp).
- **Màu thương hiệu**: các biến `--brand`, `--accent`… ở đầu `public/styles.css` là màu tạm. Sửa tại đó là đổi toàn bộ giao diện.

## Triển khai

```bash
npm install
npx wrangler d1 create pila-docs            # chép database_id vào wrangler.jsonc
npx wrangler kv namespace create SESSIONS   # chép id vào wrangler.jsonc
npx wrangler r2 bucket create pila-docs-files
npm run db:migrate:remote
```

1. Google Cloud Console → Credentials → tạo **OAuth client (Web)**, thêm redirect URI `https://<domain>/auth/callback`.
2. `npx wrangler secret put GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_SECRET`.
3. Sửa `ADMIN_EMAILS` (danh sách email admin, cách nhau bằng dấu phẩy) và `ALLOWED_DOMAIN` trong `wrangler.jsonc`.
4. `npm run deploy`, rồi gắn custom domain trong dashboard Cloudflare nếu cần.

## Chạy local

```bash
cp .dev.vars.example .dev.vars   # DEV_LOGIN=true cho phép đăng nhập không cần Google
npm run db:migrate:local
npm run dev                      # http://localhost:8787/auth/dev?email=admin@pila.vn
npm test                         # kiểm thử phân loại văn bản
```

`DEV_LOGIN` chỉ dành cho máy local, tuyệt đối không đặt trên production.

## Bảo mật

- Server kiểm tra `email_verified`, claim `hd` và đuôi email khớp domain, không chỉ dựa vào gợi ý `hd` của Google.
- Cookie phiên HttpOnly, SameSite=Lax; mọi API ghi từ origin khác bị từ chối.
- Quyền admin được tính lại ở mỗi request, gỡ khỏi `ADMIN_EMAILS` là có hiệu lực ngay.
- Tệp chỉ tải qua API có xác thực (`Content-Disposition: attachment`, `nosniff`); chỉ cho phép PDF, Office, TXT, PNG, JPG, tối đa 50MB.

## Claude Code cloud sessions

A `SessionStart` hook (`.claude/hooks/session-start.sh`, registered in `.claude/settings.json`) installs these plugins at the start of every cloud session:

- [superpowers](https://github.com/obra/superpowers)
- [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)

The hook only runs when `CLAUDE_CODE_REMOTE=true`, runs synchronously, and is safe to run repeatedly.
