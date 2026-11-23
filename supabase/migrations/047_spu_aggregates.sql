-- 047: Hai hàm gom dữ liệu SPU ngay trong database — trang Theo dõi SPU và Dashboard nạp nhanh hơn (1–2 lần gọi thay cho ~25 lần). CHẠY TAY trong Supabase SQL Editor, SAU 045 (cần cột staff / tags) và 044 (cột name). Chạy lại vẫn an toàn.
--  • sales.spu_sku_summary(): mỗi SPU một dòng — số mã con (SKU) và tên (tên SKU đầu tiên có tên). Thay cho việc đọc ~13.000 SKU.
--  • sales.spu_order_groups(p_since): dòng đơn đã nhập từ p_since, gom theo (SPU, ngày VN, nhân viên, tag, trạng thái). CHỈ gom dữ liệu thô — bỏ đơn huỷ, gán team, phân loại bán… vẫn tính ở ứng dụng.
--  • Cách tách mã SPU giống spuOf() trong src/lib/spu-code.ts: bỏ "#" đầu, cắt khoảng trắng, chữ HOA, lấy phần trước dấu "-" đầu tiên.
--  • Chưa chạy migration này: ứng dụng tự quay về cách đọc từng dòng như cũ (chậm hơn), không lỗi.

create or replace function sales.spu_sku_summary()
returns table (code text, variants integer, name text)
language sql stable
as $$
  select s.spu as code,
         count(*)::int as variants,
         (array_agg(s.name order by s.sku) filter (where s.name is not null and s.name <> ''))[1] as name
  from (
    select btrim(split_part(upper(btrim(regexp_replace(coalesce(nullif(k.code, ''), k.sku), '^#', ''))), '-', 1)) as spu, k.sku, k.name
    from sales.inventory_skus k
  ) s
  group by s.spu
  order by s.spu
$$;

create or replace function sales.spu_order_groups(p_since timestamptz)
returns table (code text, day date, staff text, tags text, status text, qty bigint, lines integer)
language sql stable
as $$
  select btrim(split_part(upper(btrim(regexp_replace(l.code, '^#', ''))), '-', 1)) as code,
         (l.ordered_at at time zone 'Asia/Ho_Chi_Minh')::date as day,
         l.staff, l.tags, l.status,
         sum(l.qty)::bigint as qty,
         count(*)::int as lines
  from sales.imported_order_lines l
  where l.price > 0 and l.ordered_at >= p_since
  group by 1, 2, 3, 4, 5
  order by 1, 2, 3, 4, 5
$$;

revoke all on function sales.spu_sku_summary() from public, anon, authenticated;
revoke all on function sales.spu_order_groups(timestamptz) from public, anon, authenticated;
grant execute on function sales.spu_sku_summary() to service_role;
grant execute on function sales.spu_order_groups(timestamptz) to service_role;

notify pgrst, 'reload schema';
