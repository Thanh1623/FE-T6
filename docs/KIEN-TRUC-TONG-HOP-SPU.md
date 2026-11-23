# Kiến trúc bảng tổng hợp SPU (tăng tốc trang Theo dõi đẩy hàng và Dashboard)

> Tài liệu bảo trì. Người sửa `src/lib/spu-data.ts`, `src/lib/spu-tracking.ts`, `src/lib/spu-summary*.ts`, `src/lib/spu-query.ts`, `src/lib/spu-dash.ts` hoặc migration 059–061 **đọc tài liệu này trước**.
> Cập nhật lần cuối: 2026-10-29 · Trạng thái: **code Pha 1–3 đã viết và kiểm thử trên Postgres cục bộ; CHƯA chạy trên DB thật, CHƯA bật** (mục 7).

## 1. Vấn đề cần giải quyết

Hai trang `/spu` (Theo dõi đẩy hàng) và `/rnd/dashboard` (Báo cáo đẩy tồn) đều dựa vào `loadSpuRows()` (`src/lib/spu-data.ts`). Hàm này mỗi lần chạy:

1. Kéo về máy chủ khoảng **11 MB dữ liệu thô**: ~30.000 video gắn mã, ~11.000 dòng danh mục, ~9.700 phiếu nhập kho, ~22.000 ảnh/tên SPU, tồn kho theo SKU × kho, dòng đơn hàng 30 ngày…
2. Tự gom và tính (tuổi tồn FIFO, nhóm hàng, team của đơn, số bán…) cho **~11.000 SPU**.
3. Trang chỉ hiện 50 dòng và vài chục con số, nhưng toàn bộ bước 1–2 vẫn chạy.

Đo ngày 2026-10-29 (từ máy phát triển, **không có cache**, nên là chi phí xấu nhất):

| Hàm | Thời gian |
|---|---|
| `loadSpuRows()` | 11 đến 17 giây |
| `spuWinStats()` (Dashboard) | 2,3 giây |
| `loadFlowEvals()` (Dashboard) | 1,4 giây (3,8 MB cho 926 dòng) |
| `rndDashboard()` | 0,9 giây |

Cache chung (`unstable_cache`, nhãn `TAG.spuData`, giữ 6 giờ) đã có từ trước, nhưng bị xoá sau mỗi lần đồng bộ (3 giờ) hoặc nhập file, nên **người mở trang đầu tiên sau đó chờ ~10 giây**. Cache trong bộ nhớ gần như vô dụng trên Vercel (mỗi máy chủ riêng).

## 2. Hướng giải quyết: tính trước, trang chỉ đọc kết quả

```
 nhập tồn kho ─┐
 nhập đơn hàng ┤                          ┌─────────────────────────┐
 đồng bộ video ┼─► refreshSpuSummary() ──►│ sales.spu_summary        │ 1 dòng / SPU           (~11.000)
 nhập ảnh/tên ─┤   (lib/spu-summary.ts)   │ sales.spu_sales_daily    │ số bán ngày × team     (~4.000)
 sửa KPI ──────┘   chạy NỀN sau mỗi thay  │ sales.spu_video_daily    │ video ngày × kênh      (~28.000)
                   đổi dữ liệu nguồn      └────────────┬────────────┘
                                                       ▼
                       sales.spu_query(p)  ← trang /spu   (lọc, đếm, sắp xếp, phân trang trong DB)
                       sales.spu_dash(p)   ← Dashboard    (thẻ S0, cơ cấu video, trạng thái tồn, cảnh báo)
```

**Nguyên tắc then chốt: logic tính KHÔNG viết lại.** `refreshSpuSummary()` gọi lại `loadSpuRows()` (logic gốc: tuổi tồn FIFO, nhóm hàng, team của đơn…) rồi ghi kết quả xuống bảng. Hai hàm SQL chỉ lọc / đếm / sắp xếp trên bảng đã tính và **nhân bản đúng các công thức phân loại đơn giản** của `viewOf` (mục 6). Mọi thứ còn lại (gợi ý hành động) dùng **chung** hàm TypeScript.

Mỗi chỗ đọc có **hai đường cho cùng kết quả**:

| Đường | Cách tính | Vai trò |
|---|---|---|
| `legacy` | trực tiếp từ `loadSpuRows()` bằng TypeScript | **nguồn chân lý**, chậm nhưng luôn đúng; là đường dự phòng khi đường nhanh lỗi |
| `sql` | hàm SQL đọc bảng tổng hợp | nhanh; chỉ dùng sau khi đối chiếu khớp |

