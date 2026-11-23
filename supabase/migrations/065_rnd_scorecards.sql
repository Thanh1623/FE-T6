-- 065: Bảng chấm điểm mẫu sưu tầm trước khi duyệt (mẫu BM23 — Scorecard). CHẠY TAY trong Supabase SQL Editor. Chạy lại vẫn an toàn.
--  • Mỗi (mẫu, người chấm) có đúng 1 bản chấm hiện hành: điểm 0–5 của từng tiêu chí (scores), ghi chú từng tiêu chí (notes), cờ "Loại ngay" (fatal).
--  • total = điểm quy đổi thang 100 của RIÊNG người chấm này; passed = đạt theo luật của người đó (tổng ≥ ngưỡng và không tiêu chí nào dưới ngưỡng liệt).
--    Điểm CHÍNH THỨC của mẫu = trung bình từng tiêu chí của mọi người chấm, tính ở ứng dụng (src/lib/rnd-score-calc.ts), không lưu ở đây.
--  • cfg = bản chụp cấu hình (tiêu chí, trọng số, ngưỡng) lúc chấm — đổi trọng số về sau không làm sai điểm cũ.
--  • Chấm mù: ứng dụng chỉ trả điểm người khác cho người đã chấm (và Quản lý / trưởng team). Bảng chỉ đọc / ghi bằng service role qua server action (RLS bật, không mở policy cho client).
--  • Cấu hình hiển thị ở core.settings, khoá 'rnd_scorecard' (không bắt buộc — thiếu thì dùng mặc định trong mã).

create table if not exists rnd.scorecards (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references rnd.products(id) on delete cascade,
  scorer_id  uuid not null,
  scores     jsonb not null,
  notes      jsonb not null default '{}'::jsonb,
  fatal      boolean not null default false,
  total      numeric(5, 2) not null,
  passed     boolean not null,
  cfg        jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, scorer_id)
);
create index if not exists scorecards_product_idx on rnd.scorecards (product_id);

alter table rnd.scorecards enable row level security;
grant all on rnd.scorecards to service_role;
revoke all on rnd.scorecards from anon, authenticated;

notify pgrst, 'reload schema';
