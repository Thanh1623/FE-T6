-- 078: Báo cáo DOANH THU theo cơ cấu SPU cũ / mới / chế tác (tab "Doanh thu" trong thẻ "Cơ cấu SPU mới và cũ" ở Dashboard trang QLHH, chỉ Quản lý). CHẠY TAY trong Supabase SQL Editor, SAU 077. Chạy lại vẫn an toàn.
--  Nhóm theo quy tắc 077 (sales.spu_age_class, tháng của p_to): cũ · mới · chế tác (đơn chế tác + mã trung gian) · bảo hành (HANGBAOHANH).
--  p_by = 'order' (mặc định): dòng ĐẶT trong kỳ (od), không huỷ, giá > 0. p_by = 'delivery': dòng ĐÃ GIAO có ngày giao (dd) trong kỳ (kể cả đơn đặt tháng trước). Doanh thu = giá × SL.
--    rev = doanh thu đặt · rev_del = phần đã giao · revc / cost = doanh thu / vốn của dòng ĐÃ GIAO có giá vốn (vốn theo giá vốn SKU hiện tại, chưa trừ hoàn)
--  Trả về: cats (theo nhóm: SPU, sản phẩm, đơn, doanh thu, phần đã giao, doanh thu / vốn của dòng đã giao có giá vốn).

drop function if exists sales.tr_revenue_mix(text, date, date);
create or replace function sales.tr_revenue_mix(p_team text, p_from date, p_to date, p_by text default 'order')
returns jsonb
language sql stable
as $$
  with cl as (select code, cat from sales.spu_age_class(p_to)),
  b as (
    select l.order_id, l.code, l.od, l.dd dday, l.qty, l.price, l.cost_price, (l.delivered_at is not null) delivered,
           case when l.craft then 'made'
                when l.code = 'HANGBAOHANH' then 'out'
                when cl.cat = 'new' then 'new' else 'old' end cat
    from sales.tr_lines(p_team) l left join cl on cl.code = l.code
    where not l.canc and l.price > 0
      and case when p_by = 'delivery' then l.delivered_at is not null and l.dd between p_from and p_to else l.od between p_from and p_to end),
  g as (
    select cat, coalesce(sum(qty), 0)::int q, count(distinct order_id) orders, count(distinct code) spus,
           coalesce(sum(price * qty), 0) rev,
           coalesce(sum(price * qty) filter (where delivered), 0) rev_del,
           coalesce(sum(price * qty) filter (where delivered and cost_price > 0), 0) revc,
           coalesce(sum(cost_price * qty) filter (where delivered and cost_price > 0), 0) cost
    from b group by cat)
  select jsonb_build_object(
    'cats', (select coalesce(jsonb_agg(jsonb_build_object('cat', cat, 'q', q, 'orders', orders, 'spus', spus, 'rev', rev, 'rev_del', rev_del, 'revc', revc, 'cost', cost) order by rev desc), '[]'::jsonb) from g)
  )
$$;

do $$
begin
  execute 'grant execute on function sales.tr_revenue_mix(text, date, date, text) to service_role';
  execute 'revoke all on function sales.tr_revenue_mix(text, date, date, text) from anon, authenticated, public';
end $$;

notify pgrst, 'reload schema';
