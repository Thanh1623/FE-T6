-- 041: Số bán nhập từ file "Danh sách chi tiết đơn hàng" xuất từ Sapo (CSV / Excel). CHẠY TAY trong Supabase SQL Editor, SAU 040. Chạy lại vẫn an toàn.
--  • Mỗi dòng file = 1 dòng sản phẩm của 1 đơn. Khoá (mã đơn, SKU, thứ tự cùng SKU trong đơn) → nhập lại file trùng đơn chỉ CẬP NHẬT (vd đơn đổi sang "Đã hủy"), không nhân đôi,
--    và file xuất theo từng đợt / từng ngày không xoá số của đợt khác.
--  • code = mã suy từ SKU (phần trước dấu "-" đầu tiên, vd B0049-50-S-WH → B0049). LẤY TẤT CẢ dòng, kể cả mã không phải SPU (vd MATRUNGGIANBAC của hàng chế tác) và quà tặng (giá 0, vd khăn lau H002),
--    để thống kê hàng chế tác về sau. Khi tính số bán của SPU: chỉ lấy code dạng SPU (^[A-Z]{1,4}[0-9]{3,}$), price > 0 và status không phải đơn huỷ.
--  • Chỉ ghi bằng service role; RLS bật, không mở policy cho client.

create table if not exists sales.sales_imports (
  id          uuid primary key default gen_random_uuid(),
  file_name   text not null,
  row_count   integer not null default 0,      -- số dòng đã ghi
  skipped     integer not null default 0,      -- số dòng bỏ qua (quà tặng, mã không phải SPU…)
  date_from   date,
  date_to     date,
  created_by  uuid references core.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists sales.imported_order_lines (
  order_id    text not null,                    -- mã đơn hàng (HK116492, 586793461083571914…)
  sku         text not null,                    -- mã SKU trên dòng (B0049-50-S-WH)
  seq         integer not null default 1,       -- thứ tự của SKU này trong đơn (đơn có nhiều dòng cùng SKU)
  code        text not null,                    -- mã suy từ SKU (SPU thật hoặc mã khác như MATRUNGGIANBAC)
  ordered_at  timestamptz not null,             -- ngày đặt hàng (giờ VN)
  qty         integer not null check (qty >= 0),
  price       bigint not null default 0,        -- giá sản phẩm trên dòng (đồng)
  status      text,                             -- Đặt hàng / Đang giao dịch / Đã lưu trữ / Đã hủy…
  source      text,                             -- Website / TikTokShop…
  branch      text,                             -- chi nhánh / kho xuất
  import_id   uuid references sales.sales_imports(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (order_id, sku, seq)
);
create index if not exists imported_order_lines_code_idx on sales.imported_order_lines (code, ordered_at);
create index if not exists imported_order_lines_date_idx on sales.imported_order_lines (ordered_at);

alter table sales.sales_imports enable row level security;
alter table sales.imported_order_lines enable row level security;
grant all on sales.sales_imports, sales.imported_order_lines to service_role;

notify pgrst, 'reload schema';
