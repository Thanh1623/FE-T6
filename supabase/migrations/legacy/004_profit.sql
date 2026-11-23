-- 004_profit: thêm tiền hoàn / giá vốn vào số bán + lợi nhuận trong báo cáo sản phẩm
-- Chạy trên project fb-traffic, SAU 003_products.sql. Chạy lại nhiều lần vẫn an toàn.

alter table product_daily_sales add column if not exists returned_value bigint not null default 0;
alter table product_daily_sales add column if not exists cost           bigint not null default 0;
alter table product_daily_sales add column if not exists returned_cost  bigint not null default 0;
-- Trang nguồn của đơn (tag Sapo page_id_...), '' = đơn không có tag Trang (sàn, web, cửa hàng...)
alter table product_daily_sales add column if not exists page_id text not null default '';
-- Kênh bán: facebook, tiktok_shop, tiktok, shopee, web, cua_hang, zalo, instagram, bao_hanh, khac
alter table product_daily_sales add column if not exists channel text not null default 'khac';
-- Dữ liệu cũ chưa tách Trang → xoá để đồng bộ lại (dữ liệu dẫn xuất, không mất gì)
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'product_daily_sales_pkey'
             and pg_get_constraintdef(oid) not like '%channel%') then
    truncate product_daily_sales;
    alter table product_daily_sales drop constraint product_daily_sales_pkey;
    alter table product_daily_sales add primary key (product_code, date, page_id, channel);
  end if;
end $$;

comment on column product_daily_sales.revenue is 'Doanh thu sau phân bổ giảm giá đơn (chưa trừ hoàn)';
comment on column product_daily_sales.cost is 'Giá vốn hàng bán theo gia_von HIỆN TẠI của SKU (trước 2026-07-26 = 0)';

-- Đổi kiểu trả về → phải drop rồi tạo lại
drop function if exists product_report(date, date);
drop function if exists product_report(date, date, text[]);
drop function if exists product_report(date, date, text[], text[]);

-- p_page_ids NULL  = toàn hệ thống: bài của mọi Trang đang theo dõi + số bán MỌI kênh
-- p_page_ids [...] = chỉ bài của các Trang đó + chỉ đơn có tag page_id_ của các Trang đó
-- p_channels NULL  = mọi kênh trừ bao_hanh; [...] = chỉ các kênh đó
create function product_report(p_from date, p_to date, p_page_ids text[] default null, p_channels text[] default null)
returns table (
  product_code   text,
  first_post_at  timestamptz,
  last_post_at   timestamptz,
  post_count     bigint,
  video_count    bigint,
  views          numeric,
  viewers        numeric,          -- người xem, cộng dồn các bài (1 người xem 2 video tính 2)
  qty_sold       bigint,
  qty_returned   bigint,
  qty_net        bigint,
  revenue_net    bigint,           -- doanh thu sau giảm giá − tiền hoàn
  cost_net       bigint,           -- giá vốn hàng bán − giá vốn hàng hoàn
  gross_profit   bigint,           -- lợi nhuận gộp = revenue_net − cost_net
  margin_pct     numeric,          -- gross_profit / revenue_net × 100
  conversion_pct numeric           -- qty_net / viewers × 100
)
language sql stable
set search_path = public
as $$
  with tagged as (
    select p.id, p.type, p.created_time, unnest(product_codes(p.hashtags)) as code
    from posts p
    where (p.created_time at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
      and (p_page_ids is null or p.account_id = any(p_page_ids))
  ),
  traffic as (
    select t.code,
           min(t.created_time) as first_post_at,
           max(t.created_time) as last_post_at,
           count(distinct t.id) as post_count,
           count(distinct t.id) filter (where t.type = 'added_video') as video_count,
           coalesce(sum(m.value) filter (where m.metric = 'post_media_view'), 0) as views,
           coalesce(sum(m.value) filter (where m.metric = 'post_total_media_view_unique'), 0) as viewers
    from tagged t
    left join post_metrics m on m.post_id = t.id
    group by t.code
  ),
  sales as (
    select s.product_code as code,
           sum(s.qty_sold)::bigint                        as qty_sold,
           sum(s.qty_returned)::bigint                    as qty_returned,
           sum(s.revenue - s.returned_value)::bigint      as revenue_net,
           sum(s.cost - s.returned_cost)::bigint          as cost_net
    from product_daily_sales s
    where s.date between p_from and p_to
      and (p_page_ids is null or s.page_id = any(p_page_ids))
      and (case when p_channels is null then s.channel <> 'bao_hanh' else s.channel = any(p_channels) end)
      and s.product_code in (select code from traffic)
    group by s.product_code
  )
  select tr.code, tr.first_post_at, tr.last_post_at, tr.post_count, tr.video_count,
         tr.views, tr.viewers,
         coalesce(sa.qty_sold, 0), coalesce(sa.qty_returned, 0),
         coalesce(sa.qty_sold, 0) - coalesce(sa.qty_returned, 0),
         coalesce(sa.revenue_net, 0),
         coalesce(sa.cost_net, 0),
         coalesce(sa.revenue_net, 0) - coalesce(sa.cost_net, 0),
         case when coalesce(sa.revenue_net, 0) > 0
              then round((sa.revenue_net - sa.cost_net) * 100.0 / sa.revenue_net, 1) end,
         case when tr.viewers > 0
              then round((coalesce(sa.qty_sold, 0) - coalesce(sa.qty_returned, 0)) * 100.0 / tr.viewers, 2) end
  from traffic tr
  left join sales sa on sa.code = tr.code
  order by tr.views desc;
$$;

revoke execute on function product_report(date, date, text[], text[]) from public, anon, authenticated;
grant execute on function product_report(date, date, text[], text[]) to service_role;
notify pgrst, 'reload schema';

-- Số bán 1 mã theo kênh (bảng chi tiết khi bấm vào 1 sản phẩm)
create or replace function product_sales_by_channel(p_code text, p_from date, p_to date)
returns table (channel text, qty_net bigint, revenue_net bigint, gross_profit bigint)
language sql stable set search_path = public as $$
  select channel,
         sum(qty_sold - qty_returned)::bigint,
         sum(revenue - returned_value)::bigint,
         sum((revenue - returned_value) - (cost - returned_cost))::bigint
  from product_daily_sales
  where product_code = upper(p_code) and date between p_from and p_to
  group by channel
  order by 2 desc;
$$;
revoke execute on function product_sales_by_channel(text, date, date) from public, anon, authenticated;
grant execute on function product_sales_by_channel(text, date, date) to service_role;
notify pgrst, 'reload schema';
