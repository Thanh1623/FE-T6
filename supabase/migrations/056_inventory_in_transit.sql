-- 056: Lưu cột "Đang giao dịch" của file Sapo (hàng đã bán, chưa giao xong) theo từng SKU × KHO (chi nhánh). CHẠY TAY trong Supabase SQL Editor. Chạy lại vẫn an toàn.
--  • Tồn kho (stock), Có thể bán (available), Đang về (incoming) và Đang giao dịch (in_transit) đều lưu theo từng kho — nhập từ file "Xuất danh sách sản phẩm" kèm tồn kho.
--  • Sau khi chạy: nhập lại file tồn kho (nút "Nhập tồn kho") để cột được ghi.

alter table sales.inventory_stock add column if not exists in_transit integer not null default 0;
comment on column sales.inventory_stock.in_transit is 'Đang giao dịch (Sapo): hàng đã bán, chưa giao xong, của kho này';

notify pgrst, 'reload schema';
