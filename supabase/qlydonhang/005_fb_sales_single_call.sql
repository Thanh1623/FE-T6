-- Chạy trên project QLYDONHANG (SQL Editor). CHỈ ĐỌC / chỉ thêm hàm mới, chạy lại được, KHÔNG sửa hàm cũ fb_product_daily_sales.
--
-- Vì sao: fb_product_daily_sales tính lại TOÀN BỘ mỗi lần PostgREST xin 1 trang 1000 dòng → 5.300 dòng = 6 lần tính (mỗi lần ~2-3 giây),
-- lúc DB bận thì 1 lần vượt giới hạn thời gian → "canceling statement due to statement timeout".
-- Cách chữa: trả MỘT mảng jsonb (không dính giới hạn 1000 dòng) → chỉ tính 1 lần; thêm p_until để tải năm đầu theo từng khoảng ngày.
--   fb_product_daily_sales_range(p_since, p_until)  — như bản 004 nhưng lọc thêm p_until (loại trừ ngày p_until; NULL = đến nay)
--   fb_product_daily_sales_json(p_since, p_until)   — bọc range thành 1 mảng jsonb (app gọi hàm này)

create or replace function public.fb_product_daily_sales_range(p_since date, p_until date default null)
returns table (
  sale_date      date,
  product_code   text,
  page_id        text,
  channel        text,
  qty_sold       bigint,
  qty_returned   bigint,
  revenue        bigint,
  returned_value bigint,
  cost           bigint,
  returned_cost  bigint
)
language sql
stable
set search_path = public
as $$
  with tagged as (
    select o.id,
           substring(o.sapo_tags from 'page_id_([0-9]+)') as pid,
           substring(o.sapo_tags from 'ig_id_([0-9]+)')   as igid,
           array(select trim(x) from unnest(string_to_array(coalesce(o.sapo_tags, ''), ',')) x where trim(x) <> '') as tags,
           o.created_at
    from orders o
    where o.created_at >= now() - interval '400 days'
  ),
  -- Bảng tra tên tag → ID, tự học từ đơn có đủ cả 2 loại tag
  name_map as (
    select distinct on (name) name, id from (
      select t as name, case when t like 'page\_%' then pid else igid end as id, count(*) as n
      from tagged, unnest(tags) t
      where (t like 'page\_%' and t not like '%page\_id\_%' and pid is not null)
         or (t like 'ig\_%' and t not like 'ig\_id\_%' and igid is not null)
      group by 1, 2
    ) s
    order by name, n desc
  ),
  src as (
    select tg.id,
           coalesce(tg.pid, tg.igid, (select m.id from unnest(tg.tags) t join name_map m on m.name = t limit 1), '') as page_id
    from tagged tg
  ),
  lines as (
    select (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date as d,
           upper(split_part(oi.sku, '-', 1))                    as code,
           coalesce(sr.page_id, '')                             as page_id,
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
    left join src sr on sr.id = o.id
    left join product_stock ps on ps.sku = oi.sku
    where o.status <> 'huy'
      and o.created_at >= (p_since::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and (p_until is null or o.created_at < (p_until::timestamp at time zone 'Asia/Ho_Chi_Minh'))
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
           coalesce(sr.page_id, '')                              as page_id,
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
    left join src sr on sr.id = o.id
    left join product_stock ps on ps.sku = ri.sku
    where r.returned_at >= (p_since::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and (p_until is null or r.returned_at < (p_until::timestamp at time zone 'Asia/Ho_Chi_Minh'))
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

create or replace function public.fb_product_daily_sales_json(p_since date, p_until date default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.fb_product_daily_sales_range(p_since, p_until) t;
$$;

revoke execute on function public.fb_product_daily_sales_range(date, date) from public, anon, authenticated;
revoke execute on function public.fb_product_daily_sales_json(date, date) from public, anon, authenticated;
grant execute on function public.fb_product_daily_sales_range(date, date) to service_role;
grant execute on function public.fb_product_daily_sales_json(date, date) to service_role;

-- TUỲ CHỌN (bỏ dấu -- để chạy nếu vẫn còn timeout): nới giới hạn thời gian 1 câu lệnh của service_role (hiện ~8 giây)
-- alter role service_role set statement_timeout = '30s';
-- notify pgrst, 'reload config';

notify pgrst, 'reload schema';
