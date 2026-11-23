-- Tuổi tồn theo FIFO của API tồn kho (aged-inventory): start_date của MÃ (sku), không theo kho.
-- Chạy tay trong Supabase SQL Editor (idempotent). Chưa đổi code import/hiển thị — xem docs/HANDOFF-dac-ta-du-lieu-sapo.md mục 3–5.
--   code = sku (cho phép đuôi biến thể, vd D0006-00-S-WH); gộp lên SPU ở tầng app (cắt trước dấu '-' đầu tiên).
--   Tuổi SPU = Σ(tồn × ngày tồn) / Σ tồn trên các mã còn tồn.
alter table sales.inventory_stock
  add column if not exists start_date   date,                                   -- ngày của lô cũ nhất còn hàng (FIFO); thay cho last_in_date khi tính tuổi tồn
  add column if not exists is_floor     boolean not null default false,         -- true = start_date là mốc sàn 2025-09-08/09 → tuổi thật chỉ là cận dưới (≥)
  add column if not exists warehouse_id text;                                   -- mã kho Sapo (sapo_location_id), dạng chuỗi

comment on column sales.inventory_stock.start_date   is 'Tuổi tồn FIFO theo mã (không theo kho); lấy từ start_date của API aged-inventory';
comment on column sales.inventory_stock.is_floor     is 'start_date rơi vào mốc sàn 2025-09-08/09 (đầu dữ liệu) → chỉ là cận dưới';
comment on column sales.inventory_stock.warehouse_id is 'sapo_location_id của kho (không dùng location_id nội bộ của Tech)';

notify pgrst, 'reload schema';
