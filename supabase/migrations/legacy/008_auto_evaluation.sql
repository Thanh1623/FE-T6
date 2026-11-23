-- 008_auto_evaluation: luồng tự đánh giá WIN / WIN TRAFFIC / FAIL theo hashtag mã, không cần đặt mục tiêu
-- Chạy trên project fb-traffic, SAU 007. Chạy lại nhiều lần vẫn an toàn.

-- Ngày mã xuất hiện lần đầu trong kho Sapo (đồng bộ từ fb_product_catalog)
alter table products add column if not exists first_seen_at timestamptz;

-- Mẫu R&D tự tạo khi hashtag mã mới xuất hiện + phân loại mới/cũ sửa tay
alter table rnd_products add column if not exists auto_created boolean not null default false;
alter table rnd_products add column if not exists age_override text check (age_override in ('new', 'old'));

-- ---------- Cài đặt đánh giá tự động (1 dòng duy nhất) ----------
-- KPI tự động = mẫu KPI MẶC ĐỊNH của mục tiêu 'sales' (→ WIN) và 'traffic' (→ WIN TRAFFIC) trong trang KPI.
create table if not exists eval_settings (
  id                   int primary key default 1 check (id = 1),
  window_days          int not null default 14 check (window_days > 0),   -- thời gian test tính từ video đầu
  new_lookback_days    int not null default 90 check (new_lookback_days > 0),
  new_max_qty          int not null default 3 check (new_max_qty >= 0),    -- bán ≤ ngần này trước video đầu → MỚI
  new_catalog_days     int not null default 30 check (new_catalog_days >= 0), -- lên Sapo ≤ ngần này ngày trước video đầu → MỚI
  catalog_trusted_from date not null default '2026-08-01',                -- trước mốc này ngày tạo SKU không đáng tin (import hàng loạt)
  history_trusted_from date not null default '2026-04-01',                -- trước mốc này lịch sử bán thưa
  old_hot_qty          int not null default 30 check (old_hot_qty >= 0),   -- mẫu cũ bán ≥ ngần này → "cũ bán chạy"
  updated_by           uuid references profiles(id),
  updated_at           timestamptz not null default now()
);
insert into eval_settings (id) values (1) on conflict (id) do nothing;
alter table eval_settings enable row level security;

-- ---------- Kết quả đánh giá mới nhất của mỗi mã (tính lại mỗi lần đồng bộ) ----------
create table if not exists product_evaluations (
  code             text primary key,                 -- mã mẫu (hashtag), chữ HOA
  product_id       uuid references rnd_products(id) on delete set null,
  first_post_date  date not null,                    -- ngày video đầu tiên (giờ VN)
  window_end       date not null,
  days_elapsed     int not null,
  -- Phân loại mới/cũ tại ngày video đầu
  age              text not null check (age in ('new', 'old')),
  age_reason       text not null,                    -- not_in_sapo / new_listing / no_sales / old_hot / old_slow / override
  age_reliable     boolean not null default true,    -- false = lịch sử bán chưa đủ để kết luận
  -- Nguồn kết quả: 'auto' (KPI tự động) hoặc 'session' (phiên test theo mục tiêu ghi đè)
  source           text not null default 'auto' check (source in ('auto', 'session')),
  session_id       uuid references test_sessions(id) on delete set null,
  result           text not null check (result in ('testing', 'win', 'win_traffic', 'fail')),
  sales_status     text not null,                    -- pass / partial / weak / not_enough
  traffic_status   text not null,
  metrics          jsonb not null,                   -- views, viewers, reactions, clicks, ctr, engagement_rate, qty_net, gmv, conversion, posts, videos
  checks           jsonb not null,                   -- từng điều kiện KPI: {metric, op, target, actual, pass}
  forecast         jsonb,                            -- dự báo tới hết cửa sổ test (thống kê)
  videos           jsonb not null default '[]',      -- xếp hạng video trong mẫu
  evaluated_at     timestamptz not null default now()
);
create index if not exists product_evaluations_result_idx on product_evaluations (result);
create index if not exists product_evaluations_first_post_idx on product_evaluations (first_post_date desc);
alter table product_evaluations enable row level security;

notify pgrst, 'reload schema';
