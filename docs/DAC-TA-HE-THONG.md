# Đặc tả hệ thống — fb-traffic

> Tài liệu bàn giao cho dev/vận hành tiếp quản. Lập 23/10/2026 từ code + migration (không dựa tài liệu cũ). Schema DB chi tiết: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md). Đặc tả dữ liệu Sapo/tồn kho cho trang SPU: [HANDOFF-dac-ta-du-lieu-sapo.md](HANDOFF-dac-ta-du-lieu-sapo.md).
> Nhãn: `UNKNOWN` = không xác định được từ code · `NOT VERIFIED` = chưa kiểm trên hệ thống thật.

## 1. Mục đích

Công cụ nội bộ cho shop trang sức (mã mẫu dạng `D0008`, `N0123`):
1. **Đo traffic mạng xã hội** (Facebook Page, Instagram, TikTok, YouTube) và **ghép với số bán** (từ hệ thống đơn hàng/Sapo) qua *mã SPU gắn bằng hashtag* trong bài đăng.
2. **Quản lý quy trình R&D mẫu mới P0 → P6**: sưu tầm → duyệt → vẽ 3D → đặt mẫu → quay video → test (chấm KPI tự động) → Win/Fail → bàn giao team → thương mại hoá.
3. **Theo dõi SPU** (tồn kho, tuổi tồn, bán chậm/ngôi sao) và KPI/ngưỡng do quản lý cấu hình.

## 2. Kiến trúc & công nghệ

| Thành phần | Chi tiết |
|---|---|
| Framework | **Next.js 16.3.8** (App Router) + React 19.2, TypeScript, Tailwind 4. ⚠ `AGENTS.md`: phiên bản này có breaking change — đọc `node_modules/next/dist/docs/` trước khi sửa code Next |
| CSDL / Auth / Storage | Supabase (Postgres 17, Auth, Storage). Truy cập DB chỉ bằng `service_role` từ server (`src/lib/supabase/admin.ts`: `sb.core()/social()/sales()/rnd()`). Đăng nhập qua `@supabase/ssr` |
| Hosting | Vercel (`vercel.json`: region `sin1`, không `crons`) + Nest worker (GitHub `WORKER_URL`) |
| Lịch đồng bộ chính | GitHub Actions `.github/workflows/sync.yml` — `7 11,23 * * *` (06:07 và 18:07 VN) gọi Nest `WORKER_URL/api/cron/sync` với `Bearer CRON_SECRET`; có nút chạy tay `full`. Next cache: `POST /api/internal/revalidate` |
| Thư viện | recharts (biểu đồ), xlsx (import tồn kho), cloudinary (ảnh), Cloudflare Turnstile (chống bot đăng ký/đăng nhập) |
| Proxy | `src/proxy.ts`: làm mới phiên + chuyển `/login` nếu chưa đăng nhập (trừ `/login`, `/register`, `/privacy`, `/terms`, `/api/cron`, `/api/setup`) |
| Cache | `unstable_cache` + tag (`src/lib/cache-tags.ts`, `bust()`); hồ sơ user cache 60s |

Mô hình: **server components + server actions** (`actions.ts` cạnh mỗi trang), không có REST API công khai ngoài mục 6. Phân quyền kiểm ở từng trang/action (`requireUser` / `requireActionUser`, `src/lib/session.ts`).

```
Meta Graph / TikTok API ──► lib/sync ──► DB app (social.*)
Qlydonhang (đơn hàng/Sapo) ─► RPC fb_product_* ─► sales.daily_sales / sales.catalog
(hoặc SALES_API_URL REST)
social.posts.product_codes ⨝ sales.daily_sales ──► lib/eval (chấm KPI) ──► rnd.evaluations
UI (Next) ◄── đọc DB bằng service_role, lọc theo vai trò/team
```

## 3. Vai trò & phân quyền

Vai trò (`src/lib/roles.ts`, DB CHECK): `admin` (Quản lý), `rnd` (R&D; kèm team, vd "R&D · Hồng Ngọc"), `design3d` (Thiết kế 3D), `media`. Mỗi user có `team_id`, `is_team_lead`. Tài khoản đăng ký mới cần quản lý duyệt (`approved_at`); `is_active=false` = khoá.

