-- 034: Cho phép giao MỘT mẫu cho NHIỀU team cùng lúc (mỗi team 1 phiếu). CHẠY TAY trong Supabase SQL Editor, SAU 033. Chạy lại vẫn an toàn.
--  • Trước: unique handoffs_one_open (product_id) where status <> 'returned' → mỗi mẫu chỉ có 1 phiếu đang mở. Giao cho nhiều team thì phiếu thứ 2 trở đi
--    bị từ chối (vi phạm unique) → nút "Gửi yêu cầu" báo lỗi / không chạy.
--  • Giờ: 1 phiếu đang mở cho mỗi (mẫu, team). Phiếu chưa phân công (team_id null) vẫn chỉ 1 phiếu / mẫu.

drop index if exists rnd.handoffs_one_open;
create unique index if not exists handoffs_one_open_per_team on rnd.handoffs (product_id, coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid)) where status <> 'returned';
