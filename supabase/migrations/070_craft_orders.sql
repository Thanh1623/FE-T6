-- 070: GHI NHỚ đơn chế tác (đơn từng có mã trung gian MATRUNGGIANBAC / MATRUNGGIANVANG) để vẫn nhận ra khi đơn đã chế tác xong và dòng đơn đổi sang mã SPU thật.
-- CHẠY TAY trong Supabase SQL Editor, SAU 069. Chạy lại vẫn an toàn.
--  • sales.craft_orders: mỗi đơn chế tác 1 dòng. Từ nay trang Nhập số bán tự ghi các đơn đang có mã trung gian (spu/actions.ts importSales); phần nạp sẵn dưới đây lấy từ file đơn hàng KHÔNG đổi mã (Book1.xlsx, 01–30/10/2026) của team Hồng Ngọc.
--  • Cập nhật sales.tr_lines (thêm cột craft, craft_kind) và sales.tr_current (tách: đang chế tác · đã xong chưa giao · đã giao; hàng có sẵn không còn lẫn đơn chế tác đã xong).

create table if not exists sales.craft_orders (
  order_id   text primary key,
  kind       text check (kind in ('bac', 'vang')),
  ordered_on date,
  source     text not null default 'import',
  created_at timestamptz not null default now()
);
alter table sales.craft_orders enable row level security;
grant all on sales.craft_orders to service_role;
revoke all on sales.craft_orders from anon, authenticated;

insert into sales.craft_orders (order_id, kind, ordered_on, source) select v.order_id, v.kind, v.ordered_on::date, 'book1-xlsx' from (values
  ('HK109520', 'bac', '2026-10-01'),
  ('HK109789', 'vang', '2026-10-02'),
  ('HK109896', 'vang', '2026-10-02'),
  ('HK109897', 'vang', '2026-10-02'),
  ('HK109927', 'vang', '2026-10-02'),
  ('HK110554', 'bac', '2026-10-07'),
  ('HK110632', 'bac', '2026-10-07'),
  ('HK110914', 'bac', '2026-10-08'),
  ('HK110915', 'bac', '2026-10-08'),
  ('HK110923', 'vang', '2026-10-08'),
  ('HK111209', 'bac', '2026-10-09'),
  ('HK111491', 'bac', '2026-10-10'),
  ('HK111668', 'bac', '2026-10-10'),
  ('HK111669', 'bac', '2026-10-10'),
  ('HK111932', 'bac', '2026-10-11'),
  ('HK112045', 'vang', '2026-10-12'),
  ('HK112068', 'vang', '2026-10-12'),
  ('HK112093', 'bac', '2026-10-12'),
  ('HK112257', 'bac', '2026-10-12'),
  ('HK112393', 'bac', '2026-10-13'),
  ('HK112469', 'bac', '2026-10-13'),
  ('HK112589', 'vang', '2026-10-13'),
  ('HK112748', 'bac', '2026-10-14'),
  ('HK112985', 'bac', '2026-10-14'),
  ('HK114322', 'bac', '2026-10-18'),
  ('HK114747', 'vang', '2026-10-19'),
  ('HK115106', 'vang', '2026-10-20'),
  ('HK116156', 'vang', '2026-10-24'),
  ('HK116609', 'vang', '2026-10-26'),
  ('HK116644', 'vang', '2026-10-26'),
  ('HK117276', 'bac', '2026-10-29'),
  ('HK117294', 'bac', '2026-10-29'),
  ('HK117305', 'bac', '2026-10-29'),
  ('HK117461', 'vang', '2026-10-30'),
  ('HK117499', 'bac', '2026-10-30')
) as v(order_id, kind, ordered_on) on conflict (order_id) do nothing;

drop function if exists sales.tr_lines(text);
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
$$;

create or replace function sales.tr_current(p_team text, p_from date default null)
returns jsonb
language sql stable
as $$
  with m as (select run_id from sales.spu_summary_meta limit 1),
  base as (select * from sales.tr_lines(p_team) where od >= coalesce(p_from, current_date - 60)),
  plain as (select * from base where not craft and not canc and price > 0 and delivered_at is null),
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
  execute 'grant execute on function sales.tr_lines(text) to service_role';
  execute 'revoke all on function sales.tr_lines(text) from anon, authenticated, public';
  execute 'grant execute on function sales.tr_current(text, date) to service_role';
  execute 'revoke all on function sales.tr_current(text, date) from anon, authenticated, public';
end $$;

notify pgrst, 'reload schema';