| Khu vực (route) | Vai trò truy cập (theo `requireUser`) |
|---|---|
| `/` tổng quan, `/posts`, `/traffic`, `/account`, `/tasks`, `/sample-push`, `/rnd` (bảng), `/rnd/[id]`, `/rnd/dashboard` | mọi vai trò đã đăng nhập (dữ liệu tiền/giá vốn lọc theo quyền ở server) |
| `/kpi`, `/rnd/stats`, `/rnd/settings`, `/rnd/new`, `/team` | admin, rnd |
| `/spu`, `/rnd-library`, `/rnd/test-codes` | admin, rnd, media |
| `/rnd/kanban` | admin, rnd, design3d |
| `/connections` (kết nối Meta/TikTok), `/users` (quản lý user), `/sample-push/overview` | admin |
| Server action ghi dữ liệu R&D (`rnd/actions.ts`) | admin, rnd (`EDITORS`); duyệt/thao tác cấp quản lý: admin |
| `/api/rnd/source` | admin, rnd, media |
Chi tiết từng action: `grep -rn "requireActionUser" src/app`. Quyền trong các trang `/rnd/design-3d`, `/rnd/media`, `/rnd/orders`, `/rnd/traffic`, `/rnd/win`, `/rnd/commercial`, `/rnd/approved` được kiểm bên trong `WorkspacePage`/lib (`wsKeysFor(role)` trong `rnd-workspace-types.ts`) → quyền từng bảng theo role `NOT VERIFIED` ở mức tài liệu này.

## 4. Phân hệ chức năng

### 4.1 Đồng bộ dữ liệu (`src/lib/sync/*`, `/api/cron/sync`)
- **Kênh:** `setupChannels` đọc token Meta (`FB_USER_TOKEN`, `FB_SYSTEM_TOKEN`) → lưu Page + Page Token vĩnh viễn; tự phát hiện kênh mới khi chạy "nặng". TikTok kết nối qua OAuth (`/api/tiktok/connect` → `/api/tiktok/callback`), token lưu `private.tiktok_tokens`, tự refresh.
- **Mỗi lần gọi cron:** xử lý 1 lô kênh (lâu chưa sync nhất trước, `concurrency=4`, ngân sách 190 s), trả `202` ngay, chạy nền (`after()`), còn kênh chờ thì tự gọi lại tối đa `MAX_CHAIN=6` lô. Tham số: `days` (≤730, mặc định 3), `postDays` (≤365, mặc định 30), `full=1`, `wait=1`.
- **Phần "nặng"** (mỗi ≥180 phút hoặc `full=1`): đồng bộ số bán (`syncSales`), danh mục (`syncCatalog`), gắn lại hashtag (`retagPosts`), chấm đánh giá (`evaluateAll`), làm mới `rnd.product_metrics`, chụp `post_daily`.
- **Nguồn số bán:** RPC Qlydonhang (`fb_product_daily_sales_json`, tải phân trang) hoặc REST `SALES_API_URL` (`/daily-sales`, `/catalog`) nếu đặt. Đơn TikTok (tag `tiktok_business_<tên>`) ghép với kênh TikTok cùng tên hiển thị.
- Nhật ký: `core.sync_runs` (hiển thị ở layout, mục lỗi đồng bộ).

### 4.2 Gắn mã SPU bằng hashtag (`src/lib/tags.ts`)
Hashtag trong bài dạng `^[a-z]{1,4}[0-9]{3,}$` → `product_codes` nếu mã tồn tại trong `sales.catalog` hoặc `rnd.products` (code/sapo_code), ngược lại → `unknown_codes`. Khác: `#a1…#a5` → `content_line`; `#c`/`#m` → `concept` cũ/mới; `#k###` → `staff_code`. Mẫu regex cấu hình ở `core.settings.hashtag_rules`. Mã **test** có tiền tố `T` (vd `T10001`, `isTestCode`) và liên kết sang SPU thương mại qua `rnd.product_code_links` (`/rnd/test-codes`).

