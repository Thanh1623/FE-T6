-- 003_products: số bán theo mã mẫu + báo cáo hiệu quả sản phẩm (hashtag mã SP)
-- Chạy trên project fb-traffic, SAU 002_hashtags.sql. Chạy lại nhiều lần vẫn an toàn.

-- Số bán theo ngày, đồng bộ từ hệ thống đơn hàng Qlydonhang
create table if not exists product_daily_sales (
  product_code text not null,          -- mã mẫu, VD 'D0008'
  date         date not null,
  qty_sold     integer not null default 0,
  qty_returned integer not null default 0,
  revenue      bigint  not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (product_code, date)
);
alter table product_daily_sales enable row level security;

-- Hashtag mã SP = chữ cái + số, VD #D0008, #H002, #NRB001 (không khớp #reel, #top1...)
create or replace function product_codes(tags text[])
returns text[] language sql immutable as $$
  select coalesce(array_agg(distinct upper(t)), '{}')
  from unnest(tags) t
  where t ~ '^[a-z]{1,4}[0-9]{3,}$'
$$;

-- Báo cáo theo sản phẩm trong khoảng ngày [p_from, p_to]:
-- bài đăng gắn mã trong khoảng + số bán trong cùng khoảng → tỉ lệ chuyển đổi
create or replace function product_report(p_from date, p_to date)
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
  revenue        bigint,
  conversion_pct numeric           -- qty_net / viewers × 100
)
language sql stable
set search_path = public
as $$
  with tagged as (
    select p.id, p.type, p.created_time, unnest(product_codes(p.hashtags)) as code
    from posts p
    where (p.created_time at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
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
           sum(s.qty_sold)::bigint as qty_sold,
           sum(s.qty_returned)::bigint as qty_returned,
           sum(s.revenue)::bigint as revenue
    from product_daily_sales s
    where s.date between p_from and p_to
      and s.product_code in (select code from traffic)
    group by s.product_code
  )
  select tr.code, tr.first_post_at, tr.last_post_at, tr.post_count, tr.video_count,
         tr.views, tr.viewers,
         coalesce(sa.qty_sold, 0), coalesce(sa.qty_returned, 0),
         coalesce(sa.qty_sold, 0) - coalesce(sa.qty_returned, 0),
         coalesce(sa.revenue, 0),
         case when tr.viewers > 0
              then round((coalesce(sa.qty_sold, 0) - coalesce(sa.qty_returned, 0)) * 100.0 / tr.viewers, 2)
         end
  from traffic tr
  left join sales sa on sa.code = tr.code
  order by tr.views desc;
$$;

revoke execute on function product_report(date, date) from public, anon, authenticated;
grant execute on function product_report(date, date) to service_role;
