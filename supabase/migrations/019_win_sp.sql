-- Chạy TAY (sau 018_merge_roles.sql) trong Supabase SQL Editor (project fb-traffic) TRƯỚC KHI deploy bản code có kết quả "WIN SP". Chạy lại được.
--
-- Cách đánh giá mới (một kiểu test duy nhất, không phân Test Sales / Traffic / Concept / Content):
--   đạt KPI traffic            → WIN TRAFFIC   (sau đó đạt thêm KPI bán → WIN)
--   đạt KPI bán, traffic chưa  → WIN SP        (sau đó đạt thêm KPI traffic → WIN)
--   đạt CẢ HAI                 → WIN
-- Thêm giá trị 'win_sp' vào các cột kết quả; thêm mục tiêu 'test' (mục tiêu chung cho phiên test mới).

do $$
declare
  t record;
begin
  -- Gỡ các CHECK cũ của cột result rồi tạo lại có 'win_sp' (tên ràng buộc có thể khác nhau giữa các môi trường)
  for t in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in ('rnd.evaluations'::regclass, 'rnd.decisions'::regclass, 'rnd.handoffs'::regclass)
      and pg_get_constraintdef(c.oid) ilike '%result%in%'
  loop
    execute format('alter table %s drop constraint %I', t.tbl, t.conname);
  end loop;
end $$;

alter table rnd.evaluations add constraint evaluations_result_check check (result in ('testing', 'win', 'win_traffic', 'win_sp', 'fail'));
alter table rnd.decisions   add constraint decisions_result_check   check (result in ('win', 'win_traffic', 'win_sp', 'fail'));
alter table rnd.handoffs    add constraint handoffs_result_check    check (result in ('win', 'win_traffic', 'win_sp'));

-- Mục tiêu chung "Test" cho phiên test mới (phiên chỉ đặt cửa sổ ngày + phạm vi số bán; KPI lấy từ mẫu mặc định Sales + Traffic)
insert into rnd.goals (code, name, description, win_result, sort_order)
values ('test', 'Test', 'Test chung: đạt traffic → WIN TRAFFIC, đạt bán → WIN SP, đạt cả hai → WIN', 'win', 0)
on conflict (code) do nothing;

notify pgrst, 'reload schema';
