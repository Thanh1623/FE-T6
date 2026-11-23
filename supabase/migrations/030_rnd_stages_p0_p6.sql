-- Quy trình R&D mới P0–P6 (thay Sưu tầm + P0–P5 cũ). CHẠY TAY trong Supabase SQL Editor.
--   P0 Sưu tầm · P1 Đã duyệt · P2 Sản xuất mẫu (3D → đặt hàng → chốt đúc → hoàn thành)
--   P3 Quay video trên tay · P4 Đăng video · P5 Win · P6 Thương mại hoá
-- Mẫu cũ (dữ liệu test) được dịch mốc 1 bậc cho khỏi vi phạm ràng buộc; chạy lại nhiều lần vẫn an toàn.

do $$
declare c text;
begin
  select pg_get_constraintdef(oid) into c from pg_constraint
   where conrelid = 'rnd.products'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%collection%';
  if c is not null then
    alter table rnd.products drop constraint if exists products_stage_check;
    update rnd.products set stage = case stage
      when 'collection' then 'p0'
      when 'p0' then 'p1'
      when 'p1' then 'p2'
      when 'p2' then 'p2'
      when 'p3' then 'p3'
      else stage end
     where stage is not null;
  end if;
end $$;

alter table rnd.products drop constraint if exists products_stage_check;
alter table rnd.products
  add constraint products_stage_check check (stage in ('p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'));
