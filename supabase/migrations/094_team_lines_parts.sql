-- 094: Bảng tr_lines (093) dựng lại THEO TỪNG TEAM để mỗi lượt gọi xong dưới giới hạn 8 giây. CHẠY TAY trong Supabase SQL Editor, SAU 093. Chạy lại vẫn an toàn.
-- Vì sao: thử thật 2026-11-09 — sales.refresh_team_lines(true) dựng cả 9 team trong MỘT câu lệnh → "canceling statement due to statement timeout" (hơn 8 giây khi DB bận), nên ứng dụng không dựng lại được bảng
--   (cờ dirty ở lại true → tr_lines vẫn tính trực tiếp, vẫn ĐÚNG nhưng chậm). Và giao dịch dài giữ khoá dòng sales.team_lines_meta làm các lần ghi dữ liệu nguồn (nhập đơn) phải chờ.
-- Cách sửa — ba bước ngắn, mỗi bước một giao dịch riêng:
--   1) sales.team_lines_begin()            → trả thời điểm bắt đầu;
--   2) sales.team_lines_part(p_team)       → dựng lại các dòng của MỘT team (lần lượt từng team, ~0,3–1 giây mỗi team);
--   3) sales.team_lines_finish(p_started)  → xoá dòng của team không còn nhân viên, rồi đặt dirty = false NẾU KHÔNG có thay đổi dữ liệu nguồn nào kể từ p_started (changed_at < p_started); có thay đổi → ở lại dirty, lần dựng sau sẽ làm lại.
-- Trong lúc dựng dirty vẫn = true → tr_lines tính trực tiếp (đúng); chỉ khi dirty = false mới đọc bảng. Trigger giờ ghi thêm changed_at (thời điểm thay đổi nguồn gần nhất).

alter table sales.team_lines_meta add column if not exists changed_at timestamptz not null default clock_timestamp();

create or replace function sales.mark_team_lines_dirty()
returns trigger
language plpgsql
as $$
begin
  update sales.team_lines_meta set dirty = true, changed_at = clock_timestamp() where id = 1;
  return null;
end
$$;

create or replace function sales.team_lines_begin()
returns timestamptz
language sql volatile
as $$ select clock_timestamp() $$;

create or replace function sales.team_lines_teams()
returns text[]
language sql stable
as $$ select coalesce(array_agg(distinct team order by team), '{}') from sales.staff_teams where team is not null $$;

-- Dựng lại các dòng của MỘT team (cùng điều kiện với tr_lines tính trực tiếp)
create or replace function sales.team_lines_part(p_team text)
returns int
language plpgsql
as $$
declare n int;
begin
  perform pg_advisory_xact_lock(8900003);
  delete from sales.team_lines where team = p_team;
  insert into sales.team_lines
  with s as materialized (
    select l.* from sales.imported_order_lines l
    join sales.staff_teams t on t.sapo_name = l.staff
    where t.team = p_team and l.order_id not like 'RD%'
  )
  select p_team, l.order_id::text, l.sku::text, l.code::text, l.qty::numeric, l.price::numeric, l.status::text, l.ordered_at, l.delivered_at, l.staff::text,
         (l.ordered_at at time zone 'Asia/Ho_Chi_Minh')::date, (l.delivered_at at time zone 'Asia/Ho_Chi_Minh')::date,
         coalesce(l.status ~* 'hủy|huỷ', false),
         case when l.sku ~* '-g(10|14|18|24)-' or k.name ~* 'v(10|14|18|24)k|vàng|gold' then 1
              when l.sku ~* '-s-' or k.name ~* 's925|s990|s999|bạc|silver' then 0 else 2 end,
         k.cost_price::numeric,
         (co.order_id is not null or l.code ilike 'MATRUNG%'),
         coalesce(co.kind, case when l.code ilike '%VANG' then 'vang' when l.code ilike 'MATRUNG%' then 'bac' end)
  from s l
  left join sales.inventory_skus k on k.sku = l.sku
  left join sales.craft_orders co on co.order_id = l.order_id
  where not exists (select 1 from unnest(string_to_array(coalesce(l.tags, ''), ',')) x
                    where lower(trim(x)) in ('page_id_1659994180936411', 'page_huyk - trang sức thiết kế'))
    and not exists (select 1 from sales.imported_order_lines n where n.order_id = l.order_id and n.updated_at > l.updated_at)
    and not exists (select 1 from sales.order_adjust a where a.order_id = l.order_id and a.kind = 'exclude');
  get diagnostics n = row_count;
  return n;
end
$$;

create or replace function sales.team_lines_finish(p_started timestamptz)
returns jsonb
language plpgsql
as $$
declare v_clean int; v_rows int;
begin
  delete from sales.team_lines where team not in (select team from sales.staff_teams where team is not null);
  select count(*) into v_rows from sales.team_lines;
  update sales.team_lines_meta set dirty = false, built_at = now(), rows = v_rows where id = 1 and changed_at < p_started;
  get diagnostics v_clean = row_count;
  return jsonb_build_object('clean', v_clean = 1, 'rows', v_rows);
end
$$;

-- Bản một lần cho SQL Editor (không giới hạn 8 giây): chạy lần lượt các bước trên, KHÔNG giữ khoá meta suốt quá trình
create or replace function sales.refresh_team_lines(p_force boolean default false)
returns jsonb
language plpgsql
as $$
declare v_started timestamptz := clock_timestamp(); tm text;
begin
  if not p_force and (select dirty from sales.team_lines_meta where id = 1) is false then return jsonb_build_object('skipped', true); end if;
  foreach tm in array sales.team_lines_teams() loop
    perform sales.team_lines_part(tm);
  end loop;
  return sales.team_lines_finish(v_started);
end
$$;

do $$
begin
  execute 'grant execute on function sales.team_lines_begin(), sales.team_lines_teams(), sales.team_lines_part(text), sales.team_lines_finish(timestamptz), sales.refresh_team_lines(boolean) to service_role';
  execute 'revoke all on function sales.team_lines_begin(), sales.team_lines_teams(), sales.team_lines_part(text), sales.team_lines_finish(timestamptz), sales.refresh_team_lines(boolean) from anon, authenticated, public';
end $$;

-- Dựng lại ngay (cũng làm "sạch" cờ dirty sau lần gán team vừa rồi)
select sales.refresh_team_lines(true);

notify pgrst, 'reload schema';
