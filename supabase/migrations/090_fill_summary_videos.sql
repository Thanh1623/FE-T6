-- 090: Pha C — bảng tổng hợp SPU lấy video từ sales.video_daily (089) thay vì đọc ~32.000 bài đăng. CHẠY TAY trong Supabase SQL Editor, SAU 089. Chạy lại vẫn an toàn.
-- sales.fill_summary_videos(p_run): sau khi ứng dụng ghi sales.spu_summary của lượt p_run, hàm này
--   (1) chép video_daily → sales.spu_video_daily cho đúng các mã SPU có trong lượt đó (bảng cũ vốn chỉ chứa các mã trong danh sách SPU);
--   (2) điền cột spu_summary.video_teams (các team đã đăng video cho SPU).
-- Kết quả đã đối chiếu KHỚP với cách cũ (sales.video_parity, 2026-11-09). Chưa chạy migration này → ứng dụng tự dùng cách cũ.

create or replace function sales.fill_summary_videos(p_run bigint)
returns jsonb
language plpgsql
as $$
declare n int;
begin
  insert into sales.spu_video_daily (run_id, code, day, channel_id, team, platform, videos, views)
  select p_run, d.code, d.day, d.channel_id, d.team, d.platform, d.videos, d.views
  from sales.video_daily d
  where d.code in (select s.code from sales.spu_summary s where s.run_id = p_run);
  get diagnostics n = row_count;
  update sales.spu_summary s set video_teams = x.t
  from (select code, array_agg(distinct team order by team) as t from sales.video_daily where team <> '' group by code) x
  where s.run_id = p_run and x.code = s.code;
  return jsonb_build_object('rows', n);
end
$$;

do $$
begin
  execute 'grant execute on function sales.fill_summary_videos(bigint) to service_role';
  execute 'revoke all on function sales.fill_summary_videos(bigint) from anon, authenticated, public';
end $$;

notify pgrst, 'reload schema';
