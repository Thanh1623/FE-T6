-- 025: tab "Tất cả sản phẩm" (sales.sales_report_all) cũng tính lượt xem của mã đã đăng bài nhưng CHƯA bán trong kỳ,
-- để tổng "Lượt xem" khớp tab "Có video" (tab Có video ⊂ tab Tất cả). Chạy TAY trên project fb-traffic, sau 024. Chạy lại vẫn an toàn.
--  • Danh sách mã = mã có bán (qty_sold > 0, như 013) ∪ mã có bài đăng gắn hashtag trong kỳ.
--  • Mã chưa bán: qty/doanh thu = 0 (hàng hoàn của mã không bán vẫn chỉ nằm ở ghi chú sales.returns_only).

create or replace function sales.sales_report_all(p_from date, p_to date, p_page_ids text[] default null, p_channels text[] default null)
returns table (
  product_code text, first_post_at timestamptz, last_post_at timestamptz, post_count bigint, video_count bigint,
  views numeric, viewers numeric, qty_sold bigint, qty_returned bigint, qty_net bigint, revenue_net bigint,
  cost_net bigint, gross_profit bigint, margin_pct numeric, conversion_pct numeric)
language sql stable set search_path = '' as $$
  with d as (
    select d.code,
           case when d.qty_sold > 0 and d.revenue = 0 then 0 else d.qty_sold end qs,
           case when d.qty_sold > 0 and d.revenue = 0 then 0 else d.revenue end rev,
           case when d.qty_sold > 0 and d.revenue = 0 then 0 else d.cost end cost,
           case when d.qty_returned > 0 and d.returned_value = 0 then 0 else d.qty_returned end qr,
           case when d.qty_returned > 0 and d.returned_value = 0 then 0 else d.returned_value end rv,
           case when d.qty_returned > 0 and d.returned_value = 0 then 0 else d.returned_cost end rc
    from sales.daily_sales d
    where d.date between p_from and p_to
      and (p_page_ids is null or d.page_id = any(p_page_ids))
      and (case when p_channels is null then d.channel <> 'bao_hanh' else d.channel = any(p_channels) end)
  ),
  s as (
    select code, sum(qs)::bigint qs, sum(qr)::bigint qr, sum(rev - rv)::bigint rev, sum(cost - rc)::bigint cost
    from d group by code having sum(qs) > 0
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
    from tagged group by code
  ),
  allcodes as (select code from s union select code from traffic)
  select a.code, t.f, t.l, coalesce(t.n, 0), coalesce(t.v, 0), coalesce(t.views, 0), coalesce(t.viewers, 0),
         coalesce(s.qs, 0), coalesce(s.qr, 0), coalesce(s.qs, 0) - coalesce(s.qr, 0),
         coalesce(s.rev, 0), coalesce(s.cost, 0), coalesce(s.rev, 0) - coalesce(s.cost, 0),
         case when coalesce(s.rev, 0) > 0 then round((s.rev - s.cost) * 100.0 / s.rev, 1) end,
         case when coalesce(t.viewers, 0) > 0 then round((coalesce(s.qs, 0) - coalesce(s.qr, 0)) * 100.0 / t.viewers, 2) end
  from allcodes a left join s on s.code = a.code left join traffic t on t.code = a.code
  order by coalesce(s.rev, 0) desc, coalesce(t.views, 0) desc
$$;

revoke execute on function sales.sales_report_all(date, date, text[], text[]) from public, anon, authenticated;
grant execute on function sales.sales_report_all(date, date, text[], text[]) to service_role;
notify pgrst, 'reload schema';
