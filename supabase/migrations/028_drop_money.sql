-- 028: BỎ MỌI SỐ TIỀN khỏi dữ liệu bán hàng (doanh thu, giá vốn, tiền hoàn): chỉ còn SỐ LƯỢNG bán / hoàn.
-- Chạy TAY trên project fb-traffic, SAU KHI đã deploy bản code mới (code mới không còn đọc cột tiền) và SAU KHI sao lưu
-- (bản sao lưu ngày 2026-10-16 nằm ở E:\New Project\backups\2026-10-16). KHÔNG hoàn lại được: các cột tiền bị xoá thật.
-- Thứ tự trong file: (1) xoá 6 hàm báo cáo cũ (2) tạo lại không có tiền (3) xoá cột tiền (4) dọn khoá gmv trong JSON đã lưu.
-- Lưu ý: tab "Tất cả" của Sản phẩm đẩy bán không còn tự loại quà tặng / phụ kiện 0đ (vì không còn biết giá).

-- (1) ---------------------------------------------------------------------------------------------------
drop function if exists sales.code_sales(text[], date, date, text[], text[]);
drop function if exists sales.code_sales_by_channel(text, date, date);
drop function if exists sales.page_sales(text[], date, date);
drop function if exists sales.product_report(date, date, text[], text[]);
drop function if exists sales.sales_report_all(date, date, text[], text[]);
drop function if exists sales.returns_only(date, date, text[], text[]);

-- (2) ---------------------------------------------------------------------------------------------------
create function sales.code_sales(p_codes text[], p_from date, p_to date, p_page_ids text[] default null, p_channels text[] default null)
returns table (code text, qty_net bigint)
language sql stable set search_path = '' as $$
  select s.code, sum(s.qty_sold - s.qty_returned)::bigint
  from sales.daily_sales s
  where s.code = any(p_codes) and s.date between p_from and p_to
    and (p_page_ids is null or s.page_id = any(p_page_ids))
    and (case when p_channels is null then s.channel <> 'bao_hanh' else s.channel = any(p_channels) end)
  group by s.code
$$;

create function sales.code_sales_by_channel(p_code text, p_from date, p_to date)
returns table (channel text, qty_net bigint)
language sql stable set search_path = '' as $$
  select channel, sum(qty_sold - qty_returned)::bigint
  from sales.daily_sales where code = upper(p_code) and date between p_from and p_to
  group by channel order by 2 desc
$$;

create function sales.page_sales(p_page_ids text[], p_from date, p_to date)
returns table (page_id text, qty_net bigint)
language sql stable set search_path = '' as $$
  select page_id, sum(qty_sold - qty_returned)::bigint
  from sales.daily_sales where page_id = any(p_page_ids) and date between p_from and p_to group by page_id
$$;

-- Báo cáo theo mã có bài đăng gắn hashtag trong kỳ (tab "Có video")
create function sales.product_report(p_from date, p_to date, p_page_ids text[] default null, p_channels text[] default null)
returns table (
  product_code text, first_post_at timestamptz, last_post_at timestamptz, post_count bigint, video_count bigint,
  views numeric, viewers numeric, qty_sold bigint, qty_returned bigint, qty_net bigint, conversion_pct numeric)
language sql stable set search_path = '' as $$
  with tagged as (
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
  s as (
    select d.code, sum(d.qty_sold)::bigint qs, sum(d.qty_returned)::bigint qr
    from sales.daily_sales d
    where d.code in (select code from traffic) and d.date between p_from and p_to
      and (p_page_ids is null or d.page_id = any(p_page_ids))
      and (case when p_channels is null then d.channel <> 'bao_hanh' else d.channel = any(p_channels) end)
    group by d.code
  )
  select t.code, t.f, t.l, t.n, t.v, t.views, t.viewers,
         coalesce(s.qs, 0), coalesce(s.qr, 0), coalesce(s.qs, 0) - coalesce(s.qr, 0),
         case when t.viewers > 0 then round((coalesce(s.qs, 0) - coalesce(s.qr, 0)) * 100.0 / t.viewers, 2) end
  from traffic t left join s on s.code = t.code
  order by t.views desc
$$;

-- Báo cáo mọi mã có bán ∪ mã có bài đăng trong kỳ (tab "Tất cả sản phẩm")
create function sales.sales_report_all(p_from date, p_to date, p_page_ids text[] default null, p_channels text[] default null)
returns table (
  product_code text, first_post_at timestamptz, last_post_at timestamptz, post_count bigint, video_count bigint,
  views numeric, viewers numeric, qty_sold bigint, qty_returned bigint, qty_net bigint, conversion_pct numeric)
language sql stable set search_path = '' as $$
  with s as (
    select d.code, sum(d.qty_sold)::bigint qs, sum(d.qty_returned)::bigint qr
    from sales.daily_sales d
    where d.date between p_from and p_to
      and (p_page_ids is null or d.page_id = any(p_page_ids))
      and (case when p_channels is null then d.channel <> 'bao_hanh' else d.channel = any(p_channels) end)
    group by d.code having sum(d.qty_sold) > 0
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
         case when coalesce(t.viewers, 0) > 0 then round((coalesce(s.qs, 0) - coalesce(s.qr, 0)) * 100.0 / t.viewers, 2) end
  from allcodes a left join s on s.code = a.code left join traffic t on t.code = a.code
  order by coalesce(s.qs, 0) - coalesce(s.qr, 0) desc, coalesce(t.views, 0) desc
$$;

-- Hàng hoàn trong kỳ của các mã KHÔNG bán trong kỳ (đơn cũ hoàn lại) — để ghi chú, không lẫn vào bảng
create function sales.returns_only(p_from date, p_to date, p_page_ids text[] default null, p_channels text[] default null)
returns table (code_count bigint, qty bigint)
language sql stable set search_path = '' as $$
  with c as (
    select d.code, sum(d.qty_sold) qs, sum(d.qty_returned) qr
    from sales.daily_sales d
    where d.date between p_from and p_to
      and (p_page_ids is null or d.page_id = any(p_page_ids))
      and (case when p_channels is null then d.channel <> 'bao_hanh' else d.channel = any(p_channels) end)
    group by d.code
  )
  select count(*), coalesce(sum(qr), 0)::bigint from c where coalesce(qs, 0) = 0 and qr > 0
$$;

do $$ declare f text; begin
  foreach f in array array[
    'sales.code_sales(text[], date, date, text[], text[])', 'sales.code_sales_by_channel(text, date, date)', 'sales.page_sales(text[], date, date)',
    'sales.product_report(date, date, text[], text[])', 'sales.sales_report_all(date, date, text[], text[])', 'sales.returns_only(date, date, text[], text[])'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- (3) ---------------------------------------------------------------------------------------------------
alter table sales.daily_sales drop column if exists revenue, drop column if exists returned_value, drop column if exists cost, drop column if exists returned_cost;

-- (4) khoá gmv còn sót trong dữ liệu đã lưu (kết quả đánh giá, dự báo, phiếu chuyển Sao Biển, quyết định)
update rnd.evaluations set metrics = metrics - 'gmv' where metrics ? 'gmv';
update rnd.evaluations set forecast = forecast - 'gmv' where forecast is not null and forecast ? 'gmv';
update rnd.handoffs set snapshot = jsonb_set(snapshot, '{metrics}', (snapshot -> 'metrics') - 'gmv') where snapshot #> '{metrics,gmv}' is not null;
update rnd.decisions set snapshot = jsonb_set(snapshot, '{metrics}', (snapshot -> 'metrics') - 'gmv') where snapshot #> '{metrics,gmv}' is not null;

notify pgrst, 'reload schema';
