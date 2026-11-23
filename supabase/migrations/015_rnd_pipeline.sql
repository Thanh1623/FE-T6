-- 015: Quy trình R&D đầy đủ — Sưu tầm → P0 duyệt → P1 3D → P2 mẫu → P3 media → P4 traffic → P5 Win thương mại hoá.
-- Chạy trên project fb-traffic, sau 014. Chạy lại vẫn an toàn.
--
--  • core.teams + profiles.team_id / is_team_lead (dùng chung cho R&D và phân Page theo team sau này)
--  • 2 vai trò mới: design3d (Thiết kế 3D), media (Media)
--  • rnd.products thêm thông tin sưu tầm + giai đoạn; code (SKU/hashtag) được phép trống tới khi lên video
--  • rnd.design_tasks (P1), rnd.sample_orders (P2), rnd.media_tasks (P3)
--  • rnd.link_code(): gắn SKU cho mẫu, gộp mẫu "tự động" cùng mã (do hệ thống tạo từ hashtag) vào mẫu R&D

-- ===================================================================================== TEAM
create table if not exists core.teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into core.teams (name) values ('Hồng Ngọc'), ('Global'), ('Đá quý'), ('HLB'), ('NLB') on conflict (name) do nothing;

alter table core.profiles add column if not exists team_id uuid references core.teams(id) on delete set null;
alter table core.profiles add column if not exists is_team_lead boolean not null default false;
alter table core.profiles drop constraint if exists profiles_role_check;
alter table core.profiles add constraint profiles_role_check check (role in ('admin', 'rnd', 'saobien', 'design3d', 'media'));

-- Chuẩn bị cho phân Page theo team (mỗi Page 1 team) — chưa dùng
alter table social.channels add column if not exists team_id uuid references core.teams(id) on delete set null;

-- ===================================================================================== MẪU R&D
alter table rnd.products alter column code drop not null;   -- check định dạng vẫn áp dụng khi có mã

create sequence if not exists rnd.st_code_seq start 101;   -- Lark đã dùng tới ~MST0074 → bắt đầu MST0101 tránh trùng

alter table rnd.products
  add column if not exists st_code        text unique,                -- Mã sưu tầm MST0101…, tự cấp
  add column if not exists stage          text check (stage in ('collection', 'p0', 'p1', 'p2', 'p3', 'p4', 'p5')),  -- null = mã tự động, không thuộc quy trình
  add column if not exists stage_at       timestamptz,
  add column if not exists approval       text check (approval in ('draft', 'pending', 'approved', 'rejected')),
  add column if not exists approved_by    uuid references core.profiles(id) on delete set null,
  add column if not exists approved_at    timestamptz,
  add column if not exists approval_note  text,
  add column if not exists approved_qty   int,                         -- SL duyệt làm mẫu
  add column if not exists team_id        uuid references core.teams(id) on delete set null,
  add column if not exists ref_url        text,                        -- link video/sản phẩm tham khảo
  add column if not exists ref_platform   text,
  add column if not exists ref_metrics    text,                        -- chỉ số thu thập: view, like, bình luận…
  add column if not exists price_ref      bigint,                      -- giá bán tham khảo
  add column if not exists product_group  text check (product_group in ('gmv', 'traffic', 'profit', 'return')),
  add column if not exists expected_cost  bigint,
  add column if not exists expected_price bigint,
  add column if not exists win_qty        int,                         -- SL duyệt sản xuất khi Win (P5)
  add column if not exists killed_at      timestamptz,                 -- dừng ở giai đoạn hiện tại (stage giữ mốc đã đạt)
  add column if not exists kill_reason    text;

create index if not exists products_stage_idx on rnd.products (stage) where stage is not null;
create index if not exists products_team_idx on rnd.products (team_id) where team_id is not null;

-- Mẫu thuộc quy trình (có stage) tự cấp Mã ST
create or replace function rnd.assign_st_code() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.stage is not null and new.st_code is null then
    new.st_code := 'MST' || lpad(nextval('rnd.st_code_seq')::text, 4, '0');
  end if;
  return new;
end $$;
drop trigger if exists products_st_code on rnd.products;
create trigger products_st_code before insert or update of stage on rnd.products
  for each row execute function rnd.assign_st_code();

