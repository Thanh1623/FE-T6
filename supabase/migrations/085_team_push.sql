-- 085: BẢNG 3 của QLHH — "Tồn kho & Đẩy hàng theo team" + yêu cầu đẩy hàng. CHẠY TAY trong Supabase SQL Editor, SAU 084. Chạy lại vẫn an toàn.
--  sales.tr_push(p_from, p_to): mọi SPU ĐANG TỒN KHO (tồn > 0, bỏ SPU công cụ dụng cụ trong sales.spu_excluded, mã trung gian) kèm số video / lượt xem / SL bán của TỪNG team trong kỳ —
--    lấy từ bảng tổng hợp SPU (sales.spu_summary, sales.spu_video_daily, sales.spu_sales_daily của lần tính mới nhất). Phân loại bán chạy / chậm / tồn xấu và mức ưu tiên tính ở ứng dụng theo ngưỡng ở trang KPI.
--  sales.push_requests: yêu cầu đẩy hàng Quản lý giao cho team (SPU, team, ưu tiên, số video mục tiêu, hạn, ghi chú; trạng thái todo → doing → done).
--  sales.tr_push_requests(): danh sách yêu cầu kèm SỐ VIDEO THỰC TẾ team đã đăng cho SPU đó từ ngày tạo yêu cầu (hoàn thành phải được xác nhận bằng số video thực tế).

create table if not exists sales.push_requests (
  id            bigserial primary key,
  code          text not null,
  team          text not null,
  priority      text not null default 'mid' check (priority in ('high', 'mid', 'low')),
  target_videos int  not null default 1 check (target_videos >= 1),
  due_on        date,
  note          text,
  status        text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  created_by    uuid,
  created_by_name text,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  done_at       timestamptz
);
create index if not exists push_requests_team_idx on sales.push_requests (team, status);
create index if not exists push_requests_code_idx on sales.push_requests (code);
alter table sales.push_requests enable row level security;
grant all on sales.push_requests to service_role;
revoke all on sales.push_requests from anon, authenticated;
grant usage, select on sequence sales.push_requests_id_seq to service_role;

create or replace function sales.tr_push(p_from date, p_to date)
returns jsonb
language sql stable
as $$
  with m as (select run_id from sales.spu_summary_meta limit 1),
  s as (
    select s.code, left(s.name, 80) name, s.stock_total stock, coalesce(s.incoming, 0) incoming, s.age_days, s.sold30
    from sales.spu_summary s
    where s.run_id = (select run_id from m) and s.stock_total > 0
      and s.code !~* 'TRUNGGIAN' and s.code not in (select code from sales.spu_excluded)),
  v as (select code, team, sum(videos)::int videos, sum(views)::bigint views
        from sales.spu_video_daily where run_id = (select run_id from m) and day between p_from and p_to and team is not null group by code, team),
  d as (select code, team, sum(qty)::int sold
        from sales.spu_sales_daily where run_id = (select run_id from m) and day between p_from and p_to and team is not null group by code, team),
  t as (
    select coalesce(v.code, d.code) code, coalesce(v.team, d.team) team, coalesce(v.videos, 0) videos, coalesce(v.views, 0) views, coalesce(d.sold, 0) sold
    from v full join d on d.code = v.code and d.team = v.team),
  tj as (select t.code, jsonb_agg(jsonb_build_array(t.team, t.videos, t.views, t.sold) order by t.videos desc, t.sold desc) teams
         from t where t.code in (select code from s) group by t.code)
  select jsonb_build_object(
    'spus', coalesce((select jsonb_agg(jsonb_build_array(s.code, s.name, s.stock, s.incoming, s.age_days, s.sold30, coalesce(tj.teams, '[]'::jsonb)) order by s.stock desc, s.code)
                      from s left join tj on tj.code = s.code), '[]'::jsonb),
    'refreshed_at', (select refreshed_at from sales.spu_summary_meta limit 1))
$$;

create or replace function sales.tr_push_requests(p_team text default null)
returns jsonb
language sql stable
as $$
  with m as (select run_id from sales.spu_summary_meta limit 1),
  r as (select * from sales.push_requests where p_team is null or team = p_team),
  vv as (select r.id, coalesce(sum(vd.videos), 0)::int done_videos
         from r left join sales.spu_video_daily vd
           on vd.run_id = (select run_id from m) and vd.code = r.code and vd.team = r.team and vd.day >= (r.created_at at time zone 'Asia/Ho_Chi_Minh')::date
         group by r.id)
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'code', r.code, 'name', left(coalesce(sm.name, r.code), 80), 'team', r.team, 'priority', r.priority, 'target', r.target_videos, 'due', r.due_on,
      'note', r.note, 'status', r.status, 'by', r.created_by_name, 'created', r.created_at, 'started', r.started_at, 'done_at', r.done_at, 'done_videos', vv.done_videos)
    order by case r.status when 'done' then 1 else 0 end, r.due_on nulls last, r.id desc), '[]'::jsonb)
  from r join vv on vv.id = r.id left join sales.spu_summary sm on sm.code = r.code and sm.run_id = (select run_id from m)
$$;

do $$
begin
  execute 'grant execute on function sales.tr_push(date, date) to service_role';
  execute 'revoke all on function sales.tr_push(date, date) from anon, authenticated, public';
  execute 'grant execute on function sales.tr_push_requests(text) to service_role';
  execute 'revoke all on function sales.tr_push_requests(text) from anon, authenticated, public';
end $$;

notify pgrst, 'reload schema';