### 4.3 Quy trình R&D P0–P6 (`lib/rnd-flow.ts`, `lib/pipeline-constants.ts`)
| Mốc | Ý nghĩa | Chuyển tiếp |
|---|---|---|
| P0 Sưu tầm | nhập thông tin tham khảo (form Collection), cấp `VST####` | gửi duyệt → quản lý duyệt |
| P1 Đã duyệt | | duyệt → tạo việc `design_tasks` (3D) |
| P2 Sản xuất mẫu | Vẽ 3D → đặt hàng (`sample_orders`) → chốt đúc → hoàn thành | 3D Đạt → tạo đơn nháp; đơn "Hoàn thành" → P3 |
| P3 Hoàn thành mẫu | tạo yêu cầu Media "Quay video trên tay" | yêu cầu Media Đạt → P4 |
| P4 Đăng video | video gắn mã SPU lên các kênh | "đã lên video" tự nhận khi có bài gắn mã |
| P5 Win | hệ thống chấm WIN / WIN TRAFFIC; chọn tay quay source chế tác | người duyệt thương mại hoá → P6 |
| P6 Thương mại hoá | theo dõi hiệu quả | FAIL → dừng mẫu (`killed_at`, giữ mốc) |
Mốc chỉ **tiến** (`reachStage`). Mọi thay đổi ghi `rnd.product_events`/`status_log`. Danh mục trạng thái/loại yêu cầu cấu hình ở `/rnd/settings` (`core.settings.rnd_options`).

### 4.4 Chấm KPI tự động (`src/lib/eval/*`, `kpi-constants.ts`)
- Cửa sổ test = `window_days` (mặc định 14) tính từ ngày video đầu tiên gắn mã (giờ VN); mẫu thuộc quy trình chỉ tính bài từ ngày sưu tầm.
- Chỉ số: `views, viewers, reactions, clicks, qty_net, ctr = clicks/views, engagement_rate = (reactions+clicks)/viewers, conversion = qty_net/viewers` (%; null khi mẫu số = 0).
- `qty_net = qty_sold − qty_returned`, **loại kênh `bao_hanh`** mặc định.
- Quyết định (`decideAuto`): đạt KPI bán → **WIN**; chưa đạt bán nhưng đạt traffic → **WIN TRAFFIC**; chưa đạt cả hai: còn trong cửa sổ → **ĐANG TEST**, hết cửa sổ → **FAIL**. (`win_sp` là giá trị cũ, chỉ để đọc.)
- **Hai điều kiện Win Traffic** (từ 02/11/2026; `engine.ts`, `team-win.ts`): **SP test** (mã test T của luồng Media, mẫu R&D ở P0–P5, hoặc có phiên test) dùng KPI Traffic ở Cài đặt (hiện: lượt xem ≥ 50.000 trong cửa sổ test `window_days`, **không xét người xem**); **SP đang bán** (mọi SPU còn lại, kể cả mẫu R&D đã lên P6) cần **lượt xem ≥ 100.000 trong 3 ngày** trên mọi kênh toàn công ty — xét cả 3 ngày đầu kể từ video đầu tiên lẫn 3 ngày gần nhất; ngưỡng lấy từ Quy tắc Win ở Cài đặt (`core.settings.spu_rules` → `win.traffic`, bình luận mặc định 0 = không xét). Điều kiện Win bán hàng của hai nhóm giữ nguyên (KPI bán, `window_days`).
- Phân loại mẫu mới/cũ theo `core.settings.evaluation` (`new_lookback_days`, `new_max_qty`, `new_catalog_days`, mốc tin cậy…), có `age_override` thủ công.
- Mẫu KPI mặc định (seed): Sales (`qty_net ≥ 20`, `conversion ≥ 1`, min 14 ngày/2000 views), Traffic (`views ≥ 5000`, `viewers ≥ 3000`), Concept, Content. Quản lý chỉnh ở `/kpi`.
- Kết quả lưu `rnd.evaluations`; người xác nhận → `rnd.decisions`; Win → bàn giao `rnd.handoffs` (giao team, hạn lên video; 1 bàn giao mở / mẫu / team).

### 4.5 Thương mại hoá (`lib/commercial-math.ts`, `commercial-eval.ts`)
Chỉ cho mẫu đã vào quy trình (có `stage`). Dùng chi phí mẫu (`sample_orders.cost + cost_other`), Ads, chi phí quay (`video_cost`), `ops_cost`, `lead_days`, `min_order_qty`, số bán thực tế từ `launch_date`, giá vốn/giá bán dự kiến khi thiếu số bán. Ngưỡng ở `core.settings.commercial_rules` (`/kpi` → CommercialRulesForm): biên tối thiểu, số ngày hoà vốn tối đa, tỉ lệ hoàn tối đa, ngày an toàn… Gợi ý hệ thống `approve/conditional/reject`; người duyệt ghi `rnd.commercial_reviews`. ⚠ Xem lỗi nghi vấn #1 mục 8.

