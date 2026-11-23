-- 087: Lưu TRẠNG THÁI GIAO HÀNG + TRẠNG THÁI TRẢ HÀNG của từng dòng đơn nhập từ file (các cột "Trạng thái giao hàng", "Trạng thái trả hàng", "Trạng thái hoàn trả") và hiện trạng thái "Đã hoàn hàng" / nhãn "Đang trả hàng". CHẠY TAY trong Supabase SQL Editor, SAU 086. Chạy lại vẫn an toàn.
--  • sales.imported_order_lines.ship_status: Đã giao hàng / Đã hoàn hàng / Đang giao hàng / Đã lấy hàng / Chờ lấy hàng / Chờ giao lại / Đang hoàn hàng / Chờ xác nhận hoàn hàng / rỗng.
--  • Đơn "Đã hoàn hàng" (Sapo vẫn để trạng thái đơn là "Đang giao dịch", chưa có ngày giao) trước đây bị tính là "Còn hàng, chưa giao" / "Thiếu hàng". Nay: trạng thái riêng "r" (Đã hoàn hàng) ở bảng DS đơn hàng,
--    và KHÔNG còn tính vào số "chưa giao", "thiếu hàng để giao" (tr_current) cũng như dồn nhu cầu tồn kho của DS đơn hàng (tr_order_list). Doanh thu / số đơn / SL bán KHÔNG đổi.
--  • Sau khi chạy: NHẬP LẠI file đơn hàng (nút "Nhập số bán") để các dòng cũ được ghi trạng thái giao hàng (và ngày giao nếu file đã có).

alter table sales.imported_order_lines add column if not exists ship_status text;
alter table sales.imported_order_lines add column if not exists return_status text;   -- cột "Trạng thái trả hàng": Không có trả hàng / Đang trả hàng / Đã trả hàng một phần / Đã trả hàng toàn bộ
alter table sales.imported_order_lines add column if not exists refund_status text;   -- cột "Trạng thái hoàn trả" (hoàn tiền): Chưa hoàn trả / Hoàn trả một phần / Đã hoàn trả
create index if not exists imported_order_lines_ret_idx on sales.imported_order_lines (order_id) where ship_status ilike 'đã hoàn hàng';
comment on column sales.imported_order_lines.ship_status is 'Trạng thái giao hàng (file Sapo); null = file cũ chưa có cột';

-- Dòng sản phẩm: [ngày đặt, mã đơn, SPU, SKU, tên, SL, trạng thái, số ngày, trả hàng]
--   trả hàng: '' = không, 'i' = đang trả hàng, 'p' = đã trả một phần, 'f' = đã trả toàn bộ (khách trả sau khi giao; CHỈ hiển thị, doanh thu không đổi)
--   trạng thái d = đã giao, c = còn hàng chưa giao, t = thiếu hàng, m = đang chế tác, r = đã hoàn hàng
create or replace function sales.tr_order_list(p_team text, p_from date, p_to date)
returns jsonb
language sql stable
as $$
  with m as (select run_id from sales.spu_summary_meta limit 1),
  ret as (select distinct order_id from sales.imported_order_lines where ship_status ilike 'đã hoàn hàng'),
  b as (select tl.*, (tl.delivered_at is null and tl.order_id in (select order_id from ret)) rt
        from sales.tr_lines(p_team) tl where tl.od between p_from and p_to and not tl.canc and tl.price > 0),
  rs as (select order_id, max(case when return_status ilike 'đang trả%' then 1 when return_status ilike '%một phần%' then 2 when return_status ilike '%toàn bộ%' then 3 else 0 end) k
         from sales.imported_order_lines where return_status is not null and return_status not ilike 'không có%' group by order_id),
  stk as (select sku, sum(stock) stock from sales.inventory_stock group by sku),
  x as (
    select b.*, coalesce(k.name, s.name, b.code) nm, coalesce(stk.stock, 0) stock,
           sum(case when b.delivered_at is null and not b.rt then b.qty else 0 end)
             over (partition by b.sku order by b.ordered_at, b.order_id rows between unbounded preceding and current row) cum
    from b left join sales.inventory_skus k on k.sku = b.sku
           left join sales.spu_summary s on s.code = b.code and s.run_id = (select run_id from m)
           left join stk on stk.sku = b.sku)
  select coalesce(jsonb_agg(jsonb_build_array(
      od, order_id, code, sku, left(nm, 90), qty::int,
      case when delivered_at is not null then 'd' when rt then 'r' when code ilike 'MATRUNG%' then 'm' when cum <= stock then 'c' else 't' end,
      case when delivered_at is not null then dd - od else greatest((now() at time zone 'Asia/Ho_Chi_Minh')::date - od, 0) end,
      case (select k from rs where rs.order_id = x.order_id) when 1 then 'i' when 2 then 'p' when 3 then 'f' else '' end)
    order by od desc, order_id desc), '[]'::jsonb)
  from x
