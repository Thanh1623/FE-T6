-- Chạy TAY trong Supabase SQL Editor (project fb-traffic). Chạy lại được.
-- Đồng bộ theo lô (200 kênh Facebook / TikTok): mỗi lần chạy xử lý các kênh LÂU CHƯA ĐƯỢC CẬP NHẬT nhất.
-- last_synced_at = lần thử đồng bộ gần nhất của kênh (cả khi lỗi, để kênh hỏng không chặn hàng đợi).
alter table social.channels add column if not exists last_synced_at timestamptz;
create index if not exists channels_last_synced_idx on social.channels (last_synced_at nulls first) where is_active;
notify pgrst, 'reload schema';