Chọn đường bằng biến môi trường **`SPU_READ_MODE`**: `sql` hoặc `legacy`. **Mặc định `sql`** (từ 2026-10-29, sau khi đối chiếu khớp trên dữ liệu thật); đặt `legacy` để quay lại đường cũ. Đường `sql` gặp lỗi (chưa chạy migration, bảng chưa làm mới lần nào…) thì **tự rơi về `legacy`**, trang không hỏng.

## 3. Các bảng và hàm

**Migration `059_spu_summary.sql`** — bảng

| Bảng | Mỗi dòng là | Cột chính |
|---|---|---|
| `sales.spu_summary` | 1 SPU | `code`, `name`, `grp` (nhóm hàng), `variants`, `image`, `stock_by` (jsonb kho→tồn), `stock_total`, `avail_by` (có thể bán theo kho, null nếu chưa có cột), `incoming`, `age_days`, `age_approx`, `sold30` (null = chưa có dữ liệu bán), `sold_by_team`, `video_teams` |
| `sales.spu_sales_daily` | SPU × ngày × team | `day`, `team` (rỗng = chưa gán), `qty` |
| `sales.spu_video_daily` | SPU × ngày × kênh | `day`, `channel_id`, `team`, `platform`, `videos`, `views` |
| `sales.spu_summary_meta` | đúng 1 dòng | `run_id` hiện hành, `refreshed_at`, thời gian chạy, số dòng, nguồn số bán (`orders`/`sapo`/`none`), `skus`, `team_qty` |

**Migration `060_spu_query.sql`** — thêm vào `spu_summary` cột `search_text` (mã + tên không dấu, để tìm kiếm); hàm `sales.spu_query(p jsonb)` cho trang `/spu`. Win Traffic / Win Đơn hàng **không** nằm trong bảng (phụ thuộc kỳ lọc): được truyền vào hàm dưới dạng danh sách mã `p.wt` / `p.ord` (mục 6.1).

**Migration `061_spu_dash.sql`** — hàm `sales.spu_dash(p jsonb)` cho Dashboard (cũng nhận `p.wt` / `p.ord`).

**Cơ chế "lượt" (`run_id`)**: mỗi lần làm mới ghi toàn bộ dữ liệu với `run_id` mới, rồi **một lệnh UPDATE** chuyển con trỏ trong `spu_summary_meta` sang lượt đó, sau đó xoá lượt cũ. Người đang xem không bao giờ thấy dữ liệu nửa cũ nửa mới. Hàm SQL đọc qua 3 view `v_spu_summary`, `v_spu_sales_daily`, `v_spu_video_daily` (chỉ lấy lượt hiện hành).

**Bảo mật**: bảng bật RLS, chỉ `service_role` ghi/đọc. View và hàm chạy với quyền chủ (bỏ qua RLS) nên migration đã `revoke` quyền của `anon`/`authenticated` — **không được bỏ các dòng revoke này**.

Video trong bảng chỉ là số lượng + lượt xem theo ngày × kênh. Danh sách từng video của một SPU (ngăn video) và nội dung / link / ảnh bìa nạp theo yêu cầu: `loadSpuVids()` (lib/spu-query) và `loadVideoDetails()` (lib/spu-data).

## 4. Làm mới dữ liệu

`scheduleSpuSummaryRefresh()` (lib/spu-summary.ts) lên lịch làm mới ở **nền** (`after()`), gộp các yêu cầu dồn dập thành tối đa 1 lần chạy + 1 lần chạy bù. Tắt bằng `SPU_SUMMARY_REFRESH=off`. Đã nối vào:

| Sự kiện | Nối ở đâu |
|---|---|
| Nhập tồn kho, nhập đơn hàng, nhập phiếu nhập kho, nhập ảnh / tên sản phẩm | `invalidateSpuRows()` (lib/spu-data.ts) — mọi action nhập đều gọi |
| Đồng bộ video xong | `src/lib/sync/index.ts` (cạnh `bust(TAG.sync, TAG.spuData)`) |
| Sửa KPI / ngưỡng SPU | `refreshPages()` và `refreshSpu()` trong `src/app/(dash)/kpi/actions.ts` |

Một lần làm mới đồng thời làm nóng cache dùng chung của `loadSpuRows()` nên người dùng không phải chờ lần nạp nặng. **Thêm một nguồn dữ liệu mới vào `loadSpuRows()` thì phải đảm bảo thao tác thay đổi nguồn đó gọi `invalidateSpuRows()` hoặc `scheduleSpuSummaryRefresh()`.**

Làm mới thủ công (cần `Authorization: Bearer <CRON_SECRET>`):

