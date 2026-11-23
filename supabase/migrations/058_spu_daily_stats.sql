-- 058: Chụp số SPU theo NGÀY để vẽ xu hướng tăng / giảm cạnh các thẻ ở trang Theo dõi SPU. CHẠY TAY trong Supabase SQL Editor. Chạy lại vẫn an toàn.
--  • sales.spu_daily_stats: mỗi ngày (giờ VN) 1 dòng — số SPU Active / còn hàng / bán chạy / bán thường / bán chậm / tồn xấu của TOÀN công ty (không lọc kho, nhóm, team).
--  • Ứng dụng tự ghi dòng của hôm nay khi mở trang (ghi đè trong ngày); lịch sử bắt đầu từ ngày chạy migration này.
--  • Chưa chạy migration: thẻ vẫn hiện bình thường, chỉ chưa có biểu đồ xu hướng.

create table if not exists sales.spu_daily_stats (
  day        date primary key,
  active     integer not null default 0,
  in_stock   integer not null default 0,
  hot        integer not null default 0,
  normal     integer not null default 0,
  slow       integer not null default 0,
  bad        integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table sales.spu_daily_stats enable row level security;
grant all on sales.spu_daily_stats to service_role;

-- Điểm xuất phát: số trên màn hình trang Theo dõi SPU trước khi nhập file tồn kho sp2910 (dữ liệu của lần nhập 27/10), ghi làm số của HÔM QUA 28/10/2026.
-- Không ghi đè nếu ngày đó đã có dòng.
insert into sales.spu_daily_stats (day, active, in_stock, hot, normal, slow, bad)
values ('2026-10-28', 1344, 1076, 23, 35, 457, 829)
on conflict (day) do nothing;

notify pgrst, 'reload schema';
