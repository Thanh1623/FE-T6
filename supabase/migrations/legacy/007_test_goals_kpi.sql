-- 007_test_goals_kpi: mục tiêu test, mẫu KPI, phiên test
-- Chạy trên project fb-traffic, SAU 006. Chạy lại nhiều lần vẫn an toàn.

-- ---------- Mục tiêu test ----------
-- win_result: kết quả khi ĐẠT KPI của mục tiêu này ('win' = đạt mục tiêu bán hàng, 'win_traffic' = đạt sức hút)
create table if not exists test_goals (
  code        text primary key,                     -- 'sales', 'traffic', ... (chữ thường, không dấu)
  name        text not null,
  description text,
  win_result  text not null check (win_result in ('win', 'win_traffic')),
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint test_goals_code_format check (code ~ '^[a-z][a-z0-9_]*$')
);
alter table test_goals enable row level security;

insert into test_goals (code, name, description, win_result, sort_order) values
  ('sales',   'Test Sales',   'Kiểm tra khả năng bán hàng',                 'win',         1),
  ('traffic', 'Test Traffic', 'Kiểm tra khả năng thu hút traffic',          'win_traffic', 2),
  ('concept', 'Test Concept', 'Kiểm tra phản ứng với một concept/thiết kế', 'win_traffic', 3),
  ('content', 'Test Content', 'Kiểm tra hiệu quả hình ảnh/nội dung',        'win_traffic', 4)
on conflict (code) do nothing;

-- ---------- Mẫu KPI ----------
-- rules: [{"metric": "qty_net", "op": ">=", "value": 20}, ...] — metric xem src/lib/kpi-constants.ts
-- match: 'all' = phải đạt mọi điều kiện, 'any' = đạt 1 điều kiện là đủ
-- min_days / min_views: điều kiện "đủ dữ liệu" — chưa đủ thì KHÔNG kết luận FAIL
-- line / campaign: để trống = áp dụng chung; có giá trị = ưu tiên khi mẫu R&D cùng line/chiến dịch
create table if not exists kpi_templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  goal_code     text not null references test_goals(code),
  line          text,
  campaign      text,
  rules         jsonb not null default '[]',
  match         text not null default 'all' check (match in ('all', 'any')),
  min_days      int not null default 14 check (min_days >= 0),
  min_views     int not null default 0 check (min_views >= 0),
  duration_days int not null default 14 check (duration_days > 0),   -- thời gian test gợi ý
  is_default    boolean not null default false,                       -- mặc định của mục tiêu (dùng cả cho tín hiệu phụ)
  is_active     boolean not null default true,
  created_by    uuid references profiles(id),
  updated_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- Mỗi mục tiêu tối đa 1 mẫu mặc định
create unique index if not exists kpi_templates_one_default on kpi_templates (goal_code) where is_default;
alter table kpi_templates enable row level security;

-- Mẫu mặc định khởi đầu (ngưỡng tạm — Quản lý chỉnh trong trang "KPI")
insert into kpi_templates (name, goal_code, rules, match, min_days, min_views, duration_days, is_default)
select * from (values
  ('Sales mặc định',   'sales',   '[{"metric":"qty_net","op":">=","value":20},{"metric":"conversion","op":">=","value":1}]'::jsonb, 'all', 14, 2000, 21, true),
  ('Traffic mặc định', 'traffic', '[{"metric":"views","op":">=","value":5000},{"metric":"viewers","op":">=","value":3000}]'::jsonb, 'all', 7, 0, 14, true),
  ('Concept mặc định', 'concept', '[{"metric":"views","op":">=","value":3000},{"metric":"engagement_rate","op":">=","value":3}]'::jsonb, 'all', 7, 0, 14, true),
  ('Content mặc định', 'content', '[{"metric":"ctr","op":">=","value":1},{"metric":"views","op":">=","value":3000},{"metric":"engagement_rate","op":">=","value":3}]'::jsonb, 'all', 7, 0, 7, true)
) as v(name, goal_code, rules, match, min_days, min_views, duration_days, is_default)
where not exists (select 1 from kpi_templates t where t.goal_code = v.goal_code and t.is_default);

-- ---------- Phiên test ----------
-- KPI được CHỤP LẠI từ mẫu lúc bắt đầu (rules/match/min_*) → sửa mẫu sau đó không đổi luật phiên đang chạy.
-- Phạm vi số bán chọn theo phiên: all = toàn hệ thống; pages = chỉ đơn có tag page_id_ của các Trang;
-- channels = chỉ các kênh bán. Traffic luôn lấy từ bài gắn hashtag mã trong thời gian test
-- (khi scope = pages thì chỉ bài của các Trang đó).
create table if not exists test_sessions (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references rnd_products(id) on delete cascade,
  goal_code       text not null references test_goals(code),
  template_id     uuid references kpi_templates(id) on delete set null,
  campaign        text,
  start_date      date not null,
  end_date        date not null,
  sales_scope     text not null default 'all' check (sales_scope in ('all', 'pages', 'channels')),
  page_ids        text[] not null default '{}',
  channels        text[] not null default '{}',
  rules           jsonb not null,
  match           text not null check (match in ('all', 'any')),
  min_days        int not null,
  min_views       int not null,
  status          text not null default 'running' check (status in ('running', 'ended')),
  ended_at        timestamptz,
  -- Kết quả (giai đoạn 3): hệ thống đề xuất, R&D xác nhận
  result          text check (result in ('win', 'win_traffic', 'fail')),
  result_note     text,
  result_snapshot jsonb,                 -- số liệu + đánh giá tại lúc xác nhận
  confirmed_by    uuid references profiles(id),
  confirmed_at    timestamptz,
  note            text,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint test_sessions_dates check (end_date >= start_date)
);
-- Mỗi mẫu chỉ 1 phiên đang chạy
create unique index if not exists test_sessions_one_running on test_sessions (product_id) where status = 'running';
create index if not exists test_sessions_product_idx on test_sessions (product_id, start_date desc);
alter table test_sessions enable row level security;

notify pgrst, 'reload schema';
