-- 048: Chat trao đổi theo từng MẪU / SPU (trang chi tiết mẫu R&D, cột phải) — chủ yếu để trao đổi thiết kế 3D: tin có thể kèm ảnh. CHẠY TAY trong Supabase SQL Editor. Chạy lại vẫn an toàn (kể cả đã chạy bản trước chưa có cột ảnh).
--  • Mỗi tin gắn 1 mẫu (product_id) và 1 người gửi (user_id = core.profiles.id).
--  • image_paths: đường dẫn ảnh đính kèm (cùng kho ảnh của mẫu: Cloudinary / Storage, thư mục chat/<mã mẫu>/…). Tin chỉ có ảnh, không có chữ vẫn hợp lệ.
--  • Thu hồi = xoá mềm (recalled_at): chỉ người gửi hoặc Quản lý thu hồi; nội dung và ảnh không còn trả về cho ai (file ảnh được xoá khỏi kho).
--  • Chỉ đọc / ghi bằng service role qua server action (RLS bật, không mở policy cho client) — giống các bảng rnd khác.

create table if not exists rnd.product_messages (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references rnd.products(id) on delete cascade,
  user_id     uuid not null,
  content     text not null default '',
  image_paths text[] not null default '{}',
  recalled_at timestamptz,
  created_at  timestamptz not null default now()
);
alter table rnd.product_messages add column if not exists image_paths text[] not null default '{}';
alter table rnd.product_messages alter column content set default '';
alter table rnd.product_messages drop constraint if exists product_messages_content_check;
alter table rnd.product_messages drop constraint if exists product_messages_body_check;
alter table rnd.product_messages add constraint product_messages_body_check
  check (char_length(content) <= 2000 and (char_length(btrim(content)) > 0 or cardinality(image_paths) > 0));
create index if not exists product_messages_product_idx on rnd.product_messages (product_id, created_at desc);

alter table rnd.product_messages enable row level security;
grant all on rnd.product_messages to service_role;

notify pgrst, 'reload schema';
