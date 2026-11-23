-- 098: Bảng Hoàn thành mẫu (P3) bỏ cột "Duyệt source" và "Yêu cầu nội dung". CHẠY TAY trong Supabase SQL Editor. Chạy lại vẫn an toàn.
--   • Yêu cầu source nào đã "Hoàn thành" coi như đã Đạt (approval = 'pass') — để các báo cáo cũ dựa vào cột này vẫn đúng.
--   • Mọi yêu cầu (trừ "Quay chế tác" của P5) có Yêu cầu nội dung mặc định là "Quay sản phẩm".
--   • Chưa chạy: ứng dụng vẫn hoạt động đúng (coi Hoàn thành là đã đạt), chỉ dữ liệu cũ chưa gọn.
update rnd.media_requests set approval = 'pass' where status = 'done' and approval is distinct from 'pass';
update rnd.media_requests set approval = null where status <> 'done' and approval is not null;
update rnd.media_requests set request_type = 'Quay sản phẩm' where request_type <> 'Quay chế tác' and request_type <> 'Quay sản phẩm';
notify pgrst, 'reload schema';