$$;

-- Số liệu "hiện tại" của team (chưa giao, thiếu hàng, đơn chế tác): bỏ các đơn đã hoàn hàng khỏi phần chưa giao
create or replace function sales.tr_current(p_team text, p_from date default null)
returns jsonb
language sql stable
as $$
  with m as (select run_id from sales.spu_summary_meta limit 1),
  ret as (select distinct order_id from sales.imported_order_lines where ship_status ilike 'đã hoàn hàng'),
  base as (select * from sales.tr_lines(p_team) where od >= coalesce(p_from, current_date - 60)),
  plain as (select * from base where not craft and not canc and price > 0 and delivered_at is null and order_id not in (select order_id from ret)),
  ordr as (   -- mỗi đơn chế tác (chưa huỷ) trong kỳ: còn mã trung gian (making), đã xong chưa giao, hay đã giao
    select order_id, coalesce(max(craft_kind), 'bac') kind, bool_or(code ilike 'MATRUNG%' and price > 0) making, bool_or(delivered_at is not null) delivered,
           max(status) st, min(ordered_at) oa
    from base where craft and not canc group by order_id),
  pend as (
    select p.code, sum(p.qty) pend, sum(p.qty) filter (where p.ordered_at < now() - interval '7 days') pend7,
           coalesce(s.stock_total, 0) stock, coalesce(s.incoming, 0) incoming, left(coalesce(s.name, ''), 80) name
    from plain p left join sales.spu_summary s on s.code = p.code and s.run_id = (select run_id from m)
    group by p.code, s.stock_total, s.incoming, s.name)
  select jsonb_build_object(
    'pending_qty', (select coalesce(sum(qty), 0) from plain),
    'pending_over7', (select coalesce(sum(qty) filter (where ordered_at < now() - interval '7 days'), 0) from plain),
    'chetac', (select coalesce(jsonb_agg(x order by k), '[]'::jsonb) from (
        select kind k, jsonb_build_object('kind', case kind when 'vang' then 'Vàng' else 'Bạc' end,
          'orders', count(*) filter (where making), 'running', count(*) filter (where making and st = 'Đang giao dịch'),
          'booked', count(*) filter (where making and st = 'Đặt hàng'), 'archived', count(*) filter (where making and st = 'Đã lưu trữ'),
          'over14', count(*) filter (where making and oa < now() - interval '14 days'),
          'ready', count(*) filter (where not making and not delivered), 'done', count(*) filter (where delivered)) x
        from ordr group by kind) z),
    'short', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'pending', pend, 'pending7', coalesce(pend7, 0), 'stock', stock, 'incoming', incoming, 'short', pend - stock) order by pend - stock desc, pend desc), '[]'::jsonb)
              from pend where pend > stock)
  )
$$;

do $$
begin
  execute 'grant execute on function sales.tr_order_list(text, date, date) to service_role';
  execute 'revoke all on function sales.tr_order_list(text, date, date) from anon, authenticated, public';
  execute 'grant execute on function sales.tr_current(text, date) to service_role';
  execute 'revoke all on function sales.tr_current(text, date) from anon, authenticated, public';
end $$;

notify pgrst, 'reload schema';
