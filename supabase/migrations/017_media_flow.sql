-- 017: Tách 2 luồng. Chạy trên project fb-traffic, sau 016. Chạy lại vẫn an toàn.
--  • Luồng R&D: chỉ mẫu đã qua ít nhất 1 bước quy trình (rnd.products.stage có giá trị)
--  • Luồng Media: mọi mã lên video (cả mẫu R&D). Mẫu Media tự test (không qua R&D) mà WIN → báo team xem xét:
--      "Đưa vào quy trình" → mẫu bắt đầu thuộc luồng R&D (entry_source = 'media'), hoặc "Bỏ qua".
--    Không tự động tính ngược vào luồng R&D.

alter table rnd.products
  add column if not exists entry_source      text check (entry_source in ('rnd', 'media')),   -- media = vào quy trình từ luồng Media
  add column if not exists media_review      text check (media_review in ('accepted', 'dismissed')),
  add column if not exists media_review_by   uuid references core.profiles(id) on delete set null,
  add column if not exists media_review_at   timestamptz,
  add column if not exists media_review_note text;

-- Mẫu đang có trong quy trình (tạo từ bảng Sưu tầm) = nguồn R&D
update rnd.products set entry_source = 'rnd' where stage is not null and entry_source is null;

notify pgrst, 'reload schema';
