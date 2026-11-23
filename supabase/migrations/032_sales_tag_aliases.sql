-- 032: Bảng tra tag Sapo của đơn hàng nằm NGAY TRONG project này (sales.tag_aliases). CHẠY TAY trong Supabase SQL Editor, SAU 031. Chạy lại vẫn an toàn.
--  • Số bán (sales.daily_sales) và danh mục mã (sales.catalog) đã nằm ở project này, do đồng bộ kéo từ Qlydonhang.
--    Chỗ DUY NHẤT còn đọc thẳng Qlydonhang là lúc dán tag "tiktok_business_id_<id>" ở trang Kết nối: phải tra đơn hàng để biết tên tài khoản.
--  • Bảng này lưu sẵn kết quả tra (id → tên tài khoản): lần sau không cần gọi Qlydonhang. Khi Qlydonhang cắt bảng orders và API chuyển về
--    project này, chỉ cần ghi vào bảng này (đồng bộ hoặc API) — code không phải sửa.
--  • Chỉ ghi bằng service role; RLS bật, không mở policy cho client.

create table if not exists sales.tag_aliases (
  tag        text primary key,                  -- tag gốc trên đơn Sapo, VD tiktok_business_id_123456
  alias_name text not null,                     -- tên tài khoản tương ứng, VD ten_tai_khoan (từ tag tiktok_business_<tên>)
  hits       integer not null default 1,        -- số đơn mẫu đã thấy cặp này khi tra
  source     text not null default 'orders',    -- orders = tra từ Qlydonhang · api = đẩy / kéo qua API
  updated_at timestamptz not null default now()
);

alter table sales.tag_aliases enable row level security;
