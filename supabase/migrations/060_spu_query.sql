-- 060: Hàm SQL đọc bảng tổng hợp SPU (lọc, đếm, sắp xếp, phân trang ngay trong database) cho trang Theo dõi đẩy hàng và Dashboard. CHẠY TAY trong Supabase SQL Editor, SAU 059. Chạy lại vẫn an toàn.
--  • Tài liệu thiết kế + cách bảo trì: docs/KIEN-TRUC-TONG-HOP-SPU.md (ĐỌC TRƯỚC khi sửa file này).
--  • Công thức PHẢI giống viewOf() trong src/lib/spu-tracking.ts (nguồn chân lý). Sửa một nơi thì sửa nơi kia rồi chạy đối chiếu: /api/cron/spu-summary?check=2.
--  • Ngưỡng bán chạy / chậm truyền vào làm tham số (lấy từ trang KPI), KHÔNG viết cứng ở đây.
--  • Win Traffic / Win Đơn hàng / Ngôi sao (QUY TẮC WIN duy nhất, trang KPI) phụ thuộc kỳ đang lọc nên tính ở TypeScript (lib/spu-winflags.ts) rồi TRUYỀN VÀO hàm dưới dạng danh sách mã: p.wt = đạt Win Traffic, p.ord = đạt Win Đơn hàng; Ngôi sao = đạt cả hai.

alter table sales.spu_summary add column if not exists search_text text not null default '';   -- mã + tên, không dấu, chữ thường (để tìm kiếm)

-- Dựng lại view để có cột mới (view cũ được tạo bằng "select s.*" tại thời điểm 059)
drop view if exists sales.v_spu_summary;
create view sales.v_spu_summary as select s.* from sales.spu_summary s join sales.spu_summary_meta m on m.run_id = s.run_id;
grant select on sales.v_spu_summary to service_role;
revoke all on sales.v_spu_summary from anon, authenticated;

-- ============================================================================================================
-- sales.spu_query(p jsonb): MỘT lượt gọi trả về mọi thứ trang /spu cần (thẻ, số trên các nút lọc, tổng, 1 trang dòng)
--   p = {
--     today:'YYYY-MM-DD'(giờ VN), days:int, end_age:int      -- kỳ xem: [end_age, end_age+days) ngày tính lùi từ hôm nay
--     teams:[tên team], wh:'', grp:'', words:[từ khoá đã bỏ dấu],
--     slow_below:int, normal_below:int,                       -- ngưỡng bán chậm / bán chạy (SL bán 30 ngày)
--     wt:[mã đạt Win Traffic], ord:[mã đạt Win Đơn hàng],
--     status:'all|instock|hot|normal|slow|bad|star|win|wintraffic|novideo|video',
--     sort:'stock|available|incoming|age|sold|videos|teams|views', dir:'asc|desc', page:int, page_size:int }
-- ============================================================================================================
create or replace function sales.spu_query(p jsonb) returns jsonb
language plpgsql stable
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
  s30 as (select code, sum(qty)::int qty from sales.v_spu_sales_daily where day > v_today - 30 and team = any(v_teams) group by code),
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
           case when b.sold30 is null then null when v_has_teams then coalesce(s30.qty, 0) else b.sold30 end as sl30,
           case when b.sold30 is null then null when v_has_teams then coalesce(st.qty, 0) else coalesce(sa.qty, 0) end as sold,
           coalesce(case when v_has_teams then vt.videos else va.videos end, 0) as videos,
           case when coalesce(case when v_has_teams then vt.videos else va.videos end, 0) > 0 then (case when v_has_teams then vt.views else va.views end) end as views
    from b left join sa on sa.code = b.code left join st on st.code = b.code left join s30 on s30.code = b.code
         left join va on va.code = b.code left join vt on vt.code = b.code left join vtm on vtm.code = b.code
    where not v_has_teams or b.video_teams && v_teams
  ),
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

grant execute on function sales.spu_query(jsonb) to service_role;
revoke all on function sales.spu_query(jsonb) from anon, authenticated, public;

notify pgrst, 'reload schema';
