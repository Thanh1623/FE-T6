-- 069: sales.tr_extra — số phụ cho trang QLHN: phiếu nhập kho hôm nay / gần nhất của các SPU team đang bán, giờ cập nhật dữ liệu. CHẠY TAY trong Supabase SQL Editor, SAU 068. Chạy lại vẫn an toàn.
create or replace function sales.tr_extra(p_team text)
returns jsonb
language sql stable
as $$
  with m as (select run_id, refreshed_at from sales.spu_summary_meta limit 1),
  codes as (select distinct code from sales.spu_sales_daily where team = p_team and run_id = (select run_id from m) and day > current_date - 30),
  r as (select r.po, r.received_on from sales.stock_receipts r join sales.inventory_skus k on k.sku = r.sku where k.code in (select code from codes))
  select jsonb_build_object(
    'receipts_today', (select count(distinct po) from r where received_on = (now() at time zone 'Asia/Ho_Chi_Minh')::date),
    'last_receipt', (select max(received_on) from r),
    'orders_at', (select max(updated_at) from sales.imported_order_lines),
    'summary_at', (select refreshed_at from m)
  )
$$;

grant execute on function sales.tr_extra(text) to service_role;
revoke all on function sales.tr_extra(text) from anon, authenticated, public;
notify pgrst, 'reload schema';