-- P1: vẽ 3D (1 việc / mẫu)
create table if not exists rnd.design_tasks (
  product_id   uuid primary key references rnd.products(id) on delete cascade,
  assignee_id  uuid references core.profiles(id) on delete set null,
  status       text not null default 'todo' check (status in ('todo', 'doing', 'review', 'redo', 'done')),
  file_url     text,                       -- thư mục/file 3D (Drive)
  image_paths  text[] not null default '{}',  -- ảnh render 3D (bucket rnd-images)
  note         text,
  review_note  text,
  reviewed_by  uuid references core.profiles(id) on delete set null,
  submitted_at timestamptz,
  done_at      timestamptz,
  created_by   uuid references core.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists design_tasks_assignee_idx on rnd.design_tasks (assignee_id, status);

-- P2: đặt xưởng làm mẫu (có thể đặt lại nhiều lần)
create table if not exists rnd.sample_orders (
  id          bigint generated always as identity primary key,
  product_id  uuid not null references rnd.products(id) on delete cascade,
  supplier    text,                                   -- xưởng / NCC
  status      text not null default 'ordered' check (status in ('ordered', 'casting', 'finishing', 'received', 'cancelled')),
  ordered_at  date not null default current_date,
  expected_at date,
  received_at date,
  qty         int,
  unit        text,
  weight_chi  numeric,                                -- trọng lượng (chỉ)
  size        text,
  color       text,
  cost        bigint,                                 -- giá vốn mẫu
  price       bigint,                                 -- giá bán dự kiến
  note        text,
  created_by  uuid references core.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists sample_orders_product_idx on rnd.sample_orders (product_id, created_at desc);

-- P3: media quay source (1 việc / mẫu)
create table if not exists rnd.media_tasks (
  product_id   uuid primary key references rnd.products(id) on delete cascade,
  assignee_id  uuid references core.profiles(id) on delete set null,
  status       text not null default 'todo' check (status in ('todo', 'doing', 'review', 'redo', 'done')),
  brief        text,                                  -- yêu cầu nội dung
  deadline     date,
  drive_url    text,                                  -- link thư mục source → thành "kho Source" của mẫu
  note         text,
  review_note  text,
  reviewed_by  uuid references core.profiles(id) on delete set null,
  submitted_at timestamptz,
  done_at      timestamptz,
  created_by   uuid references core.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists media_tasks_assignee_idx on rnd.media_tasks (assignee_id, status);

do $$ declare t text; begin
  foreach t in array array['core.teams', 'rnd.design_tasks', 'rnd.sample_orders', 'rnd.media_tasks'] loop
    execute format('drop trigger if exists touch_updated_at on %s', t);
    execute format('create trigger touch_updated_at before update on %s for each row execute function core.touch_updated_at()', t);
    execute format('alter table %s enable row level security', t);
  end loop;
end $$;

-- Gắn SKU (mã hashtag) cho mẫu R&D. Nếu hệ thống đã tự tạo mẫu "tự động" cùng mã (video đăng trước khi gắn),
-- chuyển phiên test / kết luận / bàn giao / lịch sử / đánh giá sang mẫu R&D rồi xoá mẫu tự động.
create or replace function rnd.link_code(p_id uuid, p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare o record;
begin
  select id, stage into o from rnd.products where code = p_code and id <> p_id;
  if o.id is not null then
    if o.stage is not null then raise exception 'Mã % đã gắn với một mẫu R&D khác', p_code; end if;
    update rnd.test_sessions  set product_id = p_id where product_id = o.id;
    update rnd.decisions      set product_id = p_id where product_id = o.id;
    update rnd.handoffs       set product_id = p_id where product_id = o.id;
    update rnd.product_events set product_id = p_id where product_id = o.id;
    update rnd.evaluations    set product_id = p_id where product_id = o.id;
    update rnd.products t set
      sapo_code = coalesce(t.sapo_code, x.sapo_code), age_override = coalesce(t.age_override, x.age_override),
      source_url = coalesce(t.source_url, x.source_url), image_paths = t.image_paths || x.image_paths
    from rnd.products x where t.id = p_id and x.id = o.id;
    delete from rnd.products where id = o.id;
  end if;
  update rnd.products set code = p_code where id = p_id;
end $$;

-- ===================================================================================== QUYỀN
-- (default privileges của 011 đã cấp cho service_role và chặn anon/authenticated; khai báo lại cho chắc)
revoke all on all tables in schema core, rnd from public, anon, authenticated;
revoke all on all sequences in schema rnd from public, anon, authenticated;
revoke execute on function rnd.link_code(uuid, text) from public, anon, authenticated;
revoke execute on function rnd.assign_st_code() from public, anon, authenticated;
grant all on all tables in schema core, rnd to service_role;
grant all on all sequences in schema rnd to service_role;
grant execute on function rnd.link_code(uuid, text) to service_role;

notify pgrst, 'reload schema';
