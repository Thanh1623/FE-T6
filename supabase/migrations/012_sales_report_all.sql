-- 012_sales_report_all: báo cáo số bán cho MỌI mã (không chỉ mã có video) — tab "Tất cả sản phẩm".
-- Chạy trên project fb-traffic, SAU 011. Chạy lại vẫn an toàn.
-- Cột giống sales.product_report; mã không có bài đăng trong kỳ → post_count = 0, views/viewers = 0.

create or replace function sales.sales_report_all(p_from date, p_to date, p_page_ids text[] default null, p_channels text[] default null)
returns table (
  product_code text, first_post_at timestamptz, last_post_at timestamptz, post_count bigint, video_count bigint,
  views numeric, viewers numeric, qty_sold bigint, qty_returned bigint, qty_net bigint, revenue_net bigint,
  cost_net bigint, gross_profit bigint, margin_pct numeric, conversion_pct numeric)
language sql stable set search_path = '' as $$
  with s as (
    select d.code, sum(d.qty_sold)::bigint qs, sum(d.qty_returned)::bigint qr,
           sum(d.revenue - d.returned_value)::bigint rev, sum(d.cost - d.returned_cost)::bigint cost
    from sales.daily_sales d
    where d.date between p_from and p_to
      and (p_page_ids is null or d.page_id = any(p_page_ids))
      and (case when p_channels is null then d.channel <> 'bao_hanh' else d.channel = any(p_channels) end)
    group by d.code
    having sum(d.qty_sold) <> 0 or sum(d.qty_returned) <> 0
  ),
  tagged as (
    select p.id, p.kind, p.published_at, p.views, p.viewers, unnest(p.product_codes) as code
    from social.posts p
    where (p.published_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
      and (p_page_ids is null or p.channel_id = any(p_page_ids))
  ),
  traffic as (
    select code, min(published_at) f, max(published_at) l, count(distinct id) n,
           count(distinct id) filter (where kind in ('video', 'reel')) v, sum(views) views, sum(viewers) viewers
    from tagged where code in (select code from s) group by code
  )
  select s.code, t.f, t.l, coalesce(t.n, 0), coalesce(t.v, 0), coalesce(t.views, 0), coalesce(t.viewers, 0),
         s.qs, s.qr, s.qs - s.qr, s.rev, s.cost, s.rev - s.cost,
         case when s.rev > 0 then round((s.rev - s.cost) * 100.0 / s.rev, 1) end,
         case when coalesce(t.viewers, 0) > 0 then round((s.qs - s.qr) * 100.0 / t.viewers, 2) end
  from s left join traffic t on t.code = s.code
  order by s.rev desc
$$;

revoke execute on function sales.sales_report_all(date, date, text[], text[]) from public, anon, authenticated;
grant execute on function sales.sales_report_all(date, date, text[], text[]) to service_role;
notify pgrst, 'reload schema';
