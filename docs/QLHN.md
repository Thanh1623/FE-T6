# QLHH (trước đây QLHN) — báo cáo theo team (`/qlhn`)

Trang cho **Quản lý (admin)** xem mọi team và **Trưởng nhóm** (có team) xem team của mình (không chọn được team khác); **giá vốn / giá bán và lợi nhuận chỉ Quản lý** thấy. Mỗi lần mở là báo cáo của MỘT team (mặc định Hồng Ngọc, đổi ở bộ lọc Team) trong khoảng ngày của bộ lọc chung (FilterBar).
Có 2 tab: **Dashboard** (số tổng + biểu đồ) và **Bảng chi tiết** (`#chi-tiet`).

## Bố cục (mỗi chỉ số chỉ xuất hiện một lần, bấm vào thì tới đúng bảng ở tab chi tiết)
Dashboard: **Kết quả bán hàng** (thẻ Đơn hàng + biểu đồ theo ngày, theo bộ lọc ngày) → **Cần xử lý hôm nay** (4 thẻ: bán chạy thiếu hàng · chưa giao quá 7 ngày · team order chưa về · SPU tồn xấu cần đẩy) → **Sức khỏe hàng hóa và Media** (SPU team đã bán theo phân loại tồn kho của công ty, SPU mới đã lên video, SPU win / SP test) → **Bán chạy và hàng về** (Top 15 có bục top 3, hàng về / sắp về) → **Cơ cấu và giá vốn** (cơ cấu theo loại, cơ cấu SPU mới / cũ, giá vốn / giá bán). Không có biểu đồ trạng thái đơn Sapo (không nói hàng đã giao chưa) và tỷ lệ giao theo nhân viên (đã có ở bảng Đơn hàng theo nhân viên).
Tab chi tiết theo mức ưu tiên: DS đơn hàng · Thống kê SPU · Bán chạy thiếu hàng · Chưa giao · Đơn chế tác · Team đang order · Cần đẩy · Theo nhân viên · SPU win, SP test · Giá vốn / giá bán. Ba bảng danh sách (đơn hàng, SPU, win) có nút lọc, tìm, bấm tên cột để sắp xếp, phân trang (`Lists.tsx`).

## Nguồn số liệu
| Phần | Nguồn |
|---|---|
| Đơn, giao hàng, theo nhân viên, theo ngày | `sales.tr_orders` ← `sales.imported_order_lines` (nhân viên thuộc team trong `sales.staff_teams`) |
| Chưa giao, SPU khách đặt thiếu hàng, đơn chế tác | `sales.tr_current` (đơn đặt từ đầu khoảng ngày đang lọc mà chưa giao) |
| Cơ cấu loại sản phẩm, SPU mới / cũ | `sales.tr_mix` (viết lại ở 071) ← `tr_lines` + `sales.spu_summary` + `rnd.evaluations` |
| Sức khỏe SPU, thiếu hàng, cần đẩy, video | `sales.tr_spu` ← `sales.spu_summary`, `sales.spu_video_daily` |
| SP test / SP win | `sales.tr_test` ← `rnd.products` (mã test do người dùng tạo, `team_id`) + `rnd.evaluations` |
| Giá vốn / giá bán | `sales.tr_cost` ← `sales.inventory_skus.cost_price` (giá vốn HIỆN TẠI của SKU) |
| DS đơn hàng (trạng thái đã giao / còn hàng chưa giao / thiếu hàng / đang chế tác) | `sales.tr_order_list` (071) ← `tr_lines` + tồn từng SKU `sales.inventory_stock` |
| Thống kê SPU team bán (bán, đã giao, video), Top 15 | `sales.tr_spu_list`, `sales.tr_top` (071) ← `tr_lines` + `spu_summary` |
| SPU mới đã lên video, SPU win, SPU mới chưa video | `sales.tr_media` (071) ← `rnd.evaluations` + `sales.spu_video_daily` |
| Hàng team đang order, PO đã order theo SPU, hàng về / sắp về | Qlydonhang (chỉ đọc): `stock_order_requests`, `stock_order_request_items`, `purchase_orders`, `po_items`, `po_receipts`, `po_receipt_items` |

