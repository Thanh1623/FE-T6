-- 076: Số bán theo ngày của team cho các SPU được chọn — để chấm "Win của team" (lib/team-win.ts) bằng đúng bộ KPI của bộ máy đánh giá R&D nhưng chỉ tính đơn của team.
-- CHẠY TAY trong Supabase SQL Editor, sau 075; chạy lại an toàn. Chỉ đọc; service_role gọi.
-- Trả mảng [mã SPU, ngày đặt (giờ VN), số lượng]; dòng đã huỷ và dòng giá 0 bị bỏ như mọi số "sản phẩm" khác của QLHH.
create or replace function sales.tr_code_sales(p_team text, p_codes text[])
returns jsonb
language sql stable
as $$
  select coalesce(jsonb_agg(jsonb_build_array(code, od, q) order by code, od), '[]'::jsonb)
  from (select code, od, sum(qty)::int q from sales.tr_lines(p_team)
        where code = any(p_codes) and not canc and price > 0 group by code, od) z
$$;

do $$
begin
  execute 'revoke all on function sales.tr_code_sales(text,text[]) from public, anon, authenticated';
  execute 'grant execute on function sales.tr_code_sales(text,text[]) to service_role';
end $$;

notify pgrst, 'reload schema';
