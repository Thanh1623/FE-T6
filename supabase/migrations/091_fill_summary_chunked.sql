-- 091: Pha C bền hơn — chia nhỏ việc chép video vào bảng tổng hợp SPU để MỖI lượt gọi xong dưới giới hạn 8 giây ngay cả khi database đang bận. CHẠY TAY trong Supabase SQL Editor, SAU 090. Chạy lại vẫn an toàn.
-- Vì sao: thử thật 2026-11-09 — sales.fill_summary_videos (090) làm MỘT lần: chèn ~29.000 dòng + gom danh sách team của ~11.000 SPU → "canceling statement due to statement timeout" khi DB đang bận (cùng lúc database bị truy vấn khác chiếm CPU).
-- Cách sửa:
--   • sales.video_code_teams: danh sách team đã đăng video của TỪNG MÃ (~700 dòng), dựng sẵn trong refresh_video_daily → cập nhật video_teams chỉ là phép nối với bảng nhỏ này.
--   • sales.fill_summary_videos(p_run, p_part, p_parts): chỉ xử lý các mã thuộc phần p_part trong p_parts phần (chia theo băm của mã) → ứng dụng gọi lần lượt 6 phần, mỗi phần ~5.000 dòng, thử lại khi quá thời gian.

create table if not exists sales.video_code_teams (
  code  text primary key,
  teams text[] not null
);
alter table sales.video_code_teams enable row level security;
grant all on sales.video_code_teams to service_role;
revoke all on sales.video_code_teams from anon, authenticated;

create or replace function sales.refresh_video_daily()
returns jsonb
language plpgsql
as $$
declare v_rows int;
begin
  perform pg_advisory_xact_lock(8900002);   -- hai lượt dựng chồng nhau: lượt sau không thấy dòng lượt trước vừa chèn → xoá hụt → lỗi trùng khoá; khoá xếp chúng nối đuôi
  delete from sales.video_daily where true;   -- Supabase bật pg_safeupdate: DELETE bắt buộc có WHERE
  insert into sales.video_daily (day, code, channel_id, team, platform, videos, views)
  select f.day, c.code, f.channel_id, coalesce(t.name, ''),
         case ch.platform when 'instagram' then 'IG' when 'tiktok' then 'TT' else 'FB' end,
         count(*)::int, sum(f.views)
  from sales.video_fact f
  join social.channels ch on ch.id = f.channel_id and ch.is_active
  left join core.teams t on t.id = ch.team_id
  cross join lateral unnest(f.codes) as c(code)
  group by f.day, c.code, f.channel_id, coalesce(t.name, ''), case ch.platform when 'instagram' then 'IG' when 'tiktok' then 'TT' else 'FB' end;
  get diagnostics v_rows = row_count;
  delete from sales.video_code_teams where true;
  insert into sales.video_code_teams (code, teams)
  select code, array_agg(distinct team order by team) from sales.video_daily where team <> '' group by code;
  update sales.video_meta set daily_refreshed = now(), daily_rows = v_rows where id = 1;
  return jsonb_build_object('rows', v_rows);
end
$$;

-- Bản 090 một tham số bị thay bằng bản có phần; gỡ để không trùng tên
drop function if exists sales.fill_summary_videos(bigint);

create or replace function sales.fill_summary_videos(p_run bigint, p_part int default 0, p_parts int default 1)
returns jsonb
language plpgsql
as $$
declare n int;
begin
  insert into sales.spu_video_daily (run_id, code, day, channel_id, team, platform, videos, views)
  select p_run, d.code, d.day, d.channel_id, d.team, d.platform, d.videos, d.views
  from sales.video_daily d
  where d.code in (select s.code from sales.spu_summary s where s.run_id = p_run and abs(hashtext(s.code)) % p_parts = p_part);
  get diagnostics n = row_count;
  update sales.spu_summary s set video_teams = t.teams
  from sales.video_code_teams t
  where s.run_id = p_run and t.code = s.code and abs(hashtext(s.code)) % p_parts = p_part;
  return jsonb_build_object('rows', n);
end
$$;

do $$
begin
  execute 'grant execute on function sales.refresh_video_daily() to service_role';
  execute 'grant execute on function sales.fill_summary_videos(bigint, int, int) to service_role';
  execute 'revoke all on function sales.fill_summary_videos(bigint, int, int) from anon, authenticated, public';
end $$;

-- Dựng sẵn bảng team theo mã từ video_daily hiện có (khỏi chờ lần dựng kế tiếp)
insert into sales.video_code_teams (code, teams)
select code, array_agg(distinct team order by team) from sales.video_daily where team <> '' group by code
on conflict (code) do update set teams = excluded.teams;

notify pgrst, 'reload schema';
