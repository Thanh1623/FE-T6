-- 092: sales.tr_lines NHANH HƠN ~5 lần (kết quả KHÔNG đổi). CHẠY TAY trong Supabase SQL Editor, SAU 091. Chạy lại vẫn an toàn.
-- Đo thật 2026-11-09: trang /qlhn mất 10–15 giây (có lần lỗi 500). Gần như MỌI hàm sales.tr_* (orders, mix, spu, order_list, top, media, revenue_mix, test…) gọi lại tr_lines → ~17 lần mỗi lần mở trang.
-- tr_lines cho một team mất 1,6 giây vì kế hoạch quét 101.000 dòng và kiểm tra thẻ loại trừ (tách chuỗi tags) trên TỪNG dòng TRƯỚC khi lọc theo nhân viên của team (chỉ ~16.000 dòng).
-- Cách sửa: lọc theo nhân viên của team trước (CTE materialized) rồi mới kiểm tra thẻ loại trừ / dòng cũ / đơn loại trừ trên số dòng còn lại → ~0,3 giây. Cùng điều kiện, cùng cột trả về.

create or replace function sales.tr_lines(p_team text)
returns table (order_id text, sku text, code text, qty numeric, price numeric, status text, ordered_at timestamptz, delivered_at timestamptz,
               staff text, od date, dd date, canc boolean, mat int, cost_price numeric, craft boolean, craft_kind text)
language sql stable
as $$
  with s as materialized (
    select l.* from sales.imported_order_lines l
    join sales.staff_teams t on t.sapo_name = l.staff
    where t.team = p_team and l.order_id not like 'RD%'
  )
  select l.order_id::text, l.sku::text, l.code::text, l.qty::numeric, l.price::numeric, l.status::text, l.ordered_at, l.delivered_at, l.staff::text,
         (l.ordered_at at time zone 'Asia/Ho_Chi_Minh')::date, (l.delivered_at at time zone 'Asia/Ho_Chi_Minh')::date,
         coalesce(l.status ~* 'hủy|huỷ', false),
         case when l.sku ~* '-g(10|14|18|24)-' or k.name ~* 'v(10|14|18|24)k|vàng|gold' then 1
              when l.sku ~* '-s-' or k.name ~* 's925|s990|s999|bạc|silver' then 0 else 2 end,
         k.cost_price::numeric,
         (co.order_id is not null or l.code ilike 'MATRUNG%'),
         coalesce(co.kind, case when l.code ilike '%VANG' then 'vang' when l.code ilike 'MATRUNG%' then 'bac' end)
  from s l
  left join sales.inventory_skus k on k.sku = l.sku
  left join sales.craft_orders co on co.order_id = l.order_id
  where not exists (select 1 from unnest(string_to_array(coalesce(l.tags, ''), ',')) x
                    where lower(trim(x)) in ('page_id_1659994180936411', 'page_huyk - trang sức thiết kế'))
    and not exists (select 1 from sales.imported_order_lines n where n.order_id = l.order_id and n.updated_at > l.updated_at)
    and not exists (select 1 from sales.order_adjust a where a.order_id = l.order_id and a.kind = 'exclude')   -- đơn do Quản lý đánh dấu loại khỏi báo cáo
$$;

do $$
begin
  execute 'grant execute on function sales.tr_lines(text) to service_role';
  execute 'revoke all on function sales.tr_lines(text) from anon, authenticated, public';
end $$;

notify pgrst, 'reload schema';