| Địa chỉ | Việc |
|---|---|
| `/api/cron/spu-summary` | làm mới nền, trả 202 |
| `/api/cron/spu-summary?wait=1` | làm mới và trả kết quả đầy đủ |
| `/api/cron/spu-summary?check=1` | **không ghi**; so tổng của bảng với số tính trực tiếp |
| `/api/cron/spu-summary?check=2` | **không ghi**; so kết quả hàm SQL với đường cũ trên ~35 bộ lọc |

Ví dụ: `curl -H "Authorization: Bearer $CRON_SECRET" "https://<tên miền>/api/cron/spu-summary?wait=1"`. Chi phí một lần làm mới ≈ một lần `loadSpuRows()` không cache (~10 giây) + ghi ~45.000 dòng.

## 5. Kiểm tra khớp

- **`?check=1`**: 7 tổng (số SPU, tồn kho, có thể bán, bán 30 ngày, số bán theo ngày, số video, lượt xem). Lệch ngay sau khi làm mới → lỗi trong `refreshSpuSummary()`; lệch sau một thời gian → dữ liệu nguồn đổi mà chưa làm mới (thiếu điểm nối ở mục 4).
- **`?check=2`** (`src/lib/spu-parity.ts`): chạy cả hai đường trên nhiều bộ lọc (mặc định, sắp xếp, mọi trạng thái, 3 team, 2 kho, nhóm, tìm kiếm, kỳ 7 ngày / tháng trước, trang 2; Dashboard mặc định / 7 / 90 ngày / 2 team) và so thẻ, số trên nút lọc, tổng, thứ tự mã, giá trị từng dòng, gợi ý hành động. **Phải toàn `ok: true` trước khi bật `SPU_READ_MODE=sql`, và chạy lại sau mỗi lần sửa công thức.**
- **Đã kiểm thử khi phát triển** (2026-10-29): nạp dữ liệu thật vào Postgres cục bộ (PGlite, PG 16) rồi so hàm SQL với `viewOf`: `/spu` **53/53** ca khớp, Dashboard **15/15** ca khớp (ngoại lệ đã chấp thuận ở mục 6). Cách làm lại: dựng dữ liệu bằng `buildSummaryTables()`, nạp 059 → 060 → 061, gọi hàm và so với `queryLegacy()` / `dashLegacy()`.

## 6. Nguồn chân lý của quy tắc phân loại

- **TypeScript là nguồn chân lý**: `src/lib/spu-tracking.ts`.
  - `saleFlags(stock, sl30, rules)`: Active, còn hàng, bán chạy / thường / chậm, tồn xấu — **SQL nhân bản công thức này**.
  - `viewOf()`: tồn / bán / video / lượt xem theo kỳ, kho, team.
  - `actionOf()`: gợi ý hành động — dùng **chung** cho đường cũ và đường nhanh (không nhân bản sang SQL).
  - Ngưỡng ở `core.settings` (`spu_rules`) và trang KPI; truyền vào hàm SQL làm **tham số**, không viết cứng.
- **Win Traffic / Win Đơn hàng / Ngôi sao**: một quy tắc duy nhất, xem mục 6.1. Không còn dùng engine KPI (`buildMetrics`, `checkRules`) cho SPU.
- **Khi sửa công thức phân loại**: sửa `saleFlags` / `viewOf` **và** hàm SQL tương ứng (060, 061) rồi chạy `?check=2`. Nếu đổi **cách tính** các cột của bảng tổng hợp thì sửa `buildSummaryTables()` và cho làm mới.

### 6.1 Quy tắc Win duy nhất (biên bản họp R&D × ĐVKD, chỉnh ở trang KPI)

Trang KPI → mục **"Quy tắc Win (theo biên bản họp)"** lưu vào `core.settings` khoá `spu_rules`, phần `win` (`WinRulesForm`, action `saveWinRules`). Mặc định đúng biên bản: Win Traffic ≥ 100.000 lượt xem và ≥ 300 bình luận trong 3 ngày · Win Đơn hàng ≥ 30 sản phẩm trong 7 ngày · Ngôi sao = đạt cả hai. **Một bộ ngưỡng, hai cách tính** tuỳ đối tượng; cả hai đều đánh giá **cấp SẢN PHẨM (SPU)**: gộp MỌI video gắn mã SPU, không video nào phải tự đạt ngưỡng.

