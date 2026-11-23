-- 061: Hàm SQL cho Dashboard "Báo cáo đẩy tồn" (thẻ S0, cơ cấu video, trạng thái tồn kho, cảnh báo). CHẠY TAY trong Supabase SQL Editor, SAU 060. Chạy lại vẫn an toàn.
--  • Tài liệu thiết kế + cách bảo trì: docs/KIEN-TRUC-TONG-HOP-SPU.md (ĐỌC TRƯỚC khi sửa file này).
--  • Công thức PHẢI giống lib/spu-tracking.ts (saleFlags, viewOf) — nguồn chân lý. Đối chiếu: /api/cron/spu-summary?check=2.
--  • Cần thêm quyền đọc bảng social.posts / social.channels cho hàm (chạy bằng quyền người gọi = service role, đã có).
--
-- sales.spu_dash(p jsonb)
--   p = { today:'YYYY-MM-DD', days:int, end_age:int, teams:[tên team], channels:[id Page] | null, slow_below:int, normal_below:int, alert_limit:int,
--         wt:[mã đạt Win Traffic], ord:[mã đạt Win Đơn hàng] }   -- QUY TẮC WIN duy nhất (trang KPI), tính ở lib/spu-winflags.ts; Ngôi sao = đạt cả hai
--   Trả về: s0 · s1 (SPU Active đăng video trong kỳ) · win (SPU Active ĐANG Win: cuốn chiếu, không theo kỳ) · cats · groups · stock_status · active_codes · alerts(rows, vids_total, top_videos)
create or replace function sales.spu_dash(p jsonb) returns jsonb
language plpgsql stable
as $$
declare
  v_today date := (p->>'today')::date;
  v_days  int  := greatest(1, (p->>'days')::int);
  v_end   int  := coalesce((p->>'end_age')::int, 0);
  v_teams text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p->'teams', '[]'::jsonb))), '{}');
  v_has_channels boolean := p ? 'channels' and jsonb_typeof(p->'channels') = 'array';
  v_channels text[] := case when p ? 'channels' and jsonb_typeof(p->'channels') = 'array' then array(select jsonb_array_elements_text(p->'channels')) else '{}' end;
  v_slow  int := (p->>'slow_below')::int;
  v_norm  int := (p->>'normal_below')::int;
  v_limit int := coalesce((p->>'alert_limit')::int, 8);
  v_wt    text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p->'wt', '[]'::jsonb))), '{}');
  v_ord   text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p->'ord', '[]'::jsonb))), '{}');
  v_from  date;
  v_to    date;
  v_has_teams boolean;
  v_result jsonb;
