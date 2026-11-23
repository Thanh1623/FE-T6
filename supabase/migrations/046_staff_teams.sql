-- 046: Danh sách tên nhân viên phụ trách (tên tài khoản Sapo trên đơn hàng) và TEAM của từng người — lưu trong database của dự án này. CHẠY TAY trong Supabase SQL Editor, SAU 045. Chạy lại vẫn an toàn.
--  • Mỗi lần "Nhập số bán", hệ thống ghi thêm các tên nhân viên mới trong file; team tự suy từ Qlydonhang (public.profiles / public.teams) theo tên (source = 'auto').
--  • Tên chưa suy được team (team = null): sửa tay ngay trong bảng này — điền cột team và đặt source = 'manual'; lần nhập sau KHÔNG ghi đè dòng 'manual'.
--      update sales.staff_teams set team = 'Hồng Ngọc', source = 'manual' where sapo_name = 'Đặng Thị Hải Yến';
--  • team = tên team trong hệ thống này (vd 'Hồng Ngọc', 'HLB', 'NLB', 'TAV', 'Đá quý', 'Global', 'ADS'); team chưa có ở đây vẫn lưu được nhưng chưa lọc được ở trang Theo dõi SPU.
--  • Chỉ ghi bằng service role; RLS bật, không mở policy cho client.

create table if not exists sales.staff_teams (
  sapo_name    text primary key,                                   -- tên nhân viên đúng như cột "Nhân viên phụ trách" của đơn
  team         text,                                               -- tên team; null = chưa xác định
  profile_name text,                                               -- tên nhân viên khớp trên Qlydonhang (tham khảo)
  source       text not null default 'auto' check (source in ('auto', 'manual')),
  updated_at   timestamptz not null default now()
);
create index if not exists staff_teams_team_idx on sales.staff_teams (team);

alter table sales.staff_teams enable row level security;
grant all on sales.staff_teams to service_role;

notify pgrst, 'reload schema';
