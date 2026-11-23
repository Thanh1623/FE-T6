# Phương án chuyển đổi: NestJS (backend) + React (frontend)

> Tài liệu nghiên cứu, viết ngày 2026-11-09. **Chưa có dòng mã nào được đổi.** Số liệu "hiện trạng" đo trực tiếp từ kho mã; số "ước lượng công sức" là ước lượng thô (ghi rõ), cần kiểm chứng bằng bản thử nghiệm ở mục 10.

## 1. Tóm tắt (đọc mục này trước)

1. **Làm được**, và kho mã hiện tại thuận lợi hơn thường thấy: toàn bộ truy cập dữ liệu đã đi qua lớp server dùng khoá dịch vụ Supabase (`src/lib`, 105 file, ~658 KB), trình duyệt không gọi thẳng database. Phần nghiệp vụ (quy tắc phân loại SPU, Win, nhập file, báo cáo QLHH…) phần lớn là TypeScript thuần, dùng lại được.
2. **Cần rewrite thật sự:** 32 trang (đa số là Server Component tự tải dữ liệu), **93 server action** (26 file), 8 route handler, lớp đăng nhập theo cookie, **52 chỗ dùng `unstable_cache`** và 86 lời gọi `revalidatePath/Tag`, lịch chạy nền.
3. **Điều quan trọng cần nói thẳng:** toàn bộ các lần chậm / lỗi mình đo trong những ngày qua (QLHH 10–15 giây, lỗi 504, "statement timeout", đăng nhập quá thời gian) có nguyên nhân gốc là **database Supabase bị giới hạn CPU** (CPU đỉnh 90%, RAM 81%) và giới hạn thời gian hàm của Vercel gói Hobby. **Chuyển sang NestJS + React tự nó KHÔNG làm database nhanh hơn.** Lợi ích thật của việc chuyển là: máy chủ chạy liên tục (hết giới hạn 60 giây, chạy được tác vụ dài), bộ đệm dùng chung (Redis), hàng đợi tác vụ nền, tách backend để tái sử dụng / kiểm thử, và đúng hướng công nghệ nếu đội của bạn quen NestJS + React hơn Next.js.
4. **Khuyến nghị:** làm theo kiểu **"bóp dần" (strangler)**, KHÔNG viết lại một lần. Bước đầu chỉ dựng NestJS làm API cho từng module, cho Next hiện tại gọi (hoặc chạy song song sau một reverse proxy), rồi mới thay giao diện sang React khi API ổn định. Ước lượng thô toàn bộ: **4–7 tháng-người** (xem mục 7); chạy thử nghiệm (PoC) 2 tuần để biết con số thật.

## 2. Hiện trạng (đo từ kho mã, 2026-11-09)

| Hạng mục | Số liệu |
|---|---|
| Khung | Next.js 16.3.8 (App Router) + React 19.2 + Tailwind v4 + Recharts + `xlsx` |
| Tổng mã TypeScript | ~29.500 dòng (~2 MB; nhiều dòng rất dài), 85 migration SQL chạy tay |
| Trang (`page.tsx`) | **32** (+ 3 layout) |
| Server action | **93** hàm trong **26** file `*actions*.ts` |
| Route handler | 8: `api/cron/{sync,videos,spu-summary}`, `api/rnd/{source,workspace}`, `api/setup`, `api/tiktok/{connect,callback}` |
| Lớp nghiệp vụ `src/lib` | 105 file, 658 KB — **23 file phụ thuộc `next/*`** (chủ yếu `next/cache` cho bộ đệm) |
| Thành phần giao diện | 130 file `.tsx` (`src/components` 82 file + thành phần nằm cạnh trang); **94 file khai báo `"use client"`** |
| Bộ đệm | `unstable_cache` ở 19 file (52 lần dùng) + `revalidateTag/Path` 86 lần; nhãn `TAG.spuData`, `TAG.sync`… |
| Đăng nhập | Supabase Auth + cookie qua `@supabase/ssr`, `src/proxy.ts` làm mới phiên; vai trò (admin / rnd / media / sale…) lưu ở `core.profiles` |
| Dữ liệu | Supabase Postgres (schema core / social / sales / rnd), truy cập qua khoá dịch vụ phía server; hàm SQL nặng (`spu_query`, `spu_dash`, `tr_*`…) |
| Lịch chạy nền | Chỉ 1 cron của Vercel (`/api/cron/sync` 23:00 UTC); các việc khác chạy nền sau thao tác (`after()`) hoặc gọi tay |
| Ngoài | Meta Graph API, TikTok, Cloudinary (ảnh/video), nhập file Excel (trình duyệt đọc rồi chia phần gửi lên) |
| Vùng chạy | Vercel Hobby, vùng `sin1` (giới hạn thời gian hàm thấp, đã gặp 504) |

