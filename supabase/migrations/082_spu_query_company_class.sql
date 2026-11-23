-- 082: Trang "Theo dõi hiệu quả SPU": DANH SÁCH SPU và cách phân loại theo TỒN / SL bán 30 ngày (Active, còn hàng, bán chạy, thường, chậm, tồn xấu) luôn là TOÀN CÔNG TY.
-- Lọc theo team chỉ đổi các số của team: SL bán trong kỳ, số video, lượt xem, số team đăng (và các tab "Chưa có video" / "Đã có video" theo video của team) — không còn lọc bớt danh sách mã
-- hay phân loại lại theo số bán của team như bản trước. Thẻ thống kê trên cùng và các tab bên dưới vì vậy cùng một tập SPU và khớp nhau.
-- CHẠY TAY trong Supabase SQL Editor. Chạy lại vẫn an toàn.
-- Thay đổi so với bản trước: bỏ điều kiện lọc danh sách theo team ở CTE sc, sl30 luôn bằng sold30 của công ty.

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
           case when coalesce(case when v_has_teams then vt.videos else va.videos end, 0) > 0 then (case when v_has_teams then vt.views else va.views end) end as views
    from b left join sa on sa.code = b.code left join st on st.code = b.code
         left join va on va.code = b.code left join vt on vt.code = b.code left join vtm on vtm.code = b.code
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
      'slow', count(*) filter (where slow), 'bad', count(*) filter (where bad), 'star', count(*) filter (where f_wt and f_ord), 'win', count(*) filter (where f_ord),
      'wintraffic', count(*) filter (where f_wt), 'novideo', count(*) filter (where not has_video), 'video', count(*) filter (where has_video)) as j
    from sa2
  ),
  flt as (
    select * from sa2 where case v_status
      when 'instock' then in_stock when 'hot' then hot when 'normal' then normal when 'slow' then slow when 'bad' then bad
      when 'star' then (f_wt and f_ord) when 'win' then f_ord when 'wintraffic' then f_wt
      when 'novideo' then not has_video when 'video' then has_video else true end
  ),
  tot as (
    select jsonb_build_object('n', count(*), 'stock', coalesce(sum(stock), 0), 'available', coalesce(sum(available), 0), 'incoming', coalesce(sum(incoming), 0),
      'sold', coalesce(sum(sold), 0), 'videos', coalesce(sum(videos), 0), 'views', coalesce(sum(views), 0),
      'teams', (select count(distinct t) from flt, unnest(flt.pt) t)) as j
    from flt
  ),
  keyed as (
    select flt.*, case v_sort when 'stock' then stock::numeric when 'available' then available::numeric when 'incoming' then incoming::numeric
        when 'age' then age_days::numeric when 'sold' then sold::numeric when 'videos' then videos::numeric
        when 'teams' then (case when videos > 0 then coalesce(cardinality(pt), 0) else 0 end)::numeric else views::numeric end as sk
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
        'sold30', sold30, 'sl30', sl30, 'video_teams', pt, 'stock', stock, 'available', available, 'sold', sold, 'videos', videos, 'views', views,
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

notify pgrst, 'reload schema';
