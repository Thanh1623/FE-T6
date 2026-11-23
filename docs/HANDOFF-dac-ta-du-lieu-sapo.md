# Bàn giao: đặc tả dữ liệu Sapo cho trang "Theo dõi SPU"

Ngày lập: 23/10/2026. Người nhận: phiên Claude Code làm việc trên dự án **fb-traffic** (R&D). Tài liệu này tóm tắt các trao đổi và **quyết định đã chốt** giữa người dùng và một phiên Claude Code khác (làm trên dự án *quản lý đơn hàng*, kho mã `my-jewelry-dashboard`), để phiên này không phải làm lại phân tích.

> Quy ước độ tin cậy dùng xuyên suốt: **[ĐÃ XÁC NHẬN]** = có bằng chứng từ lệnh gọi API thật hoặc dữ liệu thật; **[CHƯA XÁC NHẬN]** = chưa có bằng chứng, không được dùng như sự thật; **[QUYẾT ĐỊNH]** = người dùng đã chốt.

## 0. Nguồn bằng chứng và giới hạn

- Khoá API Sapo của dự án quản lý đơn hàng đã **gỡ** (Sapo bị gỡ khỏi dự án đó từ 19/10/2026), nên **không gọi trực tiếp Sapo** được. Tên trường Sapo được xác nhận bằng hai nguồn: (a) code gọi API Sapo từng chạy thật (lịch sử git của dự án đơn hàng) và (b) dữ liệu Sapo đã lưu trong DB đơn hàng (~16 nghìn SKU, ~32,7 nghìn đơn, ~14,5 nghìn phiếu nhập/chuyển/hoàn kho, 12 tháng).
- API tồn kho của team Tech (mục 3) đã được **gọi thử trực tiếp ngày 23/10/2026** (chỉ đọc, không cần xác thực).
- **API tồn kho đang tạm dừng cập nhật để Sapo xử lý bảo mật** → số liệu snapshot 17/10/2026 chỉ là số liệu **tạm**.

## 1. Quyết định đã chốt [QUYẾT ĐỊNH]

1. Tên trường trong đặc tả viết **đúng như Sapo** (vd `product_id`, `variant_id`, `created_on`), không thêm tiền tố `sapo_`.
2. Đã **loại** các trường không tồn tại trên Sapo (xem sheet "Đã loại bỏ" trong file Excel): mã SPU, nhóm hàng chuẩn, chất liệu, các trường tag tách sẵn, giá niêm yết, giá trị tồn, lô hàng...
3. **Bán 30 ngày KHÔNG trừ hàng hoàn.** = tổng `quantity` của đơn hợp lệ trong 30 ngày; loại đơn huỷ (`status = cancelled`), đơn thử (`test = true`), đơn bảo hành (`source_name = BAO-HANH`, hoặc SKU `HANGBAOHANH` giá 0đ). Không cần dữ liệu `order_returns`.
4. **Chỉ dùng tag của ĐƠN** (`order.tags`) để thống kê kênh/Trang/team. **Không dùng tag sản phẩm.**
5. **Cột "Hàng đang về" KHÔNG lấy từ Sapo/Tech** mà lấy từ hệ thống quản lý đơn hàng (cột `nk_ve` + `sx_ve` của `product_stock`, tự tính từ PO nội bộ qua hàm `recompute_po_incoming`).
6. **Tuổi tồn = `start_date` / `days_in_stock` của API tồn kho Tech đã có** (tạm thời), nên **bỏ nhóm "Phiếu nhập kho"** khỏi đặc tả.
7. **Hàng khách hoàn trả KHÔNG tính là hàng nhập** (không làm tuổi tồn "mới" lại).
8. **Gộp tuổi tồn nhiều mã thành 1 SPU = bình quân gia quyền theo số lượng tồn:** `tuổi_SPU = Σ(on_hand × days_in_stock) / Σ on_hand` trên các mã còn tồn của SPU. Hiển thị thêm tuổi mã cũ nhất ở chú thích. Mã có `start_date` = 2025-09-08/09 là **mốc sàn** (xem 3.3): giá trị chỉ là cận dưới, phải kèm dấu `>` hoặc cảnh báo.

## 2. Danh sách trường sau rút gọn (24 trường gửi Tech; 18 trường lõi)

