-- 031: Bảng số liệu traffic + bán hàng theo mẫu R&D (rnd.product_metrics). CHẠY TAY trong Supabase SQL Editor, SAU 030. Chạy lại vẫn an toàn.
--  • Mỗi mẫu có mã SKU = 1 dòng; đồng bộ (lib/rnd-metrics.ts, cuối mỗi lần syncAll) kéo số từ bài gắn hashtag mã (social.posts)
--    và số bán theo mã Sapo (sales.daily_sales) về đây — trang mẫu / bảng R&D đọc 1 dòng thay vì tính lại từ bài + đơn
--  • Chỉ ghi bằng service role (đồng bộ); RLS bật, không mở policy cho client

create table if not exists rnd.product_metrics (
  product_id   uuid primary key references rnd.products(id) on delete cascade,
  code         text not null,                       -- mã SKU (hashtag) lúc kéo
  since        date,                                -- ngày bài đầu tiên gắn mã (giờ VN); null = chưa có bài
  posts        integer not null default 0,
  videos       integer not null default 0,
  views        bigint  not null default 0,
  viewers      bigint  not null default 0,
  reactions    bigint  not null default 0,
  clicks       bigint  not null default 0,
  qty_net      integer not null default 0,          -- SL bán thuần (trừ hoàn) từ ngày bài đầu, mọi kênh
  daily_qty    integer[] not null default '{}',     -- SL bán thuần 30 ngày gần nhất (cũ → mới)
  refreshed_at timestamptz not null default now()
);
create index if not exists product_metrics_code_idx on rnd.product_metrics (code);

alter table rnd.product_metrics enable row level security;
