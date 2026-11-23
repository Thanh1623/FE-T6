-- 002_hashtags: lưu hashtag của bài viết + view thống kê theo hashtag
-- Chạy trong Supabase Dashboard → SQL Editor. Chạy lại nhiều lần vẫn an toàn.

alter table posts add column if not exists hashtags text[] not null default '{}';
create index if not exists posts_hashtags_idx on posts using gin (hashtags);

-- Thống kê theo hashtag: số bài, tổng/trung bình lượt xem
create or replace view hashtag_stats
with (security_invoker = true) as
select
  p.account_id,
  tag                                         as hashtag,
  count(distinct p.id)                        as post_count,
  coalesce(sum(m.value), 0)                   as total_views,
  round(coalesce(avg(m.value), 0))            as avg_views,
  max(p.created_time)                         as last_used
from posts p
cross join lateral unnest(p.hashtags) as tag
left join post_metrics m on m.post_id = p.id and m.metric = 'post_media_view'
group by p.account_id, tag;