begin
  v_to := v_today - v_end;
  v_from := v_to - v_days + 1;
  v_has_teams := cardinality(v_teams) > 0;

  with
  -- Video trong kỳ: theo bộ lọc team / Page của Dashboard (cơ cấu, nhóm trạng thái) và toàn công ty (cảnh báo)
  vp as (select code, sum(videos)::int videos from sales.v_spu_video_daily
         where day between v_from and v_to and (not v_has_teams or team = any(v_teams)) and (not v_has_channels or channel_id = any(v_channels)) group by code),
  vc as (select code, sum(videos)::int videos, sum(views)::bigint views from sales.v_spu_video_daily where day between v_from and v_to group by code),
  sc as (select code, sum(qty)::int qty from sales.v_spu_sales_daily where day between v_from and v_to group by code),
  s30t as (select code, sum(qty)::int qty from sales.v_spu_sales_daily where day > v_today - 30 and team = any(v_teams) group by code),
  a as (
    select s.code, s.name, s.grp, s.stock_total as stock, s.age_days, s.age_approx, s.sold30, s.video_teams, s.incoming,
           (s.code = any(v_wt)) as f_wt, (s.code = any(v_ord)) as f_ord,
           -- phân loại TOÀN CÔNG TY
           (s.stock_total > 0) as in_stock,
           (s.stock_total > 0 or (s.sold30 is not null and s.sold30 > 0)) as c_active,
           (s.sold30 is not null and s.sold30 >= v_norm) as c_hot,
           (s.sold30 is not null and s.sold30 >= v_slow and s.sold30 < v_norm) as c_normal,
           (s.sold30 is not null and s.sold30 > 0 and s.sold30 < v_slow) as c_slow,
           (s.stock_total > 0 and s.sold30 is not null and s.sold30 = 0) as c_bad,
           -- phân loại theo bộ lọc team của Dashboard (số bán riêng của team)
           case when s.sold30 is null then null when v_has_teams then coalesce(t.qty, 0) else s.sold30 end as t_sl30,
           coalesce(vp.videos, 0) as videos_p,
           coalesce(vc.videos, 0) as videos_c, vc.views as views_c,
           case when s.sold30 is null then null else coalesce(sc.qty, 0) end as sold_c
    from sales.v_spu_summary s
    left join vp on vp.code = s.code left join vc on vc.code = s.code left join sc on sc.code = s.code left join s30t t on t.code = s.code
  ),
  tf as (
    select a.*, (a.t_sl30 is not null and a.t_sl30 >= v_norm) as t_hot,
           (a.t_sl30 is not null and a.t_sl30 > 0 and a.t_sl30 < v_slow) as t_slow,
           (a.stock > 0 and a.t_sl30 is not null and a.t_sl30 = 0) as t_bad
    from a
  ),
  -- 5 nhóm như các thẻ ở trang Theo dõi đẩy hàng (có thể chồng nhau)
  g as (
    select * from (values (1, 'SPU Active'), (2, 'SPU còn hàng'), (3, 'SPU bán chậm'), (4, 'SPU tồn xấu'), (5, 'SPU bán chạy')) t(ord, label)
  ),
  groups as (
    select g.ord, g.label,
      count(*) filter (where case g.ord when 1 then c_active when 2 then in_stock when 3 then c_slow when 4 then c_bad else c_hot end) as spu,
      count(*) filter (where case g.ord when 1 then c_active when 2 then in_stock when 3 then c_slow when 4 then c_bad else c_hot end and videos_p > 0) as with_video,
      coalesce(sum(videos_p) filter (where case g.ord when 1 then c_active when 2 then in_stock when 3 then c_slow when 4 then c_bad else c_hot end), 0) as posted
    from tf cross join g group by g.ord, g.label
  ),
  cats as (
    select grp as name, sum(videos_p)::int as posted from tf group by grp having sum(videos_p) > 0
  ),
  -- Cảnh báo: SPU Active (nếu có lọc team thì chỉ SPU team đã đăng video); số liệu toàn công ty trong kỳ
  al as (select * from tf where c_active and (not v_has_teams or video_teams && v_teams)),
  s1 as (select * from tf where c_active and videos_p > 0),
  -- Top video: lấy trước 3.000 bài nhiều lượt xem nhất trong kỳ (rẻ) rồi mới nối với SPU còn hàng — không nối toàn bộ bài trong kỳ (kỳ 90 ngày chậm ~2 giây)
  pool as (
    select p.id, p.channel_id, p.published_at, coalesce(p.views, 0) as views, p.product_codes
    from social.posts p
    where p.kind in ('video', 'reel') and cardinality(p.product_codes) > 0
      and p.published_at >= (v_from::text || 'T00:00:00+07:00')::timestamptz and p.published_at < ((v_to + 1)::text || 'T00:00:00+07:00')::timestamptz
    order by coalesce(p.views, 0) desc, p.id limit 3000
  ),
  topv as (
    select pool.id::text as id, pool.channel_id, pool.published_at, pool.views, c as code
    from pool
    join social.channels ch on ch.id = pool.channel_id and ch.is_active
    cross join lateral unnest(pool.product_codes) c
    join al on al.code = c and al.in_stock
    order by pool.views desc, pool.id limit v_limit
  )
  select jsonb_build_object(
    'refreshed_at', (select refreshed_at from sales.spu_summary_meta where id = 1),
    's1', (select jsonb_build_object('total', count(*)) from s1),
    'win', (select jsonb_build_object('wt', count(*) filter (where f_wt), 'win', count(*) filter (where f_ord), 'star', count(*) filter (where f_wt and f_ord)) from a where c_active),
    's1_codes', coalesce((select jsonb_agg(code order by code) from s1), '[]'::jsonb),
    's0', (select jsonb_build_object('active', count(*) filter (where c_active), 'hot', count(*) filter (where c_active and c_hot), 'normal', count(*) filter (where c_active and c_normal),
             'slow', count(*) filter (where c_active and c_slow), 'bad', count(*) filter (where c_active and c_bad), 'no_stock_sold', count(*) filter (where c_active and not in_stock)) from a),
    'cats', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'posted', posted) order by posted desc, name) from cats), '[]'::jsonb),
    'groups', (select jsonb_agg(jsonb_build_object('label', label, 'spu', spu, 'with_video', with_video, 'posted', posted) order by ord) from groups),
    'stock_status', jsonb_build_object(
      'bad', coalesce((select jsonb_agg(code order by code) from tf where t_bad), '[]'::jsonb),
      'slow', coalesce((select jsonb_agg(code order by code) from tf where not t_bad and t_slow), '[]'::jsonb),
      'hot', coalesce((select jsonb_agg(code order by code) from tf where not t_bad and not t_slow and t_hot), '[]'::jsonb)),
    'active_codes', coalesce((select jsonb_agg(code order by code) from a where c_active), '[]'::jsonb),
    'alerts', jsonb_build_object(
      'vids_total', (select coalesce(sum(videos_c), 0) from al where in_stock and videos_c > 0),
      'top_videos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'channel_id', channel_id, 'published_at', published_at, 'views', views, 'code', code) order by views desc, id) from topv), '[]'::jsonb),
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
          'code', code, 'name', name, 'grp', grp, 'stock', stock, 'age_days', age_days, 'age_approx', age_approx, 'sold30', sold30, 'sl30', sold30,
          'sold', sold_c, 'videos', videos_c, 'views', case when videos_c > 0 then views_c end, 'video_teams', video_teams, 'incoming', incoming,
          'star', (f_wt and f_ord), 'win', f_ord, 'wt', f_wt) order by code) from al), '[]'::jsonb))
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function sales.spu_dash(jsonb) to service_role;
revoke all on function sales.spu_dash(jsonb) from anon, authenticated, public;

notify pgrst, 'reload schema';
