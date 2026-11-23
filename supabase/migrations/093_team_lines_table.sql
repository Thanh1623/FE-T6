-- 093: BẢNG CHỨA SẴN kết quả sales.tr_lines cho MỌI team (sales.team_lines). CHẠY TAY trong Supabase SQL Editor, SAU 092. Chạy lại vẫn an toàn.
-- Vì sao: gần như mọi hàm sales.tr_* của trang QLHH gọi lại tr_lines (~17 lần mỗi lần mở trang) và mỗi lần tính lại từ ~101.000 dòng đơn (0,3–1,6 giây). Tính MỘT lần cho mọi team rồi chỉ đọc lại → vài chục mili giây.
-- Luôn ĐÚNG, không bao giờ cũ:
--   • sales.team_lines_meta.dirty: các trigger (mức câu lệnh, rất nhẹ) trên imported_order_lines, staff_teams, craft_orders, order_adjust, inventory_skus đặt dirty = true khi dữ liệu nguồn đổi.
--   • tr_lines: dirty (hoặc chưa dựng) → TÍNH TRỰC TIẾP như bản 092 (chậm hơn nhưng đúng); sạch → đọc bảng.
--   • sales.refresh_team_lines(): dựng lại bảng (dirty → sạch). Ứng dụng gọi sau khi nhập đơn hàng và trước mỗi lần làm mới bảng tổng hợp SPU; migration này tự dựng lần đầu ở cuối.
-- Kết quả KHÔNG đổi (đã đối chiếu từng team trước khi viết).

create table if not exists sales.team_lines (
  team text not null,
  order_id text, sku text, code text, qty numeric, price numeric, status text, ordered_at timestamptz, delivered_at timestamptz,
  staff text, od date, dd date, canc boolean, mat int, cost_price numeric, craft boolean, craft_kind text
);
create index if not exists team_lines_team_od_idx on sales.team_lines (team, od);

create table if not exists sales.team_lines_meta (
  id int primary key default 1 check (id = 1),
  dirty boolean not null default true,
  built_at timestamptz,
  rows int
);
insert into sales.team_lines_meta (id) values (1) on conflict do nothing;

alter table sales.team_lines enable row level security;
alter table sales.team_lines_meta enable row level security;
grant all on sales.team_lines, sales.team_lines_meta to service_role;
revoke all on sales.team_lines, sales.team_lines_meta from anon, authenticated;

-- Trigger mức câu lệnh: chỉ UPDATE khi đang sạch (không khoá dòng meta thừa)
create or replace function sales.mark_team_lines_dirty()
returns trigger
language plpgsql
as $$
begin
  update sales.team_lines_meta set dirty = true where id = 1 and not dirty;
  return null;
end
$$;

do $$
declare t text;
begin
  foreach t in array array['imported_order_lines', 'staff_teams', 'craft_orders', 'order_adjust', 'inventory_skus'] loop
    execute format('drop trigger if exists team_lines_dirty_ins on sales.%I', t);
    execute format('drop trigger if exists team_lines_dirty_upd on sales.%I', t);
    execute format('drop trigger if exists team_lines_dirty_del on sales.%I', t);
    execute format('drop trigger if exists team_lines_dirty_trunc on sales.%I', t);
    execute format('create trigger team_lines_dirty_ins after insert on sales.%I for each statement execute function sales.mark_team_lines_dirty()', t);
    execute format('create trigger team_lines_dirty_upd after update on sales.%I for each statement execute function sales.mark_team_lines_dirty()', t);
    execute format('create trigger team_lines_dirty_del after delete on sales.%I for each statement execute function sales.mark_team_lines_dirty()', t);
    execute format('create trigger team_lines_dirty_trunc after truncate on sales.%I for each statement execute function sales.mark_team_lines_dirty()', t);
  end loop;
end $$;

-- Dựng lại bảng cho MỌI team (một giao dịch). p_force = false: đang sạch thì bỏ qua.
create or replace function sales.refresh_team_lines(p_force boolean default false)
returns jsonb
language plpgsql
as $$
declare v_dirty boolean; v_rows int;
begin
  perform pg_advisory_xact_lock(8900003);
  select dirty into v_dirty from sales.team_lines_meta where id = 1 for update;
  if not p_force and v_dirty is false then return jsonb_build_object('skipped', true); end if;
  -- Đặt "sạch" TRƯỚC khi dựng: thay đổi dữ liệu nguồn commit sau thời điểm này sẽ đặt dirty = true lại (trigger chờ khoá dòng meta tới khi giao dịch này xong)
  update sales.team_lines_meta set dirty = false, built_at = now() where id = 1;
  delete from sales.team_lines where true;
  insert into sales.team_lines
  with s as materialized (
    select t.team, l.* from sales.imported_order_lines l
    join sales.staff_teams t on t.sapo_name = l.staff
    where l.order_id not like 'RD%' and t.team is not null   -- nhân viên chưa gán team (team rỗng) không thuộc team nào: tr_lines(p_team) cũng không bao giờ trả các dòng này
  )
  select l.team, l.order_id::text, l.sku::text, l.code::text, l.qty::numeric, l.price::numeric, l.status::text, l.ordered_at, l.delivered_at, l.staff::text,
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
  get diagnostics v_rows = row_count;
  update sales.team_lines_meta set rows = v_rows where id = 1;
  return jsonb_build_object('rows', v_rows);
end
$$;

-- tr_lines: sạch → đọc bảng; dirty / chưa dựng → tính trực tiếp (bản 092, luôn đúng)
create or replace function sales.tr_lines(p_team text)
returns table (order_id text, sku text, code text, qty numeric, price numeric, status text, ordered_at timestamptz, delivered_at timestamptz,
               staff text, od date, dd date, canc boolean, mat int, cost_price numeric, craft boolean, craft_kind text)
language plpgsql stable
rows 15000
as $$
begin
  if coalesce((select m.dirty from sales.team_lines_meta m where m.id = 1), true) then
    return query
    with s as materialized (
      select l.* from sales.imported_order_lines l
      join sales.staff_teams t on t.sapo_name = l.staff
      where t.team = p_team and l.order_id not like 'RD%'
    )
    select l.order_id::text, l.sku::text, l.code::text, l.qty::numeric, l.price::numeric, l.status::text, l.ordered_at, l.delivered_at, l.staff::text,
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
  else
    return query
    select tl.order_id, tl.sku, tl.code, tl.qty, tl.price, tl.status, tl.ordered_at, tl.delivered_at, tl.staff, tl.od, tl.dd, tl.canc, tl.mat, tl.cost_price, tl.craft, tl.craft_kind
    from sales.team_lines tl where tl.team = p_team;
  end if;
end
$$;

do $$
begin
  execute 'grant execute on function sales.tr_lines(text) to service_role';
  execute 'grant execute on function sales.refresh_team_lines(boolean) to service_role';
  execute 'revoke all on function sales.tr_lines(text), sales.refresh_team_lines(boolean) from anon, authenticated, public';
end $$;

-- Dựng lần đầu (có thể mất vài giây)
select sales.refresh_team_lines(true);

notify pgrst, 'reload schema';
