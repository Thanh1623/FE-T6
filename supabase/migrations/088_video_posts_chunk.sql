-- 088: ĐỌC NHANH danh sách video / reel gắn mã SPU (Dashboard, Theo dõi đẩy hàng, QLHH). CHẠY TAY trong Supabase SQL Editor, SAU 087. Chạy lại vẫn an toàn.
-- Vì sao chậm: mỗi lần bộ đệm bị xoá (sau đồng bộ), ứng dụng đọc ~32.000 bài trong 400 ngày bằng ~35 lượt gọi phân trang OFFSET, mỗi lượt ~1 giây (database đang bị giới hạn CPU) → trang tải 10–25 giây,
--   thậm chí quá thời gian của Vercel (lỗi 503). pg_stat_statements: truy vấn này chiếm nhiều thời gian nhất (12.956 lượt, trung bình 1,1 giây).
-- Cách sửa: (1) một chỉ mục riêng đúng điều kiện đọc; (2) hàm trả MỘT mảng gọn cho cả đoạn thời gian chỉ trong 1 lượt gọi (kết quả KHÔNG đổi).

create index if not exists posts_video_codes_idx on social.posts (published_at, id)
  where kind in ('video', 'reel') and product_codes <> '{}';

-- Mỗi phần tử: [id, channel_id, published_at, views, product_codes] — cùng thứ tự cột với bản phân trang cũ (published_at, id)
create or replace function sales.video_posts_chunk(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable
as $$
  select coalesce(jsonb_agg(jsonb_build_array(id, channel_id, published_at, views, product_codes) order by published_at, id), '[]'::jsonb)
  from social.posts
  where kind in ('video', 'reel') and product_codes <> '{}' and published_at >= p_from and published_at < p_to
$$;

do $$
begin
  execute 'grant execute on function sales.video_posts_chunk(timestamptz, timestamptz) to service_role';
  execute 'revoke all on function sales.video_posts_chunk(timestamptz, timestamptz) from anon, authenticated, public';
end $$;

notify pgrst, 'reload schema';
