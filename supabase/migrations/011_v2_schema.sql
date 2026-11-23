-- =====================================================================================
-- 011_v2_schema — TÁI CẤU TRÚC DB v2 (làm sạch, đồng bộ lại từ đầu)
-- Chạy trên project fb-traffic. Toàn bộ chạy trong 1 giao dịch: lỗi ở đâu → hoàn tác hết.
--
-- Schema theo nghiệp vụ:
--   core     hồ sơ người dùng, cài đặt, nhật ký đồng bộ
--   social   kênh (Facebook/IG/TikTok/YouTube), số liệu kênh theo ngày, bài đăng (có sẵn cột chỉ số)
--   sales    danh mục mã mẫu (từ Sapo), số bán theo ngày
--   rnd      mẫu R&D, mục tiêu/KPI, phiên test, đánh giá, kết luận, chuyển giao Sao Biển
--   private  token kênh — KHÔNG mở qua API, chỉ đọc/ghi bằng hàm kiểm soát quyền
--
-- Bảo mật: mọi bảng bật RLS và KHÔNG có policy; thu toàn bộ quyền của anon/authenticated ở tầng
-- schema + bảng + hàm (2 lớp). Chỉ server (service_role / secret key) truy cập được.
--
-- GIỮ LẠI: tài khoản đăng nhập (auth.users) và hồ sơ vai trò (chép sang core.profiles).
-- XOÁ: mọi bảng dữ liệu cũ trong public — kéo lại từ Facebook + Qlydonhang ở lần đồng bộ đầu.
-- SAU KHI CHẠY: Supabase Dashboard → Project Settings → API → Exposed schemas: thêm core, social, sales, rnd
-- =====================================================================================

begin;

create schema if not exists core;
create schema if not exists social;
create schema if not exists sales;
create schema if not exists rnd;
create schema if not exists private;

-- Trigger dùng chung: tự cập nhật updated_at
create or replace function core.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- =====================================================================================
-- CORE
-- =====================================================================================
create table core.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text not null,
  role       text not null check (role in ('admin', 'rnd', 'saobien')),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chép hồ sơ cũ (nếu có) để không mất tài khoản đăng nhập
do $$ begin
  if to_regclass('public.profiles') is not null then
    insert into core.profiles (id, email, full_name, role, is_active, created_at, updated_at)
    select id, email, full_name, role, is_active, created_at, updated_at from public.profiles
    where id in (select id from auth.users);
  end if;
end $$;

-- Cài đặt dạng key/value: quy ước hashtag, chữ cái loại hàng, thông số đánh giá
create table core.settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references core.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into core.settings (key, value) values
  ('hashtag_rules', '{"staff_pattern": "^k[0-9]{3}$", "line_pattern": "^a[1-5]$", "concept": {"c": "old", "m": "new"}}'),
  ('category_prefix', '{"M": "Mặt dây", "D": "Dây chuyền", "N": "Nhẫn", "L": "Lắc", "K": "Kiềng", "B": "Bông tai", "C": "Charm", "Q": "Đá quý"}'),
  ('evaluation', '{"window_days": 14, "new_lookback_days": 90, "new_max_qty": 3, "new_catalog_days": 30,
                   "catalog_trusted_from": "2026-08-01", "history_trusted_from": "2026-04-01", "old_hot_qty": 30}');