Khối lượng theo module (KB mã): `rnd` 319 · `qlhn` 107 · `spu` 89 · `team` 67 · `kpi` 39 · `rnd-library` 28 · `sample-push` 27 · `posts` 12 · `users` 8 · `tasks` 3 · `api` 14.

## 3. Kiến trúc đích

```
repo (pnpm workspaces)
├─ apps/
│  ├─ api/            NestJS (Fastify adapter) — REST + OpenAPI
│  │   └─ src/modules/{auth,users,teams,spu,qlhn,rnd,posts,kpi,sample-push,tasks,sync,imports,media}
│  └─ web/            React 19 + Vite + React Router + TanStack Query + Tailwind v4 + Recharts
├─ packages/
│  ├─ shared/         kiểu dữ liệu, quy tắc thuần (spu-tracking, spu-code, roles…) dùng chung api + web
│  └─ api-client/     client TypeScript sinh tự động từ OpenAPI (orval / openapi-typescript)
└─ supabase/migrations/   giữ nguyên
```

| Lớp | Lựa chọn đề xuất | Lý do ngắn |
|---|---|---|
| Backend | NestJS 11, Fastify adapter, `@nestjs/swagger`, `class-validator` hoặc `zod` | quen thuộc, mô-đun hoá tốt, sinh OpenAPI |
| Truy cập DB | Giữ `supabase-js` (khoá dịch vụ) + `pg` cho vài truy vấn nặng; **không** thêm ORM | tránh viết lại 85 migration và hàm SQL; ORM không giúp gì ở đây |
| Đăng nhập | Supabase Auth giữ nguyên (không phải chuyển người dùng); API xác minh JWT qua JWKS; hồ sơ + vai trò nạp từ `core.profiles` | không đổi mật khẩu / tài khoản |
| Bộ đệm | `cache-manager` + Redis (Upstash hoặc Redis tự chạy), khoá có tiền tố + tập "nhãn" để xoá theo nhãn; thêm chế độ "dùng số cũ, tải lại ở nền" | thay `unstable_cache` / `revalidateTag` |
| Tác vụ nền | `@nestjs/schedule` cho lịch + BullMQ (Redis) cho việc dài (đồng bộ Meta/TikTok, làm mới bảng tổng hợp, nhập file) | hết giới hạn 60 giây, thử lại, quan sát được |
| Frontend | React 19 + Vite + React Router + TanStack Query + react-hook-form | SPA nội bộ, không cần SEO / SSR |
| Triển khai | API: container chạy liên tục (Railway / Fly.io / Render / VPS Singapore); Web: tĩnh trên Vercel / Cloudflare Pages; cùng tên miền qua reverse proxy hoặc CORS | tách ra để mở rộng riêng |
| Quan sát | pino log + Sentry; số đo thời gian từng truy vấn | hiện chỉ có log Vercel / Supabase rời rạc |

## 4. Bản đồ chuyển từng phần

