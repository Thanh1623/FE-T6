-- Chạy trên project QLYDONHANG (không phải project fb-traffic).
-- Hàm CHỈ ĐỌC: số bán / doanh thu / giá vốn theo mã mẫu (phần SKU trước dấu '-') theo ngày,
-- cho app fb-traffic. Chạy lại nhiều lần vẫn an toàn.
--
-- Quy tắc:
--  - Đơn chốt = status <> 'huy', tính theo ngày tạo đơn (giờ VN).
--  - Doanh thu = tiền dòng hàng đã PHÂN BỔ giảm giá đơn: dòng × total_value / tổng dòng của đơn.
--  - Hàng hoàn trừ theo ngày hoàn; tiền hoàn = returned_value của phiếu, phân bổ theo qty × price.
--  - page_id = ID Trang Facebook lấy từ tag Sapo 'page_id_<số>' (ChatOmniAI tự gắn); '' (rỗng) nếu đơn
--    không có tag Trang. Hàng hoàn lấy page_id / kênh của đơn gốc.
--  - channel = kênh bán chuẩn hoá từ orders.sapo_source: facebook, tiktok_shop, tiktok, shopee, web,
--    cua_hang (pos), zalo, instagram, bao_hanh, khac.
--  - Giá vốn = qty × product_stock.gia_von HIỆN TẠI của SKU (đồng bộ Sapo; trước 2026-07-26 = 0
--    nên lợi nhuận kỳ cũ chỉ là ước tính).

drop function if exists public.fb_product_daily_sales(date);

create function public.fb_product_daily_sales(p_since date)
returns table (
  sale_date      date,
  product_code   text,
  page_id        text,     -- ID Trang nguồn (từ tag page_id_...), '' nếu không có
  channel        text,     -- kênh bán (chuẩn hoá từ sapo_source)
  qty_sold       bigint,
  qty_returned   bigint,
  revenue        bigint,   -- doanh thu sau giảm giá
  returned_value bigint,   -- tiền hoàn
  cost           bigint,   -- giá vốn hàng bán
  returned_cost  bigint    -- giá vốn hàng hoàn (cộng lại)
)
language sql
stable
set search_path = public
as $$
  with lines as (
    select (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date as d,
           upper(split_part(oi.sku, '-', 1))                    as code,
           coalesce(substring(o.sapo_tags from 'page_id_([0-9]+)'), '') as page_id,
           case lower(coalesce(o.sapo_source, ''))
             when 'facebook' then 'facebook' when 'facebook_shopping' then 'facebook'
             when 'tiktokshop' then 'tiktok_shop'
             when 'tiktok-for-business' then 'tiktok' when 'tiktok-personal' then 'tiktok'
             when 'shopee' then 'shopee' when 'web' then 'web' when 'pos' then 'cua_hang'
             when 'zalo' then 'zalo' when 'zalo-oa' then 'zalo' when 'instagram' then 'instagram'
             when 'bao-hanh' then 'bao_hanh' else 'khac' end as channel,
           oi.qty,
           oi.qty * oi.unit_price                               as line_value,
           sum(oi.qty * oi.unit_price) over (partition by o.id) as order_line_sum,
           o.total_value,
           oi.qty * coalesce(ps.gia_von, 0)                     as line_cost
    from order_items oi
    join orders o on o.id = oi.order_id
    left join product_stock ps on ps.sku = oi.sku
    where o.status <> 'huy'
      and o.created_at >= (p_since::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and oi.sku is not null
  ),
  sold as (
    select d, code, page_id, channel,
           sum(qty) as qty,
           round(sum(case when order_line_sum > 0 and total_value > 0
                          then line_value * total_value::numeric / order_line_sum
                          else line_value end))::bigint as revenue,
           sum(line_cost)::bigint as cost
    from lines
    group by d, code, page_id, channel
  ),
  ret_lines as (
    select (r.returned_at at time zone 'Asia/Ho_Chi_Minh')::date as d,
           upper(split_part(ri.sku, '-', 1))                     as code,
           coalesce(substring(o.sapo_tags from 'page_id_([0-9]+)'), '') as page_id,
           case lower(coalesce(o.sapo_source, ''))
             when 'facebook' then 'facebook' when 'facebook_shopping' then 'facebook'
             when 'tiktokshop' then 'tiktok_shop'
             when 'tiktok-for-business' then 'tiktok' when 'tiktok-personal' then 'tiktok'
             when 'shopee' then 'shopee' when 'web' then 'web' when 'pos' then 'cua_hang'
             when 'zalo' then 'zalo' when 'zalo-oa' then 'zalo' when 'instagram' then 'instagram'
             when 'bao-hanh' then 'bao_hanh' else 'khac' end as channel,
           ri.qty,
           ri.qty * ri.price                                     as line_value,
           sum(ri.qty * ri.price) over (partition by r.id)       as ret_line_sum,
           r.returned_value,
           ri.qty * coalesce(ps.gia_von, 0)                      as line_cost
    from order_return_items ri
    join order_returns r on r.id = ri.return_id
    left join orders o on o.id = r.order_id
    left join product_stock ps on ps.sku = ri.sku
    where r.returned_at >= (p_since::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and ri.sku is not null
  ),
  ret as (
    select d, code, page_id, channel,
           sum(qty) as qty,
           round(sum(case when ret_line_sum > 0 and returned_value is not null
                          then line_value * returned_value::numeric / ret_line_sum
                          else line_value end))::bigint as value,
           sum(line_cost)::bigint as cost
    from ret_lines
    group by d, code, page_id, channel
  )
  select coalesce(s.d, r.d), coalesce(s.code, r.code), coalesce(s.page_id, r.page_id),
         coalesce(s.channel, r.channel),
         coalesce(s.qty, 0), coalesce(r.qty, 0),
         coalesce(s.revenue, 0), coalesce(r.value, 0),
         coalesce(s.cost, 0), coalesce(r.cost, 0)
  from sold s
  full join ret r on r.d = s.d and r.code = s.code and r.page_id = s.page_id and r.channel = s.channel;
$$;

-- Chỉ server (secret key) được gọi
revoke execute on function public.fb_product_daily_sales(date) from public, anon, authenticated;
grant execute on function public.fb_product_daily_sales(date) to service_role;
notify pgrst, 'reload schema';
