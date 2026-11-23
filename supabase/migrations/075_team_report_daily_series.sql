-- 075: Thêm chuỗi theo ngày cho biểu đồ xu hướng nhỏ của ô "đơn hủy" ở thẻ Đơn hàng (QLHN). CHẠY TAY trong Supabase SQL Editor, sau 074; chạy lại an toàn.
-- Viết lại sales.tr_orders (thay bản trong 067): mỗi ngày trong 'daily' có thêm  o = số đơn (không huỷ) đặt trong ngày · c = số đơn huỷ.
-- Các khoá cũ (d, q) và mọi số tổng giữ nguyên.
create or replace function sales.tr_orders(p_team text, p_from date, p_to date)
returns jsonb
language sql stable
as $$
  with b as (select * from sales.tr_lines(p_team) where od between p_from and p_to),
  o as (
    select order_id, staff, min(od) od, bool_and(canc) canc, max(status) st,
           coalesce(sum(qty) filter (where price > 0 and not canc), 0) qp,
           coalesce(sum(qty) filter (where price > 0 and not canc and delivered_at is not null), 0) qd,
           bool_or(delivered_at is not null) dl,
           extract(epoch from (max(delivered_at) - min(ordered_at))) / 86400 days
    from b group by order_id, staff),
  days as (select d::date d from generate_series(p_from, p_to, interval '1 day') d),
  per_day as (
    select days.d, coalesce(sum(o.qp), 0) q, count(o.order_id) filter (where not o.canc) orders, count(o.order_id) filter (where o.canc) canc
    from days left join o on o.od = days.d group by days.d),
  per_staff as (
    select staff, count(*) filter (where not canc) orders, coalesce(sum(qp), 0) qty, count(*) filter (where dl) delivered_orders, count(*) filter (where canc) cancelled
    from o group by staff)
  select jsonb_build_object(
    'orders', (select count(*) from o where not canc),
    'qty', (select coalesce(sum(qp), 0) from o),
    'delivered_qty', (select coalesce(sum(qd), 0) from o),
    'cancelled', (select count(*) from o where canc),
    'delivered_orders', (select count(*) from o where dl),
    'avg_days', (select round(avg(days)::numeric, 1) from o where dl),
    'st', jsonb_build_object(
      'done', (select count(*) from o where not canc and st = 'Đã hoàn thành'),
      'running', (select count(*) from o where not canc and st = 'Đang giao dịch'),
      'booked', (select count(*) from o where not canc and st = 'Đặt hàng'),
      'archived', (select count(*) from o where not canc and st = 'Đã lưu trữ')),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'q', q, 'o', orders, 'c', canc) order by d), '[]'::jsonb) from per_day),
    'staff', (select coalesce(jsonb_agg(jsonb_build_object('name', staff, 'orders', orders, 'qty', qty, 'delivered_orders', delivered_orders, 'cancelled', cancelled) order by orders desc, staff), '[]'::jsonb) from per_staff)
  )
$$;

notify pgrst, 'reload schema';