| Đối tượng | Cách tính | Hàm | Nơi dùng |
|---|---|---|---|
| **SPU đang bán** | **Cuốn chiếu, KHÔNG phụ thuộc kỳ lọc.** Win Traffic = lượt xem **tăng thêm** ≥ V và bình luận **tăng thêm** ≥ C trong N ngày gần nhất, cộng dồn mọi video gắn mã. Win Đơn hàng = bán thuần ≥ Q trong M ngày gần nhất (không cần có video). | `loadRollingWin` | trang Theo dõi đẩy hàng (nút lọc + nhãn), Dashboard S2–S4, tab cảnh báo, gợi ý hành động |
| **Mẫu mới** (mã test, SP R&D) | Theo **video đầu tiên** từ trước đến nay: Win Traffic = tổng lượt xem + bình luận của các video đăng trong N ngày đầu; Win Đơn hàng = bán ≥ Q trong M ngày kể từ video đầu tiên. | `loadLaunchWinFlags` | cột "Đánh giá SP" của bảng Thống kê đẩy hàng (Báo cáo R&D); Báo cáo test mẫu có engine tự chấm riêng |

- **Team / Page đang lọc vẫn có tác dụng** (chỉ tính video và số bán của các Page đó); **kỳ ngày thì không** (với SPU đang bán).
- **Cách tính "tăng thêm"** (`sales.spu_traffic_gain`, migration 062): tăng thêm của một video = số hiện tại − số ở **ảnh chụp** gần nhất có ngày ≤ cuối ngày (hôm nay − N). Video đăng SAU mốc đó: tăng thêm = toàn bộ số hiện có. Video cũ chưa từng được chụp: **không biết → không tính** (đếm vào `unknownVideos`, trang `/spu` báo số này). Đồng bộ ghi ảnh chụp mỗi khi BẤT KỲ chỉ số nào đổi, nên ảnh chụp gần nhất chính là số tại mốc đó. Bình luận được chụp từ migration 062 trở đi (`post_daily.comments`); ảnh chụp cũ chưa có bình luận mà lượt xem không đổi → coi bình luận không đổi.
- **Dữ liệu để Win Traffic cuốn chiếu chạy đúng**: (1) đồng bộ phải chụp video gắn mã mỗi khi chỉ số đổi — video ≤ 45 ngày được chụp tự động; **video cũ bứt phá** được ghi thêm một **mốc trước khi bứt phá** (`api-videos.ts`); video cũ hơn 45 ngày không bứt phá thì không có ảnh chụp nên không tính; (2) đã chạy migration 062. Lúc mới triển khai, các video cũ hơn N ngày chưa kịp có ảnh chụp mốc nên chưa tính, đủ dữ liệu dần sau N ngày.
- **Thẻ Dashboard**: S1 = SPU Active có video trong kỳ (theo team / Page đang lọc). S2 / S3 / S4 = **SPU Active ĐANG Win Traffic / Win Đơn hàng / Ngôi sao** (không phụ thuộc kỳ).
- **Nơi tính**: `src/lib/spu-winflags.ts` trả hai tập mã (`wt`, `order`); mọi nơi nhận cùng tập: `viewOf` (cờ `winTraffic`, `win`, `star` — **không loại trừ nhau**), hàm SQL (`p.wt`, `p.ord`), Dashboard, nút lọc. Lưu đệm 5 phút, xoá cùng `TAG.spuData`.
- **Báo cáo R&D**: bảng "Thống kê đẩy hàng" có cột **Đánh giá SP** (Ngôi sao / Win Đơn hàng / Win Traffic / Chưa Win) theo cách "mẫu mới" ở trên, tổng mọi team; chọn riêng một team trong bảng không đổi cột này. Mã R&D có mã Sapo riêng thì số bán lấy theo mã Sapo.
- **Đã gỡ**: cài đặt "SP Ngôi sao" (KPI + số ngày) ở trang KPI và việc dùng 2 bộ KPI mặc định (Bán hàng / Traffic) để chấm Win cho SPU. Hai bộ KPI đó **vẫn dùng** để tự chấm WIN / WIN TRAFFIC cho mã test ở "Báo cáo test mẫu" — đó là hệ thống khác.
- Giới hạn: số ngày tối đa 30 mỗi tiêu chuẩn (form chặn).

### 6.2 Video Win (chấm RIÊNG TỪNG VIDEO, theo ngày đăng của video)

Ngưỡng ở trang KPI, thẻ **Video Win** (mặc định lượt xem ≥ 30.000 và người xem ≥ 3.000) — **khác** quy tắc Win cấp SPU. Mỗi video được chấm trên số liệu **N ngày đầu kể từ NGÀY ĐĂNG của chính video** (N = số ngày Win Traffic), không phải số cộng dồn hiện tại:

