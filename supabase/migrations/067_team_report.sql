-- 067: Hàm SQL cho trang QLHN (/qlhn, chỉ Quản lý). CHẠY TAY trong Supabase SQL Editor, SAU 066. Chạy MỘT LẦN theo thứ tự 067 → 071. KHÔNG chạy lại sau khi đã chạy 070 (070 đổi cột của tr_lines nên 067 báo lỗi 42P13, và 067 sẽ ghi đè tr_current / tr_mix bản cũ). Chỉ 071 chạy lại được khi có thay đổi.
--  • Chỉ ĐỌC, không sửa dữ liệu. Gọi bằng service_role từ máy chủ (lib/team-report.ts); anon / authenticated bị thu quyền.
--  • "Đơn của team" = dòng đơn có nhân viên phụ trách thuộc team (sales.staff_teams), bỏ đơn kênh ADS (thẻ tag giống ADS_TAGS ở lib/spu-data.ts)
--    và đơn thử RD*. Ngày tính theo giờ Việt Nam.
--  • Sản phẩm = số lượng của dòng có giá > 0 và đơn không huỷ; dòng quà giá 0 không tính. KHÔNG trừ hoàn (dòng hoàn SL = 0 có giá: xem lib/sales-import.ts).
--  • Chất liệu theo mã SKU: "-S-" bạc, "-G10/14/18/24-" vàng; thiếu thì theo tên (vàng / V14K…, bạc / S925…); còn lại là phụ kiện, bảo hành.
--  • Giá vốn = sales.inventory_skus.cost_price HIỆN TẠI của SKU (không phải giá vốn tại ngày bán). Là dữ liệu nhạy cảm: chỉ Quản lý được gọi sales.tr_cost (lib/team-report.ts kiểm tra).

-- Dòng đơn của team (đã loại ADS, đơn thử) kèm ngày VN, chất liệu, giá vốn SKU
create or replace function sales.tr_lines(p_team text)
returns table (order_id text, sku text, code text, qty numeric, price numeric, status text, ordered_at timestamptz, delivered_at timestamptz,
               staff text, od date, dd date, canc boolean, mat int, cost_price numeric)
language sql stable
as $$
  select l.order_id::text, l.sku::text, l.code::text, l.qty::numeric, l.price::numeric, l.status::text, l.ordered_at, l.delivered_at, l.staff::text,
         (l.ordered_at at time zone 'Asia/Ho_Chi_Minh')::date, (l.delivered_at at time zone 'Asia/Ho_Chi_Minh')::date,
         coalesce(l.status ~* 'hủy|huỷ', false),
         case when l.sku ~* '-g(10|14|18|24)-' or k.name ~* 'v(10|14|18|24)k|vàng|gold' then 1
              when l.sku ~* '-s-' or k.name ~* 's925|s990|s999|bạc|silver' then 0 else 2 end,
         k.cost_price::numeric
  from sales.imported_order_lines l
  join sales.staff_teams t on t.sapo_name = l.staff
  left join sales.inventory_skus k on k.sku = l.sku
  where t.team = p_team and l.order_id not like 'RD%'
    and not exists (select 1 from unnest(string_to_array(coalesce(l.tags, ''), ',')) x
                    where lower(trim(x)) in ('page_id_1659994180936411', 'page_huyk - trang sức thiết kế'))
$$;

-- Đơn hàng trong khoảng ngày đặt: tổng, trạng thái, đã giao, theo ngày, theo nhân viên
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
  per_day as (select days.d, coalesce(sum(o.qp), 0) q from days left join o on o.od = days.d group by days.d),
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
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'q', q) order by d), '[]'::jsonb) from per_day),
    'staff', (select coalesce(jsonb_agg(jsonb_build_object('name', staff, 'orders', orders, 'qty', qty, 'delivered_orders', delivered_orders, 'cancelled', cancelled) order by orders desc, staff), '[]'::jsonb) from per_staff)
  )
$$;

-- Tình trạng HIỆN TẠI (không theo khoảng ngày): hàng có sẵn chưa giao, đơn chế tác (còn mã trung gian), SPU chưa giao thiếu hàng
create or replace function sales.tr_current(p_team text)
returns jsonb
language sql stable
as $$
  with m as (select run_id from sales.spu_summary_meta limit 1),
  b as (select * from sales.tr_lines(p_team) where od >= current_date - 60 and not canc and price > 0 and delivered_at is null),
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