### 4.6 Theo dõi SPU & tồn kho (`/spu`, `lib/spu-tracking.ts`, `spu-rules.ts`, `inventory-import.ts`)
Import Excel tồn kho → `sales.inventory_stock` (+ lịch sử `inventory_imports`). Phân loại SPU: **Ngôi sao** (KPI riêng, N ngày), **Bán chậm**, **Tồn xấu** theo ngưỡng tuổi tồn & tỉ lệ bán (`core.settings.spu_rules`); tuổi tồn gộp = bình quân gia quyền theo tồn (xem file HANDOFF). Nguồn tồn kho tự động từ API Tech đang tạm dừng → dùng import tay; `lib/inventory-demo.ts` là dữ liệu mẫu.

### 4.7 Các trang khác
- **Tổng quan `/`, `/traffic`, `/posts`:** số liệu kênh/bài theo khoảng ngày, theo team (`team-scope.ts`, `team-tags.ts`).
- **`/team`:** quản lý team, kênh theo team, kết nối Page (`connectTeamPages`).
- **`/sample-push`:** đẩy mẫu cho team (bàn giao) + `/overview` cho quản lý (`handoff-overview.ts`, ma trận `SampleMatrix`).
- **`/rnd-library`:** thư viện video/ảnh sản phẩm (thẻ video dọc, `spu-videos.ts`).
- **`/tasks`:** việc của tôi (3D, Media, đặt hàng) theo vai trò.
- **`/connections`:** token Meta/TikTok, trạng thái kênh. **`/users`:** duyệt/khoá/đổi vai trò/team. **`/account`:** đổi mật khẩu, hồ sơ.
- Bảng dữ liệu kiểu lưới (`components/grid`) có cache phía trình duyệt + đồng bộ nền (`/api/rnd/workspace`), tuỳ chọn cột lưu theo user.

## 5. Tích hợp ngoài