Hàm SQL ở `supabase/migrations/067_team_report.sql`, `068_team_report_current_since.sql` (số chưa giao theo khoảng ngày) và `069_team_report_extra.sql` (phiếu nhập hôm nay, giờ cập nhật) `070_craft_orders.sql` (ghi nhớ đơn chế tác) `071_team_report_lists.sql` (các danh sách, Top 15, Media) và `072_team_report_perf.sql` (tăng tốc `tr_lines`: bỏ nhãn ADS bằng biểu thức chính quy, thêm chỉ mục ngày đặt giờ Việt Nam; 1,6 giây → 0,28 giây mỗi lần gọi, kết quả y hệt) và `073_system_logs.sql` (nhật ký hệ thống, xem docs/NHAT-KY-HE-THONG.md) và `074_team_report_cost_orders.sql` (thêm số đơn vào giá vốn / giá bán) và `075_team_report_daily_series.sql` (chuỗi theo ngày cho biểu đồ xu hướng nhỏ của thẻ Đơn hàng) — **chạy tay** trong Supabase SQL Editor theo thứ tự, sau 066, mỗi file MỘT LẦN (không chạy lại 067 sau khi đã chạy 070: lỗi 42P13 vì 070 đổi cột của `tr_lines`; chỉ 071 chạy lại được khi có thay đổi); chưa chạy đủ thì trang báo thiếu migration. Code đọc ở `src/lib/team-report.ts`, trang ở `src/app/(dash)/qlhn/`.

**Giao diện = bản mẫu HTML:** `qlhn.css` là bản sao CSS của bản mẫu (phạm vi `.qlhn`, chỉ nền sáng), markup trong `page.tsx` dùng đúng tên lớp của bản mẫu. Biểu đồ dùng SVG vẽ theo bề rộng thật (`Charts.tsx`), tab Dashboard / Bảng chi tiết chuyển trong trình duyệt (`Tabs.tsx`). Mặc định khoảng ngày là "Tháng này" (từ ngày 1 tới hôm nay).

## Quy tắc tính (đã đối chiếu với file Sapo xuất ngày 30/10/2026)
- Đơn của team = nhân viên phụ trách thuộc team; bỏ đơn kênh ADS (cùng `ADS_TAGS` ở `lib/spu-data.ts`) và đơn thử `RD*`. Ngày theo giờ Việt Nam.
- Sản phẩm = số lượng dòng giá > 0 của đơn không huỷ. **Không trừ hoàn**: dòng hoàn (SL = 0, có giá) tính 1 sản phẩm như quy tắc nhập file (`lib/sales-import.ts`); trừ hoàn như Sapo thì ít hơn vài sản phẩm.
- Chất liệu theo mã SKU: `-S-` bạc, `-G10/14/18/24-` vàng; thiếu thì theo tên; còn lại là phụ kiện, bảo hành.
- Giá vốn / giá bán, hai cách: **theo ngày giao hàng** (báo cáo tháng; dòng giao trong kỳ, kể cả đơn đặt tháng trước) và **theo ngày đặt hàng** (chuẩn P&L, số tạm thời vì đơn đặt cuối kỳ còn giao sau). Ô "Loại dòng có vốn lớn hơn giá bán" bỏ các đơn như khách gửi vàng cũ làm lại (giá bán đã trừ vàng cũ).
- SPU mới / cũ (migration **077**, hàm `sales.spu_age_class`): tính trên đơn hàng **toàn công ty**, không theo team. Tháng tính = tháng của ngày cuối kỳ lọc. Mã đổi từ mã cũ (`sales.spu_aliases`.new_code) = **cũ**; SPU tạo tháng trước hoặc tháng này (không phải mã đổi) đã có đơn (kể cả đơn tháng trước) = **mới**; tạo tháng này chưa có đơn nào = chưa phát sinh đơn (chưa bán nên không hiện ở báo cáo); tạo từ trước tháng trước hoặc không có dữ liệu đơn = **cũ**. "Tạo" = sớm nhất của ngày lên danh mục Sapo (chỉ tin từ 01/08/2026) và ngày nhập kho đầu. Đơn chế tác (bảng `sales.craft_orders`, mã trung gian, mã X9xxx) **không tính là đơn đầu tiên** của SPU và xếp vào nhóm "Chế tác" (cần chạy 070 trước 077). "SPU mới đã lên video" dùng cùng quy tắc.
- **Đơn chế tác** (migration 070): bảng `sales.craft_orders` ghi nhớ mọi đơn từng có mã trung gian MATRUNGGIANBAC / MATRUNGGIANVANG — trang Nhập số bán tự ghi thêm mỗi lần nhập (`spu/actions.ts`), phần nạp sẵn lấy từ file đơn không đổi mã (Book1.xlsx, 35 đơn Hồng Ngọc 01–30/10). Nhờ đó đơn chế tác đã xong, dòng đã đổi sang SPU thật, vẫn được nhận ra: tách thành **đang chế tác** (còn mã trung gian) · **xong, chưa giao** · **đã giao**; hàng có sẵn chưa giao không còn lẫn đơn chế tác. Đã đối chiếu 01–30/10: 22 đang chế tác (Bạc 12, Vàng 10), 2 xong chưa giao, 2 đã giao, 3 đơn huỷ, 6 đơn kênh ADS loại.
- Lệnh order của team bỏ yêu cầu đã **từ chối / huỷ** (vd yêu cầu K0006 bị từ chối vì "đã đặt" có SL còn lại 0, nếu tính vào sẽ thành "đã về đủ" sai).
- "Đã về" của lệnh order = đã nhập kho; hàng QC đã nhận nhưng phiếu còn nháp chỉ ghi chú, chưa trừ vào số còn thiếu.