-- Giá vốn / giá bán của dòng đã giao, theo chất liệu. p_by = 'order' (theo ngày đặt, đơn đã giao tới nay) | 'delivery' (theo ngày giao)
-- p_excl = true: bỏ dòng có giá vốn lớn hơn giá bán (vd đơn khách gửi vàng cũ làm lại, giá bán đã trừ vàng cũ)
-- NHẠY CẢM: chỉ Quản lý được gọi (kiểm ở lib/team-report.ts)
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
    select mat, coalesce(sum(qty), 0) q, coalesce(sum(price * qty), 0) rev,
           coalesce(sum(price * qty) filter (where cost_price > 0), 0) revc, coalesce(sum(cost_price * qty) filter (where cost_price > 0), 0) cost
    from b group by mat)
  select jsonb_build_object(
    'mat', (select coalesce(jsonb_agg(jsonb_build_object('mat', mat, 'q', q, 'rev', rev, 'revc', revc, 'cost', cost) order by mat), '[]'::jsonb) from g),
    'flagged', (select coalesce(jsonb_agg(jsonb_build_object('order_id', order_id, 'sku', sku, 'price', price, 'cost', cost_price, 'qty', qty)), '[]'::jsonb)
                from (select * from b where cost_price > price limit 5) f)
  )
$$;

-- Cơ cấu số bán theo loại sản phẩm và SPU mới / cũ (theo bảng tổng hợp SPU + đánh giá R&D); SPU chưa có đánh giá được xếp bổ sung
--  cũ: nhập kho đầu cách đây từ 90 ngày · mới: sau đó hoặc chưa nhập kho · chế tác: tên có (CHẾ TÁC) · ngoai: HANGBAOHANH
create or replace function sales.tr_mix(p_team text, p_from date, p_to date)
returns jsonb
language sql stable
as $$
  with m as (select run_id from sales.spu_summary_meta limit 1),
  sold as (select code, sum(qty)::int q from sales.spu_sales_daily
           where team = p_team and run_id = (select run_id from m) and day between p_from and p_to group by code),
  fr as (select k.code, min(r.received_on) first_in, sum(r.qty)::int in_qty
         from sales.stock_receipts r join sales.inventory_skus k using (sku) where k.code in (select code from sold) group by k.code),
  x as (
    select sold.code, sold.q, coalesce(s.grp, 'Khác') grp, left(coalesce(s.name, sold.code), 80) name, e.age, fr.first_in, fr.in_qty,
           case when e.age = 'old' then 'old' when e.age = 'new' then 'new'
                when sold.code = 'HANGBAOHANH' then 'out'
                when s.name ilike '%chế tác%' then 'made'
                when fr.first_in is not null and fr.first_in <= current_date - 90 then 'old' else 'new' end cat,
           (e.age is null) sup
    from sold left join sales.spu_summary s on s.code = sold.code and s.run_id = (select run_id from m)
              left join rnd.evaluations e on e.code = sold.code left join fr on fr.code = sold.code)
  select jsonb_build_object(
    'grp', (select coalesce(jsonb_agg(jsonb_build_object('name', grp, 'q', q, 'spus', n) order by q desc), '[]'::jsonb) from (select grp, sum(q) q, count(*) n from x group by grp) z),
    'age', (select coalesce(jsonb_agg(jsonb_build_object('cat', cat, 'q', q, 'spus', n, 'sup', sup) order by cat), '[]'::jsonb)
            from (select cat, sum(q) q, count(*) n, count(*) filter (where sup) sup from x group by cat) z),
    'unrated', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'grp', grp, 'q', q, 'first_in', first_in, 'in_qty', in_qty, 'cat', cat) order by first_in nulls last, code), '[]'::jsonb) from x where sup)
  )
$$;