- **Hàm SQL** `sales.video_first_days` (migration 063): bài đã đủ N ngày và có ảnh chụp ≤ (ngày đăng + N) → lấy ảnh chụp đó (`exact`); bài **chưa đủ N ngày** → số hiện tại (tạm tính, vẫn trong N ngày đầu); bài **đã quá N ngày mà chưa từng được chụp** → `unknown`, **không chấm Win** (số hiện tại đã cộng dồn quá N ngày nên sai nghĩa).
- **Nơi dùng**: nhãn WIN ở ngăn video (`SpuDrawer`), tab "Video tiềm năng" của cảnh báo Dashboard, cột "Video Win" của bảng Thống kê đẩy hàng. Chưa chạy migration 063 thì các nơi này dùng số hiện tại như trước. Hàm chấm: `videoWinOf` (`src/lib/video-win.ts`).

## 7. Lộ trình và trạng thái

| Pha | Nội dung | Trạng thái |
|---|---|---|
| 1 | Bảng tổng hợp (059), `refreshSpuSummary()`, `checkSpuSummary()`, endpoint làm mới | **Đã viết code, chưa chạy trên DB thật** |
| 2 | Tự làm mới sau mỗi thay đổi dữ liệu (mục 4); cờ Ngôi sao / Win tính sẵn; tìm kiếm không dấu | **Đã viết code** |
| 3 | `/spu` đọc qua `spu_query` (060); Dashboard đọc qua `spu_dash` (061): thẻ S0, cơ cấu video, trạng thái tồn, cảnh báo; công tắc `SPU_READ_MODE`; đối chiếu `?check=2` | **Đã chạy trên DB thật; mặc định `sql`** |
| 4 | Tối ưu các khối còn lại của Dashboard (mục 7.1); dọn mã cũ sau khi `sql` chạy ổn định vài tuần | **Phần tối ưu đã viết code; dọn mã cũ chưa làm (chủ ý, chờ ổn định)** |

### 7.1 Pha 4: những gì đã tối ưu ở Dashboard (không phụ thuộc `SPU_READ_MODE`)

| Việc | Trước | Sau |
|---|---|---|
| **Mỗi chế độ chỉ tải phần của mình** (`dashboard/page.tsx`): "Báo cáo đẩy tồn" không tải số liệu R&D (`rndDashboard`, chi phí test, `loadFlowEvals` 3,8 MB); "Báo cáo R&D" không tải số liệu SPU | cả hai chế độ tải cả hai bộ số liệu dù chỉ dùng một | bớt ~1,5 giây thời gian truy vấn cộng dồn và ~4 MB mỗi lần mở |
| **Thống kê Win chạy song song với số liệu SPU**: `spuWinStats` nhận `stockInfo` dưới dạng Promise, chỉ chờ ở bước cuối (thẻ S1, bảng theo team) | số liệu SPU xong rồi mới bắt đầu thống kê Win | hai khối chạy cùng lúc |
| **Gom 3 bước truy vấn độc lập thành 1** trong `spuWinStats` (kênh + team, bài đăng, đánh giá + mẫu R&D) | nối đuôi 3 lượt | 1 lượt (đo: ~3,7 → ~2,1 giây, có nhiễu mạng) |
| **Không hỏi số bán của ngày tương lai** (`loadDailySales` giới hạn `to` ≤ hôm nay) | luôn hỏi thêm 12 truy vấn rỗng cho 7 ngày kế tiếp | bỏ hẳn |

**Còn lại, chưa tối ưu thêm**: `spuWinStats` vẫn ~2 giây (gồm một khoảng chờ ~0,6 giây giữa bước đọc bài đăng và bước đọc số bán chưa tìm ra nguyên nhân; số bán lấy từ `imported_order_lines`); `rndDashboard` (~0,9 giây) và `loadFlowEvals` chỉ còn ảnh hưởng chế độ R&D. Nếu Dashboard vẫn chậm sau khi bật `sql`, bước tiếp theo là tính sẵn thống kê Win vào bảng tổng hợp như đã làm với số liệu SPU.

### Cách bật (theo thứ tự)

1. Deploy code.
2. Chạy lần lượt trong Supabase SQL Editor: `059_spu_summary.sql`, `060_spu_query.sql`, `061_spu_dash.sql`.
3. Gọi `?wait=1` để làm mới lần đầu → `?check=1` → `?check=2`. Tất cả phải `ok: true`.
4. (Không cần đặt biến — mặc định đã là `sql`.) Mở `/spu` và `/rnd/dashboard`, đối chiếu mắt với bản cũ; trang `/spu` hiện "số liệu tổng hợp lúc …" khi đang dùng đường nhanh.

