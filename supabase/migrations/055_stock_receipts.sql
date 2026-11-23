-- 055: Các lô NHẬP KHO (file Sapo "Danh sách chi tiết đơn nhập hàng") để tính THỜI GIAN TỒN theo FIFO. CHẠY TAY trong Supabase SQL Editor. Chạy lại vẫn an toàn.
--  • stock_receipts: mỗi dòng = 1 lô của 1 đơn nhập (po) × SKU, ngày nhập, số lượng. Chỉ dòng "Đã nhập" được lưu (dòng "Chưa nhập" bỏ qua).
--  • Tuổi tồn KHÔNG lưu ở đây mà tính lúc xem: tồn hiện tại của SKU = các lô nhập GẦN NHẤT (trừ dần từ lô mới nhất ngược về), lấy bình quân gia quyền theo số lượng; phần tồn không có lô trong file (nhập trước ngày đầu của file) tính là "≥ số ngày từ ngày đầu file".
--  • Nhập lại file: dòng cũ được cập nhật theo (po, sku, seq), dòng mới thêm vào; không xoá dòng nào.
--  • receipt_imports: nhật ký các lần nhập (để cảnh báo "lâu chưa cập nhật" ở Cài đặt).
--  • Chỉ ghi bằng service role (RLS bật, không mở policy cho client).

create table if not exists sales.receipt_imports (
  id         uuid primary key default gen_random_uuid(),
  file_name  text not null,
  row_count  integer not null default 0,        -- số lô đã nhập kho được ghi
  pending    integer not null default 0,        -- số dòng "Chưa nhập" bỏ qua
  skipped    integer not null default 0,        -- dòng thiếu mã đơn / SKU / ngày / số lượng
  date_from  date,
  date_to    date,
  created_by uuid references core.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists sales.stock_receipts (
  po          text not null,                    -- mã đơn nhập (REI02864)
  sku         text not null,
  seq         integer not null default 1,       -- thứ tự của SKU này trong đơn (đơn có nhiều dòng cùng SKU)
  received_on date not null,
  qty         integer not null check (qty > 0),
  supplier    text,
  import_id   uuid references sales.receipt_imports(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (po, sku, seq)
);
create index if not exists stock_receipts_sku_idx on sales.stock_receipts (sku, received_on desc);

alter table sales.receipt_imports enable row level security;
alter table sales.stock_receipts enable row level security;
grant all on sales.receipt_imports, sales.stock_receipts to service_role;

notify pgrst, 'reload schema';
