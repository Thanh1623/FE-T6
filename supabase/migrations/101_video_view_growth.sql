-- 101: Cột "Lượt xem" = lượt xem TĂNG THÊM trong kỳ lọc + cột "View 3N" (tăng 3 ngày) ở trang Theo dõi hiệu quả SPU. CHẠY TAY trong Supabase SQL Editor, SAU 100. Chạy lại vẫn an toàn.
-- (Bản này thay bản 101 trước: bản trước chỉ có View 3N; nếu đã chạy bản đó thì cứ chạy lại file này — nó thay hàm và dọn bảng cũ sales.video_growth.)
--
-- Dữ liệu: social.post_daily lưu lượt xem TÍCH LUỸ của từng bài theo từng ngày (mốc đầu 2026-10-09). Lượt tăng của một bài trong ngày D = lượt xem mốc D trừ mốc liền trước nó.
--   • Mốc đầu tiên của bài: bài đăng trong vòng 1 ngày trước mốc đó (bài mới) → tính TOÀN BỘ từ 0; bài cũ (có sẵn trước khi bắt đầu lưu lịch) → 0 (chỉ làm gốc, không khai khống).
--   • Giữa hai mốc có khoảng trống (ngày không đồng bộ): phần tăng dồn vào ngày của mốc sau. Số âm (lượt xem bị điều chỉnh giảm) → 0.
-- Quy tắc gom GIỐNG video_daily (089): mã SPU đã quy mã cũ → mới, chỉ kênh đang bật, team = team của kênh.
--
--  sales.video_views_daily    — (ngày, mã SPU, team) → lượt xem tăng thêm trong ngày. Dựng lại TOÀN BỘ mỗi lần trong một giao dịch (~11 nghìn dòng, vài trăm ms).
--  sales.refresh_video_views  — gọi sau refresh_video_daily (lib/video-daily.ts); lỗi hoặc chưa chạy migration này thì 2 cột chỉ hiện "—", phần còn lại của trang không đổi.
--  sales.spu_query            — "views" (Lượt xem) = Σ lượt tăng các NGÀY TRONG KỲ LỌC của MỌI video gắn mã (không còn giới hạn ở video đăng trong kỳ); "views3" (View 3N) = 3 ngày gần nhất,
--                               không theo kỳ lọc. Cả hai theo team khi lọc team; "—" khi SPU chưa có video; có video nhưng không tăng → 0. Phần còn lại GIỐNG HỆT 095.
-- Lưu ý: kỳ lọc lùi xa hơn 09/10/2026 chỉ có phần lượt tăng từ 09/10 (chưa có mốc trước đó).

create table if not exists sales.video_views_daily (
  day   date   not null,
  code  text   not null,
  team  text   not null default '',
  views bigint not null default 0,
  primary key (day, code, team)
);
create index if not exists video_views_daily_code_idx on sales.video_views_daily (code, day);
alter table sales.video_views_daily enable row level security;
grant all on sales.video_views_daily to service_role;
revoke all on sales.video_views_daily from anon, authenticated;

create or replace function sales.refresh_video_views()
returns jsonb
language plpgsql
as $$
declare v_rows int; v_total bigint;
begin
  perform pg_advisory_xact_lock(8900003);   -- hai lượt dựng chồng nhau: khoá xếp nối đuôi (giống refresh_video_daily)
  delete from sales.video_views_daily where true;   -- Supabase bật pg_safeupdate: DELETE bắt buộc có WHERE
  insert into sales.video_views_daily (day, code, team, views)
  with snap as (
    select pd.post_id, pd.date, pd.views, f.day as pub_day, f.channel_id, f.codes,
           lag(pd.views) over (partition by pd.post_id order by pd.date) as prev_views,
           row_number() over (partition by pd.post_id order by pd.date) as rn
    from social.post_daily pd join sales.video_fact f on f.post_id = pd.post_id),
  inc as (
    select s.post_id, s.date as day, s.channel_id, s.codes,
           case when s.rn = 1 then (case when s.pub_day >= s.date - 1 then s.views else 0 end)
                else greatest(0, s.views - s.prev_views) end as d
    from snap s)
  select i.day, c.code, coalesce(t.name, ''), sum(i.d)::bigint
  from inc i
  join social.channels ch on ch.id = i.channel_id and ch.is_active
  left join core.teams t on t.id = ch.team_id
  cross join lateral unnest(i.codes) as c(code)
  where i.d > 0
  group by i.day, c.code, coalesce(t.name, '');
  get diagnostics v_rows = row_count;
  select coalesce(sum(views), 0) into v_total from sales.video_views_daily;
  return jsonb_build_object('rows', v_rows, 'views', v_total);
