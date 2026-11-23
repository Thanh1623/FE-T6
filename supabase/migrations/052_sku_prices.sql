-- 052: Lưu GIÁ VỐN và GIÁ BÁN của từng SKU (đọc từ file tồn kho Sapo nếu file có các cột này). CHẠY TAY trong Supabase SQL Editor, SAU 051. Chạy lại vẫn an toàn.
--  • cost_price = giá vốn, sale_price = giá bán (đồng, số nguyên). null = file chưa có cột / ô trống.
--  • LƯU Ý: migration 028 đã bỏ mọi số tiền khỏi dữ liệu BÁN HÀNG (doanh thu, giá vốn từng đơn). Hai cột này là giá NIÊM YẾT theo SKU, không phải tiền của từng đơn;
--    giá vốn là thông tin nhạy cảm → chỉ đọc bằng service role qua server, khi hiển thị phải ẩn theo quyền (canSeeProfit).
--  • Sau khi chạy: NHẬP LẠI file tồn kho (nút "Nhập tồn kho") để giá được ghi.

alter table sales.inventory_skus add column if not exists cost_price bigint;
alter table sales.inventory_skus add column if not exists sale_price bigint;
comment on column sales.inventory_skus.cost_price is 'Giá vốn của SKU (đ) — nhạy cảm, chỉ hiển thị cho người có quyền xem giá vốn';
comment on column sales.inventory_skus.sale_price is 'Giá bán niêm yết của SKU (đ)';

notify pgrst, 'reload schema';
