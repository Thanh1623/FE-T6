-- 083: Danh sách "SPU team đã bán" (thống kê SPU, thẻ phân loại tồn kho của QLHH) GỘP mã cũ vào mã mới theo bảng quy đổi sales.spu_aliases (migration 066):
-- sản phẩm bán ở mã cũ (vd K400013, N620144) được cộng vào SPU mới (K0002, N0045) nên có tồn kho / phân loại và không còn nằm ở ô "chưa xếp loại".
-- CHẠY TAY trong Supabase SQL Editor, SAU 082. Chạy lại vẫn an toàn. Chỉ đổi bước gom mã ở CTE b; phần còn lại giữ NGUYÊN như bản 071.

create or replace function sales.tr_spu_list(p_team text, p_from date, p_to date)
returns jsonb
language sql stable
as $$
  with m as (select run_id from sales.spu_summary_meta limit 1),
  b as (select coalesce(al.new_code, tl.code) code, tl.qty, tl.delivered_at
        from sales.tr_lines(p_team) tl left join sales.spu_aliases al on al.old_code = upper(tl.code)
        where tl.od between p_from and p_to and not tl.canc and tl.price > 0),
  a as (select code, sum(qty)::int sold, coalesce(sum(qty) filter (where delivered_at is not null), 0)::int deliv from b group by code),
  v as (select code, sum(videos)::int videos from sales.spu_video_daily
        where team = p_team and run_id = (select run_id from m) and day between p_from and p_to group by code)
  select coalesce(jsonb_agg(jsonb_build_array(
      a.code, left(coalesce(s.name, (select k.name from sales.inventory_skus k where k.code = a.code limit 1), a.code), 90), a.sold, a.deliv, coalesce(v.videos, 0), coalesce(s.stock_total, 0), s.sold30)
    order by a.sold desc, a.code), '[]'::jsonb)
  from a left join sales.spu_summary s on s.code = a.code and s.run_id = (select run_id from m)
         left join v on v.code = a.code
$$;

do $$
begin
  execute 'grant execute on function sales.tr_spu_list(text, date, date) to service_role';
  execute 'revoke all on function sales.tr_spu_list(text, date, date) from anon, authenticated, public';
end $$;

notify pgrst, 'reload schema';
