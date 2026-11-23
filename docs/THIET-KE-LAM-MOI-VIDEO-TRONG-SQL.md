# Thiết kế: làm mới bảng tổng hợp video NGAY TRONG SQL (Pha 5 — chưa triển khai)

> Tài liệu thiết kế, **chưa có code**. Bổ sung cho [KIEN-TRUC-TONG-HOP-SPU.md](KIEN-TRUC-TONG-HOP-SPU.md) (đọc tài liệu đó trước). Viết ngày 2026-11-09.
> Mục tiêu: bỏ việc kéo ~32.000 bài đăng về Node mỗi lần làm mới số liệu SPU; bảng `sales.spu_video_daily` được dựng và cập nhật ngay trong database, chỉ ghi lại phần thay đổi.

## 1. Hiện trạng đã đo (2026-11-09, `pg_stat_statements` + `EXPLAIN ANALYZE` trên DB thật)

| Phát hiện | Số liệu |
|---|---|
| Truy vấn tốn nhiều thời gian nhất toàn DB | đọc video gắn mã bằng phân trang OFFSET: **12.956 lượt, TB 1,1 giây, tổng ~14.261 giây** |
| Ai gọi? | `loadVideoPosts()` ← `loadSpuRows()` ← `refreshSpuSummary()` (chạy nền sau MỖI lần đồng bộ / nhập file) và đường `legacy` |
| Bảng `social.posts` | 52.000 dòng nhưng **74 MB** (~1,4 KB/dòng: nội dung, hashtag…) → quét heap rất tốn |
| Dựng lại toàn bộ `spu_video_daily` bằng 1 câu SQL (400 ngày — sẽ là 360 ngày, 31.246 dòng kết quả) | **5,7 giây** (Seq Scan `posts` 5,4 giây) — chạy được trong giới hạn 8 giây nhưng sát |
| Một đoạn 130 ngày bằng hàm `video_posts_chunk` (088) | ~4 giây / 13.000 bài (index scan, đọc heap từng dòng) |
| `posts` có cột `updated_at` | **có** (không có `synced_at`) → dùng được để biết bài nào đổi |

Kết luận: nút thắt là **đọc từng bài từ heap** (DB bị giới hạn CPU), không phải việc gom. Hướng đúng: đọc ÍT bài hơn mỗi lần (chỉ phần đã đổi) và gom trong DB.

## 2. Thiết kế đề xuất (tốt nhất trong các phương án)

### 2.1 Bảng đích không gắn `run_id` cho phần video

`spu_video_daily` hiện gắn `run_id` (ghi lại TOÀN BỘ mỗi lượt). Đề xuất bảng mới **`sales.video_daily`** (một bản duy nhất, cập nhật tại chỗ):

```
sales.video_daily (
  day date, code text, channel_id text,          -- khoá chính (day, code, channel_id)
  team text not null default '', platform text not null default 'FB',
  videos int not null, views bigint not null default 0,
  src_updated_at timestamptz not null,           -- max(posts.updated_at) của các bài đã gom vào dòng này
  primary key (day, code, channel_id)
)
```
Người đọc (`spu_query`, `spu_dash`…) chuyển từ `spu_video_daily where run_id = hiện hành` sang `video_daily` (view tương thích `spu_video_daily_v` để đổi ít nơi nhất).

### 2.2 Hàm làm mới trong SQL, chỉ phần đã đổi