Nguồn: sheet "Hàng hoá & Kho" của `dac-ta-du-lieu-spu-traffic-doi-chieu-sapo.xlsx`. Sheet "Rút gọn (đề xuất)" chỉ ra 18 trường lõi (bỏ thêm `title`, `barcode`, `modified_on`, `cost_price`, `committed`) và chuỗi "mỗi cột trên web tính từ trường nào".

| Nhóm | Tên trường (đúng như Sapo) | Ý nghĩa | Mức | Gọi trên Sapo (GET → đường dẫn JSON) | Kiểm chứng |
|---|---|---|---|---|---|
| A | `product_id` | Mã số của sản phẩm cha trên Sapo. Các biến thể (từng size / màu) của cùng một sản phẩm có chung mã này. | Bắt buộc | `GET /admin/products.json → products[].id  (hoặc products[].variants[].product_id)` | Đã xác nhận |
| A | `variant_id` | Mã số của từng biến thể (từng SKU) trên Sapo. Mỗi SKU có một mã riêng, không trùng nhau. | Bắt buộc | `GET /admin/products.json → products[].variants[].id` | Đã xác nhận |
| A | `sku` | Mã SKU: mã hàng đầy đủ của một biến thể, ví dụ D0006-00-S-WH. | Bắt buộc | `GET /admin/products.json → products[].variants[].sku  (tra theo SKU: GET /admin/variants.json?sku=)` | Đã xác nhận |
| A | `name` | Tên sản phẩm gốc trên Sapo (chưa kèm size / màu). Có thể mang tiền tố trạng thái như (Dừng bán), (HỦY), (CHẾ TÁC). | Bắt buộc | `GET /admin/products.json → products[].name` | Đã xác nhận |
| A | `title` | Tên biến thể (size, màu). Sản phẩm không có biến thể thì Sapo ghi "Default Title". | Tuỳ chọn | `GET /admin/products.json → products[].variants[].title` | Đã xác nhận |
| A | `barcode` | Mã vạch của biến thể, dùng khi kiểm kho. | Tuỳ chọn | `GET /admin/products.json → products[].variants[].barcode  (tra theo mã vạch: GET /admin/variants.json?barcode=)` | Đã xác nhận |
| A | `product_type` | "Loại sản phẩm" trên Sapo, phân cấp bằng dấu >>, ví dụ NHẪN >> Vàng. Dùng để xếp nhóm hàng. | Bắt buộc | `GET /admin/products.json → products[].product_type` | Đã xác nhận |
| A | `image.src` | Đường dẫn (URL) ảnh đại diện của sản phẩm. | Nên có | `GET /admin/products/{id}.json → product.image.src  (ảnh riêng từng biến thể: product.images[].src + images[].variant_ids)` | Đã xác nhận |
| A | `(chưa rõ tên trường)` | Trạng thái kinh doanh của sản phẩm (đang bán hay ngừng bán). CHƯA rõ Sapo có trường này không. | Nên có | `Chưa rõ endpoint và tên trường — Tech xác nhận` | Chưa xác nhận |
| A | `created_on` | Thời điểm sản phẩm được tạo trên Sapo (giờ UTC). Dùng để phân biệt hàng mới và hàng cũ. | Bắt buộc | `GET /admin/products.json → products[].created_on  (Tech xác nhận tên trường)` | Chưa xác nhận |
| A | `modified_on` | Thời điểm sản phẩm / biến thể được sửa lần cuối. | Nên có | `GET /admin/products.json → products[].variants[].modified_on  (hoặc products[].modified_on)` | Đã xác nhận |
| A | `cost_price` | Giá vốn của biến thể (thông tin nhạy cảm). | Tuỳ chọn | `GET /admin/inventory_items.json → inventory_items[].cost_price` | Đã xác nhận |
| B | `variant_id` | Mã số biến thể (SKU) mà dòng tồn kho này thuộc về. | Bắt buộc | `GET /admin/inventory_levels.json → inventory_levels[].variant_id` | Đã xác nhận |
| B | `location_id` | Mã số của kho (chi nhánh) trên Sapo. | Bắt buộc | `GET /admin/inventory_levels.json → inventory_levels[].location_id` | Đã xác nhận |
| B | `name` | Tên kho (chi nhánh), ví dụ Trung tâm VAT (Mới). Lấy từ danh sách kho, dòng tồn kho không có sẵn tên. | Bắt buộc | `GET /admin/locations.json → locations[].name  (nối: location_id = locations[].id)` | Đã xác nhận |
| B | `on_hand` | Số lượng thực tế đang có trong kho. | Bắt buộc | `GET /admin/inventory_levels.json → inventory_levels[].on_hand` | Đã xác nhận |
| B | `committed` | Số lượng đã được giữ chỗ cho đơn chưa xuất kho. | Tuỳ chọn | `GET /admin/inventory_levels.json → inventory_levels[].committed` | Đã xác nhận |
| C | `id` | Mã số của đơn hàng trên Sapo, dùng làm khoá. Mã nhân viên nhìn thấy (vd HK88069) là trường name của đơn. | Bắt buộc | `GET /admin/orders.json → orders[].id  (mã hiển thị: orders[].name)` | Đã xác nhận |
| C | `created_on` | Thời điểm tạo đơn (giờ UTC). Dùng để đếm bán theo ngày. | Bắt buộc | `GET /admin/orders.json?created_on_min=…&created_on_max=… → orders[].created_on` | Đã xác nhận |
| C | `status` | Trạng thái đơn: open (đang mở), closed (đã lưu trữ), cancelled (đã huỷ). Kèm cờ test = true là đơn thử. | Bắt buộc | `GET /admin/orders.json → orders[].status ; orders[].test` | Đã xác nhận |
| C | `variant_id` | Mã số biến thể (SKU) được bán ở dòng đơn. | Bắt buộc | `GET /admin/orders.json → orders[].line_items[].variant_id` | Đã xác nhận |
| C | `quantity` | Số lượng của dòng sản phẩm trong đơn. | Bắt buộc | `GET /admin/orders.json → orders[].line_items[].quantity` | Đã xác nhận |
| C | `source_name` | Kênh / nguồn tạo đơn: facebook, tiktokshop, pos, shopee, web, zalo, BAO-HANH (đơn bảo hành)… | Bắt buộc | `GET /admin/orders.json → orders[].source_name` | Đã xác nhận |
| C | `tags` | Các tag gắn trên đơn, ngăn bằng dấu phẩy. Dùng để biết đơn thuộc Trang / kênh / team nào. | Bắt buộc | `GET /admin/orders.json → orders[].tags` | Đã xác nhận |

