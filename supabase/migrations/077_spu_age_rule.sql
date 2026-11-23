-- 077: QUY TẮC SPU MỚI / CŨ theo ngày tạo và đơn hàng TOÀN CÔNG TY (không theo team) — dùng cho cơ cấu SPU mới / cũ và "SPU mới đã lên video" ở trang QLHH.
-- CHẠY TAY trong Supabase SQL Editor, SAU 070 và 076. Chạy lại vẫn an toàn.
--  Tháng tính = tháng của ngày cuối kỳ lọc (p_to). "Tạo" = sớm nhất của ngày SKU lên danh mục Sapo (chỉ tin từ 01/08/2026) và ngày nhập kho đầu; nếu có đơn sớm hơn các ngày đó thì lấy ngày đơn đầu tiên (SPU không thể tạo sau đơn đầu).
--  Đơn đầu tiên = sớm nhất của file đơn hàng đã nhập (bỏ đơn huỷ, giá 0 và ĐƠN CHẾ TÁC — sales.craft_orders, mã trung gian) và số đồng bộ Qlydonhang (sales.daily_sales), của MỌI team.
--    • Mã ĐỔI TỪ MÃ CŨ (có trong sales.spu_aliases, cột new_code)                          → cũ (dù tạo tháng này / tháng trước, đã hay chưa có đơn)
--    • Tạo tháng trước hoặc tháng này, không phải đổi mã, đã có đơn (kể cả đơn tháng trước) → mới
--    • Tạo tháng này, không phải đổi mã, chưa có đơn nào                                   → 'pending' (chưa bán nên không xuất hiện ở báo cáo số bán)
--    • Tạo từ trước tháng trước / không có dữ liệu đơn                                      → cũ
--  CHẾ TÁC = đúng các ĐƠN chế tác (sales.craft_orders + dòng mã trung gian MATRUNGGIAN…); các dòng của đơn đó xếp riêng "Chế tác" (không xét mới / cũ). Mã X9xxx bán ở đơn thường vẫn xếp mới / cũ như SPU khác. HANGBAOHANH xếp "SP bảo hành".

create or replace function sales.spu_age_class(p_ref date)
returns table (code text, cat text, created_on date, first_order date, renamed boolean)
language sql stable
as $$
  with d0 as (select date_trunc('month', p_ref)::date d),
  fo as (
    select z.code, min(z.d) first_order from (
      select upper(l.code) code, (l.ordered_at at time zone 'Asia/Ho_Chi_Minh')::date d from sales.imported_order_lines l
        where l.price > 0 and coalesce(l.status, '') !~* 'hủy|huỷ'
          and l.code not ilike 'MATRUNG%'
          and not exists (select 1 from sales.craft_orders co where co.order_id = l.order_id)   -- đơn chế tác (070) không tính là đơn đầu tiên của SPU
      union all
      select upper(code), date from sales.daily_sales where qty_sold > 0) z
    group by z.code),
  fr as (select upper(k.code) code, min(r.received_on) first_in
         from sales.stock_receipts r join sales.inventory_skus k using (sku) group by upper(k.code)),
  cr as (select coalesce(upper(c.code), f.code) code,
                least(case when c.first_seen_at >= date '2026-08-01' then c.first_seen_at::date end, f.first_in) created
         from sales.catalog c full join fr f on f.code = upper(c.code)),
  rn as (select distinct upper(new_code) code from sales.spu_aliases),
  cls as (select coalesce(fo.code, cr.code) code, least(coalesce(cr.created, fo.first_order), fo.first_order) created, fo.first_order, (rn.code is not null) renamed   -- SPU không thể tạo SAU đơn đầu tiên: có đơn từ trước ngày nhập kho đầu thì lấy ngày đơn đầu làm ngày tạo
          from fo full join cr on cr.code = fo.code left join rn on rn.code = coalesce(fo.code, cr.code))
  select cls.code, case
           when cls.renamed then 'old'
           when cls.created >= (select d from d0) - interval '1 month'
             then case when cls.first_order is not null then 'new' when cls.created >= (select d from d0) then 'pending' else 'new' end
           else 'old' end,
         cls.created, cls.first_order, cls.renamed
  from cls
$$;

