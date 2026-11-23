-- 086: sales.spu_traffic_gain NHANH HƠN (Win Traffic cuốn chiếu: lượt xem / bình luận TĂNG THÊM trong N ngày gần nhất). CHẠY TAY trong Supabase SQL Editor. Chạy lại vẫn an toàn.
-- Vì sao: hàm cũ quét TOÀN BẢNG social.posts (điều kiện "bài mới OR bài có ảnh chụp mới" không dùng được chỉ mục) mất 4–10 giây; kết nối PostgREST giới hạn 8 giây (statement_timeout của role authenticator) nên
-- nhiều lúc bị huỷ → trang Theo dõi SPU báo "Chưa tính được Win Traffic: cần chạy migration 062" dù 062 đã chạy. Bản này tách thành hai nhánh dùng chỉ mục (bài đăng từ mốc, và bài có ảnh chụp mới theo khoá chính) rồi UNION.
-- Kết quả KHÔNG đổi.

create or replace function sales.spu_traffic_gain(p jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_today date := (p->>'today')::date;
  v_days  int  := greatest(1, coalesce((p->>'days')::int, 3));
  v_has_channels boolean := p ? 'channels' and jsonb_typeof(p->'channels') = 'array';
  v_channels text[] := case when p ? 'channels' and jsonb_typeof(p->'channels') = 'array' then array(select jsonb_array_elements_text(p->'channels')) else '{}' end;
  v_base  date;
  v_result jsonb;
begin
  v_base := v_today - v_days;   -- mốc đầu cửa sổ: cuối ngày (hôm nay − N)

  with
  changed as (select distinct post_id from social.post_daily where date > v_base),   -- video có ảnh chụp mới hơn mốc = đã đổi trong cửa sổ
  b as materialized (
    select po.id, po.product_codes, (po.published_at at time zone 'Asia/Ho_Chi_Minh')::date as pday,
           coalesce(po.views, 0) as views, coalesce(po.comments, 0) as comments
    from social.posts po
    join social.channels ch on ch.id = po.channel_id and ch.is_active
    where po.kind in ('video', 'reel') and cardinality(po.product_codes) > 0
      and (not v_has_channels or po.channel_id = any(v_channels))
      and po.published_at >= (v_base + 1)::timestamptz - interval '7 hours'
    union
    select po.id, po.product_codes, (po.published_at at time zone 'Asia/Ho_Chi_Minh')::date,
           coalesce(po.views, 0), coalesce(po.comments, 0)
    from social.posts po
    join social.channels ch on ch.id = po.channel_id and ch.is_active
    where po.kind in ('video', 'reel') and cardinality(po.product_codes) > 0
      and (not v_has_channels or po.channel_id = any(v_channels))
      and po.id in (select post_id from changed)
  ),
  snap as (
    select b.id, s.v0, s.c0
    from b
    join lateral (select d.views as v0, d.comments as c0 from social.post_daily d where d.post_id = b.id and d.date <= v_base order by d.date desc limit 1) s on true
  ),
  g as (
    select b.id, b.product_codes,
      case when b.pday > v_base then b.views
           when s.id is not null then greatest(b.views - coalesce(s.v0, 0), 0) end as gv,
      case when b.pday > v_base then b.comments
           when s.id is not null and s.c0 is not null then greatest(b.comments - s.c0, 0)
           when s.id is not null and b.views = coalesce(s.v0, 0) then 0 end as gc
    from b left join snap s on s.id = b.id
  ),
  -- quy mã cũ về mã SPU mới (sales.spu_aliases); một bài gắn cả mã cũ và mã mới của cùng SPU chỉ tính MỘT lần
  pc as (
    select distinct g.id, coalesce(al.new_code, upper(c)) as code, g.gv, g.gc
    from g cross join lateral unnest(g.product_codes) c
    left join sales.spu_aliases al on al.old_code = upper(c)
  ),
  per as (
    select code, sum(coalesce(gv, 0))::bigint as views, sum(coalesce(gc, 0))::bigint as comments,
           count(*)::int as videos, count(*) filter (where gv is null)::int as unknown
    from pc
    group by code
  )
  select jsonb_build_object(
    'base', v_base,
    'rows', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'views', views, 'comments', comments, 'videos', videos, 'unknown', unknown) order by code) from per where views > 0 or comments > 0), '[]'::jsonb),
    'videos', (select count(*) from b), 'unknown', (select count(*) from g where gv is null)
  ) into v_result;
  return v_result;
end;
$$;

do $$
begin
  execute 'grant execute on function sales.spu_traffic_gain(jsonb) to service_role';
  execute 'revoke all on function sales.spu_traffic_gain(jsonb) from anon, authenticated, public';
end $$;

notify pgrst, 'reload schema';
