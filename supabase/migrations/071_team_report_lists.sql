-- QLHN: các danh sách mới của dashboard / tab chi tiết (chạy TAY trong Supabase SQL Editor, sau 070).
--  tr_order_list: từng dòng sản phẩm trong đơn của team (trạng thái: đã giao / còn hàng chưa giao / thiếu hàng / đang chế tác, số ngày xử lý)
--  tr_spu_list:   thống kê từng SPU team bán trong khoảng ngày (bán, đã giao, video)
--  tr_top:        top SPU bán chạy (tính từ chính các dòng đơn, cùng nguồn với hai hàm trên)
--  tr_media:      SPU mới đã lên video, SPU win theo SPU team đăng video, SPU mới chưa có video
--  tr_mix:        (viết lại từ 067) cơ cấu loại và SPU mới / cũ tính từ chính các dòng đơn, để cùng tổng với thẻ Đơn hàng.
--                 Bản cũ đọc bảng tổng hợp sales.spu_sales_daily chỉ chứa 30 ngày gần nhất, nên cuối tháng thiếu ngày 1 (31/10 → mất cả ngày 1/10).
-- Các hàm đều dựa vào sales.tr_lines (070) nên cùng quy tắc loại đơn ADS, đơn RD*, đơn huỷ.

-- Dòng sản phẩm: [ngày đặt, mã đơn, SPU, SKU, tên, SL, trạng thái, số ngày]
--   trạng thái d = đã giao, c = còn hàng chưa giao, t = thiếu hàng, m = đang chế tác (còn mã trung gian)
--   tồn theo từng SKU (tổng các kho); hàng cấp cho đơn đặt sớm trước. Số ngày: đã giao = từ đặt đến giao; chưa giao = số ngày đã chờ đến hôm nay
create or replace function sales.tr_order_list(p_team text, p_from date, p_to date)
returns jsonb
language sql stable
as $$
  with m as (select run_id from sales.spu_summary_meta limit 1),
  b as (select * from sales.tr_lines(p_team) where od between p_from and p_to and not canc and price > 0),
  stk as (select sku, sum(stock) stock from sales.inventory_stock group by sku),
  x as (
    select b.*, coalesce(k.name, s.name, b.code) nm, coalesce(stk.stock, 0) stock,
           sum(case when b.delivered_at is null then b.qty else 0 end)
             over (partition by b.sku order by b.ordered_at, b.order_id rows between unbounded preceding and current row) cum
    from b left join sales.inventory_skus k on k.sku = b.sku
           left join sales.spu_summary s on s.code = b.code and s.run_id = (select run_id from m)
           left join stk on stk.sku = b.sku)
  select coalesce(jsonb_agg(jsonb_build_array(
      od, order_id, code, sku, left(nm, 90), qty::int,
      case when delivered_at is not null then 'd' when code ilike 'MATRUNG%' then 'm' when cum <= stock then 'c' else 't' end,
      case when delivered_at is not null then dd - od else greatest((now() at time zone 'Asia/Ho_Chi_Minh')::date - od, 0) end)
    order by od desc, order_id desc), '[]'::jsonb)
  from x
$$;

-- SPU team bán trong khoảng ngày: [SPU, tên, SL bán, SL đã giao, SL video đăng trong khoảng, tồn kho (mọi kho), SL bán 30 ngày của cả công ty (null nếu chưa có)]
-- Hai số cuối để phân loại tồn kho của công ty (bán chạy / thường / chậm / tồn xấu) ở lib/spu-tracking.ts saleFlags
create or replace function sales.tr_spu_list(p_team text, p_from date, p_to date)
returns jsonb
language sql stable
as $$
  with m as (select run_id from sales.spu_summary_meta limit 1),
  b as (select code, qty, delivered_at from sales.tr_lines(p_team) where od between p_from and p_to and not canc and price > 0),
  a as (select code, sum(qty)::int sold, coalesce(sum(qty) filter (where delivered_at is not null), 0)::int deliv from b group by code),
  v as (select code, sum(videos)::int videos from sales.spu_video_daily
        where team = p_team and run_id = (select run_id from m) and day between p_from and p_to group by code)
  select coalesce(jsonb_agg(jsonb_build_array(
      a.code, left(coalesce(s.name, (select k.name from sales.inventory_skus k where k.code = a.code limit 1), a.code), 90), a.sold, a.deliv, coalesce(v.videos, 0), coalesce(s.stock_total, 0), s.sold30)
    order by a.sold desc, a.code), '[]'::jsonb)
  from a left join sales.spu_summary s on s.code = a.code and s.run_id = (select run_id from m)
         left join v on v.code = a.code
$$;

-- Top p_n SPU bán chạy của team (bỏ mã trung gian chế tác và HANGBAOHANH)
create or replace function sales.tr_top(p_team text, p_from date, p_to date, p_n int default 15)
returns jsonb
language sql stable
as $$
  with m as (select run_id from sales.spu_summary_meta limit 1),
  b as (select code, qty from sales.tr_lines(p_team) where od between p_from and p_to and not canc and price > 0
        and code not ilike 'MATRUNG%' and code <> 'HANGBAOHANH'),
  a as (select code, sum(qty)::int q from b group by code order by q desc, code limit p_n)
  select coalesce(jsonb_agg(jsonb_build_object(
      'code', a.code, 'name', left(coalesce(s.name, a.code), 90), 'q', a.q,
      'stock', coalesce(s.stock_total, 0), 'incoming', coalesce(s.incoming, 0), 'sold30', coalesce(s.sold30, 0), 'image', s.image,
      'result', (select e.result from rnd.evaluations e where e.code = a.code limit 1), 'has_video', (p_team = any(s.video_teams)))
    order by a.q desc, a.code), '[]'::jsonb)
  from a left join sales.spu_summary s on s.code = a.code and s.run_id = (select run_id from m)
