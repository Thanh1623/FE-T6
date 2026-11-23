-- 005_product_catalog: tên + ảnh đại diện của mã mẫu, đồng bộ từ Qlydonhang (product_stock).
-- Chạy trên project fb-traffic. Chạy lại nhiều lần vẫn an toàn.
-- Khoá product_code = mã mẫu (VD 'D0008') — cũng là khoá để nối hệ thống R&D sau này
-- (product_research.ma_sp / research_pipeline.lifecycle_sku bên Qlydonhang).

create table if not exists products (
  product_code text primary key,
  name         text not null,
  image_url    text,
  base_masp    text,                -- masp được chọn làm đại diện, VD 'D0008-00-S-WH'
  updated_at   timestamptz not null default now()
);
alter table products enable row level security;
