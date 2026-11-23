-- 057: Hàm tính sẵn số liệu bài đăng theo mã mẫu ngay trong database (thay cho việc kéo hàng chục nghìn bài về cộng trong code). CHẠY TAY trong Supabase SQL Editor. Chạy lại vẫn an toàn.
--  • social.rnd_code_stats(p_items jsonb): mỗi phần tử {id, codes: "MA1,MA2", d_from, d_to} → số bài, số video, lượt xem, người xem, tương tác, nhấp, ngày bài đầu và link bài nhiều view nhất,
--    của các bài gắn BẤT KỲ mã nào trong `codes` (mỗi bài chỉ tính 1 lần) trong khoảng ngày [d_from, d_to] (giờ VN; null = không giới hạn).
--  • Dùng cho thẻ mẫu / bảng R&D / duyệt Win: trước đây kéo ~13.000 bài (~3,5 MB, trang đầu 5 giây) mỗi lần mở; nay trả đúng vài trăm dòng tổng hợp.
--  • Chưa chạy migration này: ứng dụng tự quay về cách tính cũ (chậm hơn), không lỗi.

create or replace function social.rnd_code_stats(p_items jsonb)
returns table (id text, first_day date, posts integer, videos integer, views bigint, viewers bigint, reactions bigint, comments bigint, shares bigint, clicks bigint, top_url text)
language sql stable
as $$
  select i.id,
         min((p.published_at at time zone 'Asia/Ho_Chi_Minh')::date) as first_day,
         count(*)::int as posts,
         (count(*) filter (where p.kind in ('video', 'reel')))::int as videos,
         coalesce(sum(p.views), 0)::bigint as views,
         coalesce(sum(p.viewers), 0)::bigint as viewers,
         coalesce(sum(p.reactions), 0)::bigint as reactions,
         coalesce(sum(p.comments), 0)::bigint as comments,
         coalesce(sum(p.shares), 0)::bigint as shares,
         coalesce(sum(p.clicks), 0)::bigint as clicks,
         (array_agg(p.permalink_url order by p.views desc nulls last, p.id))[1] as top_url
  from jsonb_to_recordset(p_items) as i(id text, codes text, d_from date, d_to date)
  join social.posts p
    on p.product_codes && string_to_array(i.codes, ',')
   and (i.d_from is null or (p.published_at at time zone 'Asia/Ho_Chi_Minh')::date >= i.d_from)
   and (i.d_to is null or (p.published_at at time zone 'Asia/Ho_Chi_Minh')::date <= i.d_to)
  group by i.id
$$;

revoke all on function social.rnd_code_stats(jsonb) from public, anon, authenticated;
grant execute on function social.rnd_code_stats(jsonb) to service_role;

notify pgrst, 'reload schema';
