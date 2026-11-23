-- 053: Lưu NGÀY GIAO HÀNG THÀNH CÔNG của từng dòng đơn nhập từ file (cột "Ngày giao hàng thành công" của file "Danh sách chi tiết đơn hàng"). CHẠY TAY trong Supabase SQL Editor, SAU 052. Chạy lại vẫn an toàn.
--  • delivered_at = thời điểm giao thành công (giờ VN, lưu timestamptz). null = chưa giao thành công / dòng nhập từ file cũ chưa có cột này.
--  • Dùng cho báo cáo "đơn giao thành công trong kỳ" (vd tỷ lệ giá vốn / giá bán các đơn đã giao) — tách biệt với ordered_at (ngày đặt).
--  • Sau khi chạy: NHẬP LẠI file đơn hàng (nút "Nhập số bán", file có cột "Ngày giao hàng thành công") để các dòng cũ được ghi ngày giao.

alter table sales.imported_order_lines add column if not exists delivered_at timestamptz;
create index if not exists imported_order_lines_delivered_idx on sales.imported_order_lines (delivered_at) where delivered_at is not null;
comment on column sales.imported_order_lines.delivered_at is 'Ngày giao hàng thành công (file Sapo); null = chưa giao / chưa có dữ liệu';

notify pgrst, 'reload schema';