$$;

-- Media: SPU mới (R&D đã đánh giá age = new) team BÁN trong khoảng ngày và đã có video của team (bất kỳ ngày nào);
-- win theo các SPU team ĐĂNG video trong khoảng ngày; danh sách win: [SPU, tên, kết quả, SL bán, video, lượt xem, mới/cũ]
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
         from sold join rnd.evaluations e on e.code = sold.code and e.age = 'new' left join tv on tv.code = sold.code),
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

-- Cơ cấu số bán theo loại sản phẩm và SPU mới / cũ (thay bản trong 067). Số bán lấy từ các dòng đơn của team (đã loại ADS, RD*, đơn huỷ, dòng giá 0)
-- Mọi dòng của ĐƠN CHẾ TÁC (đơn trong sales.craft_orders hoặc còn mã trung gian MATRUNG*, kể cả đơn đã chế tác xong và đã đổi sang SPU thật) xếp vào loại "Khác" và nhóm "Chế tác",
-- nên số sản phẩm chế tác khớp số đơn chế tác. Nhóm Chế tác chỉ tách theo ĐƠN, không theo mã SPU: SPU có tên "(CHẾ TÁC)" bán ngoài đơn chế tác vẫn xếp cũ / mới như thường. Các dòng còn lại: loại / tên lấy ở bảng tổng hợp SPU, mới / cũ theo đánh giá R&D, SPU chưa đánh giá xếp bổ sung:
--  cũ: nhập kho đầu cách đây từ 90 ngày · mới: sau đó hoặc chưa nhập kho · out: HANGBAOHANH
create or replace function sales.tr_mix(p_team text, p_from date, p_to date)
returns jsonb
language sql stable
as $$
  with m as (select run_id from sales.spu_summary_meta limit 1),
  sold as (select code, craft, sum(qty)::int q from sales.tr_lines(p_team)
           where od between p_from and p_to and not canc and price > 0 group by code, craft),
  fr as (select k.code, min(r.received_on) first_in, sum(r.qty)::int in_qty
         from sales.stock_receipts r join sales.inventory_skus k using (sku) where k.code in (select code from sold) group by k.code),
  x as (
    select sold.code, sold.q, case when sold.craft then 'Khác' else coalesce(s.grp, 'Khác') end grp, left(coalesce(s.name, sold.code), 80) name, e.age, fr.first_in, fr.in_qty,
           case when sold.craft then 'made' when e.age = 'old' then 'old' when e.age = 'new' then 'new'
                when sold.code = 'HANGBAOHANH' then 'out'
                when fr.first_in is not null and fr.first_in <= current_date - 90 then 'old' else 'new' end cat,
           (e.age is null and not sold.craft) sup
    from sold left join sales.spu_summary s on s.code = sold.code and s.run_id = (select run_id from m)
              left join rnd.evaluations e on e.code = sold.code left join fr on fr.code = sold.code)
  select jsonb_build_object(
    'grp', (select coalesce(jsonb_agg(jsonb_build_object('name', grp, 'q', q, 'spus', n) order by q desc), '[]'::jsonb) from (select grp, sum(q) q, count(*) n from x group by grp) z),
    'age', (select coalesce(jsonb_agg(jsonb_build_object('cat', cat, 'q', q, 'spus', n, 'sup', sup) order by cat), '[]'::jsonb)
            from (select cat, sum(q) q, count(*) n, count(*) filter (where sup) sup from x group by cat) z),
    'unrated', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'grp', grp, 'q', q, 'first_in', first_in, 'in_qty', in_qty, 'cat', cat) order by first_in nulls last, code), '[]'::jsonb) from x where sup)
  )
$$;

-- Phân loại tồn kho của CẢ CÔNG TY (khớp 6 thẻ thống kê ở trang SPU, cùng công thức lib/spu-tracking.ts saleFlags):
--  active = còn tồn hoặc SL bán 30 ngày > 0 · in_stock = tồn > 0 · hot = SL >= p_normal · normal = SL từ p_slow đến dưới p_normal · slow = SL từ 1 đến dưới p_slow · bad = còn hàng và SL = 0
-- p_slow / p_normal là ngưỡng đang chỉnh ở trang KPI (truyền từ máy chủ). Không phụ thuộc team.
create or replace function sales.tr_company_class(p_slow int, p_normal int)
returns jsonb
language sql stable
as $$
  with m as (select run_id from sales.spu_summary_meta limit 1),
  s as (select coalesce(stock_total, 0) st, sold30 sl from sales.spu_summary where run_id = (select run_id from m))
  select jsonb_build_object(
    'active', count(*) filter (where st > 0 or sl > 0), 'in_stock', count(*) filter (where st > 0),
    'hot', count(*) filter (where sl >= p_normal), 'normal', count(*) filter (where sl >= p_slow and sl < p_normal),
    'slow', count(*) filter (where sl > 0 and sl < p_slow), 'bad', count(*) filter (where st > 0 and sl = 0))
  from s
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'sales.tr_order_list(text,date,date)', 'sales.tr_spu_list(text,date,date)', 'sales.tr_top(text,date,date,int)', 'sales.tr_media(text,date,date)', 'sales.tr_mix(text,date,date)', 'sales.tr_company_class(int,int)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
