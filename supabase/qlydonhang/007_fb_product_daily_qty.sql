-- 007: số bán chỉ theo SỐ LƯỢNG (không đọc giá, giá vốn, tiền hoàn) cho fb-traffic. Chạy TAY trên project QLYDONHANG (SQL Editor).
-- Chỉ thêm 2 hàm mới, KHÔNG sửa / xoá hàm cũ (fb_product_daily_sales*), chạy lại an toàn.
-- Cách tính giống 006: bỏ đơn huỷ, ngày tạo đơn (giờ VN), hàng hoàn tính theo ngày hoàn, ghép Trang nguồn theo tag. Chỉ cần các bảng:
--   orders (id, status, created_at, sapo_tags, sapo_source), order_items (order_id, sku, qty), order_returns (id, order_id, returned_at), order_return_items (return_id, sku, qty).
-- => Khi tái cấu trúc DB, GIỮ các bảng/cột trên; có thể xoá mọi bảng/cột tiền, giá vốn.
--   fb_product_daily_qty_range(p_since, p_until)  — loại trừ ngày p_until; NULL = đến nay
--   fb_product_daily_qty_json(p_since, p_until)   — bọc range thành 1 mảng jsonb (app gọi hàm này)

create or replace function public.fb_product_daily_qty_range(p_since date, p_until date default null)
returns table (
  sale_date    date,
  product_code text,
  page_id      text,
  channel      text,
  qty_sold     bigint,
  qty_returned bigint
)
language sql
stable
set search_path = public
as $$
  with tagged as (
    select o.id,
           substring(o.sapo_tags from 'page_id_([0-9]+)') as pid,
           substring(o.sapo_tags from 'ig_id_([0-9]+)')   as igid,
           -- Đơn từ tài khoản TikTok (nguồn tiktok-for-business): tag "tiktok_business_<tên tài khoản>" (bỏ tag tiktok_business_id_…)
           (select lower(regexp_replace(trim(substring(trim(x) from 'tiktok_business_(.*)$')), '\s+', ' ', 'g'))
              from unnest(string_to_array(coalesce(o.sapo_tags, ''), ',')) x
             where trim(x) like 'tiktok\_business\_%' and trim(x) not like 'tiktok\_business\_id\_%' limit 1) as ttname,
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
           coalesce(tg.pid, tg.igid, (select m.id from unnest(tg.tags) t join name_map m on m.name = t limit 1),
                    case when tg.ttname is not null and tg.ttname <> '' then 'ttn:' || tg.ttname end, '') as page_id
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
           oi.qty
    from order_items oi
    join orders o on o.id = oi.order_id
    left join src sr on sr.id = o.id
    where o.status <> 'huy'
      and o.created_at >= (p_since::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and (p_until is null or o.created_at < (p_until::timestamp at time zone 'Asia/Ho_Chi_Minh'))
      and oi.sku is not null
  ),
  sold as (
    select d, code, page_id, channel, sum(qty) as qty from lines group by d, code, page_id, channel
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
           ri.qty
    from order_return_items ri
    join order_returns r on r.id = ri.return_id
    left join orders o on o.id = r.order_id
    left join src sr on sr.id = o.id
    where r.returned_at >= (p_since::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and (p_until is null or r.returned_at < (p_until::timestamp at time zone 'Asia/Ho_Chi_Minh'))
      and ri.sku is not null
  ),
  ret as (
    select d, code, page_id, channel, sum(qty) as qty from ret_lines group by d, code, page_id, channel
  )
  select coalesce(s.d, r.d), coalesce(s.code, r.code), coalesce(s.page_id, r.page_id), coalesce(s.channel, r.channel),
         coalesce(s.qty, 0), coalesce(r.qty, 0)
  from sold s
  full join ret r on r.d = s.d and r.code = s.code and r.page_id = s.page_id and r.channel = s.channel;
$$;

create or replace function public.fb_product_daily_qty_json(p_since date, p_until date default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) from public.fb_product_daily_qty_range(p_since, p_until) q;
$$;

revoke execute on function public.fb_product_daily_qty_range(date, date) from public, anon, authenticated;
grant execute on function public.fb_product_daily_qty_range(date, date) to service_role;
revoke execute on function public.fb_product_daily_qty_json(date, date) from public, anon, authenticated;
grant execute on function public.fb_product_daily_qty_json(date, date) to service_role;
notify pgrst, 'reload schema';