end
$$;

do $$
begin
  execute 'grant execute on function sales.refresh_video_views() to service_role';
  execute 'revoke all on function sales.refresh_video_views() from anon, authenticated, public';
end $$;

create or replace function sales.spu_query(p jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_today  date := (p->>'today')::date;
  v_days   int  := greatest(1, (p->>'days')::int);
  v_end    int  := coalesce((p->>'end_age')::int, 0);
  v_teams  text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p->'teams', '[]'::jsonb))), '{}');
  v_wh     text := coalesce(p->>'wh', '');
  v_grp    text := coalesce(p->>'grp', '');
  v_words  text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p->'words', '[]'::jsonb))), '{}');
  v_wt     text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p->'wt', '[]'::jsonb))), '{}');
  v_ord    text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p->'ord', '[]'::jsonb))), '{}');
  v_slow   int  := (p->>'slow_below')::int;
  v_norm   int  := (p->>'normal_below')::int;
  v_status text := coalesce(p->>'status', 'all');
  v_sort   text := coalesce(p->>'sort', 'stock');
  v_asc    boolean := coalesce(p->>'dir', 'desc') = 'asc';
  v_size   int  := greatest(1, coalesce((p->>'page_size')::int, 50));
  v_want   int  := greatest(1, coalesce((p->>'page')::int, 1));
  v_from   date;
  v_to     date;
  v_has_teams boolean;
  v_result jsonb;
