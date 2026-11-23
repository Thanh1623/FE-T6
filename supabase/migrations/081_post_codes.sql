-- 081: Gắn tay MÃ SPU vào video (trang "Thư viện SP mới", nút "＋ Gắn mã SPU") cho video đã đăng nhưng chưa có hashtag mã nhận diện được.
-- CHẠY TAY trong Supabase SQL Editor. Chạy lại vẫn an toàn.
-- Lưu riêng (không ghi đè posts.product_codes) để lần tách hashtag kế tiếp không xoá mất; sync hợp nhất mã gắn tay với mã tách từ hashtag (giống social.post_links của sản phẩm R&D).
create table if not exists social.post_codes (
  post_id    text not null references social.posts(id) on delete cascade,
  code       text not null,
  linked_by  uuid,
  created_at timestamptz not null default now(),
  primary key (post_id, code)
);
create index if not exists post_codes_code_idx on social.post_codes (code);
alter table social.post_codes enable row level security;
revoke all on social.post_codes from public, anon, authenticated;
grant all on social.post_codes to service_role;
notify pgrst, 'reload schema';
