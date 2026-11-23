-- Chạy trên project QLYDONHANG (không phải project fb-traffic).
-- Hàm CHỈ ĐỌC: danh mục mã mẫu → tên + ảnh đại diện, cho app fb-traffic. Chạy lại nhiều lần vẫn an toàn.
-- Mã mẫu = phần masp trước dấu '-' (D0008-00-S-WH → D0008).
-- Tên đại diện: ưu tiên biến thể gốc '-00', rồi biến thể không phải charm '-Cxxx', rồi bán chạy nhất 30 ngày.

create or replace function public.fb_product_catalog()
returns table (product_code text, name text, image_url text, base_masp text)
language sql
stable
set search_path = public
as $$
  select distinct on (code) code, ten, image_url, masp
  from (
    select upper(split_part(masp, '-', 1)) as code, masp, ten, image_url, ban30
    from product_stock
    where masp is not null and ten is not null and ten <> ''
  ) s
  order by code,
           (masp ~ '^[A-Za-z0-9]+-00') desc,
           (masp !~ '-C[0-9]') desc,
           (image_url is not null) desc,
           ban30 desc nulls last,
           length(masp);
$$;

-- Chỉ server (secret key) được gọi
revoke execute on function public.fb_product_catalog() from public, anon, authenticated;
grant execute on function public.fb_product_catalog() to service_role;
notify pgrst, 'reload schema';