### Đo trên DB thật (2026-10-29, từ máy phát triển)

| Việc | Thời gian |
|---|---|
| Làm mới bảng tổng hợp (11.282 SPU, 4.142 dòng bán, 27.912 dòng video) | 44 giây |
| `spu_query` (một trang `/spu`, mọi bộ lọc đã thử) | 0,25 đến 0,9 giây |
| `spu_dash` | 0,6 giây (7 ngày), 1,9 giây (30 ngày), 2,4 giây (90 ngày) → đã tối ưu lấy top video, cần chạy lại `061` |
| `spu_traffic_gain` (Win Traffic cuốn chiếu) | 5,6 giây → đã tối ưu chỉ xét video đã đổi trong cửa sổ, cần chạy lại `062` |
| Đối chiếu `?check=2` | 25 trên 28 ca khớp; 3 ca còn lại là **hết thời gian chờ** của DB (statement timeout), không phải lệch số |

Hai hàm chậm nhất đã sửa trong repo nhưng **chỉ có hiệu lực khi chạy lại `061` và `062` trong Supabase** (hai file viết để chạy lại được). Cờ Win cuốn chiếu lưu đệm 1 giờ và được làm nóng sau mỗi lần làm mới.

### Hoàn tác

Đổi `SPU_READ_MODE` về `legacy` (hoặc xoá biến) và deploy lại. Muốn dừng cả việc làm mới nền: `SPU_SUMMARY_REFRESH=off`. Muốn xoá hẳn khỏi DB: `drop function sales.spu_query(jsonb), sales.spu_dash(jsonb); drop view sales.v_spu_summary, sales.v_spu_sales_daily, sales.v_spu_video_daily; drop table sales.spu_summary, sales.spu_sales_daily, sales.spu_video_daily, sales.spu_summary_meta;`.

## 8. Bản đồ mã nguồn

| File | Việc |
|---|---|
| `supabase/migrations/059_spu_summary.sql`, `060_spu_query.sql`, `061_spu_dash.sql`, `062_win_rolling.sql`, `063_video_first_days.sql` | bảng, view, hàm SQL (062: ảnh chụp bình luận + `spu_traffic_gain`; 063: `video_first_days`) |
| `src/lib/spu-summary-build.ts` | **hàm thuần** dựng nội dung bảng từ `SpuRow[]` (kiểm thử được) |
| `src/lib/spu-summary.ts` | làm mới (`refreshSpuSummary`), lên lịch nền (`scheduleSpuSummaryRefresh`), `checkSpuSummary` |
| `src/lib/spu-query.ts` | truy vấn trang `/spu`: `queryLegacy`, `querySql`, `querySpu` (chọn đường), `resolveOpenView` + `loadSpuVids` (ngăn video) |
| `src/lib/spu-dash.ts` | số liệu Dashboard: `dashLegacy`, `loadDashSpu` (chọn đường) |
| `src/lib/spu-parity.ts` | đối chiếu hai đường (`?check=2`) |
| `src/lib/spu-winflags.ts` | **quy tắc Win duy nhất**: `loadRollingWin` (SPU đang bán, cuốn chiếu), `loadLaunchWinFlags` (mẫu mới, theo video đầu tiên), `computeWinFlags` (hàm thuần) |
| `src/lib/video-win.ts`, `video-win-data.ts` | Video Win từng video theo ngày đăng (`videoWinOf`, `loadFirstDays`) |
| `src/components/kpi/WinRulesForm.tsx`, `kpi/actions.ts` (`saveWinRules`) | form cài đặt quy tắc Win ở trang KPI |
| `src/lib/spu-tracking.ts` | `saleFlags`, `viewOf`, `actionOf` (nguồn chân lý của quy tắc) |
| `src/app/api/cron/spu-summary/route.ts` | endpoint làm mới / kiểm tra |

## 9. Giới hạn đã biết