## Hạn chế đã biết
- Giá vốn lấy giá vốn hiện tại của SKU, không phải giá vốn tại ngày bán; chưa trừ đơn hoàn. **Đã chốt giữ cách này** (31/10/2026): file đơn hàng Sapo không có giá vốn; giá vốn đến từ cột "Giá vốn" của file Sapo "Xuất danh sách sản phẩm" nhập ở trang Theo dõi đẩy hàng (`lib/inventory-parse.ts` → `sales.inventory_skus.cost_price`). Muốn số mới thì nhập lại file đó.
- Chưa có hạn sản xuất nên đơn chế tác quá hạn tính tạm mốc 14 ngày kể từ lúc đặt.
- Cache 5 phút (`TAG.spuData`), xoá khi đồng bộ / nhập file.

## Quy tắc của các danh sách mới (071)
- **Trạng thái dòng đơn**: đã có ngày giao → *Đã giao hàng*; chưa giao và còn mã trung gian MATRUNG* → *Đang chế tác*; chưa giao còn lại: so với tồn của SKU (tổng các kho), hàng cấp cho đơn đặt sớm trước → *Còn hàng, chưa giao* nếu đủ, *Thiếu hàng* nếu không đủ. Số ngày xử lý: đã giao = từ ngày đặt đến ngày giao; chưa giao = số ngày đã chờ tới hôm nay.
- **Thống kê SPU**: SL còn thiếu = bán − đã giao (cộng lại khớp "còn thiếu" của thẻ Đơn hàng). SL đã order = phần PO đang đặt chưa về của MỌI team (Qlydonhang), dự kiến về = ETA sớm nhất.
- **Top 15, thống kê SPU, cơ cấu loại và cơ cấu mới/cũ tính từ chính các dòng đơn** (cùng nguồn với thẻ Đơn hàng; cơ cấu gồm mọi dòng của đơn chế tác (đơn trong `craft_orders` hoặc còn mã MATRUNG*, kể cả đã chế tác xong): xếp vào loại "Khác" và nhóm "Chế tác" nên tổng bằng thẻ Đơn hàng và số sản phẩm chế tác khớp số đơn chế tác; nhóm Chế tác chỉ tách theo đơn, không theo mã SPU (SPU tên "(CHẾ TÁC)" bán ngoài đơn chế tác vẫn là cũ / mới theo đánh giá R&D); "SP bảo hành" là mã HANGBAOHANH (hàng bảo hành, không phải sản phẩm bán)). Lý do: bảng tổng hợp `spu_summary` / `spu_sales_daily` chỉ giữ 30 ngày gần nhất (`sales_from`), ngày 31/10 thì mất ngày 1/10 (40 sản phẩm của Hồng Ngọc) — bản cũ của `tr_mix` đọc bảng này nên cơ cấu chỉ ra 628 thay vì 691. Khối "Sức khỏe hàng hóa" vẫn dùng bảng tổng hợp vì cố ý là 30 ngày gần nhất.
- **SPU mới đã lên video** = SPU có đánh giá R&D `age = new` mà team bán trong khoảng ngày, và team đã có video (bất kỳ ngày). Số này ít hơn số SPU mới ở thẻ cơ cấu vì thẻ cơ cấu có thêm SPU xếp bổ sung.
- **SPU win** tính trên SPU team đăng video trong khoảng ngày (`win` / `win_traffic` / `fail` theo `rnd.evaluations.result`); SP test là các mã test của team (`tr_test`).
- **SPU team đã bán theo phân loại tồn kho** (4 ô như trang SPU: bán chạy, bán thường, bán chậm, tồn xấu): **số lớn = số sản phẩm team đã bán** trong khoảng ngày thuộc nhóm; dòng nhỏ = số SPU của team và số SPU của CẢ CÔNG TY cùng nhóm (theo tồn kho và SL bán 30 ngày (`sales.tr_company_class`, cùng công thức `saleFlags` và ngưỡng `loadSpuRules` chỉnh ở trang KPI nên khớp các thẻ cùng tên ở trang SPU); phần của team tính từ các dòng đơn, `tr_spu_list`, mỗi SPU xếp theo tồn và SL bán 30 ngày của cả công ty). Mã trung gian chế tác, HANGBAOHANH và mã không có trong tồn kho là "Chưa xếp", không tính vào phần của team. Bấm ô thì mở bảng Thống kê SPU với đúng bộ lọc.
- Ô "SPU tồn xấu cần đẩy" ở nhóm Cần xử lý hôm nay vẫn dùng quy tắc riêng của danh sách cần đẩy (tồn từ 30, bán 30 ngày không quá 15), khác "Tồn xấu" ở trên (bán 30 ngày = 0).
- **So sánh với kỳ trước ở thẻ Đơn hàng.** Kỳ trước = khoảng liền trước, cùng độ dài kỳ đang lọc; hai kỳ tính cùng một hàm (`tr_orders`) theo ngày đặt hàng. Mũi tên "▲ +n (+x%)": xanh = diễn biến tốt, đỏ = xấu, xám = không đổi / chưa có kỳ trước. Chỉ so sánh những số **không phụ thuộc thời gian chờ giao**: **số đơn** (tăng là tốt) và **đơn hủy** (tăng là xấu, kèm đường xu hướng theo ngày từ `daily.c`, migration 075).
  - Các ô "giao trung bình / đã giao / chưa giao" **không có mũi tên so sánh**: chúng tính tại hôm nay nên kỳ trước (đã có thêm hơn 30 ngày để giao) luôn trông "giao nhiều hơn, nhanh hơn" kỳ này; giao trung bình chỉ tính đơn đã giao nên kỳ mới luôn thấp giả tạo.
