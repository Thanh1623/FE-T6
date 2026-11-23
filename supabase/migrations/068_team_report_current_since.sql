-- 068: sales.tr_current nhận thêm ngày bắt đầu (p_from) để số "chưa giao", "thiếu hàng để giao", "đơn chế tác" của trang QLHN khớp khoảng ngày đang lọc
-- (trước đó cố định 60 ngày nên lệch với thẻ Đơn hàng). CHẠY TAY trong Supabase SQL Editor, SAU 067. Chạy lại vẫn an toàn.
drop function if exists sales.tr_current(text);

create or replace function sales.tr_current(p_team text, p_from date default null)
returns jsonb
language sql stable
as $$
  with m as (select run_id from sales.spu_summary_meta limit 1),
  b as (select * from sales.tr_lines(p_team) where od >= coalesce(p_from, current_date - 60) and not canc and price > 0 and delivered_at is null),
  plain as (select * from b where code not ilike 'MATRUNG%'),
  ct as (select * from b where code ilike 'MATRUNG%'),
  pend as (
    select p.code, sum(p.qty) pend, sum(p.qty) filter (where p.ordered_at < now() - interval '7 days') pend7,
           coalesce(s.stock_total, 0) stock, coalesce(s.incoming, 0) incoming, left(coalesce(s.name, ''), 80) name
    from plain p left join sales.spu_summary s on s.code = p.code and s.run_id = (select run_id from m)
    group by p.code, s.stock_total, s.incoming, s.name)
  select jsonb_build_object(
    'pending_qty', (select coalesce(sum(qty), 0) from plain),
    'pending_over7', (select coalesce(sum(qty) filter (where ordered_at < now() - interval '7 days'), 0) from plain),
    'chetac', (select coalesce(jsonb_agg(jsonb_build_object('kind', k, 'orders', orders, 'running', running, 'booked', booked, 'archived', archived, 'over14', over14) order by k), '[]'::jsonb)
               from (select case when code ilike '%VANG' then 'Vàng' else 'Bạc' end k, count(distinct order_id) orders,
                            coalesce(sum(qty) filter (where status = 'Đang giao dịch'), 0) running, coalesce(sum(qty) filter (where status = 'Đặt hàng'), 0) booked,
                            coalesce(sum(qty) filter (where status = 'Đã lưu trữ'), 0) archived, coalesce(sum(qty) filter (where ordered_at < now() - interval '14 days'), 0) over14
                     from ct group by 1) z),
    'short', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'pending', pend, 'pending7', coalesce(pend7, 0), 'stock', stock, 'incoming', incoming, 'short', pend - stock) order by pend - stock desc, pend desc), '[]'::jsonb)
              from pend where pend > stock)
  )
$$;

grant execute on function sales.tr_current(text, date) to service_role;
revoke all on function sales.tr_current(text, date) from anon, authenticated, public;
notify pgrst, 'reload schema';