- Số liệu ở đường nhanh đúng bằng **lần làm mới gần nhất** (thường vài giây đến vài chục giây sau thay đổi), không phải thời gian thực. Nếu một lần làm mới lỗi, trang dùng bảng cũ và chỉ có log (`console.error`) — theo dõi giờ "tổng hợp lúc …" trên `/spu`.
- `spu_video_daily` lưu team **tại thời điểm làm mới**; đổi team của một kênh chỉ có hiệu lực sau lần làm mới kế tiếp.
- Ngăn video của một SPU nạp video bằng `posts.product_codes @> {mã}`: chỉ thấy bài gắn đúng mã SPU (khớp dữ liệu hiện tại, mọi mã gắn là mã SPU; nếu sau này gắn mã SKU dạng `D0001-00` thì cần mở rộng truy vấn).
- Đường nhanh chưa có cột "footage" (số clip source, hiện luôn rỗng ở cả hai đường).
- **Cờ Win không nằm trong bảng tổng hợp**: tính theo từng bộ lọc Page / kênh bán rồi lưu đệm 5 phút; lần đầu mất khoảng 1–2 giây (đọc ảnh chụp + số bán). Cột "Video Win" của bảng Thống kê đẩy hàng (Báo cáo R&D) chấm RIÊNG TỪNG VIDEO theo cài đặt "Video Win" ở trang KPI (lượt xem ≥ …, người xem ≥ …; chỉ số ngoài lượt xem quy theo tỉ lệ cố định) — không dùng quy tắc Win cấp SPU.
- **Số migration**: `054` đã bị trùng với migration của phiên khác nên bảng tổng hợp là `059`; trước khi thêm migration mới luôn `ls supabase/migrations` để tránh trùng số.
- **Trùng ý với `spu_daily_stats` (migration 058)**: bảng đó chụp số SPU Active / còn hàng / bán chạy… mỗi ngày để vẽ xu hướng cạnh thẻ; dữ liệu nó ghi lấy từ kết quả của `spu_query` / đường cũ nên hai nơi dùng chung một cách tính.
- Chưa đo trên Vercel thật; các con số thời gian ở mục 1 là từ máy phát triển.

## Cột "Lượt xem" (tăng trong kỳ) và "View 3N" (migration 101)

- `sales.video_views_daily` (ngày, mã SPU, team) → lượt xem TĂNG THÊM trong ngày, dựng lại toàn bộ bởi `sales.refresh_video_views()` mỗi lần `refreshVideoDaily` (lib/video-daily.ts). Lượt tăng ngày D của một bài = lượt xem mốc D (`social.post_daily`, tích luỹ) trừ mốc liền trước; mốc đầu của bài mới (đăng trong 1 ngày trước mốc) tính từ 0, của bài cũ có sẵn trước khi lưu lịch (từ 09/10/2026) chỉ làm gốc (0).
- Cột **Lượt xem** (`views` của `sales.spu_query`) = Σ lượt tăng các ngày TRONG KỲ LỌC của MỌI video gắn mã (không còn chỉ video đăng trong kỳ). Cột **View 3N** (`views3`) = 3 ngày gần nhất, không theo kỳ lọc. Cả hai theo team khi lọc team; "—" khi SPU chưa có video hoặc bảng chưa dựng. Kỳ lọc lùi xa hơn 09/10/2026 chỉ có phần từ ngày đó.
- Đường tính trực tiếp (legacy, `SPU_READ_MODE=legacy` hoặc SQL lỗi) vẫn dùng nghĩa CŨ của "Lượt xem" (tổng lượt xem video đăng trong kỳ) và không có View 3N — chỉ là đường dự phòng.

## Bộ lọc "Thị trường" (migration 102)

- Thị trường gắn theo KÊNH (không theo team vì kênh "chưa gán team" chứa nhiều video nước ngoài): `sales.channel_market` (kênh → `vn` / `intl` + nguồn) do `sales.refresh_channel_market()` dựng; chạy mỗi khi `refresh_video_views()` chạy. Thứ tự: `social.channels.market` đặt tay → team Thái Lan / Mỹ / Nhật Bản / Global → tên kênh có chữ Thái / Nhật / Trung / Hàn → ngôn ngữ bài đăng (≥50% chữ Thái / Nhật / Trung / Hàn, hoặc <20% có dấu tiếng Việt = tiếng Anh…) → mặc định trong nước. Đặt tay: `update social.channels set market = 'vn' where id = ...` rồi `select sales.refresh_channel_market();`.
- `sales.video_views_daily` có thêm chiều `market`. `sales.spu_query` nhận `market` ('' / `vn` / `intl`) và lọc MỌI số liên quan video: Video đăng, SL Team đăng, View, View 3N (giống bộ lọc Team); hàm trả lại `market` đã áp dụng để trang cảnh báo khi chưa chạy migration 102. Cờ Win Traffic cũng chỉ tính video của các kênh thuộc thị trường đang chọn (lib/spu-winflags qua `pageIds`), ngăn video cũng lọc theo thị trường.
- Đường tính trực tiếp (legacy) KHÔNG hỗ trợ thị trường; trang hiện cảnh báo. Trang Bài đăng (`/posts`) chưa có bộ lọc thị trường.
- `lib/spu-parity.ts` (đối chiếu SQL ↔ legacy) sẽ báo lệch ở cột Lượt xem vì nghĩa mới (lượt tăng trong kỳ, migration 101).