Cách gọi Sapo: mọi lệnh **GET** gọi vào `https://<tên cửa hàng>.mysapo.net` (cửa hàng thật: `vienchibao.mysapo.net`), xác thực HTTP Basic bằng API Key : Secret Key của Private App; danh sách có phân trang (`page`, `limit` tối đa 250); giới hạn ~2 request/giây (vượt thì lỗi 429). Chỉ đọc, không ghi lên Sapo. Endpoint của mỗi trường đã xác nhận qua code từng chạy thật, trừ ô ghi "Tech xác nhận".

Các trường **[CHƯA XÁC NHẬN]** (tên trường thật trên Sapo chưa kiểm tra): `created_on` của **sản phẩm** (hàng mới/cũ), `product_status` (xem mục 6). `created_on` của **đơn** thì đã xác nhận.

Ghi chú về định dạng Sapo đã xác nhận:
- Thời điểm trả về dạng ISO 8601, **giờ UTC** (không phải +07:00) → quy về giờ Việt Nam khi đếm theo ngày.
- Đơn: `id` (số, làm khoá) và `name` (mã hiển thị, vd `HK88069`).
- `status` của đơn chỉ có `open` / `closed` / `cancelled` (không có `completed`).
- `source_name` thật: facebook, tiktokshop, pos, tiktok-for-business, web, shopee, zalo, admin/Admin, zalo-oa, BAO-HANH, tiktok-personal, instagram, facebook_shopping, other.
- `tags` của đơn: chuỗi ngăn bởi dấu phẩy; có dấu tiếng Việt, khoảng trắng, hoa/thường — **giữ nguyên văn**. Dạng thật: `page_id_<số>`, `channel_user_id_<số>`, `post_id_t_<số>`, `page_<tên Page>`, `tiktok_business_<tên có khoảng trắng>`, `tiktok_business_id_<chuỗi chữ-số, KHÔNG phải số thuần>`, `Tiktok_<tên shop>`, `Shopee_<tên shop>`, `ChatOmniAI`, `COD`... Không thấy tag dạng `K###` (mã nhân sự K301 là hashtag video, không phải tag đơn) và không thấy tag chỉ gồm số.
- Mô hình dữ liệu Sapo: một **product** có nhiều **variant**; `sku` ở mức variant. Trong DB đơn hàng, 837 product có từ 2 SKU trở lên (nhiều nhất 21).