| Hiện tại (Next) | Đích | Ghi chú |
|---|---|---|
| `page.tsx` Server Component tự gọi `lib` rồi dựng HTML | Route React + hook `useQuery` gọi `GET /api/...`; phần tính toán nằm ở Nest | **việc lớn nhất**: 32 trang |
| Bộ lọc nằm trên URL (`searchParams`) | `useSearchParams` của React Router; API nhận cùng tham số | giữ nguyên địa chỉ hiện tại → liên kết cũ, drill-down Dashboard vẫn chạy |
| Server action (93) | Endpoint `POST/PATCH/DELETE` + `useMutation` | mỗi action → một hàm service + một route; kiểm tra quyền chuyển thành Guard |
| `requireUser` / `requireActionUser` (session cookie) | `AuthGuard` + `RolesGuard` + decorator `@CurrentUser()` | cùng ma trận vai trò (`lib/roles.ts`) |
| `unstable_cache` + `revalidateTag` | `CacheService.wrap(key, tags, ttl, fn)` + `invalidate(tag)` (+ SWR) | cùng nhãn, cùng thời gian sống để so sánh hành vi |
| `after()` (làm nền sau thao tác) | đẩy việc vào hàng đợi BullMQ | giải quyết luôn lỗi 504 / quá thời gian |
| Route handler cron / tiktok / rnd | Controller + `@Cron` / hàng đợi | `api/setup` cân nhắc bỏ |
| `proxy.ts` (làm mới phiên) | Supabase JS trong trình duyệt tự làm mới token; API chỉ xác minh | |
| Nhập Excel (trình duyệt đọc, chia phần, gửi) | giữ nguyên cách làm ở trình duyệt; endpoint nhận từng phần; có thể chuyển sang tải thẳng file + xử lý nền | bỏ giới hạn 4 MB của Vercel |
| Cloudinary upload | service `media` trong Nest (ký upload) | |
| Tailwind + 82 component client | **dùng lại gần nguyên vẹn** (đã là React thuần) | phần cần sửa: import `next/link`, `next/navigation` |

## 5. Dùng lại được gì / viết lại gì

**Dùng lại (ước ~35–40% khối lượng):** quy tắc thuần trong `src/lib` (spu-tracking, spu-code, spu-win, rules, parser nhập Excel…), toàn bộ SQL + migration, Tailwind, hầu hết component client (lưới dữ liệu R&D, biểu đồ, form), kiểu dữ liệu.

**Viết lại:** 32 trang → route React + lớp gọi API; 93 action → endpoint; lớp đăng nhập / phân quyền; lớp bộ đệm; lịch nền; 23 file `lib` đang gọi `next/cache|headers|navigation`; kiểm thử tự động (hiện chỉ có `scripts/test-rules.mts` và các điểm đối chiếu `?check=1/2/3`).

## 6. Lộ trình đề xuất (bóp dần)

| Pha | Việc | Cổng chấp nhận |
|---|---|---|
| 0 | Chuẩn bị: monorepo, gói `shared`, CI, khung NestJS, khung Vite; chốt lựa chọn ở mục 3 | build + lint xanh |
| 1 | **Nest làm API cho một module nhỏ, ít rủi ro** (ví dụ `posts`, `tasks`, `users`): đăng nhập JWT, phân quyền, OpenAPI, bộ đệm Redis. Next vẫn là giao diện, gọi Nest qua server | số liệu API khớp 100% với trang cũ (script so sánh JSON) |
| 2 | Module trung bình: `spu` (list, drill-down), `kpi`, `team` | đối chiếu `check=2`; đo tốc độ không tệ hơn |
| 3 | Module phức tạp: `qlhn` (báo cáo team, bảng `tr_lines`), `rnd` (lưới + quy trình, ~319 KB) | đối chiếu báo cáo QLHH với số Sapo (đã từng đối chiếu thủ công) |
| 4 | **Tác vụ nền sang Nest**: đồng bộ Meta/TikTok, làm mới bảng tổng hợp, nhập file nặng | chạy song song 1–2 tuần với cron cũ, so kết quả |
| 5 | **Thay giao diện** từng trang sang React SPA (có thể đi trước pha 3–4 với module đã có API) | dùng cờ chuyển đổi theo trang; reverse proxy định tuyến theo đường dẫn |
| 6 | Cắt hẳn: tắt Next, dọn Vercel cron, bỏ bộ đệm `unstable_cache` | giám sát 2 tuần, giữ đường quay lại |

