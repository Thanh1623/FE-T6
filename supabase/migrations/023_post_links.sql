-- Chạy TAY trong Supabase SQL Editor (project fb-traffic). Chạy lại được.
-- Gắn video ↔ sản phẩm bằng TAY (trang "Video R&D"): video của Page R&D thường không có hashtag mã SP trong mô tả.
-- Lưu riêng (không ghi vào posts.product_codes) để lần tách hashtag kế tiếp không xoá mất; retagPosts hợp nhất cả hai.
create table if not exists social.post_links (
  post_id    text not null references social.posts(id) on delete cascade,
  product_id uuid not null,                 -- rnd.products.id (khác schema nên không đặt khoá ngoại)
  linked_by  uuid,
  created_at timestamptz not null default now(),
  primary key (post_id, product_id)
);
create index if not exists post_links_product_idx on social.post_links (product_id);
alter table social.post_links enable row level security;
revoke all on social.post_links from public, anon, authenticated;
grant all on social.post_links to service_role;
notify pgrst, 'reload schema';
