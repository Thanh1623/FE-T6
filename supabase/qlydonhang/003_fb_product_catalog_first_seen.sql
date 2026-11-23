-- Chạy trên project QLYDONHANG. Thay hàm fb_product_catalog (002) bằng bản có thêm first_seen_at:
-- ngày SKU đầu tiên của mã mẫu xuất hiện trong kho (product_stock.created_at nhỏ nhất).
-- LƯU Ý: SKU import hàng loạt tháng 07/2026 đều mang ngày đó → app chỉ tin first_seen_at từ 2026-08.
-- Hàm CHỈ ĐỌC. Chạy lại nhiều lần vẫn an toàn.

drop function if exists public.fb_product_catalog();

create function public.fb_product_catalog()
returns table (product_code text, name text, image_url text, base_masp text, first_seen_at timestamptz)
language sql
stable
set search_path = public
as $$
  with s as (
    select upper(split_part(masp, '-', 1)) as code, masp, ten, image_url, ban30, created_at
    from product_stock
    where masp is not null and ten is not null and ten <> ''
  ),
  first_seen as (select code, min(created_at) as first_seen_at from s group by code),
  pick as (
    select distinct on (code) code, ten, image_url, masp
    from s
    order by code,
             (masp ~ '^[A-Za-z0-9]+-00') desc,
             (masp !~ '-C[0-9]') desc,
             (image_url is not null) desc,
             ban30 desc nulls last,
             length(masp)
  )
  select p.code, p.ten, p.image_url, p.masp, f.first_seen_at
  from pick p join first_seen f using (code);
$$;

revoke execute on function public.fb_product_catalog() from public, anon, authenticated;
grant execute on function public.fb_product_catalog() to service_role;
notify pgrst, 'reload schema';