Nguyên tắc: mỗi pha **chạy song song và đối chiếu số** trước khi chuyển; không bao giờ đổi quy tắc nghiệp vụ trong lúc chuyển khung (tránh lẫn nguyên nhân lệch số).

## 7. Ước lượng công sức (THÔ — một người thạo cả hai khung; tính tháng-người)

| Pha | Ước lượng |
|---|---|
| 0 Chuẩn bị + khung | 0,5 |
| 1 API module nhỏ + đăng nhập + bộ đệm | 0,5–1 |
| 2 `spu`, `kpi`, `team` | 1–1,5 |
| 3 `qlhn`, `rnd` | 1,5–2,5 |
| 4 Tác vụ nền | 0,5–1 |
| 5 Giao diện React (32 trang) | 1–2 (một phần trùng với pha 2–3) |
| 6 Cắt, dọn, giám sát | 0,5 |
| **Tổng** | **~4–7**, chưa tính thời gian chờ đối chiếu / kiểm thử với người dùng thật |

Cách ước lượng: theo khối lượng mã từng module và tỷ lệ dùng lại; sai số lớn. PoC ở mục 10 sẽ cho số đo thực.

## 8. Rủi ro chính

| Rủi ro | Mức | Cách giảm |
|---|---|---|
| **Kỳ vọng sai về tốc độ**: database vẫn là nút thắt (CPU 90%) | Cao | nâng gói Supabase song song; đặt mục tiêu chuyển đổi là kiến trúc / tác vụ dài, không phải "nhanh hơn" |
| Lệch số nghiệp vụ khi viết lại (QLHH, phân loại SPU, Win, đối chiếu Sapo) | Cao | giữ SQL; script so sánh JSON cũ ↔ mới từng endpoint; không đổi quy tắc trong lúc chuyển |
| Mất tính năng "tải dữ liệu theo từng khối" của Server Component (SPA dễ bị chuỗi gọi nối đuôi) | Trung bình | gộp endpoint theo trang (BFF), TanStack Query + prefetch |
| Hai hệ thống chạy song song lâu → gấp đôi bảo trì | Trung bình | chia pha ngắn, chuyển xong thì tắt phần cũ |
| Chi phí hạ tầng mới (API chạy liên tục + Redis) | Trung bình | bắt đầu gói nhỏ; so với phí nâng Supabase |
| Phân quyền: 93 action đang kiểm tra quyền riêng từng chỗ | Trung bình | gom thành Guard + test ma trận vai trò |
| Bảo mật: khoá dịch vụ chỉ ở API | Thấp (tốt hơn) | giữ nguyên nguyên tắc hiện tại |
| Đội chưa thạo NestJS (DI, module, pipe) | Tuỳ đội | PoC + tài liệu mẫu cho một module |

## 9. Ưu, nhược điểm và các phương án thay thế

**Phương án C — NestJS + React SPA (bạn yêu cầu)**
- *Ưu:* backend tách biệt, tác vụ dài / hàng đợi / bộ đệm dùng chung, kiểm thử và mở rộng riêng, có OpenAPI cho ứng dụng khác (mobile…), không bị giới hạn Vercel.
- *Nhược:* công sức lớn (4–7 tháng-người), nguy cơ lệch số, chi phí hạ tầng mới, mất SSR/streaming (không cần cho app nội bộ), **không tự giải quyết nút thắt database**.

**Các phương án khác đã cân nhắc**

