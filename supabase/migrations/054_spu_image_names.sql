-- 054: Lưu thêm TÊN SẢN PHẨM theo SPU (đọc từ file Sapo "Xuất danh sách sản phẩm", cùng lần nhập ảnh ở Cài đặt → Ảnh sản phẩm). CHẠY TAY trong Supabase SQL Editor, SAU 049. Chạy lại vẫn an toàn.
--  • name = tên sản phẩm Sapo của SKU gốc (mã = SPU, rồi "-00…"), không kèm size → dùng thay cho tên trong sales.catalog (đồng bộ từ Qlydonhang, bị gộp theo mã).
--  • image_url cho phép trống: SPU có tên nhưng chưa có ảnh vẫn được lưu.
--  • Sau khi chạy: nhập lại file danh sách sản phẩm (Cài đặt → Ảnh sản phẩm) để tên được ghi.

alter table sales.spu_images add column if not exists name text;
alter table sales.spu_images alter column image_url drop not null;

notify pgrst, 'reload schema';