| Hệ thống | Mục đích | Cấu hình |
|---|---|---|
| Meta Graph API (FB/IG) | kênh, bài, insights | `FB_USER_TOKEN`, `FB_SYSTEM_TOKEN`, `FB_APP_ID`, `FB_APP_SECRET` (`lib/meta/*`) |
| TikTok Open API | OAuth, số liệu video/kênh | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI` (`lib/tiktok/*`) |
| Qlydonhang (Supabase khác) | số bán theo ngày, danh mục, tag đơn (chỉ đọc) | `ORDERS_SUPABASE_URL`, `ORDERS_SUPABASE_SECRET_KEY`; SQL ở `supabase/qlydonhang/` |
| Sales REST API (tuỳ chọn) | thay Qlydonhang | `SALES_API_URL`, `SALES_API_KEY` |
| Cloudinary | ảnh sản phẩm | `CLOUDINARY_URL` |
| Cloudflare Turnstile | captcha | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` |
| Supabase | DB/Auth/Storage | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` |
| Cron | bảo vệ endpoint | `CRON_SECRET` (`lib/sync/auth.ts`) |
Mọi secret nằm trong `.env.local` / biến môi trường Vercel, Nest & GitHub Secrets (`WORKER_URL`, `CRON_SECRET`; Nest `APP_URL` = Next) — **không ghi vào repo**.

## 6. Endpoint HTTP (`src/app/api`)
| Route | Method | Auth | Chức năng |
|---|---|---|---|
| `/api/cron/sync` | GET | `Bearer CRON_SECRET` | chạy đồng bộ (mục 4.1); prod: Nest. Next trả 410 nếu `CRON_ON_WORKER=1` |
| `/api/internal/revalidate` | POST | `Bearer CRON_SECRET` | Nest gọi sau sync/summary — `revalidateTag` |
| `/api/setup` | POST | `CRON_SECRET` | nạp Trang từ token Meta |
| `/api/tiktok/connect`, `/callback` | GET | phiên đăng nhập (admin/…) `NOT VERIFIED` | OAuth TikTok |
| `/api/rnd/workspace` | GET | phiên | dữ liệu bảng R&D theo vai trò (`?keys=`) |
| `/api/rnd/source` | GET | admin/rnd/media | ghi nhận "lấy source" rồi chuyển hướng tới `source_url` (chỉ http/https) |
Còn lại là server actions (`src/app/**/actions.ts`, `*-actions.ts`).

## 7. Triển khai & vận hành

1. **Biến môi trường:** xem mục 5 (đủ 17 biến, mẫu ở `.env.local`).
2. **DB:** chạy tay `supabase/migrations/011 → 039` theo thứ tự trong Supabase SQL Editor; sau đó `notify pgrst, 'reload schema'` (đã có cuối mỗi file). Project Qlydonhang chạy `supabase/qlydonhang/001–007`.
3. **Admin đầu tiên:** `npm run create-admin` (`scripts/create-admin.mjs`, đọc `.env.local`).
4. **Kiểm tra token Meta:** `npm run fb:check`. **Test luật:** `npm test` (`scripts/test-rules.mts`). Dữ liệu mẫu: `scripts/seed-*.mjs`.
5. **Deploy:** Vercel (Next) + Nest worker. GitHub Secrets: `WORKER_URL` (Nest), `CRON_SECRET`. Nest env: `APP_URL` (Next) cho webhook revalidate. Vercel: `CRON_ON_WORKER=1` sau cutover.
6. **Thêm Page mới:** gọi `/api/setup` hoặc dùng `/connections`, `/team`; kênh TikTok qua nút kết nối.

## 8. Rủi ro, điểm nghi vấn, việc cần xác minh

1. **POSSIBLE BUG:** `lib/commercial-eval.ts` truy vấn cột `revenue/returned_value/cost/returned_cost` của `sales.daily_sales` đã bị migration 028 xoá → phần giá bán thực tế của thương mại hoá có thể lỗi/rỗng (chi tiết ở DATABASE_SCHEMA §9).
2. **Tài chính đang ẩn:** `SHOW_FINANCE=false` (`lib/features.ts`) — dữ liệu tiền không còn đồng bộ vào DB (028); các tài liệu cũ nhắc doanh thu/lợi nhuận không còn đúng.
3. **Cron đồng bộ:** GitHub Actions gọi Nest `WORKER_URL` (`sync.yml` 11:07 + 23:07 UTC). Đã bỏ Vercel cron khỏi `vercel.json`. Next `/api/cron/*` tắt bằng `CRON_ON_WORKER=1`. Thiếu `WORKER_URL`/`CRON_SECRET` thì KHÔNG còn lịch tự động. Rollback: `WORKER_URL` = Next, xóa `CRON_ON_WORKER`.
4. Quyền chi tiết của các trang bảng `/rnd/*` phụ thuộc `wsKeysFor(role)` và lib — chưa liệt kê từng ô; đối chiếu trực tiếp trước khi cấp quyền mới. Mọi action ghi đều phải gọi `requireActionUser` (UI ẩn nút **không** đủ bảo vệ).
5. **Không có policy RLS** — an toàn nhờ chỉ dùng `service_role` ở server; **tuyệt đối không** để lộ `SUPABASE_SECRET_KEY` ra client. `NOT VERIFIED`: chưa kiểm bảo mật tổng thể.
6. Schema DB thật chưa được đối chiếu (project app không truy cập được lúc lập tài liệu); `post_links` còn dùng hay không: `NEEDS VERIFICATION`.
7. Không có test tự động ngoài `scripts/test-rules.mts` (luật KPI/tag).
8. Lịch sử git chỉ có 50 commit; CHANGELOG chưa lập (`CHANGELOG HISTORY NOT FULLY AVAILABLE`). Có nhiều thay đổi chưa commit lúc lập tài liệu (thương mại hoá, test-costs, InfoEdit…).

## 9. Bản đồ mã nguồn

```
src/app/(dash)/        trang + server actions theo khu vực (rnd, spu, kpi, team, users, connections, sample-push, …)
src/app/api/           cron, setup, tiktok, rnd/{source,workspace}
src/components/        grid (bảng), pipeline, rnd, kpi, saobien, users, ui
src/lib/               nghiệp vụ: sync/, eval/, meta/, tiktok/, supabase/, rnd-*.ts, spu-*.ts, commercial-*.ts, tags.ts, session.ts, roles.ts
supabase/migrations/   schema DB app (011→039; legacy/ đã bị thay thế)
supabase/qlydonhang/   SQL chạy trên DB đơn hàng (RPC chỉ đọc)
scripts/               create-admin, fb-check, seed, migrate ảnh, test luật
docs/                  tài liệu này
```