`sales.refresh_video_daily(p_from date default null)` — MỘT giao dịch:
1. Xác định **ngày cần dựng lại** = hợp của: (a) 7 ngày gần nhất (số lượt xem còn tăng nhanh); (b) mọi `day` của bài có `updated_at > meta.video_refreshed_at` (kể cả bài cũ được `old_posts` làm mới lượt xem); (c) `p_from` nếu truyền vào (dựng lại tay / sau khi đổi team kênh).
2. `delete from video_daily where day = any(ngày cần dựng)`; `insert … select` gom từ `posts` đúng các ngày đó (cùng công thức đã đo: ngày VN, `unnest(product_codes)`, quy mã cũ → mới qua `spu_aliases`, **mã SPU = phần trước dấu `-`**, kênh còn bật, `count(distinct id)`, `sum(views)`).
3. Cập nhật `video_refreshed_at`. Người đọc không bao giờ thấy trạng thái nửa chừng (một giao dịch).
Ước tính: 7–14 ngày ≈ 1.000–1.500 bài → **~0,2–0,5 giây** (so với 5,7 giây dựng lại cả 400 ngày; so với ~14–44 giây hiện nay).

### 2.3 Các cải tiến để "tốt nhất có thể"

| # | Cải tiến | Lý do |
|---|---|---|
| 1 | **Chỉ mục bao phủ** `posts (published_at) include (id, channel_id, views, product_codes, updated_at) where kind in ('video','reel') and product_codes <> '{}'` | quét chỉ mục thay vì heap 1,4 KB/dòng; cần vacuum để index-only scan; nhược: `views` đổi nhiều nên chỉ mục phình — theo dõi kích thước |
| 2 | **Dựng toàn bộ (full rebuild) vẫn có sẵn** (`p_from => '2025-01-01'`) và chạy định kỳ ban đêm | tự sửa mọi sai lệch tích luỹ của cách cập nhật tăng dần |
| 3 | **Đổi team của kênh** → gọi `refresh_video_daily(p_from => <ngày đầu của kênh>)` hoặc đánh dấu ngày của kênh đó | tránh team "đóng băng" sai (hạn chế đã ghi ở mục 9 của tài liệu kiến trúc) |
| 4 | **Cắt tỉa** dòng quá 360 ngày bằng 1 câu `delete` trong cùng hàm | bảng không phình |
| 5 | **Công tắc** `SPU_VIDEO_BUILD=sql\|node` (mặc định `node` lúc đầu) + đối chiếu `?check=3` | chuyển dần, quay lại được ngay |
| 6 | **`refreshSpuSummary()` không gọi `loadVideoPosts()` nữa**: danh sách video theo SPU chỉ dùng cho đường `legacy`; đường nhanh lấy từ `video_daily` | bỏ khoảng 35 lượt đọc / lần làm mới |
| 7 | Phần cần **từng bài** (ngăn video, Video Win, "tăng thêm" theo ảnh chụp) giữ truy vấn theo yêu cầu theo mã (`product_codes @> {mã}`) và `video_first_days` / `spu_traffic_gain` | `video_daily` không có id bài; đây là chủ ý |

## 3. Kế hoạch triển khai (mỗi pha có thể dừng / quay lại)