| Phương án | Ưu | Nhược | Nhận xét |
|---|---|---|---|
| **A. Giữ Next.js, tiếp tục tối ưu** (đang làm: bảng tổng hợp, hàng đợi truy vấn, bộ đệm) | rẻ, nhanh, rủi ro thấp; đã cho kết quả (làm mới bảng tổng hợp 19 giây thay 47–130 giây) | vẫn dính giới hạn thời gian hàm Vercel, bộ đệm theo từng instance | nên tiếp tục song song với mọi phương án |
| **B. Next giữ làm giao diện + Nest chỉ làm API/tác vụ nền** (kiểu BFF) | chia nhỏ rủi ro; Nest nhận phần nặng (sync, bảng tổng hợp, báo cáo); giao diện đổi sau hoặc không đổi | hai khung song song lâu dài | **khuyến nghị làm trước** — lấy 70% lợi ích của C với ~40% công sức |
| **C. Nest + React SPA** | như trên | như trên | đích dài hạn nếu có đội & thời gian |
| **D. Next.js tự chạy trong container (Docker/VPS) thay Vercel** | không đổi mã; hết giới hạn 60 giây; cron / tác vụ nền thật | mất tiện ích Vercel (preview, scale tự động); phải tự vận hành | rẻ nhất để gỡ lỗi quá thời gian |
| **E. Chuyển phần nặng vào Postgres / Supabase Edge Functions** | gần dữ liệu, ít chuyển dữ liệu | khó kiểm thử, khoá vào Supabase | đã làm một phần (hàm SQL, bảng tổng hợp) |
| **F. Nâng gói Supabase** | giải quyết gốc nút thắt CPU, ngay lập tức | tốn phí hằng tháng | **nên làm bất kể chọn phương án nào** |

## 10. Bước tiếp theo đề xuất: bản thử nghiệm (PoC) 1–2 tuần

1. Dựng `apps/api` (NestJS + Fastify + Swagger) với `AuthGuard` xác minh JWT Supabase, `RolesGuard` dùng `lib/roles.ts`.
2. Chuyển **một** luồng đại diện từ đầu đến cuối: ví dụ trang **Theo dõi SPU** (`spu_query`, bộ lọc, drill-down từ Dashboard) → endpoint `GET /api/spu` + trang React tương ứng, dùng lại component bảng hiện có.
3. Thêm `CacheService` (Redis) và một hàng đợi BullMQ cho "làm mới bảng tổng hợp".
4. Đo: thời gian phản hồi, số dòng mã phải viết lại, độ khớp số liệu với trang hiện tại, chi phí hạ tầng.
5. Dựa trên số đo thật, chốt phương án (B hay C) và cập nhật mục 7.

## 11. Câu hỏi cần bạn trả lời để chốt thiết kế

1. Lý do chính cần chuyển là gì: (a) tốc độ / lỗi quá thời gian, (b) kiến trúc & tái sử dụng API, (c) đội quen NestJS + React hơn, (d) tách để thuê / mở rộng đội?
2. Ai thực hiện (một người hay cả đội) và thời hạn mong muốn?
3. Chấp nhận chi phí hạ tầng mới (máy chủ API + Redis) không? Mức tối đa mỗi tháng?
4. Có cần ứng dụng khác (mobile, đối tác) dùng chung API không? (nếu có → C/B có giá trị hơn)
5. Có cho phép chạy hai hệ thống song song 1–3 tháng không?

## 12. QUYẾT ĐỊNH (2026-11-09): chọn phương án C — đổi kiến trúc, thiết kế để BÀN GIAO cho đội kỹ thuật quản lý

Lý do chốt: mục tiêu là **kiến trúc dài hạn + dễ bàn giao**, không chỉ tốc độ. Vì vậy chọn **React + Vite + NestJS**, chuyển theo cách copy sang thư mục mới và bóp dần (mục 6), bản Next hiện tại tiếp tục chạy production cho tới khi cắt.

### 12.1 Gói bàn giao (phải có khi nghiệm thu mỗi pha)

