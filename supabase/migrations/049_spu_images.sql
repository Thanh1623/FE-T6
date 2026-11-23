-- 049: Ảnh sản phẩm theo SPU do người dùng nhập từ file Excel (Cài đặt → Ảnh sản phẩm). CHẠY TAY trong Supabase SQL Editor. Chạy lại vẫn an toàn.
--  • Mỗi SPU một ảnh (link ảnh trong file Sapo "Xuất danh sách sản phẩm": cột Ảnh phiên bản / Ảnh đại diện — link CDN của Sapo).
--  • Ưu tiên HƠN ảnh trong sales.catalog (catalog bị ghi đè mỗi lần đồng bộ từ Qlydonhang, nên ảnh nhập tay không để trong catalog).
--  • Nhập lại file: SPU có trong file được thêm / cập nhật; SPU không có trong file giữ nguyên.
--  • Chỉ ghi bằng service role (RLS bật, không mở policy cho client).

create table if not exists sales.spu_images (
  code       text primary key,                 -- mã SPU (phần trước dấu "-" đầu tiên của SKU)
  image_url  text not null,
  sku        text,                             -- SKU của dòng được lấy ảnh
  updated_at timestamptz not null default now()
);

alter table sales.spu_images enable row level security;
grant all on sales.spu_images to service_role;

notify pgrst, 'reload schema';