begin
  -- Kho không có trong dữ liệu thì coi như không chọn kho (giống trang)
  if v_wh <> '' and not exists (select 1 from sales.v_spu_summary s, jsonb_object_keys(s.stock_by) k where k = v_wh) then v_wh := ''; end if;
  v_to := v_today - v_end;
  v_from := v_to - v_days + 1;
  v_has_teams := cardinality(v_teams) > 0;

  with
  b as (
    select s.code, s.name, s.grp, s.variants, s.image, s.incoming, s.age_days, s.age_approx, s.sold30, s.video_teams, (s.code = any(v_wt)) as f_wt, (s.code = any(v_ord)) as f_ord,
           case when v_wh <> '' then coalesce((s.stock_by->>v_wh)::int, 0) else s.stock_total end as stock,
           case when s.avail_by is null then null when v_wh <> '' then coalesce((s.avail_by->>v_wh)::int, 0)
                else coalesce((select sum(value::int) from jsonb_each_text(s.avail_by)), 0)::int end as available
    from sales.v_spu_summary s
    where (v_grp = '' or s.grp = v_grp) and (v_wh = '' or coalesce((s.stock_by->>v_wh)::int, 0) > 0)
      and not exists (select 1 from unnest(v_words) w where strpos(s.search_text, w) = 0)
  ),
  sa  as (select code, sum(qty)::int qty from sales.v_spu_sales_daily where day between v_from and v_to group by code),
  st  as (select code, sum(qty)::int qty from sales.v_spu_sales_daily where day between v_from and v_to and team = any(v_teams) group by code),
  va  as (select code, sum(videos)::int videos, sum(views)::bigint views from sales.v_spu_video_daily where day between v_from and v_to group by code),
  vt  as (select code, sum(videos)::int videos, sum(views)::bigint views from sales.v_spu_video_daily where day between v_from and v_to and team = any(v_teams) group by code),
  -- Lượt xem TĂNG THÊM (sales.video_views_daily): gp / gpt = trong kỳ lọc (mọi video gắn mã, không chỉ video đăng trong kỳ); g3 / g3t = 3 ngày gần nhất (không theo kỳ lọc)
  gp  as (select code, sum(views)::bigint v from sales.video_views_daily where day between v_from and v_to group by code),
  gpt as (select code, sum(views)::bigint v from sales.video_views_daily where day between v_from and v_to and team = any(v_teams) group by code),
  g3  as (select code, sum(views)::bigint v from sales.video_views_daily where day > v_today - 3 group by code),
  g3t as (select code, sum(views)::bigint v from sales.video_views_daily where day > v_today - 3 and team = any(v_teams) group by code),
  hv  as (select exists (select 1 from sales.video_views_daily) as ok),   -- bảng chưa được dựng lần nào → hiện "—" thay vì 0
  vtm as (select code, array_agg(distinct team::text) as teams from sales.v_spu_video_daily where day between v_from and v_to and team is not null and (not v_has_teams or team = any(v_teams)) group by code),
  c as (
    select b.*, (b.stock > 0) as in_stock, (b.stock > 0 or (b.sold30 is not null and b.sold30 > 0)) as active,
           (b.sold30 is not null and b.sold30 >= v_norm) as hot,
           (b.sold30 is not null and b.sold30 >= v_slow and b.sold30 < v_norm) as normal,
           (b.sold30 is not null and b.sold30 > 0 and b.sold30 < v_slow) as slow,
           (b.stock > 0 and b.sold30 is not null and b.sold30 = 0) as bad,
           coalesce(case when v_has_teams then vt.videos else va.videos end, 0) as vids
    from b left join va on va.code = b.code left join vt on vt.code = b.code
  ),
  -- Thẻ thống kê: danh sách SPU và cách phân loại theo tồn / SL bán 30 ngày luôn là TOÀN CÔNG TY (c); lọc team chỉ đổi số video trong thẻ
  cards as (
    select jsonb_build_object(
      'active',  jsonb_build_object('all', count(*) filter (where active), 'video', count(*) filter (where active and vids > 0), 'vids', coalesce(sum(vids) filter (where active and vids > 0), 0)),
      'instock', jsonb_build_object('all', count(*) filter (where active and in_stock), 'video', count(*) filter (where active and in_stock and vids > 0), 'vids', coalesce(sum(vids) filter (where active and in_stock and vids > 0), 0)),
      'hot',     jsonb_build_object('all', count(*) filter (where active and hot), 'video', count(*) filter (where active and hot and vids > 0), 'vids', coalesce(sum(vids) filter (where active and hot and vids > 0), 0)),
      'normal',  jsonb_build_object('all', count(*) filter (where active and normal), 'video', count(*) filter (where active and normal and vids > 0), 'vids', coalesce(sum(vids) filter (where active and normal and vids > 0), 0)),
      'slow',    jsonb_build_object('all', count(*) filter (where active and slow), 'video', count(*) filter (where active and slow and vids > 0), 'vids', coalesce(sum(vids) filter (where active and slow and vids > 0), 0)),
      'bad',     jsonb_build_object('all', count(*) filter (where active and bad), 'video', count(*) filter (where active and bad and vids > 0), 'vids', coalesce(sum(vids) filter (where active and bad and vids > 0), 0))
    ) as j from c
  ),
  sc as (
    select b.code, b.name, b.grp, b.variants, b.image, b.incoming, b.age_days, b.age_approx, b.sold30, b.video_teams, coalesce(vtm.teams, '{}'::text[]) as pt, b.stock, b.available, b.f_wt, b.f_ord,
           b.sold30 as sl30,   -- phân loại theo tồn / SL bán 30 ngày: toàn công ty, không theo team
           case when b.sold30 is null then null when v_has_teams then coalesce(st.qty, 0) else coalesce(sa.qty, 0) end as sold,
           coalesce(case when v_has_teams then vt.videos else va.videos end, 0) as videos,
           case when (select ok from hv) and cardinality(b.video_teams) > 0 then coalesce(case when v_has_teams then gpt.v else gp.v end, 0) end as views,    -- lượt xem tăng trong kỳ lọc
           case when (select ok from hv) and cardinality(b.video_teams) > 0 then coalesce(case when v_has_teams then g3t.v else g3.v end, 0) end as views3   -- lượt xem tăng 3 ngày gần nhất
    from b left join sa on sa.code = b.code left join st on st.code = b.code
         left join va on va.code = b.code left join vt on vt.code = b.code left join vtm on vtm.code = b.code
         left join gp on gp.code = b.code left join gpt on gpt.code = b.code left join g3 on g3.code = b.code left join g3t on g3t.code = b.code
  ),   -- không lọc danh sách theo team: lọc team chỉ đổi SL bán / video / lượt xem / số team đăng

  sf as (
    select sc.*, (sc.stock > 0) as in_stock, (sc.stock > 0 or (sc.sl30 is not null and sc.sl30 > 0)) as active,
           (sc.sl30 is not null and sc.sl30 >= v_norm) as hot,
           (sc.sl30 is not null and sc.sl30 >= v_slow and sc.sl30 < v_norm) as normal,
           (sc.sl30 is not null and sc.sl30 > 0 and sc.sl30 < v_slow) as slow,
           (sc.stock > 0 and sc.sl30 is not null and sc.sl30 = 0) as bad, (sc.videos > 0) as has_video
    from sc
  ),
  sa2 as (select * from sf where active),
  counts as (
    select jsonb_build_object('all', count(*), 'instock', count(*) filter (where in_stock), 'hot', count(*) filter (where hot), 'normal', count(*) filter (where normal),
      'slow', count(*) filter (where slow), 'bad', count(*) filter (where bad), 'outstock', count(*) filter (where not in_stock), 'star', count(*) filter (where f_wt and f_ord), 'win', count(*) filter (where f_ord),
      'wintraffic', count(*) filter (where f_wt), 'novideo', count(*) filter (where not has_video), 'video', count(*) filter (where has_video)) as j
    from sa2
  ),
  flt as (
    select * from sa2 where case v_status
      when 'instock' then in_stock when 'outstock' then not in_stock when 'hot' then hot when 'normal' then normal when 'slow' then slow when 'bad' then bad
      when 'star' then (f_wt and f_ord) when 'win' then f_ord when 'wintraffic' then f_wt
      when 'novideo' then not has_video when 'video' then has_video else true end
  ),
  tot as (
    select jsonb_build_object('n', count(*), 'stock', coalesce(sum(stock), 0), 'available', coalesce(sum(available), 0), 'incoming', coalesce(sum(incoming), 0),
      'sold', coalesce(sum(sold), 0), 'videos', coalesce(sum(videos), 0), 'views', coalesce(sum(views), 0), 'views3', coalesce(sum(views3), 0),
      'teams', (select count(distinct t) from flt, unnest(flt.pt) t)) as j
    from flt
  ),
  keyed as (
    select flt.*, case v_sort when 'stock' then stock::numeric when 'available' then available::numeric when 'incoming' then incoming::numeric
        when 'age' then age_days::numeric when 'sold' then sold::numeric when 'videos' then videos::numeric
        when 'teams' then (case when videos > 0 then coalesce(cardinality(pt), 0) else 0 end)::numeric when 'views3' then views3::numeric else views::numeric end as sk
    from flt
  ),
  calc as (select (j->>'n')::int n, least(v_want, greatest(1, ceil((j->>'n')::numeric / v_size)::int)) page from tot),
  pg as (
    select * from keyed
    order by (sk is null), case when v_asc then sk end asc, case when not v_asc then sk end desc, code collate "C" asc
    offset ((select page from calc) - 1) * v_size limit v_size
  )
  select jsonb_build_object(
    'warehouses', coalesce((select jsonb_agg(k order by k collate "C") from (select distinct k from sales.v_spu_summary, jsonb_object_keys(stock_by) k) w), '[]'::jsonb),
    'cards', (select j from cards), 'status_counts', (select j from counts), 'totals', (select j from tot),
    'total', (select n from calc), 'page', (select page from calc), 'pages', greatest(1, ceil((select n from calc)::numeric / v_size)::int),
    'refreshed_at', (select refreshed_at from sales.spu_summary_meta where id = 1),
    'wh', v_wh, 'spus', (select count(*) from sales.v_spu_summary),
    'meta', (select to_jsonb(m) from sales.spu_summary_meta m where id = 1),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'code', code, 'name', name, 'grp', grp, 'variants', variants, 'image', image, 'incoming', incoming, 'age_days', age_days, 'age_approx', age_approx,
        'sold30', sold30, 'sl30', sl30, 'video_teams', pt, 'stock', stock, 'available', available, 'sold', sold, 'videos', videos, 'views', views, 'views3', views3,
        'star', (f_wt and f_ord), 'win', f_ord, 'wt', f_wt) order by (sk is null), case when v_asc then sk end asc, case when not v_asc then sk end desc, code collate "C" asc) from pg), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

do $$
begin
  execute 'grant execute on function sales.spu_query(jsonb) to service_role';
  execute 'revoke all on function sales.spu_query(jsonb) from anon, authenticated, public';
end $$;

-- Dọn bản cũ (chỉ có View 3N) nếu đã từng chạy
drop function if exists sales.refresh_video_growth(int);
drop table if exists sales.video_growth;

-- Dựng ngay lần đầu để hai cột có số liền (không phải đợi lần làm mới bảng tổng hợp kế tiếp)
select sales.refresh_video_views();

notify pgrst, 'reload schema';
