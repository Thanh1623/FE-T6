-- 051: Lưu cột "Có thể bán" của file tồn kho Sapo theo từng SKU × kho. CHẠY TAY trong Supabase SQL Editor, SAU 050. Chạy lại vẫn an toàn.
--  • Có thể bán = tồn kho − hàng đang giữ cho đơn chưa xuất; có thể ÂM (Sapo cho bán âm).
--  • null = chưa nhập lần nào có cột này → trang Theo dõi đẩy hàng hiện "—".
--  • Sau khi chạy: NHẬP LẠI file tồn kho (nút "Nhập tồn kho") để cột được ghi.

alter table sales.inventory_stock add column if not exists available integer;
comment on column sales.inventory_stock.available is 'Có thể bán (Sapo): tồn kho trừ hàng đang giữ cho đơn; có thể âm';

notify pgrst, 'reload schema';
