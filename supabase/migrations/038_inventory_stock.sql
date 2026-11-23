-- 038: Tồn kho theo SPU × kho, nhập từ file (sales.inventory_stock) + nhật ký nhập (sales.inventory_imports). CHẠY TAY trong Supabase SQL Editor, SAU 037. Chạy lại vẫn an toàn.
--  • Trang "Theo dõi SPU" có nút "Nhập tồn kho": tải file Excel / CSV tồn kho → ghi vào bảng này. Mỗi lần nhập là MỘT BẢN CHỤP TỒN HIỆN TẠI:
--    dòng có trong file được thêm / cập nhật, dòng của lần nhập trước mà file mới không còn → xoá (SPU hết trong kho).
--  • Định dạng cột chi tiết sẽ chỉnh theo file mẫu thật (lib/inventory-import.ts, bảng bí danh cột). Cột bắt buộc: mã SPU, kho, tồn.
--  • Chỉ ghi bằng service role; RLS bật, không mở policy cho client.

create table if not exists sales.inventory_imports (
  id          uuid primary key default gen_random_uuid(),
  file_name   text not null,
  row_count   integer not null default 0,        -- số dòng hợp lệ đã ghi
  skipped     integer not null default 0,        -- số dòng bị bỏ qua (thiếu mã / tồn không phải số…)
  created_by  uuid references core.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists sales.inventory_stock (
  code         text not null check (code ~ '^[A-Z]{1,4}[0-9]{3,}[A-Z0-9-]*$'),   -- mã SPU (cho phép đuôi biến thể như D0006-00-S-WH)
  warehouse    text not null,
  stock        integer not null check (stock >= 0),
  last_in_date date,                              -- ngày nhập kho gần nhất (để tính thời gian tồn); có thể trống
  import_id    uuid references sales.inventory_imports(id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (code, warehouse)
);
create index if not exists inventory_stock_warehouse_idx on sales.inventory_stock (warehouse);
create index if not exists inventory_stock_import_idx on sales.inventory_stock (import_id);

alter table sales.inventory_imports enable row level security;
alter table sales.inventory_stock enable row level security;
grant all on sales.inventory_imports, sales.inventory_stock to service_role;

notify pgrst, 'reload schema';