## 3. API tồn kho Tech đã có: `aged-inventory`

`GET https://aged-inventory.fastapicloud.dev/aged-inventory` — tham số `start_date`, `end_date` (YYYY-MM-DD), `sku`. Trả `snapshot_start_date`, `snapshot_end_date`, `count`, `total_on_hand`, `items[]`. Mỗi item: `sku`, `product_name`, `on_hand`, `start_date`, `end_date`, `days_in_stock`, `locations[]` (`location_id` nội bộ Tech, `location_name`, `sapo_location_id`, `on_hand`, `available`).

### 3.1 Thay được gì (đề xuất, chưa chốt việc dùng toàn bộ)

| Cần theo đặc tả | Trường API | Ghi chú |
|---|---|---|
| `variant_id` (mọi nhóm) | `sku` | dùng `sku` làm khoá nối; `product_id` bỏ được |
| tồn theo kho | `locations[].on_hand` | tổng = `items[].on_hand` |
| mã kho | `locations[].sapo_location_id` (chuỗi) | **không** dùng `location_id` của API (mã nội bộ Tech) |
| tên kho | `locations[].location_name` | |
| tên sản phẩm | `product_name` | tên gốc không kèm màu; **chỉ có cho mã còn tồn** |
| tuổi tồn | `start_date`, `days_in_stock` | xem 3.3 |

Vẫn phải yêu cầu Tech thêm: danh mục hàng hoá cho **cả mã hết tồn** (`sku`, `product_type`, `image.src`, `created_on`, tên); toàn bộ **nhóm đơn bán** (`id`, `created_on`, `status` + `test`, `sku`, `quantity`, `source_name`, `tags`).

### 3.2 Kết quả gọi thử (23/10/2026) [ĐÃ XÁC NHẬN]

- Chỉ có **một** snapshot: 2026-10-17 → 1.754 mã, tổng tồn 12.950, **12 kho**. Gọi các ngày 10/10, 16/10, 18/10, 20/10, 22/10, 23/10 đều 0 dòng (API tạm dừng).
- Chỉ trả mã `on_hand > 0` → SPU hết hàng **không có dòng**; không có tên/ảnh cho chúng.
- Tổng `on_hand` các kho khớp `on_hand` của mã (0 mã lệch).
- **Lệch với hệ thống quản lý đơn hàng** (dữ liệu đồng bộ tới 18/10): hệ thống đơn hàng có **15 kho** còn tồn, ~24.374 chiếc / 1.976 mã. API thiếu: Vân Phong Các VAT (776), Kho Đồ Da (454), (Cũ) Kho TT VAT (8). Riêng Kho trung tâm (SSC): API 1.643 chiếc / 646 mã, hệ thống đơn hàng 5.983 chiếc / 471 mã. **Chưa biết bên nào đúng** — cần đối chiếu với Tech.
- Danh sách kho Sapo thật (16 kho, 14 đang hoạt động) gồm cả kho không bán trực tiếp: "Kho hàng Chờ xử lý", "Kho Hàng Mượn Live", "Media mượn", "Kho Chế tác-Mẫu". **Cần chốt kho nào tính vào "Tồn kho"** (chưa chốt).

### 3.3 Định nghĩa `start_date` [ĐÃ XÁC NHẬN bằng thử nghiệm]

`start_date` = **tuổi tồn theo FIFO**: lùi từ phiếu nhập NCC (`receive_inventories`, đã nhận) mới nhất, cộng dồn số lượng cho tới khi đủ số đang tồn; ngày của phiếu đó là `start_date` (ngày của lô cũ nhất còn hàng). Phiếu chuyển kho không tính. Nếu các phiếu không đủ số tồn (hàng nhập trước khi bắt đầu ghi dữ liệu) thì `start_date` = **2025-09-08 hoặc 2025-09-09** (mốc đầu dữ liệu).