| # | Hạng mục | Nội dung tối thiểu |
|---|---|---|
| 1 | **README gốc + sơ đồ kiến trúc** | cách chạy cục bộ trong ≤ 15 phút (`pnpm i && pnpm dev`), sơ đồ thành phần, luồng dữ liệu, luồng đăng nhập |
| 2 | **Tài liệu quyết định kiến trúc (ADR)** | mỗi quyết định lớn một file ngắn: chọn gì, vì sao, đã loại gì (đăng nhập, bộ đệm, hàng đợi, nơi triển khai) |
| 3 | **OpenAPI + client sinh tự động** | mọi endpoint có mô tả, kiểu dữ liệu và mã lỗi; frontend dùng client sinh ra, không tự viết tay |
| 4 | **Kiểm thử tự động** | đơn vị cho quy tắc nghiệp vụ (phân loại SPU, Win, QLHH…), kiểm thử endpoint, **bộ đối chiếu số cũ ↔ mới** (tái dùng `?check=1/2/3`), kiểm thử ma trận vai trò |
| 5 | **CI/CD** | GitHub Actions: lint, kiểm kiểu, test, build, deploy tự động môi trường thử + duyệt tay lên production |
| 6 | **Đóng gói và môi trường** | Dockerfile cho API, `docker compose` chạy cục bộ (API + Redis), 3 môi trường (local / staging / production), `.env.example` đầy đủ, quản lý bí mật ở nơi chuyên dụng |
| 7 | **Tài liệu vận hành (runbook)** | triển khai, quay lại bản cũ, xử lý sự cố thường gặp (database bận, hàng đợi kẹt, token Meta hết hạn), cách chạy lại đồng bộ, lịch sao lưu |
| 8 | **Quan sát** | log có cấu trúc (pino), Sentry, bảng theo dõi thời gian truy vấn, cảnh báo (database CPU, hàng đợi, lỗi đồng bộ) |
| 9 | **Quy ước mã** | cấu trúc module, đặt tên, cách thêm một endpoint / một trang (kèm mẫu), commit, review, phiên bản hoá API |
| 10 | **Tài liệu dữ liệu và nghiệp vụ** | sơ đồ bảng, giải thích hàm SQL, quy tắc nghiệp vụ (đã có `docs/KIEN-TRUC-TONG-HOP-SPU.md`, `docs/QLHN.md`, `docs/DATABASE_SCHEMA.md` → cập nhật theo kiến trúc mới) |
| 11 | **Phân quyền và bảo mật** | ma trận vai trò ↔ endpoint (kiểm thử được), danh sách bí mật + cách xoay vòng, nhật ký thao tác |
| 12 | **Lộ trình kỹ thuật còn nợ** | danh sách nợ kỹ thuật có chủ ý (ví dụ chỉ mục thừa, đường tính cũ chưa bỏ) để đội mới biết |

### 12.2 Nguyên tắc để đội khác tiếp quản dễ

1. **Mỗi module Nest độc lập** (controller, service, DTO, test, README ngắn) — người mới đọc một module là hiểu.
2. **Không logic trong controller;** service gọi repository (lớp truy cập Supabase) để thay được nguồn dữ liệu.
3. **Một nguồn sự thật cho kiểu dữ liệu:** DTO + OpenAPI → client TypeScript; `packages/shared` chứa quy tắc thuần dùng chung hai phía.
4. **Cấu hình qua biến môi trường, kiểm tra lúc khởi động** (khai báo thiếu biến là dừng ngay, không chạy nửa vời).
5. **Không phụ thuộc nhà cung cấp:** Docker chạy được trên bất kỳ nơi nào (Railway, Fly, Render, VPS, Kubernetes); bộ đệm / hàng đợi qua giao diện trừu tượng.
6. **Đối chiếu số là một phần của quy trình,** không phải việc làm tay một lần.

### 12.3 Việc đầu tiên (Pha 0, ~1 tuần)
1. Tạo thư mục mới `fb-traffic-nest` (monorepo pnpm), copy mã nguồn hiện tại sang (bỏ `node_modules`, `.next`, `.env.local`).
2. Dựng khung: `apps/api` (NestJS + Fastify + Swagger + pino + kiểm tra biến môi trường), `apps/web` (Vite + React + React Router + TanStack Query + Tailwind), `packages/shared`.
3. Thiết lập CI, Docker, `README` và ADR đầu tiên.
4. Chuyển module đầu tiên làm mẫu (đề xuất: **Theo dõi SPU**, vì đã có đủ đường đối chiếu `check=1/2/3`) — làm "mẫu vàng" để đội sau bắt chước.