### Mặc định và phạm vi của bộ lọc Thị trường

- Tham số URL `market` = `all` (Tất cả) / `vn` (Trong nước) / `intl` (Nước ngoài). **Không có tham số = Trong nước** (lib/channel-market.ts: `DEFAULT_MARKET`), nên mọi người mở trang đều thấy số Trong nước trước; "Tất cả" phải chọn rõ (`market=all`). Hàm SQL nhận `market` = rỗng cho "tất cả".
- Trang `/spu` (Theo dõi đẩy hàng): hàm SQL `spu_query` lọc theo thị trường (migration 102). Dashboard `/rnd/dashboard` (Báo cáo đẩy tồn và Báo cáo R&D): thị trường được đổi thành danh sách kênh (`pageIds`, giao với Page / team đã lọc) nên thẻ S, Win, video theo team / nhóm hàng đi qua `spu_dash` (đã hỗ trợ `channels`); bảng traffic kênh R&D (`rnd-channel-traffic`) và danh sách kênh R&D của Báo cáo R&D (`rnd-dashboard`) cũng lọc kênh theo thị trường. KHÔNG theo thị trường: thẻ P0–P6 (mẫu sưu tầm), các khối theo sản phẩm của luồng R&D, và Báo cáo test mẫu (chấm theo kết quả đánh giá của từng mã, không theo kênh) — chế độ này không có ô lọc Thị trường.

### Win Traffic theo thị trường

- Win Traffic (cuốn chiếu `spu_traffic_gain` và theo mốc video đầu tiên) được chấm RIÊNG trên phần lượt xem / bình luận của từng thị trường (lib/spu-winflags: `loadRollingWinByMarket`, `loadLaunchWinFlagsByMarket`). Chọn một thị trường → chỉ tính kênh thuộc thị trường đó. **"Tất cả" = một SPU là Win Traffic khi đạt Ở ÍT NHẤT MỘT thị trường** (trong nước, nước ngoài hoặc cả hai); cộng gộp hai thị trường mà không bên nào tự đạt thì KHÔNG tính (ví dụ L0051 ngày 21/11/2026: gộp 52.664 view ≥ 50.000 nhưng trong nước 45.765 + nước ngoài 6.899 → không là Win Traffic ở thị trường nào).
- Win Đơn hàng giữ nguyên (số bán không chia theo thị trường); "Tất cả" dùng số bán của mọi Page đang lọc. Ngôi sao = Win Traffic (theo quy tắc trên) và Win Đơn hàng.
- **Làm nóng cache** (cuối `refreshSpuSummary`, tức sau nhập tồn kho / nhập số bán / đồng bộ traffic; các lần kích hoạt liên tiếp được gộp thành một lần chạy): chỉ bộ lọc MẶC ĐỊNH — toàn công ty, không lọc Team, kỳ 30 ngày, thị trường **Trong nước** — gồm (1) cờ Win cuốn chiếu `loadRollingWinByMarket(market "vn")` và (2) số liệu SPU của Dashboard `warmDashSpu` (lib/spu-dash: chỉ đường SQL `spu_dash`, không bao giờ rơi sang đường tính trực tiếp). Tham số phải giống HỆT trang Dashboard truyền vào thì mới trúng khoá đệm. Nước ngoài, Tất cả, chọn Team hay đổi kỳ thì lần đầu vẫn chậm (cố ý, giảm tải DB).

### "Chốt" làm mới sau đồng bộ (workflow `summary`)

- Đồng bộ (`sync` 06:07 / 18:07 giờ VN, `videos` 00:30 giờ VN) làm mới bảng tổng hợp ở BƯỚC CUỐI. Nếu đồng bộ bị cắt giữa chừng thì bước đó không chạy và bảng tổng hợp đứng yên (21/11/2026: mã mới L0051 hiện 0 view).
- `.github/workflows/summary.yml` gọi `/api/cron/spu-summary?ifchanged=1` 28 phút sau `sync` và 25 phút sau `videos` (06:35, 18:35, 00:55 giờ VN). `summaryNeedsRefresh()` (lib/spu-summary) chỉ cho làm mới khi: chưa từng làm mới, bài gắn mã đã đổi (`postsChangedSinceSummary`), hoặc một bước đồng bộ nguồn (`catalog`, `sales`, `retag`, `videos_api`) hoàn tất SAU `refreshed_at`. Đồng bộ chạy trọn vẹn thì trả `{ skipped }`, không tốn CPU database.
