-- 035: Liên kết Mã SPU test (luồng Media, vd T10001) ↔ Mã SPU thương mại (Sapo, vd N0123). CHẠY TAY trong Supabase SQL Editor, SAU 034. Chạy lại vẫn an toàn.
--  • Luồng R&D vẫn dùng thẳng mã SPU (không đổi). Chỉ mẫu Media tự test mới cần bước "Gắn SPU" sau khi đạt kết quả.
--  • Mã test KHÔNG bị ghi đè: giữ nguyên làm mã của mẫu. Bảng này ghi mã SPU thương mại + ngày mở bán để:
--      - bài đăng gắn #SPU được tính về đúng mẫu (không sinh thêm mẫu tự động trùng),
--      - tách số liệu: trước ngày mở bán = giai đoạn test, từ ngày mở bán = giai đoạn thương mại.
--  • Mỗi mã SPU chỉ thuộc 1 mẫu; 1 mẫu có thể gắn nhiều SPU (biến thể).

create table if not exists rnd.product_code_links (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references rnd.products(id) on delete cascade,
  test_code    text not null,                                   -- mã test của mẫu tại lúc gắn (vd T10001)
  sku_code     text not null unique check (sku_code ~ '^[A-Z]{1,4}[0-9]{3,}$'),   -- mã SPU thương mại (vd N0123)
  launch_date  date not null,                                   -- ngày mở bán chính thức: trước = test, từ đó = thương mại
  note         text,
  created_by   uuid references core.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists product_code_links_product_idx on rnd.product_code_links (product_id);
create index if not exists product_code_links_test_idx    on rnd.product_code_links (test_code);

alter table rnd.product_code_links enable row level security;
grant all on rnd.product_code_links to service_role;

notify pgrst, 'reload schema';