-- Nhật ký đồng bộ (tự dọn sau 90 ngày — xem core.prune_sync_runs)
create table core.sync_runs (
  id          bigint generated always as identity primary key,
  job         text not null,                 -- setup / channel / sales / catalog / retag / evaluate
  channel_id  text,
  status      text not null check (status in ('success', 'error')),
  message     text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index sync_runs_started_idx on core.sync_runs (started_at desc);
create index sync_runs_job_idx on core.sync_runs (job, channel_id, started_at desc);

create function core.prune_sync_runs(keep_days int default 90) returns bigint
language sql set search_path = '' as $$
  with d as (delete from core.sync_runs where started_at < now() - make_interval(days => keep_days) returning 1)
  select count(*) from d
$$;

-- =====================================================================================
-- SOCIAL
-- =====================================================================================
create table social.channels (
  id              text primary key,                      -- ID kênh trên nền tảng (VD Page ID)
  platform        text not null check (platform in ('facebook', 'instagram', 'tiktok', 'youtube')),
  name            text not null,
  username        text,
  parent_id       text references social.channels(id) on delete set null,  -- IG → Page Facebook liên kết
  followers_count bigint,
  staff_code      text,                                  -- (sau này) kênh thuộc nhân sự nào
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index channels_platform_idx on social.channels (platform) where is_active;

-- Token kênh: schema private, không qua API
create table private.channel_tokens (
  channel_id   text primary key references social.channels(id) on delete cascade,
  access_token text not null,
  updated_at   timestamptz not null default now()
);

-- Số liệu kênh theo ngày — dạng CỘT (1 dòng/kênh/ngày), không phải dạng dọc
create table social.channel_daily (
  channel_id  text not null references social.channels(id) on delete cascade,
  date        date not null,
  views       bigint not null default 0,   -- lượt xem nội dung (FB page_media_view)
  viewers     bigint not null default 0,   -- người xem (unique trong ngày)
  engagements bigint not null default 0,   -- tương tác bài
  new_follows bigint not null default 0,
  unfollows   bigint not null default 0,
  page_views  bigint not null default 0,   -- lượt xem trang/kênh
  video_views bigint not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (channel_id, date)
);
create index channel_daily_date_idx on social.channel_daily (date);

-- Bài đăng + chỉ số trọn đời (cột) + nhãn tách từ hashtag
create table social.posts (
  id            text primary key,
  channel_id    text not null references social.channels(id) on delete cascade,
  platform      text not null,
  published_at  timestamptz not null,
  kind          text not null default 'other' check (kind in ('reel', 'video', 'photo', 'status', 'other')),
  message       text,
  permalink_url text,
  thumbnail_url text,
  hashtags      text[] not null default '{}',
  product_codes text[] not null default '{}',  -- CHỈ mã có trong sales.catalog hoặc rnd.products
  unknown_codes text[] not null default '{}',  -- dạng mã nhưng chưa khai báo
  content_line  text,                          -- A1…A5
  concept       text check (concept in ('old', 'new')),
  staff_code    text,                          -- K301
  views         bigint not null default 0,
  viewers       bigint not null default 0,
  reactions     bigint not null default 0,
  comments      bigint,                        -- null = chưa có quyền đọc
  shares        bigint,
  clicks        bigint not null default 0,
  video_views   bigint not null default 0,
  stats_at      timestamptz,                   -- lần cập nhật chỉ số gần nhất
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index posts_channel_time_idx on social.posts (channel_id, published_at desc);
create index posts_time_idx on social.posts (published_at desc);
create index posts_codes_idx on social.posts using gin (product_codes);
create index posts_unknown_idx on social.posts using gin (unknown_codes) where cardinality(unknown_codes) > 0;

-- =====================================================================================
-- SALES
-- =====================================================================================
create table sales.catalog (
  code          text primary key,          -- mã mẫu, VD D0008
  name          text not null,
  image_url     text,
  base_masp     text,
  first_seen_at timestamptz,               -- SKU đầu tiên xuất hiện trong kho (tin được từ 2026-08)
  updated_at    timestamptz not null default now()
);

create table sales.daily_sales (
  code           text not null,
  date           date not null,
  page_id        text not null default '',   -- Trang nguồn (tag page_id_ trên Sapo), '' = không có
  channel        text not null,              -- facebook, tiktok_shop, shopee, web, cua_hang, zalo, instagram, bao_hanh, khac
  qty_sold       integer not null default 0,
  qty_returned   integer not null default 0,
  revenue        bigint not null default 0,  -- sau phân bổ giảm giá đơn
  returned_value bigint not null default 0,
  cost           bigint not null default 0,  -- giá vốn hiện tại (trước 2026-07-26 = 0)
  returned_cost  bigint not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (code, date, page_id, channel)
);
create index daily_sales_page_idx on sales.daily_sales (page_id, date) where page_id <> '';
create index daily_sales_date_idx on sales.daily_sales (date);

-- =====================================================================================
-- RND
-- =====================================================================================
create table rnd.goals (
  code        text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  name        text not null,
  description text,
  win_result  text not null check (win_result in ('win', 'win_traffic')),
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
insert into rnd.goals (code, name, description, win_result, sort_order) values
  ('sales',   'Test Sales',   'Kiểm tra khả năng bán hàng',                 'win',         1),
  ('traffic', 'Test Traffic', 'Kiểm tra khả năng thu hút traffic',          'win_traffic', 2),
  ('concept', 'Test Concept', 'Kiểm tra phản ứng với một concept/thiết kế', 'win_traffic', 3),
  ('content', 'Test Content', 'Kiểm tra hiệu quả hình ảnh/nội dung',        'win_traffic', 4);

create table rnd.kpi_templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  goal_code     text not null references rnd.goals(code),
  line          text,
  campaign      text,
  rules         jsonb not null default '[]',
  match         text not null default 'all' check (match in ('all', 'any')),
  min_days      int not null default 14 check (min_days >= 0),
  min_views     int not null default 0 check (min_views >= 0),
  duration_days int not null default 14 check (duration_days > 0),
  is_default    boolean not null default false,
  is_active     boolean not null default true,
  created_by    uuid references core.profiles(id) on delete set null,
  updated_by    uuid references core.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index kpi_templates_one_default on rnd.kpi_templates (goal_code) where is_default;
insert into rnd.kpi_templates (name, goal_code, rules, match, min_days, min_views, duration_days, is_default) values
  ('Sales mặc định',   'sales',   '[{"metric":"qty_net","op":">=","value":20},{"metric":"conversion","op":">=","value":1}]', 'all', 14, 2000, 21, true),
  ('Traffic mặc định', 'traffic', '[{"metric":"views","op":">=","value":5000},{"metric":"viewers","op":">=","value":3000}]', 'all', 7, 0, 14, true),
  ('Concept mặc định', 'concept', '[{"metric":"views","op":">=","value":3000},{"metric":"engagement_rate","op":">=","value":3}]', 'all', 7, 0, 14, true),
  ('Content mặc định', 'content', '[{"metric":"ctr","op":">=","value":1},{"metric":"views","op":">=","value":3000},{"metric":"engagement_rate","op":">=","value":3}]', 'all', 7, 0, 7, true);

create table rnd.products (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique check (code ~ '^[A-Z]{1,4}[0-9]{3,}$'),
  sapo_code    text,
  name         text not null,
  line         text,
  category     text,
  material     text,
  stone        text,
  size         text,
  description  text,
  image_paths  text[] not null default '{}',
  source_url   text,
  status       text not null default 'researching' check (status in ('researching', 'testing', 'ended')),
  origin       text not null default 'manual' check (origin in ('manual', 'auto')),  -- auto = tạo khi mã Sapo xuất hiện trong bài
  age_override text check (age_override in ('new', 'old')),
  created_by   uuid references core.profiles(id) on delete set null,
  updated_by   uuid references core.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index products_status_idx on rnd.products (status);
create index products_sapo_idx on rnd.products (sapo_code) where sapo_code is not null;

create table rnd.product_events (
  id         bigint generated always as identity primary key,
  product_id uuid not null references rnd.products(id) on delete cascade,
  actor_id   uuid references core.profiles(id) on delete set null,
  action     text not null,
  changes    jsonb,
  created_at timestamptz not null default now()
);
create index product_events_idx on rnd.product_events (product_id, created_at desc);

create table rnd.test_sessions (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references rnd.products(id) on delete cascade,
  goal_code   text not null references rnd.goals(code),
  template_id uuid references rnd.kpi_templates(id) on delete set null,
  campaign    text,
  start_date  date not null,
  end_date    date not null,
  sales_scope text not null default 'all' check (sales_scope in ('all', 'pages', 'channels')),
  page_ids    text[] not null default '{}',
  channels    text[] not null default '{}',
  rules       jsonb not null,                 -- KPI chụp lại lúc bắt đầu
  match       text not null check (match in ('all', 'any')),
  min_days    int not null,
  min_views   int not null,
  status      text not null default 'running' check (status in ('running', 'ended')),
  ended_at    timestamptz,
  note        text,
  created_by  uuid references core.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_date >= start_date)
);
create unique index test_sessions_one_running on rnd.test_sessions (product_id) where status = 'running';
create index test_sessions_product_idx on rnd.test_sessions (product_id, created_at desc);

-- Kết quả hệ thống đề xuất (tính lại mỗi lần đồng bộ, 1 dòng/mã)
create table rnd.evaluations (
  code            text primary key,
  product_id      uuid references rnd.products(id) on delete set null,
  first_post_date date not null,
  window_end      date not null,
  days_elapsed    int not null,
  age             text not null check (age in ('new', 'old')),
  age_reason      text not null,
  age_reliable    boolean not null default true,
  source          text not null default 'auto' check (source in ('auto', 'session')),
  session_id      uuid references rnd.test_sessions(id) on delete set null,
  result          text not null check (result in ('testing', 'win', 'win_traffic', 'fail')),
  sales_status    text not null,
  traffic_status  text not null,
  metrics         jsonb not null,
  checks          jsonb not null,
  forecast        jsonb,
  videos          jsonb not null default '[]',
  evaluated_at    timestamptz not null default now()
);
create index evaluations_product_idx on rnd.evaluations (product_id);
create index evaluations_result_idx on rnd.evaluations (result, first_post_date desc);

-- Kết luận R&D (lịch sử — mỗi lần xác nhận 1 dòng; hiện hành = dòng mới nhất)
create table rnd.decisions (
  id         bigint generated always as identity primary key,
  product_id uuid not null references rnd.products(id) on delete cascade,
  session_id uuid references rnd.test_sessions(id) on delete set null,
  result     text not null check (result in ('win', 'win_traffic', 'fail')),
  suggested  text,                     -- đề xuất của hệ thống lúc xác nhận
  note       text,
  snapshot   jsonb not null,           -- số liệu lúc xác nhận
  decided_by uuid references core.profiles(id) on delete set null,
  decided_at timestamptz not null default now()
);
create index decisions_product_idx on rnd.decisions (product_id, decided_at desc);

create view rnd.current_decisions with (security_invoker = true) as
  select distinct on (product_id) * from rnd.decisions order by product_id, decided_at desc;

create table rnd.handoffs (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references rnd.products(id) on delete cascade,
  decision_id  bigint references rnd.decisions(id) on delete set null,
  result       text not null check (result in ('win', 'win_traffic')),
  snapshot     jsonb not null,
  source_url   text not null,
  rnd_note     text,
  status       text not null default 'pending' check (status in ('pending', 'received', 'developing', 'done', 'returned')),
  assignee_id  uuid references core.profiles(id) on delete set null,
  saobien_note text,
  created_by   uuid references core.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  received_at  timestamptz,
  done_at      timestamptz,
  updated_at   timestamptz not null default now()
);
create unique index handoffs_one_open on rnd.handoffs (product_id) where status <> 'returned';
create index handoffs_status_idx on rnd.handoffs (status, created_at desc);

create table rnd.handoff_events (
  id         bigint generated always as identity primary key,
  handoff_id uuid not null references rnd.handoffs(id) on delete cascade,
  actor_id   uuid references core.profiles(id) on delete set null,
  action     text not null,
  note       text,
  created_at timestamptz not null default now()
);
create index handoff_events_idx on rnd.handoff_events (handoff_id, created_at);

-- =====================================================================================
-- TRIGGER updated_at
-- =====================================================================================
do $$
declare t record;
begin
  for t in
    select c.table_schema, c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.column_name = 'updated_at' and c.table_schema in ('core', 'social', 'sales', 'rnd', 'private')
  loop
    execute format('create trigger touch_updated_at before update on %I.%I for each row execute function core.touch_updated_at()', t.table_schema, t.table_name);
  end loop;
end $$;

-- =====================================================================================
-- HÀM TRUY VẤN TỔNG HỢP (chạy trong Postgres thay vì kéo dữ liệu về app)
-- =====================================================================================

-- Token kênh: chỉ server gọi được (security definer, đọc schema private)
create function social.channel_tokens() returns table (channel_id text, access_token text)
language sql stable security definer set search_path = '' as $$
  select t.channel_id, t.access_token from private.channel_tokens t
  join social.channels c on c.id = t.channel_id where c.is_active
$$;
create function social.save_channel_token(p_channel_id text, p_token text) returns void
language sql security definer set search_path = '' as $$
  insert into private.channel_tokens (channel_id, access_token) values (p_channel_id, p_token)
  on conflict (channel_id) do update set access_token = excluded.access_token, updated_at = now()
$$;

-- Số bán thuần theo mã trong khoảng ngày (mặc định mọi kênh trừ bảo hành)
create function sales.code_sales(p_codes text[], p_from date, p_to date, p_page_ids text[] default null, p_channels text[] default null)
returns table (code text, qty_net bigint, gmv bigint, cost_net bigint)
language sql stable set search_path = '' as $$
  select s.code, sum(s.qty_sold - s.qty_returned)::bigint, sum(s.revenue - s.returned_value)::bigint, sum(s.cost - s.returned_cost)::bigint
  from sales.daily_sales s
  where s.code = any(p_codes) and s.date between p_from and p_to
    and (p_page_ids is null or s.page_id = any(p_page_ids))
    and (case when p_channels is null then s.channel <> 'bao_hanh' else s.channel = any(p_channels) end)
  group by s.code
$$;

-- Số bán theo kênh bán của 1 mã
create function sales.code_sales_by_channel(p_code text, p_from date, p_to date)
returns table (channel text, qty_net bigint, revenue_net bigint, gross_profit bigint)
language sql stable set search_path = '' as $$
  select channel, sum(qty_sold - qty_returned)::bigint, sum(revenue - returned_value)::bigint,
         sum((revenue - returned_value) - (cost - returned_cost))::bigint
  from sales.daily_sales where code = upper(p_code) and date between p_from and p_to
  group by channel order by 2 desc
$$;

-- Số bán theo Trang nguồn (đơn có tag page_id_)
create function sales.page_sales(p_page_ids text[], p_from date, p_to date)
returns table (page_id text, qty_net bigint, gmv bigint)
language sql stable set search_path = '' as $$
  select page_id, sum(qty_sold - qty_returned)::bigint, sum(revenue - returned_value)::bigint
  from sales.daily_sales where page_id = any(p_page_ids) and date between p_from and p_to group by page_id
$$;

-- Tổng số liệu kênh trong khoảng ngày
create function social.channel_totals(p_ids text[], p_from date, p_to date)
returns table (channel_id text, views bigint, viewers bigint, engagements bigint, new_follows bigint, unfollows bigint, page_views bigint, video_views bigint)
language sql stable set search_path = '' as $$
  select channel_id, sum(views)::bigint, sum(viewers)::bigint, sum(engagements)::bigint, sum(new_follows)::bigint,
         sum(unfollows)::bigint, sum(page_views)::bigint, sum(video_views)::bigint
  from social.channel_daily where channel_id = any(p_ids) and date between p_from and p_to group by channel_id
$$;

-- Báo cáo sản phẩm (trang "Sản phẩm bán"): dùng cột product_codes + chỉ số có sẵn trên bài
create function sales.product_report(p_from date, p_to date, p_page_ids text[] default null, p_channels text[] default null)
returns table (
  product_code text, first_post_at timestamptz, last_post_at timestamptz, post_count bigint, video_count bigint,
  views numeric, viewers numeric, qty_sold bigint, qty_returned bigint, qty_net bigint, revenue_net bigint,
  cost_net bigint, gross_profit bigint, margin_pct numeric, conversion_pct numeric)
language sql stable set search_path = '' as $$
  with tagged as (
    select p.id, p.kind, p.published_at, p.views, p.viewers, unnest(p.product_codes) as code
    from social.posts p
    where (p.published_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
      and (p_page_ids is null or p.channel_id = any(p_page_ids))
  ),
  traffic as (
    select code, min(published_at) f, max(published_at) l, count(distinct id) n,
           count(distinct id) filter (where kind in ('video', 'reel')) v, sum(views) views, sum(viewers) viewers
    from tagged group by code
  ),
  s as (
    select d.code, sum(d.qty_sold)::bigint qs, sum(d.qty_returned)::bigint qr,
           sum(d.revenue - d.returned_value)::bigint rev, sum(d.cost - d.returned_cost)::bigint cost
    from sales.daily_sales d
    where d.code in (select code from traffic) and d.date between p_from and p_to
      and (p_page_ids is null or d.page_id = any(p_page_ids))
      and (case when p_channels is null then d.channel <> 'bao_hanh' else d.channel = any(p_channels) end)
    group by d.code
  )
  select t.code, t.f, t.l, t.n, t.v, t.views, t.viewers,
         coalesce(s.qs, 0), coalesce(s.qr, 0), coalesce(s.qs, 0) - coalesce(s.qr, 0),
         coalesce(s.rev, 0), coalesce(s.cost, 0), coalesce(s.rev, 0) - coalesce(s.cost, 0),
         case when coalesce(s.rev, 0) > 0 then round((s.rev - s.cost) * 100.0 / s.rev, 1) end,
         case when t.viewers > 0 then round((coalesce(s.qs, 0) - coalesce(s.qr, 0)) * 100.0 / t.viewers, 2) end
  from traffic t left join s on s.code = t.code
  order by t.views desc
$$;

-- =====================================================================================
-- XOÁ CẤU TRÚC CŨ TRONG public
-- =====================================================================================
drop view if exists public.hashtag_stats cascade;
drop function if exists public.product_report(date, date) cascade;
drop function if exists public.product_report(date, date, text[]) cascade;
drop function if exists public.product_report(date, date, text[], text[]) cascade;
drop function if exists public.product_sales_by_channel(text, date, date) cascade;
drop function if exists public.product_codes(text[]) cascade;
drop table if exists
  public.post_metrics, public.posts, public.daily_metrics, public.product_daily_sales, public.products,
  public.product_evaluations, public.handoff_events, public.handoffs, public.test_sessions, public.kpi_templates,
  public.test_goals, public.rnd_product_history, public.rnd_products, public.eval_settings, public.app_settings,
  public.sync_logs, public.accounts, public.profiles
cascade;

-- =====================================================================================
-- BẢO MẬT — 2 lớp: thu quyền + RLS không policy
-- =====================================================================================
do $$
declare s text; t record;
begin
  foreach s in array array['core', 'social', 'sales', 'rnd', 'private'] loop
    execute format('revoke all on schema %I from public, anon, authenticated', s);
    execute format('revoke all on all tables in schema %I from public, anon, authenticated', s);
    execute format('revoke all on all sequences in schema %I from public, anon, authenticated', s);
    execute format('revoke all on all functions in schema %I from public, anon, authenticated', s);
    execute format('alter default privileges in schema %I revoke all on tables from public, anon, authenticated', s);
    execute format('alter default privileges in schema %I revoke all on functions from public, anon, authenticated', s);
    if s <> 'private' then
      execute format('grant usage on schema %I to service_role', s);
      execute format('grant all on all tables in schema %I to service_role', s);
      execute format('grant all on all sequences in schema %I to service_role', s);
      execute format('grant execute on all functions in schema %I to service_role', s);
      execute format('alter default privileges in schema %I grant all on tables to service_role', s);
      execute format('alter default privileges in schema %I grant execute on functions to service_role', s);
    end if;
  end loop;
  -- RLS bật trên MỌI bảng (không policy = từ chối mọi vai trò trừ service_role)
  for t in select schemaname, tablename from pg_tables where schemaname in ('core', 'social', 'sales', 'rnd', 'private') loop
    execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
  end loop;
  -- Hàm còn sót trong public (VD rls_auto_enable): khách không được gọi
  for t in select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke execute on function %s from public, anon, authenticated', t.f);
  end loop;
end $$;

-- KHÔNG dùng FORCE RLS: các hàm security definer (token) chạy dưới quyền chủ bảng cần đọc được private.channel_tokens.

notify pgrst, 'reload schema';
commit;
