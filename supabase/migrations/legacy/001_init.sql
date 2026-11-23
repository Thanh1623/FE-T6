-- 001_init: bảng lưu thống kê Facebook Page / Instagram
-- Chạy trong Supabase Dashboard → SQL Editor. Chạy lại nhiều lần vẫn an toàn.

-- Tài khoản được theo dõi: Facebook Page hoặc Instagram Business
create table if not exists accounts (
  id            text primary key,                 -- Page ID hoặc IG User ID
  platform      text not null check (platform in ('facebook', 'instagram')),
  name          text not null,
  username      text,
  parent_page_id text references accounts(id),    -- IG: Page mà nó liên kết
  access_token  text,                             -- Page Token (IG dùng token của Page cha)
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Chỉ số theo ngày, lưu dạng dài để Meta đổi metric không phải sửa schema
create table if not exists daily_metrics (
  account_id  text not null references accounts(id) on delete cascade,
  metric      text not null,
  date        date not null,
  value       numeric not null,
  updated_at  timestamptz not null default now(),
  primary key (account_id, metric, date)
);
create index if not exists daily_metrics_date_idx on daily_metrics (date);

-- Bài viết (FB post / IG media)
create table if not exists posts (
  id            text primary key,
  account_id    text not null references accounts(id) on delete cascade,
  message       text,
  type          text,
  permalink_url text,
  thumbnail_url text,
  created_time  timestamptz not null,
  updated_at    timestamptz not null default now()
);
create index if not exists posts_account_time_idx on posts (account_id, created_time desc);

-- Chỉ số mới nhất của từng bài (ghi đè mỗi lần đồng bộ)
create table if not exists post_metrics (
  post_id    text not null references posts(id) on delete cascade,
  metric     text not null,
  value      numeric not null,
  fetched_at timestamptz not null default now(),
  primary key (post_id, metric)
);

-- Nhật ký đồng bộ
create table if not exists sync_logs (
  id          bigint generated always as identity primary key,
  job         text not null,
  account_id  text,
  status      text not null check (status in ('success', 'error')),
  message     text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists sync_logs_started_idx on sync_logs (started_at desc);

-- Bật RLS, không tạo policy: chỉ server (secret key) đọc/ghi được.
-- Token Page vì thế không bao giờ lộ qua publishable key.
alter table accounts      enable row level security;
alter table daily_metrics enable row level security;
alter table posts         enable row level security;
alter table post_metrics  enable row level security;
alter table sync_logs     enable row level security;
