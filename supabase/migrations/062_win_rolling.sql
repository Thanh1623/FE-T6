-- 062: Win Traffic CUỐN CHIẾU (lượt xem / bình luận TĂNG THÊM trong N ngày gần nhất) + ảnh chụp bình luận theo ngày. CHẠY TAY trong Supabase SQL Editor, SAU 061. Chạy lại vẫn an toàn.
--  • Tài liệu thiết kế + cách bảo trì: docs/KIEN-TRUC-TONG-HOP-SPU.md (mục 6.1).
--  • social.post_daily có thêm cột comments: ảnh chụp bình luận cộng dồn cùng ngày với lượt xem (ảnh chụp cũ để null).
--  • sales.spu_traffic_gain(p): với mỗi mã SPU, tổng lượt xem / bình luận tăng thêm của các video gắn mã trong N ngày gần nhất.
--      Tăng thêm của một video = số hiện tại − số tại cuối ngày (hôm nay − N), lấy từ ảnh chụp gần nhất có ngày ≤ mốc đó.
--      Video đăng SAU mốc: tăng thêm = toàn bộ số hiện có (trước khi đăng là 0).
--      Không có ảnh chụp nào ≤ mốc: KHÔNG biết → không tính (và đếm vào `unknown`).
--      CHỈ xét video có thể đã đổi trong cửa sổ: đăng sau mốc, hoặc có ảnh chụp mới hơn mốc (video cũ không đổi thì tăng thêm = 0). Nhờ vậy chạy nhanh (vài trăm ms) thay vì quét mọi video.
--      Ảnh chụp cũ chưa có bình luận và lượt xem không đổi từ lúc chụp → bình luận cũng không đổi (đồng bộ ghi ảnh chụp mỗi khi BẤT KỲ chỉ số nào đổi) → tăng thêm 0.
--  • Chỉ video / reel của kênh đang bật gắn mã SPU. Lọc Page: p.channels (null = mọi Page).

alter table social.post_daily add column if not exists comments bigint;

create or replace function sales.spu_traffic_gain(p jsonb) returns jsonb
language plpgsql stable
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
  b as (
    select po.id, po.product_codes, (po.published_at at time zone 'Asia/Ho_Chi_Minh')::date as pday,
           coalesce(po.views, 0) as views, coalesce(po.comments, 0) as comments
    from social.posts po
    join social.channels ch on ch.id = po.channel_id and ch.is_active
    where po.kind in ('video', 'reel') and cardinality(po.product_codes) > 0
      and (not v_has_channels or po.channel_id = any(v_channels))
      and (po.published_at >= (v_base + 1)::timestamptz - interval '7 hours' or po.id in (select post_id from changed))
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
  per as (
    select upper(c) as code, sum(coalesce(gv, 0))::bigint as views, sum(coalesce(gc, 0))::bigint as comments,
           count(*)::int as videos, count(*) filter (where gv is null)::int as unknown
    from g cross join lateral unnest(g.product_codes) c
    group by upper(c)
  )
  select jsonb_build_object(
    'base', v_base,
    'rows', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'views', views, 'comments', comments, 'videos', videos, 'unknown', unknown) order by code) from per where views > 0 or comments > 0), '[]'::jsonb),
    'videos', (select count(*) from b), 'unknown', (select count(*) from g where gv is null)
  ) into v_result;
  return v_result;
end;
$$;

grant execute on function sales.spu_traffic_gain(jsonb) to service_role;
revoke all on function sales.spu_traffic_gain(jsonb) from anon, authenticated, public;

notify pgrst, 'reload schema';
