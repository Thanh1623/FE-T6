-- Chạy TAY trong Supabase SQL Editor (project fb-traffic). Chạy lại được.
-- Lịch sử lượt xem theo NGÀY của từng bài (ảnh chụp cộng dồn mỗi lần đồng bộ) → vẽ biểu đồ xu hướng tăng / giảm view trên thẻ video.
-- Facebook / TikTok chỉ trả số liệu cộng dồn của bài; mức tăng mỗi ngày = chênh lệch giữa hai ngày liên tiếp.
-- Chỉ chụp các bài đăng trong ~45 ngày gần đây; ảnh chụp cũ hơn 60 ngày được dọn khi đồng bộ.
create table if not exists social.post_daily (
  post_id   text not null references social.posts(id) on delete cascade,
  date      date not null,
  views     bigint not null default 0,
  reactions bigint not null default 0,
  primary key (post_id, date)
);
create index if not exists post_daily_date_idx on social.post_daily (date);
alter table social.post_daily enable row level security;
revoke all on social.post_daily from public, anon, authenticated;
grant all on social.post_daily to service_role;
notify pgrst, 'reload schema';
