-- 018: Gộp vai trò "Sao Biển" vào "R&D" (team Sao Biển có bộ phận R&D riêng).
-- Chạy trên project fb-traffic. Chạy lại vẫn an toàn.
--
-- App đã tự hiểu tài khoản role 'saobien' cũ là 'rnd' (lib/roles.ts → normalizeRole), nên chạy file này KHÔNG bắt buộc để app hoạt động;
-- chạy để dữ liệu sạch và chặn ghi lại role 'saobien' vào DB.

update core.profiles set role = 'rnd' where role = 'saobien';

alter table core.profiles drop constraint if exists profiles_role_check;
alter table core.profiles add constraint profiles_role_check check (role in ('admin', 'rnd', 'design3d', 'media'));

notify pgrst, 'reload schema';
