-- 044: Tên sản phẩm của SKU trong danh sách SKU tồn kho (để phân nhóm hàng theo tên: Nhẫn / Dây chuyền / Lắc tay…). CHẠY TAY trong Supabase SQL Editor, SAU 043. Chạy lại vẫn an toàn.
--  • name = cột "Sản phẩm" của file Sapo "Quản lý kho phiên bản sản phẩm" (tên của SKU). Chưa có cột này thì trang Theo dõi SPU lấy tên từ danh mục Sapo (sales.catalog) và phân nhóm theo tiền tố mã.

alter table sales.inventory_skus add column if not exists name text;

notify pgrst, 'reload schema';
