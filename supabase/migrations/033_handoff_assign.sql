-- 033: Phân công mẫu Win cho team Sao Biển (rnd.handoffs). CHẠY TAY trong Supabase SQL Editor, SAU 032. Chạy lại vẫn an toàn.
--  • Trước: mẫu Win chuyển sang Sao Biển chung chung (ai trong R&D / Sao Biển cũng tiếp nhận được).
--  • Giờ: team R&D PHÂN CÔNG mẫu cho một team Sao Biển cụ thể (team_id) kèm hạn (deadline) và yêu cầu (rnd_note) để team đó lên video;
--    team được giao tiếp nhận / từ chối / phát triển / hoàn thành. Phiếu chưa có team_id = "Chờ phân công".
--  • Phiếu bị từ chối (status = 'returned') phân công lại được cho team khác: cập nhật lại chính phiếu đó (unique handoffs_one_open giữ 1 phiếu mở / mẫu).

alter table rnd.handoffs add column if not exists team_id  uuid references core.teams(id) on delete set null;   -- team Sao Biển được giao
alter table rnd.handoffs add column if not exists deadline date;                                                 -- hạn lên video

create index if not exists handoffs_team_idx on rnd.handoffs (team_id, status);

-- Giao việc lên video được tạo từ P3 trở đi (chưa cần Win): phiếu không nhất thiết có kết quả Win / số liệu chụp / link kho Source
alter table rnd.handoffs alter column result drop not null;
alter table rnd.handoffs alter column source_url drop not null;
alter table rnd.handoffs alter column snapshot set default '{}'::jsonb;