| Pha | Việc | Kiểm tra qua cửa | Hoàn tác |
|---|---|---|---|
| A | Migration: tạo `video_daily`, hàm `refresh_video_daily`, chỉ mục (2.3 #1). Chạy dựng đầy đủ 1 lần (5–6 giây) | `?check=3`: so từng dòng `(day, code, channel_id, videos, views)` với dữ liệu dựng bằng Node từ `posts` — phải **khớp 100%** | bỏ bảng / hàm, không ảnh hưởng gì |
| B | Gọi `refresh_video_daily()` ở cuối đồng bộ video và trong `refreshSpuSummary` (song song với đường Node, chưa ai đọc) | theo dõi 1–2 ngày: `?check=3` luôn khớp; đo thời gian | tắt gọi hàm |
| C | `spu_query` / `spu_dash` / `spu_traffic_gain` đọc `video_daily` | `?check=2` (35 bộ lọc) khớp; so mắt trang `/spu`, `/rnd/dashboard` | đặt `SPU_VIDEO_BUILD=node` |
| D | `refreshSpuSummary` bỏ `loadVideoPosts`; dọn mã cũ sau vài tuần ổn định | thời gian làm mới ≤ 15 giây | khôi phục nhánh Node |

## 4. Ưu điểm

- Số truy vấn đọc `posts` giảm từ hàng chục nghìn lượt xuống vài lượt mỗi lần làm mới; giảm tải CPU database (đang là nút thắt).
- Làm mới sau đồng bộ chỉ cần ~0,5 giây thay vì ~44 giây (số đo 2026-10-29) → trang gần như luôn thấy số mới.
- Người đọc không phụ thuộc vào bộ đệm Next khổng lồ (7 đoạn bộ đệm video có thể bỏ).
- Có đường tự sửa (dựng toàn bộ ban đêm) và đối chiếu tự động trước khi chuyển.

## 5. Nhược điểm và rủi ro

- **Công thức viết lại bằng SQL**: phải khớp đúng bản TypeScript (mã SPU = phần trước dấu `-`; quy mã cũ → mới; kênh đã tắt; một bài gắn 2 SKU của cùng SPU chỉ tính 1 video). Sai một chỗ là lệch số → đó là lý do cần `?check=3` khớp 100% trước khi chuyển.
- **Cập nhật tăng dần có thể bỏ sót** nếu `posts.updated_at` không đổi khi lượt xem đổi (cần kiểm tra trình đồng bộ có đặt `updated_at`); khắc phục bằng bản dựng đêm (2.3 #2) và bằng cách luôn dựng lại 7 ngày gần nhất.
- Thêm một bảng và một hàm cần bảo trì; thêm việc "nhớ cập nhật SQL" mỗi khi đổi quy tắc đếm video (ghi vào mục 6 của tài liệu kiến trúc).
- Chỉ mục bao phủ trên bảng có `views` đổi liên tục làm tăng chi phí ghi và dung lượng (ước tính vài MB — chấp nhận được, nhưng cần theo dõi).
- Mất chút thời gian triển khai (ước 1–2 ngày làm + vài ngày theo dõi); có rủi ro hồi quy nếu bỏ qua bước đối chiếu.

## 6. Phương án thay thế đã cân nhắc

| Phương án | Ưu | Nhược | Kết luận |
|---|---|---|---|
| **0. Giữ hiện trạng + migration 088 + đoạn bộ đệm nhỏ + xoá bộ đệm "dùng số cũ trước"** (đã làm) | không đổi kiến trúc, rủi ro thấp | vẫn đọc ~32.000 bài mỗi lần làm mới (≈ 4–14 giây DB); phụ thuộc gói Supabase | **làm trước** (đang áp dụng) |
| **1. Dựng lại TOÀN BỘ trong SQL, không tăng dần** | đơn giản (1 câu SQL), không sợ bỏ sót thay đổi | 5,7 giây mỗi lần (sát giới hạn 8 giây); vẫn quét hết heap | **dùng làm bản dựng đêm** (2.3 #2), không làm đường chính |
| **2. Tăng dần trong SQL (đề xuất này)** | nhanh nhất, ít tải nhất | phức tạp hơn; cần đối chiếu | **chọn** nếu sau khi đo phương án 0 vẫn chậm |
| **3. Trigger trên `posts`** giữ `video_daily` theo thời gian thực | số liệu luôn mới | mỗi lần cập nhật lượt xem của mỗi bài kích hoạt ghi thêm (khuếch đại ghi), khó sửa lỗi, dễ làm chậm đồng bộ | không chọn |
| **4. `MATERIALIZED VIEW … REFRESH CONCURRENTLY`** | ít mã nhất | mỗi lần làm mới là dựng lại toàn bộ (như phương án 1) và cần khoá unique | không chọn (không tăng dần được) |
| **5. Nâng gói Supabase (tăng CPU)** | giải quyết gốc, mọi truy vấn đều nhanh hơn | tốn tiền; không bỏ được việc đọc thừa | song song, bạn đã dự định làm sau |

## 7. Quyết định và kết quả kiểm tra (2026-11-09)

1. **Số liệu trễ vài phút**: chấp nhận (chủ hệ thống xác nhận).
2. **`posts.updated_at`**: đã kiểm tra trên DB thật — bảng có trigger `touch_updated_at` (BEFORE UPDATE, `core.touch_updated_at()`), nên **mọi UPDATE/upsert đều tự đặt `updated_at`**; không cần thêm cột. Lưu ý quan trọng: lệnh `update({ stats_at })` của đồng bộ cũng làm `updated_at` đổi **dù lượt xem không đổi** → `updated_at` là dấu hiệu "có thể đổi" (quá mức, an toàn), không phải "chắc chắn đổi".
   Đo phân bố bài video gắn mã đã cập nhật trong 24 giờ qua: 83/83 bài ≤ 3 ngày, 227/231 (3–7 ngày), 1.282/1.997 (8–30 ngày), 331/5.344 (31–90 ngày), 665/10.314 (91–180 ngày), 1.264/14.045 (> 180 ngày) → **~3.850 bài (12%) mỗi ngày trải trên gần như MỌI ngày đăng**. Hệ quả: cách "dựng lại các ngày có bài đổi" (2.2 gốc) sẽ phải dựng lại gần hết 400 ngày → **không tiết kiệm được** — phải đổi thiết kế (mục 2.4).
3. **Lịch sử giữ**: **360 ngày** (thay cho 400; `VIDEO_DAYS` và phần cắt tỉa dùng 360).

## 2.4 Cải tiến sau khi có số đo (thay thế cách "dựng lại ngày có bài đổi")

**Bảng sự kiện hẹp `sales.video_fact`** — mỗi bài video gắn mã một dòng, chỉ giữ cột cần để gom:

```
sales.video_fact (
  post_id text primary key, day date, channel_id text,
  codes text[],            -- đã quy mã cũ → mới, đã rút về mã SPU (phần trước dấu "-")
  views bigint, src_updated_at timestamptz
)   -- ~32.000 dòng × ~120 byte ≈ 4 MB  (so với social.posts 74 MB)
```
1. `refresh_video_fact()`: `insert … on conflict (post_id) do update` chỉ cho bài có `posts.updated_at > watermark` (~3.850 dòng/ngày, lần đồng bộ thường chỉ vài trăm) + xoá dòng của bài đã mất / ngoài 360 ngày. Đọc `posts` qua chỉ mục `(updated_at)` một phần → quét ít.
2. `video_daily` (mục 2.1) **dựng lại TOÀN BỘ từ `video_fact`** mỗi lần (group by trên 4 MB, ước **~0,2–0,4 giây**, không cần suy luận "ngày nào đổi") rồi thay trong một giao dịch. Giữ cách này thay cho cập nhật tăng dần vì **đơn giản, không thể lệch**, và đã đủ nhanh.
3. Bản dựng đêm: dựng lại `video_fact` từ `posts` (5–6 giây, một lần/ngày) để tự sửa lệch.

| | Ưu | Nhược |
|---|---|---|
| So với dựng lại từ `posts` mỗi lần (5,7 giây) | nhanh hơn ~15–25 lần; không đọc heap 74 MB | thêm 1 bảng + 1 hàm |
| So với tăng dần theo ngày (2.2 gốc) | **đúng với dữ liệu thật** (12% bài đổi mỗi ngày trải mọi ngày); không bỏ sót; mã đơn giản | `video_fact` phải đồng bộ với `posts` (bài bị xoá / đổi mã) → xử lý bằng bản dựng đêm |
| Thay thế | nhờ `video_fact` có thể gắn thêm cột cần từng bài (ví dụ `published_at`, `kind`) để các khối "theo từng bài" cũng đọc bảng hẹp này thay vì `posts` | — |

**Khuyến nghị cập nhật**: làm theo mục 2.4 (bảng sự kiện hẹp + dựng lại `video_daily` từ đó), không làm cập nhật tăng dần theo ngày.

## 8. Trạng thái triển khai (2026-11-09)

| Pha | Trạng thái |
|---|---|
| A — bảng + hàm SQL | **Đã viết** `supabase/migrations/089_video_fact_daily.sql` (`video_fact`, `video_daily`, `video_meta`, `video_codes`, `refresh_video_fact`, `refresh_video_daily`, `video_parity`) — **chờ chạy tay trên Supabase** |
| B — nạp song song, chưa ai đọc | **Đã viết** `src/lib/video-daily.ts`; gọi tăng dần sau mỗi lần đồng bộ video (`sync/api-videos.ts`); endpoint `/api/cron/spu-summary?video=full` (dựng đầy đủ lần đầu, 6 lượt × 60 ngày), `?video=inc`, `?check=3` (đối chiếu) |
| C — chuyển người đọc | chưa làm — chỉ làm sau khi `?check=3` khớp nhiều ngày liền |
| D — bỏ `loadVideoPosts` khỏi làm mới bảng tổng hợp | chưa làm |

**Kiểm tra trước (chạy thử phần SELECT của hàm trên DB thật, không ghi):** trong phạm vi các SPU có trong bảng tổng hợp hiện hành: **0 dòng chỉ có ở bảng cũ, 0 dòng chỉ có ở bảng mới**; 17 dòng lệch nhỏ về lượt xem (mới cao hơn 1–80 lượt) do đồng bộ đã cập nhật lượt xem sau lần làm mới bảng tổng hợp lúc 07:43 — số video không lệch dòng nào. Bảng mới có thêm 2.064 dòng thuộc các mã NGOÀI danh sách SPU (mã test, mã R&D, công cụ dụng cụ…), đúng chủ ý (bảng cũ bỏ các mã này).

**Cách bật:** (1) chạy `089` trong SQL Editor; (2) gọi `?video=full` một lần (có `Authorization: Bearer $CRON_SECRET`); (3) gọi `?check=3` — `ok: true`; (4) từ đó mỗi lần đồng bộ video tự nạp tăng dần.

## 9. Pha C đã triển khai (2026-11-09): bảng tổng hợp SPU lấy video từ `video_daily`

- **Đã khớp** khi đối chiếu (`?check=3`, 2026-11-09): 28.884 / 28.884 dòng, 29.235 / 29.235 video, 0 dòng chỉ ở một bên, 0 lệch số video; 17 dòng lệch nhỏ lượt xem do thời điểm cập nhật.
- **Mã**: `refreshSpuSummary()` (src/lib/spu-summary.ts) — nếu `sales.fill_summary_videos` (migration **090**) có và nạp tăng dần `video_daily` thành công thì dùng `loadSpuRowsLight()` (src/lib/spu-data.ts: không đọc bài đăng) rồi gọi `fill_summary_videos(run)` để chép `video_daily` → `spu_video_daily` và điền `spu_summary.video_teams`; thiếu migration / lỗi → **tự dùng cách cũ**. Tắt hẳn bằng biến môi trường `SPU_VIDEO_SOURCE=posts`.
- **Khác biệt đã biết**: cửa sổ video 360 ngày (cách cũ 400 ngày): 8/11.186 SPU lệch `video_teams` vì có video đăng cách đây 360–400 ngày của team đã không còn video trong 360 ngày gần nhất.
- **Chưa đổi**: `/spu` và Dashboard vẫn đọc `spu_query` / `spu_dash` trên bảng tổng hợp như trước (đã nhanh); các hàm cần từng bài (ngăn video, Video Win, Win Traffic tăng thêm) đọc `posts` theo yêu cầu; đường `legacy` (`loadSpuRows` đầy đủ) còn là phương án dự phòng và nguồn chân lý của `?check=1/2`.
- **Pha D (chưa làm)**: dọn mã đọc bài đăng khi đường SQL ổn định vài tuần.