create or replace function sales.tr_mix(p_team text, p_from date, p_to date)
returns jsonb
language sql stable
as $$
  with m as (select run_id from sales.spu_summary_meta limit 1),
  cl as (select * from sales.spu_age_class(p_to)),
  sold as (select code, craft, sum(qty)::int q, count(distinct order_id)::int orders from sales.tr_lines(p_team)
           where od between p_from and p_to and not canc and price > 0 group by code, craft),
  x as (
    select sd.code, sd.q, sd.orders,
           case when sd.made then 'Khác' else coalesce(s.grp, 'Khác') end grp, left(coalesce(s.name, sd.code), 80) name,
           case when sd.made then 'made' when sd.code = 'HANGBAOHANH' then 'out' else coalesce(nullif(cl.cat, 'pending'), case when cl.cat = 'pending' then 'new' else 'old' end) end cat,
           cl.created_on, cl.first_order
    from (select sold.code, sold.q, sold.orders, sold.craft made from sold) sd
    left join sales.spu_summary s on s.code = sd.code and s.run_id = (select run_id from m)
    left join cl on cl.code = sd.code)
  select jsonb_build_object(
    'grp', (select coalesce(jsonb_agg(jsonb_build_object('name', grp, 'q', q, 'spus', n) order by q desc), '[]'::jsonb) from (select grp, sum(q) q, count(*) n from x group by grp) z),
    'age', (select coalesce(jsonb_agg(jsonb_build_object('cat', cat, 'q', q, 'spus', n, 'orders', orders, 'sup', 0) order by cat), '[]'::jsonb)
            from (select cat, sum(q) q, count(*) n, sum(orders)::int orders from x group by cat) z),
    'unrated', '[]'::jsonb,
    'new_list', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'grp', grp, 'q', q, 'created', created_on, 'first_order', first_order) order by q desc, code), '[]'::jsonb)
                 from x where cat = 'new')
  )
$$;

-- SPU mới đã lên video: SPU mới theo quy tắc trên (thay cho đánh giá R&D) mà team bán trong kỳ
create or replace function sales.tr_media(p_team text, p_from date, p_to date)
returns jsonb
language sql stable
as $$
  with m as (select run_id from sales.spu_summary_meta limit 1),
  b as (select code, qty from sales.tr_lines(p_team) where od between p_from and p_to and not canc and price > 0
        and code not ilike 'MATRUNG%' and code <> 'HANGBAOHANH'),
  sold as (select code, sum(qty)::int q from b group by code),
  tv as (select distinct code from sales.spu_video_daily where team = p_team and run_id = (select run_id from m)),
  nw as (select sold.code, sold.q, (tv.code is not null) has_video
         from sold join sales.spu_age_class(p_to) cl on cl.code = sold.code and cl.cat = 'new' left join tv on tv.code = sold.code
         ),
  vr as (select code, sum(videos)::int videos, sum(views)::int views from sales.spu_video_daily
         where team = p_team and run_id = (select run_id from m) and day between p_from and p_to group by code),
  w as (select vr.code, left(coalesce(s.name, vr.code), 90) name, e.result, e.age, coalesce(sold.q, 0) q, vr.videos, vr.views
        from vr left join rnd.evaluations e on e.code = vr.code left join sold on sold.code = vr.code
                left join sales.spu_summary s on s.code = vr.code and s.run_id = (select run_id from m))
  select jsonb_build_object(
    'new_total', (select count(*) from nw), 'new_video', (select count(*) from nw where has_video),
    'new_no_video', (select coalesce(jsonb_agg(jsonb_build_object('code', n.code, 'name', left(coalesce(s.name, n.code), 90), 'q', n.q,
                       'stock', coalesce(s.stock_total, 0), 'incoming', coalesce(s.incoming, 0), 'sold30', coalesce(s.sold30, 0)) order by n.q desc, n.code), '[]'::jsonb)
                     from nw n left join sales.spu_summary s on s.code = n.code and s.run_id = (select run_id from m) where not n.has_video),
    'video_spus', (select count(*) from w),
    'win', (select count(*) from w where result = 'win'), 'win_traffic', (select count(*) from w where result = 'win_traffic'),
    'fail', (select count(*) from w where result = 'fail'),
    'win_list', (select coalesce(jsonb_agg(jsonb_build_array(code, name, coalesce(result, 'none'), q, videos, views, coalesce(age, ''))
                   order by case result when 'win' then 1 when 'win_traffic' then 2 when 'fail' then 4 else 3 end, views desc, code), '[]'::jsonb) from w)
  )
$$;

do $$
begin
  execute 'grant execute on function sales.spu_age_class(date) to service_role';
  execute 'revoke all on function sales.spu_age_class(date) from anon, authenticated, public';
  execute 'grant execute on function sales.tr_mix(text, date, date) to service_role';
  execute 'revoke all on function sales.tr_mix(text, date, date) from anon, authenticated, public';
  execute 'grant execute on function sales.tr_media(text, date, date) to service_role';
  execute 'revoke all on function sales.tr_media(text, date, date) from anon, authenticated, public';
end $$;

notify pgrst, 'reload schema';