Cách kiểm chứng: mẫu ngẫu nhiên 45 mã; dựng lại FIFO từ dữ liệu phiếu nhập trong DB đơn hàng. 25/25 mã có phiếu khớp đúng FIFO ("ngày nhập NCC mới nhất" chỉ khớp 23/25, sai ở D0007-00-S-WH và N0006-11-S-WH); 20/20 mã không có phiếu đều đúng bằng mốc 2025-09-08/09. (Một suy đoán ban đầu "ngày bắt đầu có tồn liên tục" đã bị bác bỏ.)

Hệ quả:
- **555/1.754 mã** (4.255/12.950 chiếc, 33% lượng tồn) có `start_date` đúng mốc sàn → tuổi thật chỉ biết **≥ ~409 ngày**. Đừng hiển thị như ngày nhập thật.
- `start_date` chỉ theo **mã**, không theo **kho**: bộ lọc "Kho" cho tồn theo kho nhưng tuổi là của cả mã.
- Tuổi là của **lô cũ nhất**: một mã tồn 50 mà còn 1 chiếc lô cũ vẫn bị tính tuổi lô cũ. Vì vậy "Tồn xấu" nên đối chiếu thêm tỉ lệ bán/tồn (logic hiện có trong `spu-tracking.ts` đã có điều kiện `ratio`).
- "Ngày nhập gần nhất" **không** dùng được cho tuổi tồn: nhập bù 1–2 chiếc làm cả đống hàng cũ trông như mới (vd N0006-11-S-WH tồn 26: 2 chiếc nhập 26/09, 22 chiếc nhập 31/05, 2 chiếc nhập 26/05 → "gần nhất" cho 21 ngày trong khi 24/26 chiếc đã tồn 139–144 ngày).
- Hàng khách hoàn trả có cộng vào FIFO của API hay không: **[CHƯA XÁC NHẬN]** (mẫu kiểm chứng không có phiếu hoàn); quyết định của người dùng là không tính.

## 4. Quy tắc tính cho bảng "Theo dõi SPU"

| Cột / chức năng | Cách tính |
|---|---|
| Mã SPU, "x mã con" | cắt `sku` trước dấu `-` đầu tiên; mã con = số SKU. **Cảnh báo:** trong DB đơn hàng, 8 `product_id` có các SKU mang ≥ 2 giá trị `masp` khác nhau (vd `L0039` và `L0039-00-S-YL`) — cách đặt mã sản phẩm chưa nhất quán, nên không tin tuyệt đối vào cách cắt chuỗi; SKU cũ không theo dạng 3 dấu gạch (vd `D000650`, `N100930-8`). |
| Tồn kho (+ lọc Kho) | cộng `on_hand` của các mã theo kho đang lọc |
| Thời gian tồn / Tồn xấu | bình quân gia quyền theo số lượng tồn (quyết định 8); kèm tuổi mã cũ nhất; cờ "mốc sàn" |
| Bán 30 ngày | quyết định 3 |
| Hàng đang về | quyết định 5 (ngoài đặc tả Sapo) |
| Nhóm hàng (bộ lọc) | ánh xạ từ `product_type` (vd `NHẪN >> Vàng`) sang 8 nhóm — bảng ánh xạ do R&D lập |
| Hàng mới / cũ (Win) | `created_on` của sản phẩm — **không** dùng `product_stock.created_at` của dự án đơn hàng (đó là ngày hệ thống nhập SKU, 14.808/16.031 dòng cùng nhập 07/2026) |
| Kênh nào bán bao nhiêu (trang khác) | R&D tự tách `order.tags` + `source_name` |

## 5. Hiện trạng code fb-traffic (đã đọc) và hướng điều chỉnh

Mức độ đã đọc (chưa đọc toàn bộ repo): `src/lib/commercial-eval.ts` (80 dòng đầu), `src/lib/spu-tracking.ts` và `src/lib/sales-api.ts` (qua tìm kiếm từ khoá), nội dung migration `038_inventory_stock.sql` và đoạn `011_v2_schema.sql` (có trong phiên làm việc). **Chưa đọc** `inventory-import.ts`, `spu-win.ts`, các trang `/spu`.

