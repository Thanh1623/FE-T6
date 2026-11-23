-- 013: sửa sales.sales_report_all (tab "Tất cả sản phẩm"). Chạy trên project fb-traffic, sau 012. Chạy lại vẫn an toàn.
--  • Bỏ dòng quà tặng / phụ kiện 0đ (khăn lau bạc, đánh sáng, hộp, nước rửa bạc…): dòng bán có SL > 0 nhưng doanh thu = 0,
--    và dòng hoàn có SL > 0 nhưng giá trị hoàn = 0.
--  • Chỉ liệt kê mã có BÁN trong kỳ (qty_sold > 0). Mã chỉ có hàng hoàn (đơn bán trước kỳ, hoàn trong kỳ) không thành dòng
--    riêng nữa — app hiện tổng hàng hoàn đó trong 1 dòng ghi chú (hàm sales.returns_only bên dưới).

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
    from tagged where code in (select code from s) group by code
  )
  select s.code, t.f, t.l, coalesce(t.n, 0), coalesce(t.v, 0), coalesce(t.views, 0), coalesce(t.viewers, 0),
         s.qs, s.qr, s.qs - s.qr, s.rev, s.cost, s.rev - s.cost,
         case when s.rev > 0 then round((s.rev - s.cost) * 100.0 / s.rev, 1) end,
         case when coalesce(t.viewers, 0) > 0 then round((s.qs - s.qr) * 100.0 / t.viewers, 2) end
  from s left join traffic t on t.code = s.code
  order by s.rev desc
$$;

-- Hàng hoàn trong kỳ của các mã KHÔNG bán trong kỳ (đơn cũ hoàn lại) — để ghi chú, không lẫn vào bảng
create or replace function sales.returns_only(p_from date, p_to date, p_page_ids text[] default null, p_channels text[] default null)
returns table (code_count bigint, qty bigint, value bigint)
language sql stable set search_path = '' as $$
  with c as (
    select d.code, sum(d.qty_sold) qs, sum(d.qty_returned) qr, sum(d.returned_value) rv
    from sales.daily_sales d
    where d.date between p_from and p_to
      and (p_page_ids is null or d.page_id = any(p_page_ids))
      and (case when p_channels is null then d.channel <> 'bao_hanh' else d.channel = any(p_channels) end)
      and not (d.qty_returned > 0 and d.returned_value = 0)
    group by d.code
  )
  select count(*), coalesce(sum(qr), 0)::bigint, coalesce(sum(rv), 0)::bigint
  from c where coalesce(qs, 0) = 0 and qr > 0
$$;

revoke execute on function sales.sales_report_all(date, date, text[], text[]) from public, anon, authenticated;
grant execute on function sales.sales_report_all(date, date, text[], text[]) to service_role;
revoke execute on function sales.returns_only(date, date, text[], text[]) from public, anon, authenticated;
grant execute on function sales.returns_only(date, date, text[], text[]) to service_role;
notify pgrst, 'reload schema';