-- Video và lượt xem của team trong khoảng ngày + sức khỏe SPU của team (số bán 30 ngày gần nhất của cả công ty)
create or replace function sales.tr_spu(p_team text, p_from date, p_to date)
returns jsonb
language sql stable
as $$
  with m as (select run_id from sales.spu_summary_meta limit 1),
  v as (select day, code, videos, views from sales.spu_video_daily where team = p_team and run_id = (select run_id from m)),
  vr as (select * from v where day between p_from and p_to),
  t30 as (select distinct code from sales.spu_sales_daily where team = p_team and run_id = (select run_id from m) and day > current_date - 30),
  h as (select s.code, left(s.name, 80) name, coalesce(s.sold30, 0) sold30, coalesce(s.stock_total, 0) stock, coalesce(s.incoming, 0) incoming, s.age_days,
               (p_team = any(s.video_teams)) has_video, coalesce(array_length(s.video_teams, 1), 0) n_teams,
               (select coalesce(sum(qty), 0) from sales.spu_sales_daily d where d.team = p_team and d.run_id = s.run_id and d.code = s.code and d.day > current_date - 30) team_qty
        from sales.spu_summary s where s.run_id = (select run_id from m) and s.code in (select code from t30))
  select jsonb_build_object(
    'videos', (select coalesce(sum(videos), 0) from vr), 'views', (select coalesce(sum(views), 0) from vr),
    'video_spus', (select count(distinct code) from vr), 'last_video_day', (select max(day) from v),
    'spus', (select count(*) from h), 'in_stock', (select count(*) from h where stock > 0), 'with_video', (select count(*) from h where has_video),
    'hot', (select count(*) from h where sold30 >= 30), 'normal', (select count(*) from h where sold30 between 16 and 29),
    'slow', (select count(*) from h where sold30 between 1 and 15), 'dead', (select count(*) from h where stock >= 30 and sold30 <= 15),
    'hot_short_stock', (select count(*) from h where sold30 >= 30 and stock / (sold30 / 30.0) < 14),
    'hot_short', (select count(*) from h where sold30 >= 30 and (stock + incoming) / (sold30 / 30.0) < 14),
    'short_list', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'team_qty', team_qty, 'sold30', sold30, 'stock', stock, 'incoming', incoming,
                     'cover', round(stock / nullif(sold30, 0)::numeric * 30), 'cover_in', round((stock + incoming) / nullif(sold30, 0)::numeric * 30)) order by stock / (sold30 / 30.0), team_qty desc), '[]'::jsonb)
                   from (select * from h where sold30 >= 30 and stock / (sold30 / 30.0) < 14 order by stock / (sold30 / 30.0), team_qty desc limit 12) z),
    'push_list', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'stock', stock, 'age_days', age_days, 'sold30', sold30, 'has_video', has_video, 'n_teams', n_teams) order by stock desc), '[]'::jsonb)
                  from (select * from h where stock >= 30 and sold30 <= 15 order by stock desc limit 12) z)
  )
$$;

-- Mã test do người dùng tạo cho team (rnd.products, team_id) + kết quả đánh giá + video đã đăng ở các Page của team
create or replace function sales.tr_test(p_team text)
returns jsonb
language sql stable
as $$
  with t as (select id from core.teams where name = p_team limit 1),
  c as (
    select p.code, e.result from rnd.products p left join rnd.evaluations e on e.product_id = p.id
    where p.team_id = (select id from t) and p.created_by is not null and p.code ~* '^t([1-9][0-9]{4,}|[a-z]{1,2}[0-9]+)$'),
  vv as (
    select code, count(*) videos, coalesce(sum(po.views), 0) views
    from (select unnest(po.product_codes) code, po.views from social.posts po join social.channels ch on ch.id = po.channel_id where ch.team_id = (select id from t)) po
    where code in (select code from c) group by code)
  select jsonb_build_object(
    'codes', (select count(*) from c),
    'win', (select count(*) from c where result = 'win'), 'win_traffic', (select count(*) from c where result = 'win_traffic'),
    'fail', (select count(*) from c where result = 'fail'), 'testing', (select count(*) from c where result is null or result = 'testing'),
    'videos', (select coalesce(sum(videos), 0) from vv), 'views', (select coalesce(sum(views), 0) from vv),
    'list', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'result', result)), '[]'::jsonb) from c)
  )
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'sales.tr_lines(text)', 'sales.tr_orders(text,date,date)', 'sales.tr_current(text)', 'sales.tr_cost(text,date,date,text,boolean)',
    'sales.tr_mix(text,date,date)', 'sales.tr_spu(text,date,date)', 'sales.tr_test(text)']
  loop
    execute format('grant execute on function %s to service_role', f);
    execute format('revoke all on function %s from anon, authenticated, public', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
