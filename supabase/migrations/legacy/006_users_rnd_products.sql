-- 006_users_rnd_products: tài khoản + vai trò, sản phẩm R&D, kho ảnh
-- Chạy trên project fb-traffic. Chạy lại nhiều lần vẫn an toàn.

-- ---------- Người dùng & vai trò ----------
-- Tài khoản đăng nhập nằm ở auth.users (Supabase Auth); bảng này giữ tên + vai trò.
--   admin   = Quản lý: mọi thứ + cài KPI + quản lý tài khoản + xem giá vốn/lợi nhuận
--   rnd     = R&D: nhập mẫu, tạo phiên test, xác nhận kết quả
--   saobien = Sao Biển: xem mẫu WIN đã xác nhận, mở Source, báo tiếp nhận
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text not null,
  role       text not null check (role in ('admin', 'rnd', 'saobien')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table profiles enable row level security;

-- ---------- Sản phẩm R&D ----------
create table if not exists rnd_products (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,                -- mã mẫu dùng làm hashtag, VD 'RD001' hoặc 'D0123' (chữ HOA)
  sapo_code    text,                                -- mã mẫu trên Sapo nếu khác code (để nối số bán)
  name         text not null,
  line         text,                                -- line sản phẩm
  category     text,                                -- loại: nhẫn, dây chuyền, bông tai...
  material     text,                                -- chất liệu
  stone        text,                                -- đá
  size         text,
  description  text,
  image_paths  text[] not null default '{}',        -- đường dẫn trong bucket rnd-images
  source_url   text,                                -- link kho Source quay chế tác
  status       text not null default 'researching'
               check (status in ('researching', 'testing', 'ended')),
  created_by   uuid references profiles(id),
  updated_by   uuid references profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint rnd_products_code_format check (code ~ '^[A-Z]{1,4}[0-9]{3,}$')
);
create index if not exists rnd_products_status_idx on rnd_products (status);
alter table rnd_products enable row level security;

-- Lịch sử thay đổi (ai sửa gì, lúc nào)
create table if not exists rnd_product_history (
  id          bigint generated always as identity primary key,
  product_id  uuid not null references rnd_products(id) on delete cascade,
  actor_id    uuid references profiles(id),
  action      text not null,          -- created / updated / status_changed ...
  changes     jsonb,                  -- {field: [cũ, mới]}
  created_at  timestamptz not null default now()
);
create index if not exists rnd_product_history_product_idx on rnd_product_history (product_id, created_at desc);
alter table rnd_product_history enable row level security;

-- ---------- Kho ảnh (private, đọc qua signed URL do server cấp) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rnd-images', 'rnd-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

notify pgrst, 'reload schema';
