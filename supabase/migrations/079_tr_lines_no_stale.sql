-- 079: tr_lines BỎ DÒNG CŨ CÒN SÓT của đơn. CHẠY TAY trong Supabase SQL Editor, SAU 078. Chạy lại vẫn an toàn.
--  Mỗi lần nhập file đơn hàng ghi đè updated_at của MỌI dòng trong file; file là bản mới nhất của đơn nên dòng của cùng đơn có updated_at cũ hơn là dòng đã bị bỏ / đổi SKU.
--  Bước dọn của lần nhập có thể không chạy hết (database bận) → dòng cũ còn lại làm đơn bị tính trùng, vd HK114747: MATRUNGGIANVANG (file 31/10) + D0001-C010 (file 02/11), cùng 15,63 tr.
--  Hàm này chỉ thêm điều kiện: không lấy dòng mà cùng đơn đã có dòng mới hơn. Phần còn lại giữ NGUYÊN như bản 070.

create or replace function sales.tr_lines(p_team text)
returns table (order_id text, sku text, code text, qty numeric, price numeric, status text, ordered_at timestamptz, delivered_at timestamptz,
               staff text, od date, dd date, canc boolean, mat int, cost_price numeric, craft boolean, craft_kind text)
language sql stable
as $$
  select l.order_id::text, l.sku::text, l.code::text, l.qty::numeric, l.price::numeric, l.status::text, l.ordered_at, l.delivered_at, l.staff::text,
         (l.ordered_at at time zone 'Asia/Ho_Chi_Minh')::date, (l.delivered_at at time zone 'Asia/Ho_Chi_Minh')::date,
         coalesce(l.status ~* 'hủy|huỷ', false),
         case when l.sku ~* '-g(10|14|18|24)-' or k.name ~* 'v(10|14|18|24)k|vàng|gold' then 1
              when l.sku ~* '-s-' or k.name ~* 's925|s990|s999|bạc|silver' then 0 else 2 end,
         k.cost_price::numeric,
         (co.order_id is not null or l.code ilike 'MATRUNG%'),
         coalesce(co.kind, case when l.code ilike '%VANG' then 'vang' when l.code ilike 'MATRUNG%' then 'bac' end)
  from sales.imported_order_lines l
  join sales.staff_teams t on t.sapo_name = l.staff
  left join sales.inventory_skus k on k.sku = l.sku
  left join sales.craft_orders co on co.order_id = l.order_id
  where t.team = p_team and l.order_id not like 'RD%'
    and not exists (select 1 from unnest(string_to_array(coalesce(l.tags, ''), ',')) x
                    where lower(trim(x)) in ('page_id_1659994180936411', 'page_huyk - trang sức thiết kế'))
    and not exists (select 1 from sales.imported_order_lines n where n.order_id = l.order_id and n.updated_at > l.updated_at)
$$;

do $$
begin
  execute 'grant execute on function sales.tr_lines(text) to service_role';
  execute 'revoke all on function sales.tr_lines(text) from anon, authenticated, public';
end $$;

notify pgrst, 'reload schema';
