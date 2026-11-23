-- 100: Một người có thể thuộc 2 team (team chính + team 2). CHẠY TAY trong Supabase SQL Editor. Chạy lại vẫn an toàn.
--   Dùng cho trưởng team kinh doanh vẫn duyệt mẫu R&D sau khi mọi mẫu chuyển về team PT Sản Phẩm (migration 099):
--   đặt "Team 2" = PT Sản Phẩm cho người đó ở trang Người dùng. Cờ "Trưởng team" áp dụng cho cả hai team.
alter table core.profiles add column if not exists team2_id uuid references core.teams(id) on delete set null;
notify pgrst, 'reload schema';
