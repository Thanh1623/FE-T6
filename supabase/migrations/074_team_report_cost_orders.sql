-- 074: Thêm SỐ ĐƠN vào giá vốn / giá bán (thẻ "Tỷ lệ giá vốn / giá bán" và bảng giá vốn của QLHN). CHẠY TAY trong Supabase SQL Editor, sau 073; chạy lại an toàn.
-- Viết lại sales.tr_cost (thay bản trong 067): thêm 'orders' = số đơn khác nhau có dòng đã giao trong kỳ (theo từng chất liệu và tổng).
-- Một đơn có nhiều chất liệu (vd bạc + vàng) được đếm ở từng chất liệu, nên tổng số đơn theo chất liệu có thể lớn hơn 'orders' tổng (đếm mỗi đơn một lần).
-- Mọi thứ khác giữ nguyên. NHẠY CẢM: chỉ Quản lý được gọi (kiểm ở lib/team-report.ts).
create or replace function sales.tr_cost(p_team text, p_from date, p_to date, p_by text, p_excl boolean default false)
returns jsonb
language sql stable
as $$
  with b as (
    select * from sales.tr_lines(p_team)
    where not canc and price > 0 and delivered_at is not null
      and case when p_by = 'delivery' then dd between p_from and p_to else od between p_from and p_to end
      and not (p_excl and cost_price > price)),
  g as (
    select mat, coalesce(sum(qty), 0) q, count(distinct order_id) orders, coalesce(sum(price * qty), 0) rev,
           coalesce(sum(price * qty) filter (where cost_price > 0), 0) revc, coalesce(sum(cost_price * qty) filter (where cost_price > 0), 0) cost
    from b group by mat)
  select jsonb_build_object(
    'orders', (select count(distinct order_id) from b),
    'mat', (select coalesce(jsonb_agg(jsonb_build_object('mat', mat, 'q', q, 'orders', orders, 'rev', rev, 'revc', revc, 'cost', cost) order by mat), '[]'::jsonb) from g),
    'flagged', (select coalesce(jsonb_agg(jsonb_build_object('order_id', order_id, 'sku', sku, 'price', price, 'cost', cost_price, 'qty', qty)), '[]'::jsonb)
                from (select * from b where cost_price > price limit 5) f)
  )
$$;

notify pgrst, 'reload schema';