- **Win của team** (ô SPU win bán hàng / win traffic / chưa đạt và bảng SPU win và SP test): chấm lại từng SPU team đăng video trong kỳ bằng ĐÚNG bộ KPI Win và số ngày cửa sổ ở Cài đặt (`lib/team-win.ts`, số bán theo ngày từ `sales.tr_code_sales`, migration 076) nhưng CHỈ tính video của kênh thuộc team và đơn của nhân viên team. Trượt cửa sổ N ngày qua kỳ đang lọc: có cửa sổ đạt KPI bán → Win bán hàng; không thì có cửa sổ đạt KPI traffic → Win traffic; không đạt: video đầu của team cho SPU còn chưa đủ N ngày → Đang test, ngược lại Chưa đạt. Khác bộ máy R&D (`lib/eval/engine.ts`: chỉ xét N ngày sau video đầu của cả công ty và N ngày gần nhất tới hôm nay) nên có thể lệch kết quả công ty; bảng có cả hai cột. Số bán chưa trừ hoàn. Chưa chạy 076 hoặc lỗi thì bảng và ô dùng kết quả công ty.
  - **Từ 02/11/2026** "Win của team" cũng theo hai điều kiện Win Traffic như bộ máy đánh giá: SP test (mã T, mẫu R&D P0–P5) cần lượt xem ≥ ngưỡng KPI Traffic (50.000) trong N ngày; SP đang bán cần ≥ 100.000 lượt xem trong 3 ngày (cửa sổ trượt trong kỳ). Xem `docs/DAC-TA-HE-THONG.md` mục 4.4.

## Tab "Doanh thu" trong thẻ "Cơ cấu SPU mới và cũ" (migration 078, chỉ Quản lý)
- Thẻ có hai tab ngay trong thẻ: **Sản phẩm bán** (số sản phẩm, tỷ trọng, số SPU) và **Doanh thu** (cột Nhóm · Doanh thu · Tỷ trọng; vòng tròn theo doanh thu). Nhóm theo quy tắc 077: SPU cũ · SPU mới · Chế tác · SP bảo hành.
- Doanh thu = giá × số lượng của đơn **đặt trong kỳ**, bỏ đơn hủy và dòng giá 0, chưa trừ hoàn — cùng phạm vi với số sản phẩm bán. Hàm `sales.tr_revenue_mix(p_team, p_from, p_to, p_by)`; chưa chạy 078 thì tab Doanh thu ẩn.

