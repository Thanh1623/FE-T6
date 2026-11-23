-- 080: ĐIỀU CHỈNH ĐƠN THỦ CÔNG cho báo cáo QLHH. CHẠY TAY trong Supabase SQL Editor, SAU 079. Chạy lại vẫn an toàn.
--  sales.order_adjust: mỗi đơn một dòng, kind =
--    'exclude'  : đơn bị loại khỏi MỌI báo cáo QLHH (vd đơn chốt từ tháng trước nhưng bị lên lại đơn vì đổi chi nhánh)
--    'warranty' : đơn bảo hành → dòng của đơn xếp nhóm "SP bảo hành" (không tính mới / cũ / chế tác, không tính SPU mới đã lên video)
--  Nạp sẵn: HK109539 (D9025, lên lại đơn ngày 01/10 do đổi chi nhánh, thực chất đơn chốt tháng 9) → exclude; HK116819 (N9211, nhẫn bảo hành) → warranty.
--  Thêm / sửa đơn sau này: insert / update trực tiếp vào bảng này rồi tải lại QLHH (báo cáo có lưu đệm tới lần đồng bộ kế tiếp hoặc 6 giờ).
--  Bản cũ của tr_lines (079), tr_mix + tr_media (077), tr_revenue_mix (078) được ghi đè bằng bản có tính điều chỉnh.

create table if not exists sales.order_adjust (
  order_id   text primary key,
  kind       text not null check (kind in ('exclude', 'warranty')),
  note       text,
  created_at timestamptz not null default now()
);
alter table sales.order_adjust enable row level security;
grant all on sales.order_adjust to service_role;
revoke all on sales.order_adjust from anon, authenticated;

insert into sales.order_adjust (order_id, kind, note) values
  ('HK109539', 'exclude', 'D9025: đổi chi nhánh nên lên lại đơn ngày 01/10, thực chất là đơn chốt tháng 9'),
  ('HK116819', 'warranty', 'N9211: nhẫn bảo hành (khách gửi vàng cũ)')
on conflict (order_id) do nothing;

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
    and not exists (select 1 from sales.order_adjust a where a.order_id = l.order_id and a.kind = 'exclude')   -- đơn do Quản lý đánh dấu loại khỏi báo cáo
$$;

create or replace function sales.tr_mix(p_team text, p_from date, p_to date)
returns jsonb
language sql stable
as $$
  with m as (select run_id from sales.spu_summary_meta limit 1),
  cl as (select * from sales.spu_age_class(p_to)),
  sold as (select tl.code, tl.craft, (a.order_id is not null) warr, sum(tl.qty)::int q, count(distinct tl.order_id)::int orders from sales.tr_lines(p_team) tl
           left join sales.order_adjust a on a.order_id = tl.order_id and a.kind = 'warranty'
           where tl.od between p_from and p_to and not tl.canc and tl.price > 0 group by tl.code, tl.craft, (a.order_id is not null)),
  x as (
    select sd.code, sd.q, sd.orders,
           case when sd.made then 'Khác' else coalesce(s.grp, 'Khác') end grp, left(coalesce(s.name, sd.code), 80) name,
           case when sd.made then 'made' when sd.warr or sd.code = 'HANGBAOHANH' then 'out' else coalesce(nullif(cl.cat, 'pending'), case when cl.cat = 'pending' then 'new' else 'old' end) end cat,
           cl.created_on, cl.first_order
    from (select sold.code, sold.q, sold.orders, sold.craft made, sold.warr from sold) sd
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

create or replace function sales.tr_media(p_team text, p_from date, p_to date)
returns jsonb
language sql stable
as $$
  with m as (select run_id from sales.spu_summary_meta limit 1),
  b as (select code, qty from sales.tr_lines(p_team) where od between p_from and p_to and not canc and price > 0
        and order_id not in (select order_id from sales.order_adjust where kind = 'warranty')
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

drop function if exists sales.tr_revenue_mix(text, date, date);
create or replace function sales.tr_revenue_mix(p_team text, p_from date, p_to date, p_by text default 'order')
returns jsonb
language sql stable
as $$
  with cl as (select code, cat from sales.spu_age_class(p_to)),
  b as (
    select l.order_id, l.code, l.od, l.dd dday, l.qty, l.price, l.cost_price, (l.delivered_at is not null) delivered,
           case when l.craft then 'made'
                when l.code = 'HANGBAOHANH' or l.order_id in (select order_id from sales.order_adjust where kind = 'warranty') then 'out'
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
  execute 'grant execute on function sales.tr_lines(text) to service_role';
  execute 'revoke all on function sales.tr_lines(text) from anon, authenticated, public';
  execute 'grant execute on function sales.tr_mix(text, date, date) to service_role';
  execute 'revoke all on function sales.tr_mix(text, date, date) from anon, authenticated, public';
  execute 'grant execute on function sales.tr_media(text, date, date) to service_role';
  execute 'revoke all on function sales.tr_media(text, date, date) from anon, authenticated, public';
  execute 'grant execute on function sales.tr_revenue_mix(text, date, date, text) to service_role';
  execute 'revoke all on function sales.tr_revenue_mix(text, date, date, text) from anon, authenticated, public';
end $$;

notify pgrst, 'reload schema';
