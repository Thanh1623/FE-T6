-- Chạy TAY trong Supabase SQL Editor (project fb-traffic), SAU 024_post_daily.sql. Chạy lại được.
--
-- "Lượt xem trong N ngày" của từng mã, kể cả video đăng từ lâu: Facebook / TikTok chỉ trả số CỘNG DỒN của bài, nên
-- lượt xem trong kỳ = số cộng dồn cuối kỳ − số cộng dồn trước kỳ (hai ảnh chụp trong social.post_daily).
--   • Thêm cột người xem + lượt nhấp vào ảnh chụp (KPI Traffic dùng "người xem").
--   • Hàm social.post_stats_at: ảnh chụp MỚI NHẤT của mỗi bài tính đến một ngày (để lấy mốc đầu kỳ / cuối kỳ).
-- Đồng bộ chụp cả các bài CŨ gắn mã SP (làm mới luân phiên, mỗi lần tối đa vài trăm bài) và giữ ảnh chụp 120 ngày.

alter table social.post_daily add column if not exists viewers bigint not null default 0;
alter table social.post_daily add column if not exists clicks  bigint not null default 0;

create or replace function social.post_stats_at(p_post_ids text[], p_day date)
returns table (post_id text, day date, views bigint, viewers bigint, reactions bigint, clicks bigint)
language sql stable set search_path = '' as $$
  select distinct on (d.post_id) d.post_id, d.date, d.views, d.viewers, d.reactions, d.clicks
  from social.post_daily d
  where d.post_id = any(p_post_ids) and d.date <= p_day
  order by d.post_id, d.date desc
$$;

revoke execute on function social.post_stats_at(text[], date) from public, anon, authenticated;
grant execute on function social.post_stats_at(text[], date) to service_role;
notify pgrst, 'reload schema';
