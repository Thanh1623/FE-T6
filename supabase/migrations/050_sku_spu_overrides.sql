-- 050: Tách SPU bị gộp nhầm do đặt trùng mã. CHẠY TAY trong Supabase SQL Editor. Chạy lại vẫn an toàn.
--  • Ví dụ: SKU "N400622" (nhẫn trái tim hở, dừng bán) và "N400622-5…9" (nhẫn tàng hình) là 2 sản phẩm Sapo khác nhau nhưng cùng bị tách ra mã SPU N400622 (phần trước dấu "-") → gộp tồn / số bán / tên.
--  • Bảng này ghi: SKU nào thuộc SPU nào KHÁC mã mặc định (vd N400622-5 → N400622X). Được tạo tự động khi nhập file Sapo "Xuất danh sách sản phẩm" (Cài đặt → Ảnh sản phẩm):
--    SKU dạng "mã-số" thuộc sản phẩm Sapo khác với SKU mã trần (và tên khác) sẽ được tách thành SPU riêng = mã + "X".
--  • Khi nhập tồn kho / nhập số bán, SKU có trong bảng này lấy mã SPU từ đây thay vì cắt theo dấu "-".
--  • Chỉ ghi bằng service role (RLS bật, không mở policy cho client).

create table if not exists sales.sku_spu_overrides (
  sku        text primary key,
  spu_code   text not null,
  reason     text,
  updated_at timestamptz not null default now()
);
create index if not exists sku_spu_overrides_spu_idx on sales.sku_spu_overrides (spu_code);

alter table sales.sku_spu_overrides enable row level security;
grant all on sales.sku_spu_overrides to service_role;

notify pgrst, 'reload schema';
