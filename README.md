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

## Thương hiệu

- Logo: `public/assets/logo.webp` (ngang, trên thanh đầu trang) và `logo-vertical.png` (dọc, trang đăng nhập); `favicon.png` cắt từ biểu tượng logo.
- Màu: xanh `#005ADF` và xanh ngọc `#00DAC5` lấy từ logo, khai báo ở đầu `public/styles.css`. Nếu PILA có bộ nhận diện chính thức khác, sửa tại các biến `--brand`, `--accent`.

## Triển khai

Đã tạo sẵn trên Cloudflare: D1 `pila-docs` (đã áp dụng migration), KV `pila-docs-sessions`, R2 bucket `pila-docs-files`; cấu hình nằm trong `wrangler.jsonc`.

### Cách 1: GitHub Actions (đã cấu hình sẵn)

`.github/workflows/deploy.yml` chạy typecheck, test rồi deploy khi push lên `main`, hoặc chạy tay ở tab Actions (chọn nhánh bất kỳ). Cần khai báo trong GitHub → Settings → Secrets and variables → Actions:

| Secret | Lấy ở đâu |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → Account API tokens → Create Token → mẫu **Edit Cloudflare Workers** |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages (cột bên phải) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client (xem dưới); có thể thêm sau, workflow tự đẩy lên Worker |

### Cách 2: Workers Builds (không cần token trong GitHub)

Cloudflare → Workers & Pages → Create → Import a repository → chọn repo này; deploy command `npm run deploy`. Secret Google đặt ở Worker → Settings → Variables and Secrets.

### Google OAuth

Chưa có domain riêng thì dùng địa chỉ `https://pila-docs.<subdomain>.workers.dev`. Google Cloud Console → Credentials → **OAuth client (Web)** (nên để màn hình đồng ý ở chế độ *Internal* nếu PILA dùng Google Workspace), redirect URI: `https://pila-docs.<subdomain>.workers.dev/auth/callback`.

Sửa `ADMIN_EMAILS` trong `wrangler.jsonc` thành email admin thật trước khi deploy.

Khi thêm migration mới: `npm run db:migrate:remote`.

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
