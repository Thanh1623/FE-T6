-- 036: Tối ưu truy vấn nóng (chỉ thêm chỉ mục, không đổi dữ liệu). CHẠY TAY trong Supabase SQL Editor. Chạy lại vẫn an toàn.
--  • Bộ máy đánh giá (lib/eval/engine), Dashboard S1–S4 (lib/spu-win) và bảng thị trường R&D đều đọc "bài có gắn mã SPU" theo thứ tự thời gian
--    (product_codes <> '{}', order by published_at, id, phân trang range). Chỉ mục riêng cho đúng tập bài có mã (nhỏ hơn nhiều so với cả bảng posts)
--    cho phép đọc theo thứ tự chỉ mục, không phải sắp xếp lại mỗi trang.
--  • Bài video / reel theo Page + thời gian: Thư viện SP mới và danh sách video của Đẩy mẫu ĐVKD chỉ lấy video / reel.
--  • Chỉ mục nhỏ cho truy vấn đếm trạng thái ở thanh bên (chạy mỗi lần mở trang).

-- Bài có mã SPU, theo thời gian (khớp đúng điều kiện PostgREST .neq("product_codes", "{}"))
create index if not exists posts_coded_time_idx on social.posts (published_at, id) where product_codes <> '{}';

-- Video / reel theo kênh + thời gian (Thư viện SP mới, video của team được giao)
create index if not exists posts_video_channel_time_idx on social.posts (channel_id, published_at desc) where kind in ('video', 'reel');

-- Phiếu giao việc chờ tiếp nhận của từng team (số báo ở thanh bên)
create index if not exists handoffs_pending_team_idx on rnd.handoffs (team_id) where status = 'pending';

-- Cập nhật thống kê để bộ lập kế hoạch dùng ngay các chỉ mục mới
analyze social.posts;
analyze rnd.handoffs;
