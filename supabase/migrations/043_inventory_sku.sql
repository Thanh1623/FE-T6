-- 043: Tồn kho lưu theo TỪNG SKU (file gốc Sapo = tất cả SKU), mỗi SKU có thêm cột SPU (code) để gộp khi xem. CHẠY TAY trong Supabase SQL Editor, SAU 042. Chạy lại vẫn an toàn.
--  • sales.inventory_stock: khoá chính đổi từ (code, warehouse) → (sku, warehouse). code vẫn là mã SPU (phần trước dấu "-" đầu tiên của sku) để SUM theo SPU.
--    Dòng cũ (mỗi dòng là 1 SPU) được coi như sku = code; nhập lại file là bản chụp mới thay thế hết.
--  • sales.inventory_skus: danh sách TẤT CẢ SKU có trong file (kể cả SKU hết hàng ở mọi kho, không có dòng ở inventory_stock).

alter table sales.inventory_stock add column if not exists sku text;
update sales.inventory_stock set sku = code where sku is null;
alter table sales.inventory_stock alter column sku set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'sales.inventory_stock'::regclass and c.contype = 'p' and a.attname = 'sku'
  ) then
    alter table sales.inventory_stock drop constraint inventory_stock_pkey;
    alter table sales.inventory_stock add primary key (sku, warehouse);
  end if;
end $$;

create index if not exists inventory_stock_code_idx on sales.inventory_stock (code);
comment on column sales.inventory_stock.sku  is 'SKU đầy đủ (vd D0006-00-S-WH)';
comment on column sales.inventory_stock.code is 'Mã SPU của SKU = phần trước dấu "-" đầu tiên (vd D0006); dùng để gộp tồn theo SPU';

create table if not exists sales.inventory_skus (
  sku        text primary key,
  code       text not null,                                   -- mã SPU
  import_id  uuid references sales.inventory_imports(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists inventory_skus_code_idx on sales.inventory_skus (code);
alter table sales.inventory_skus enable row level security;
grant all on sales.inventory_skus to service_role;

notify pgrst, 'reload schema';