## Dòng cũ còn sót của đơn (migration 079)
- Mỗi lần nhập file đơn hàng ghi đè `updated_at` của mọi dòng trong file; dòng cùng đơn có `updated_at` cũ hơn là dòng đã bị bỏ / đổi SKU (vd đơn chế tác xong: MATRUNGGIANVANG đổi thành D0001-C010). Bước dọn của lần nhập có thể không chạy hết khi DB bận nên `sales.tr_lines` (079) bỏ qua các dòng đó: không còn tính trùng (HK114747 15,63 tr). Doanh thu chế tác tháng 10 của team Hồng Ngọc: **531.980.000đ** (26 đơn), đã đối chiếu với bảng chế tác của Quản lý.

## Điều chỉnh đơn thủ công (migration 080, bảng `sales.order_adjust`)
- `kind = 'exclude'`: đơn bị loại khỏi mọi báo cáo QLHH (vd HK109539 / D9025: đổi chi nhánh nên lên lại đơn 01/10, thực chất đơn chốt tháng 9). `kind = 'warranty'`: đơn bảo hành, xếp nhóm "SP bảo hành" (vd HK116819 / N9211), không tính mới / cũ / chế tác. Thêm đơn mới bằng `insert into sales.order_adjust (order_id, kind, note) values (...)`.
- **Chế tác = đúng các đơn chế tác** (bảng `sales.craft_orders` + dòng mã trung gian), không xét mã X9xxx. Tháng 10 team Hồng Ngọc: 26 đơn, 531.980.000đ.

## Bảng 3 — Tồn kho và đẩy hàng theo team (migration 085, tab Bảng chi tiết)
- Thay cho 3 bảng cũ **SPU bán chạy cần bổ sung hàng**, **SPU khách đã đặt nhưng thiếu hàng để giao** và **Danh sách cần đẩy hôm nay** (đã bỏ; các thẻ "Cần xử lý hôm nay" trỏ sang bảng mới / bảng DS đơn hàng).
- Gốc dữ liệu: MỌI SPU đang tồn kho (tồn > 0, bỏ SPU công cụ dụng cụ trong `sales.spu_excluded`), không lấy từ danh sách đã bán. Nguồn `sales.tr_push(from, to)` (bảng tổng hợp SPU + video / bán theo team).
- Thẻ tổng quan, 5 tab (Tất cả · Chưa đẩy · Đẩy chưa hiệu quả · Bán chậm · Tồn xấu), ô lọc Team (chọn team thì video / bán / "chưa đẩy" tính theo team đó). Phân loại theo tồn + SL bán 30 ngày cả công ty (ngưỡng trang KPI).
- Ưu tiên: tồn xấu = Cao nếu tồn ≥ 30 hoặc tồn ≥ 90 ngày, còn lại Trung bình; chưa team nào đăng video = Cao nếu tồn ≥ 50, còn lại Trung bình; đã đẩy nhưng bán chậm = Trung bình; đang đẩy và bán ổn / tốt = Thấp.
- Ma trận team của từng SPU: video, lượt xem, SL bán, đánh giá (Đang đẩy: bán ≥ số video · Cần cải thiện · Chưa đẩy · Có bán, chưa đăng video).
- **Yêu cầu đẩy hàng** (`sales.push_requests`): Quản lý giao SPU cho team (ưu tiên, số video mục tiêu, hạn, ghi chú); trạng thái Chưa triển khai → Đang triển khai → Đã hoàn thành. Hoàn thành chỉ xác nhận được khi số video THỰC TẾ team đã đăng cho SPU từ ngày giao việc ≥ mục tiêu (`sales.tr_push_requests`). Trưởng team cập nhật trạng thái yêu cầu của team mình; chỉ Quản lý tạo / xoá.

- Đã bỏ bảng **Đơn hàng theo nhân viên** khỏi tab Bảng chi tiết. Bảng 3 và bảng Yêu cầu đẩy hàng sắp xếp được theo cột (bấm tiêu đề; số lớn → nhỏ, chữ A → Z, bấm lại đảo chiều); DS đơn hàng, Thống kê SPU và SPU win đã sắp xếp được từ trước.
