-- 016: Bộ bảng R&D kiểu Lark (theo file "R&D sản phẩm.xlsx"). Chạy trên project fb-traffic, SAU 015. Chạy lại vẫn an toàn.
--  • Mã sưu tầm của app: tiền tố VST (VST0001…) — MST là của Lark
--  • Media: NHIỀU yêu cầu / mẫu (rnd.media_requests, thay rnd.media_tasks); mẫu sang Traffic khi mọi yêu cầu đã Đạt
--  • Đặt hàng: trạng thái theo danh sách cấu hình (Đặt hàng → Chốt đúc → Quay chế tác → Hoàn thành / Huỷ), thêm Chi phí khác
--  • rnd.status_log: thời điểm vào từng trạng thái → tính thời gian từng bước sản xuất
--  • Trường Traffic / Duyệt Win / Theo dõi hiệu quả nhập tay; team BOD

-- ===================================================================================== MÃ SƯU TẦM
create sequence if not exists rnd.vst_seq start 1;
create or replace function rnd.assign_st_code() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.stage is not null and new.st_code is null then
    new.st_code := 'VST' || lpad(nextval('rnd.vst_seq')::text, 4, '0');
  end if;
  return new;
end $$;

insert into core.teams (name) values ('BOD') on conflict (name) do nothing;

-- ===================================================================================== SƯU TẦM / TRAFFIC / WIN / HIỆU QUẢ
alter table rnd.products
  add column if not exists source_status     text,          -- Source: "Chưa có" / "Đã có source"
  add column if not exists traffic_owner     uuid references core.profiles(id) on delete set null,
  add column if not exists customer_feedback text,          -- Phản hồi khách hàng
  add column if not exists ads_cost          bigint,        -- Chi phí Ads
  add column if not exists traffic_review    text,          -- Đánh giá hiệu quả (traffic)
  add column if not exists traffic_note      text,
  add column if not exists launch_date       date,          -- Ngày mở bán
  add column if not exists lifecycle_review  text,          -- Đánh giá hiệu quả sau mở bán
  add column if not exists lifecycle_note    text;

-- ===================================================================================== ĐẶT HÀNG
alter table rnd.sample_orders drop constraint if exists sample_orders_status_check;
alter table rnd.sample_orders alter column status set default 'Đặt hàng';
update rnd.sample_orders set status = case status
  when 'ordered' then 'Đặt hàng' when 'casting' then 'Chốt đúc' when 'finishing' then 'Quay chế tác'
  when 'received' then 'Hoàn thành' when 'cancelled' then 'Huỷ' else status end;
alter table rnd.sample_orders add column if not exists cost_other bigint;   -- Chi phí khác (cost = Chi phí SX)

-- Thời điểm vào từng trạng thái (đặt hàng, media, 3D…) — để tính thời gian từng bước
create table if not exists rnd.status_log (
  id         bigint generated always as identity primary key,
  entity     text not null,           -- order / design / media / product
  entity_id  text not null,
  value      text not null,
  actor_id   uuid references core.profiles(id) on delete set null,
  at         timestamptz not null default now()
);
create index if not exists status_log_entity_idx on rnd.status_log (entity, entity_id, at);

-- ===================================================================================== MEDIA (nhiều yêu cầu / mẫu)
create table if not exists rnd.media_requests (
  id              bigint generated always as identity primary key,
  product_id      uuid not null references rnd.products(id) on delete cascade,
  sample_order_id bigint references rnd.sample_orders(id) on delete set null,   -- yêu cầu "Quay chế tác" sinh từ đơn nào
  request_type    text not null default 'Quay sản phẩm',   -- Yêu cầu nội dung (theo cấu hình)
  assignee_id     uuid references core.profiles(id) on delete set null,       -- Người phụ trách
  lead_id         uuid references core.profiles(id) on delete set null,       -- Trưởng nhóm media
  deadline        date,
  status          text not null default 'todo' check (status in ('todo', 'doing', 'done')),   -- Trạng thái xử lý
  drive_url       text,                                    -- Link drive file media
  photo_paths     text[] not null default '{}',            -- Ảnh chụp SP
  approval        text check (approval in ('pending', 'pass', 'redo')),        -- Duyệt source
  review_note     text,
  reviewed_by     uuid references core.profiles(id) on delete set null,
  note            text,
  received_at     timestamptz not null default now(),      -- Ngày tiếp nhận
  done_at         timestamptz,                             -- Ngày hoàn thành source
  created_by      uuid references core.profiles(id) on delete set null,       -- null = tạo tự động
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists media_requests_product_idx on rnd.media_requests (product_id);
create index if not exists media_requests_assignee_idx on rnd.media_requests (assignee_id, status);

-- Chuyển dữ liệu từ rnd.media_tasks (015, 1 việc / mẫu) rồi bỏ bảng cũ
do $$ begin
  if to_regclass('rnd.media_tasks') is not null then
    insert into rnd.media_requests (product_id, request_type, assignee_id, deadline, status, drive_url, approval, review_note,
                                    reviewed_by, note, received_at, done_at, created_by, created_at)
    select product_id, coalesce(nullif(brief, ''), 'Quay sản phẩm'), assignee_id, deadline,
           case status when 'todo' then 'todo' when 'doing' then 'doing' when 'redo' then 'doing' else 'done' end,
           drive_url, case status when 'review' then 'pending' when 'done' then 'pass' when 'redo' then 'redo' end,
           review_note, reviewed_by, note, created_at, done_at, created_by, created_at
    from rnd.media_tasks;
    drop table rnd.media_tasks;
  end if;
end $$;

do $$ declare t text; begin
  foreach t in array array['rnd.media_requests'] loop
    execute format('drop trigger if exists touch_updated_at on %s', t);
    execute format('create trigger touch_updated_at before update on %s for each row execute function core.touch_updated_at()', t);
  end loop;
end $$;
alter table rnd.media_requests enable row level security;
alter table rnd.status_log enable row level security;

-- ===================================================================================== QUYỀN
revoke all on all tables in schema rnd from public, anon, authenticated;
revoke all on all sequences in schema rnd from public, anon, authenticated;
grant all on all tables in schema rnd to service_role;
grant all on all sequences in schema rnd to service_role;

notify pgrst, 'reload schema';
