-- 059: Bảng TỔNG HỢP SPU (tính sẵn) cho trang Theo dõi đẩy hàng và Dashboard "Báo cáo đẩy tồn". CHẠY TAY trong Supabase SQL Editor, SAU 058. Chạy lại vẫn an toàn.
--  • Mục đích: trang không còn kéo dữ liệu thô (30.000 video, 11.000 dòng danh mục, hàng chục nghìn dòng đơn…) về máy chủ rồi tự tính cho 11.000 SPU mỗi lần mở.
--    Một tiến trình "làm mới" (src/lib/spu-summary.ts) tính sẵn bằng đúng logic hiện có rồi ghi vào các bảng dưới; trang đọc bảng đã gọn.
--  • Tài liệu thiết kế + cách bảo trì: docs/KIEN-TRUC-TONG-HOP-SPU.md (ĐỌC TRƯỚC khi sửa).
--  • Mỗi lần làm mới ghi một "lượt" mới (run_id) rồi mới chuyển con trỏ sang lượt đó → người đang xem không bao giờ thấy dữ liệu nửa cũ nửa mới. Lượt cũ bị xoá sau khi chuyển.
--  • Chỉ ghi / đọc bằng service role qua máy chủ (RLS bật, không mở policy; các view bên dưới bị thu hồi quyền của anon / authenticated).

-- 1) Mỗi SPU một dòng ----------------------------------------------------------------------------------------
create table if not exists sales.spu_summary (
  run_id       bigint not null,
  code         text   not null,                      -- mã SPU (phần trước dấu "-" đầu tiên, đã áp dụng tách mã trùng)
  name         text   not null,
  grp          text   not null,                      -- nhóm hàng (Nhẫn, Dây chuyền, … Khác)
  variants     int    not null default 1,            -- số mã con (SKU)
  image        text,
  stock_by     jsonb  not null default '{}',         -- {tên kho: tồn} (chỉ kho có tồn > 0)
  stock_total  int    not null default 0,            -- tổng tồn mọi kho
  avail_by     jsonb,                                -- {tên kho: có thể bán} (có thể âm); null = file tồn chưa có cột "Có thể bán"
  incoming     int    not null default 0,            -- hàng đang về
  age_days     int,                                  -- thời gian tồn (ngày); null = chưa có dữ liệu
  age_approx   boolean not null default false,       -- tuổi tồn là "≥" (có phần tồn không có lô nhập)
  sold30       int,                                  -- bán 30 ngày gần nhất (không trừ hoàn); null = chưa có dữ liệu bán
  sold_by_team jsonb  not null default '{}',         -- {tên team: số bán 30 ngày}
  video_teams  text[] not null default '{}',         -- các team đã đăng video cho SPU này
  primary key (run_id, code)
);
create index if not exists spu_summary_grp_idx on sales.spu_summary (run_id, grp);

-- 2) Số bán theo ngày × team (30 ngày gần nhất) -----------------------------------------------------------------
create table if not exists sales.spu_sales_daily (
  run_id bigint not null,
  code   text   not null,
  day    date   not null,                            -- ngày đặt (giờ VN)
  team   text   not null default '',                 -- '' = chưa gán được team
  qty    int    not null,
  primary key (run_id, code, day, team)
);

-- 3) Video theo ngày × kênh (400 ngày gần nhất) ----------------------------------------------------------------
create table if not exists sales.spu_video_daily (
  run_id     bigint not null,
  code       text   not null,
  day        date   not null,                        -- ngày đăng (giờ VN)
  channel_id text   not null,
  team       text   not null default '',             -- team của kênh tại thời điểm làm mới ('' = chưa gán)
  platform   text   not null default 'FB',           -- FB / IG / TT
  videos     int    not null,
  views      bigint not null default 0,
  primary key (run_id, code, day, channel_id)
);
create index if not exists spu_video_daily_day_idx on sales.spu_video_daily (run_id, day);

-- 4) Con trỏ lượt hiện hành + thông tin lần làm mới (đúng 1 dòng) ------------------------------------------------
create table if not exists sales.spu_summary_meta (
  id           int primary key default 1 check (id = 1),
  run_id       bigint not null default 0,
  refreshed_at timestamptz,
  duration_ms  int,
  spus         int,
  sales_rows   int,
  video_rows   int,
  sales_source text,                                 -- orders = file đơn hàng · sapo = số đồng bộ · none
  sales_lines  int,
  sales_qty    int,
  sales_from   date,
  sales_to     date,
  skus         int,
  team_qty     int
);
insert into sales.spu_summary_meta (id) values (1) on conflict (id) do nothing;

-- 5) View chỉ lấy lượt hiện hành (trang đọc qua view này) --------------------------------------------------------
create or replace view sales.v_spu_summary as select s.* from sales.spu_summary s join sales.spu_summary_meta m on m.run_id = s.run_id;
create or replace view sales.v_spu_sales_daily as select s.* from sales.spu_sales_daily s join sales.spu_summary_meta m on m.run_id = s.run_id;
create or replace view sales.v_spu_video_daily as select s.* from sales.spu_video_daily s join sales.spu_summary_meta m on m.run_id = s.run_id;

-- 6) Quyền: chỉ service role -------------------------------------------------------------------------------------
alter table sales.spu_summary      enable row level security;
alter table sales.spu_sales_daily  enable row level security;
alter table sales.spu_video_daily  enable row level security;
alter table sales.spu_summary_meta enable row level security;
grant all on sales.spu_summary, sales.spu_sales_daily, sales.spu_video_daily, sales.spu_summary_meta to service_role;
grant select on sales.v_spu_summary, sales.v_spu_sales_daily, sales.v_spu_video_daily to service_role;
-- View chạy với quyền của chủ bảng (bỏ qua RLS) nên PHẢI thu hồi quyền của người dùng thường
revoke all on sales.v_spu_summary, sales.v_spu_sales_daily, sales.v_spu_video_daily from anon, authenticated;

notify pgrst, 'reload schema';
