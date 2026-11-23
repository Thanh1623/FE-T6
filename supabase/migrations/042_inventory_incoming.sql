-- 042: Cột "Hàng đang về" cho tồn kho nhập từ file Sapo "Quản lý kho phiên bản sản phẩm". CHẠY TAY trong Supabase SQL Editor, SAU 041. Chạy lại vẫn an toàn.
--  • incoming = tổng cột "Đang về kho" của các SKU thuộc SPU, theo từng kho (file Sapo có 16 kho × 5 cột: Tồn kho · Có thể bán · Đang giao dịch · Đang về kho · Đang đóng gói).
--  • Nếu bạn đã chạy bản cũ của 041 (có ràng buộc "code phải là mã SPU"), lệnh dưới gỡ ràng buộc đó để lưu cả mã khác SPU (vd MATRUNGGIANBAC của hàng chế tác).

alter table sales.inventory_stock
  add column if not exists incoming integer not null default 0 check (incoming >= 0);   -- hàng đã đặt, chưa nhập kho (Đang về kho)
comment on column sales.inventory_stock.incoming is 'Tổng "Đang về kho" của các SKU thuộc SPU, theo kho';

alter table if exists sales.imported_order_lines drop constraint if exists imported_order_lines_code_check;

-- Tồn kho lấy cả mã không phải SPU thuần (hàng chế tác, phụ kiện… vd MM03, N600100 0, C500021) để thống kê về sau → gỡ ràng buộc dạng mã của bảng tồn kho
alter table sales.inventory_stock drop constraint if exists inventory_stock_code_check;

notify pgrst, 'reload schema';
