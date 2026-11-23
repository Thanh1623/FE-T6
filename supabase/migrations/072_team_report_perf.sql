-- 072: Tăng tốc các hàm QLHN (chạy TAY trong Supabase SQL Editor, sau 071; chạy lại an toàn).
-- sales.tr_lines là nền của mọi hàm sales.tr_*, mỗi lần mở /qlhn bị gọi ~10 lần. Đo trên 34.5 nghìn dòng đơn: 1,6 giây / lần.
--  1) Bỏ nhãn kênh ADS bằng MỘT biểu thức chính quy thay vì tách chuỗi thẻ bằng unnest cho từng dòng (mỗi dòng một subplan): 1,6 giây → 0,28 giây.
--     Kết quả y hệt: đã so cả 34.507 dòng, 0 dòng khác nhau (thẻ khớp nguyên từng nhãn, không phân biệt hoa thường, bỏ khoảng trắng hai đầu).
--  2) Chỉ mục theo ngày đặt giờ Việt Nam: bộ lọc `od between ...` (cùng biểu thức này) dùng được chỉ mục thay vì quét cả bảng.
-- Giữ nguyên cột và thứ tự cột của tr_lines (070) nên create or replace là đủ; quyền cũ được giữ.

create index if not exists imported_order_lines_vn_date_idx
  on sales.imported_order_lines (((ordered_at at time zone 'Asia/Ho_Chi_Minh')::date));

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
    -- bỏ đơn kênh ADS: thẻ tag giống ADS_TAGS ở lib/spu-data.ts (nhãn đứng riêng giữa các dấu phẩy)
    and coalesce(l.tags, '') !~* '(^|,)\s*(page_id_1659994180936411|page_huyk - trang sức thiết kế)\s*(,|$)'
$$;

notify pgrst, 'reload schema';
