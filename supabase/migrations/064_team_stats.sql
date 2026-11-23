-- 064: Số liệu 30 ngày của trang Team do DATABASE cộng sẵn (thay cho việc kéo toàn bộ dòng channel_daily / đơn hàng về máy chủ rồi cộng trong code). CHẠY TAY trong Supabase SQL Editor. Chạy lại vẫn an toàn.
--  • social.team_views(p_channel_ids text[], p_from date, p_to date) → tổng lượt xem (cột views của channel_daily) của các kênh trong khoảng ngày.
--  • sales.team_sold(p_page_ids text[], p_from date, p_to date) → SL bán thuần của các Page / tag, cùng quy tắc với src/lib/daily-sales.ts (loadDailySales):
--      ngày nằm TRONG khoảng file đơn đã nhập → từ imported_order_lines (giá > 0, bỏ đơn đã hủy, bỏ kênh bảo hành, không trừ hoàn);
--      ngày NGOÀI khoảng file → từ daily_sales (bỏ kênh bảo hành, trừ hoàn). Mỗi ngày chỉ lấy từ một nguồn.
--  • Chưa chạy migration này: ứng dụng tự quay về cách tính cũ (chậm hơn), không lỗi.

create or replace function social.team_views(p_channel_ids text[], p_from date, p_to date)
returns bigint
language sql stable
as $$
  select coalesce(sum(views), 0)::bigint
  from social.channel_daily
  where channel_id = any(p_channel_ids) and date >= p_from and date <= p_to
$$;

create or replace function sales.team_sold(p_page_ids text[], p_from date, p_to date)
returns bigint
language sql stable
as $$
  with bounds as (
    select p_from as d_from,
           least(p_to, (now() at time zone 'Asia/Ho_Chi_Minh')::date) as d_to
  ),
  win as (
    select (min(ordered_at) at time zone 'Asia/Ho_Chi_Minh')::date as w_from,
           (max(ordered_at) at time zone 'Asia/Ho_Chi_Minh')::date as w_to
    from sales.imported_order_lines where price > 0
  ),
  synced as (
    select coalesce(sum(d.qty_sold - d.qty_returned), 0) as n
    from sales.daily_sales d, bounds b, win w
    where d.date between b.d_from and b.d_to
      and (w.w_from is null or d.date < w.w_from or d.date > w.w_to)
      and d.page_id = any(p_page_ids)
      and d.channel <> 'bao_hanh'
  ),
  filed as (
    select coalesce(sum(l.qty), 0) as n
    from sales.imported_order_lines l, bounds b, win w
    where l.price > 0
      and (l.ordered_at at time zone 'Asia/Ho_Chi_Minh')::date between greatest(b.d_from, w.w_from) and least(b.d_to, w.w_to)
      and coalesce(l.status, '') !~* 'hủy|huỷ'
      and coalesce(l.source, '') !~* 'bao\s*hanh|bảo\s*hành'
      and coalesce(
            (select (regexp_match(t, '^(?:page_id_)?(\d{6,})$', 'i'))[1]
               from regexp_split_to_table(coalesce(l.tags, ''), ',') with ordinality as s(t0, n), lateral (select btrim(t0) as t) x
              where t ~* '^(?:page_id_)?\d{6,}$' order by n limit 1),
            (select 'ttn:' || lower(regexp_replace(btrim((regexp_match(t, '^tiktok_business_(?!id_)(.+)$', 'i'))[1]), '\s+', ' ', 'g'))
               from regexp_split_to_table(coalesce(l.tags, ''), ',') with ordinality as s(t0, n), lateral (select btrim(t0) as t) x
              where t ~* '^tiktok_business_(?!id_).+$' order by n limit 1)
          ) = any(p_page_ids)
  )
  select (select n from synced)::bigint + (select n from filed)::bigint
$$;

revoke all on function social.team_views(text[], date, date) from public, anon, authenticated;
grant execute on function social.team_views(text[], date, date) to service_role;
revoke all on function sales.team_sold(text[], date, date) from public, anon, authenticated;
grant execute on function sales.team_sold(text[], date, date) to service_role;

notify pgrst, 'reload schema';