- Trang `/spu` hiện dùng **dữ liệu demo** (`inventory-demo.ts`), chưa nối dữ liệu thật. `SpuRow` cần: `code`, `name`, `group`, `variants`, `stockBy`, `incoming`, `ageDays`, `sold30`.
- `sales.inventory_stock` hiện có `(code, warehouse, stock, last_in_date)`, nhập từ file Excel/CSV và coi `code` = mã SPU (cho phép đuôi biến thể). API Tech trả theo **sku × kho**, nên cần bảng cấp sku (hoặc gộp khi nhập) và cột tuổi (`start_date`) thay cho `last_in_date`; gộp tuổi theo quyết định 8.
- `sales.daily_sales` đã có `qty_returned`, doanh thu, giá vốn và được các trang đánh giá Win / thương mại hoá / bàn giao dùng. Quyết định 3 (bán không trừ hoàn) áp dụng cho **cột "Bán 30 ngày" của bảng Theo dõi SPU**; **chưa** quyết định có đổi các trang kia hay không → **đừng tự đổi** cách tính ở các trang đó.
- `sales.catalog` (`code, name, image_url, base_masp, first_seen_at`): chú thích migration ghi `first_seen_at` "tin được từ 2026-08" → **suy luận** (chưa xác nhận) là ngày hệ thống nhập SKU chứ không phải ngày tạo trên Sapo (xem bảng mục 4); cần nguồn `created_on` thật của Sapo.
- Chưa sửa code nào trong fb-traffic từ các trao đổi này.

## 6. Việc còn mở

1. **`product_status`** (lọc "chỉ SPU đang kinh doanh"): trường này do bản đặc tả ban đầu tự đề xuất, **không có bằng chứng Sapo có trường này**. Shop thực tế đánh dấu ngừng bán bằng **tiền tố tên**: "(Dừng bán)"/"(Dừng nhập)" 7.499/16.031 SKU, "(HỦY)" 261, "(BHDB)" 686, "(CHẾ TÁC)" 3.261 — nhưng 422 SKU mang tiền tố Dừng bán/Dừng nhập vẫn có bán trong 90 ngày gần nhất. Đề xuất (chưa được người dùng duyệt): coi là đang kinh doanh khi **còn tồn hoặc có bán trong 90 ngày**. API tồn kho đã tự chỉ trả mã còn tồn.
2. Chốt kho nào tính vào "Tồn kho"; hỏi Tech 3 kho thiếu và chênh lệch số tồn (3.2).
3. Chờ API hoạt động lại; khi đó cần **snapshot mỗi ngày**.
4. Yêu cầu Tech: danh mục hàng hoá cho cả mã hết tồn; nhóm đơn bán (3.1).
5. Danh sách lô còn hàng theo mã (ngày nhập + số lượng còn lại) để tính tuổi theo số lượng — **để sau**, hiện tạm dùng `start_date`.
6. Tên trường thật trên Sapo của `created_on` sản phẩm cần Tech xác nhận.

## 7. File liên quan (thư mục `docs/` của fb-traffic)

- `dac-ta-du-lieu-spu-traffic.xlsx` / `.pdf`: bản đặc tả **gốc** (chưa sửa; có các trường không tồn tại trên Sapo — đừng dùng làm chuẩn).
- `dac-ta-du-lieu-spu-traffic-doi-chieu-sapo.xlsx`: bản **đã đối chiếu và sửa**; các sheet: Hướng dẫn, Rút gọn (đề xuất), Đối chiếu API có sẵn, Hàng hoá & Kho, Đã loại bỏ, Traffic (không đổi), Quy tắc gộp SPU, Từ điển giá trị.
- `HANDOFF-dac-ta-du-lieu-sapo.md`: tài liệu này.

## 8. Lưu ý cho phiên nhận

- Không suy đoán các trường **[CHƯA XÁC NHẬN]**; nếu cần, hỏi người dùng hoặc Tech.
- Không dùng số liệu API làm số liệu thật cho đến khi API hoạt động lại và Tech giải thích chênh lệch kho/tổng tồn.
- Sheet "Traffic" (Facebook/TikTok) không thuộc phạm vi đối chiếu Sapo và **chưa được rà soát**.
