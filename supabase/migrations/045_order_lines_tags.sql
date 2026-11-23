-- 045: Lưu tag đơn hàng (Sapo) và nhân viên phụ trách của từng dòng số bán nhập từ file, để tính số bán THEO TEAM. CHẠY TAY trong Supabase SQL Editor, SAU 044. Chạy lại vẫn an toàn.
--  • staff = cột "Nhân viên phụ trách" (tên tài khoản Sapo) — dùng để chia team CHÍNH: tên nhân viên → team trên Qlydonhang (public.profiles / public.teams); tag chỉ là phương án dự phòng.
--  • tags = cột "Tags" của file "Danh sách chi tiết đơn hàng" (vd "ChatOmniAI, page_HuyK - Kim Hoàn, page_id_2497800676910664, Tiktok_Viễn Chí Bảo").
--  • Team của đơn suy từ tag giống số bán đồng bộ từ Sapo: page_id_<số> → Trang Facebook, tiktok_business_<tên> → kênh TikTok; kênh thuộc team nào thì số bán tính cho team đó.
--  • Sau khi chạy: NHẬP LẠI file đơn hàng (nút "Nhập số bán") để các dòng cũ được ghi tag.

alter table sales.imported_order_lines add column if not exists tags text;
--  • staff = cột "Nhân viên phụ trách" (tên tài khoản Sapo), dùng để suy team trước, thiếu thì mới theo tag.
alter table sales.imported_order_lines add column if not exists staff text;

notify pgrst, 'reload schema';
