-- 089: BẢNG TỔNG HỢP VIDEO dựng ngay trong SQL (Pha A–B của docs/THIET-KE-LAM-MOI-VIDEO-TRONG-SQL.md). CHẠY TAY trong Supabase SQL Editor, SAU 088. Chạy lại vẫn an toàn.
-- Chưa có trang nào đọc các bảng này (Pha C sau khi đối chiếu khớp): chạy migration + làm mới + đối chiếu KHÔNG đổi số liệu hiện có.
--
--  sales.video_fact   — MỖI BÀI video / reel gắn mã một dòng HẸP (id, ngày đăng giờ VN, kênh, mảng mã SPU đã rút + quy mã cũ → mới, lượt xem). ~32.000 dòng ≈ 4 MB (social.posts nặng 74 MB).
--                       Nạp TĂNG DẦN chỉ từ bài có posts.updated_at > mốc (trigger touch_updated_at đã đặt updated_at ở mọi UPDATE), nên mỗi lần chỉ vài trăm – vài nghìn dòng.
--  sales.video_daily  — gom từ video_fact: (ngày, mã SPU, kênh) → số video, lượt xem, team, nền tảng. Dựng lại TOÀN BỘ mỗi lần trong một giao dịch (vài trăm ms trên bảng hẹp) → không thể lệch.
--  sales.video_meta   — đúng 1 dòng: mốc nạp tăng dần, lần dựng gần nhất.
--  sales.video_parity — so video_daily với bảng cũ sales.spu_video_daily (lượt hiện hành) để chắc khớp trước khi chuyển người đọc.
-- Quy tắc đếm GIỐNG HỆT lib/spu-data.ts (loadSpuRows): mã SPU = phần trước dấu "-" (bỏ "#", chữ HOA); mã cũ → mới qua sales.spu_aliases; một bài gắn nhiều SKU của cùng SPU chỉ tính 1 video;
-- chỉ kênh đang bật; team = tên team của kênh (rỗng nếu chưa gán); nền tảng FB / IG / TT. Giữ 360 ngày.

create table if not exists sales.video_fact (
  post_id         text primary key,
  day             date        not null,
  channel_id      text        not null,
  codes           text[]      not null,
  views           bigint      not null default 0,
  src_updated_at  timestamptz not null
);
create index if not exists video_fact_day_idx on sales.video_fact (day);

create table if not exists sales.video_daily (
  day        date   not null,
  code       text   not null,
  channel_id text   not null,
  team       text   not null default '',
  platform   text   not null default 'FB',
  videos     int    not null,
  views      bigint not null default 0,
  primary key (day, code, channel_id)
);
create index if not exists video_daily_code_idx on sales.video_daily (code, day);

create table if not exists sales.video_meta (
  id              int primary key default 1 check (id = 1),
  fact_watermark  timestamptz,
  fact_refreshed  timestamptz,
  daily_refreshed timestamptz,
  fact_rows       int,
  daily_rows      int
);
insert into sales.video_meta (id) values (1) on conflict do nothing;

alter table sales.video_fact enable row level security;
alter table sales.video_daily enable row level security;
alter table sales.video_meta enable row level security;
grant all on sales.video_fact, sales.video_daily, sales.video_meta to service_role;
revoke all on sales.video_fact, sales.video_daily, sales.video_meta from anon, authenticated;

-- Chỉ mục để nạp tăng dần nhanh.
--  • một phần: tìm bài video / reel có mã đã đổi (chèn / cập nhật);
--  • đầy đủ theo updated_at: tìm bài đã đổi mà KHÔNG còn đủ điều kiện (mất mã / đổi loại) để xoá khỏi video_fact — điều kiện phủ định không dùng được chỉ mục một phần, từng làm câu xoá quét cả bảng 74 MB (5,7 giây → quá thời gian 8 giây).
create index if not exists posts_video_updated_idx on social.posts (updated_at) where kind in ('video', 'reel') and product_codes <> '{}';
create index if not exists posts_updated_idx on social.posts (updated_at);

-- Rút mảng mã của một bài: bỏ "#", cắt khoảng trắng, HOA, lấy phần trước dấu "-", quy mã cũ → mới, khử trùng, bỏ rỗng
create or replace function sales.video_codes(p_codes text[])
returns text[]
language sql stable
as $$
  select coalesce(array_agg(distinct coalesce(al.new_code, s.spu)) filter (where s.spu <> ''), '{}')
  from (select trim(split_part(upper(trim(regexp_replace(c, '^#', ''))), '-', 1)) spu from unnest(p_codes) c) s
  left join sales.spu_aliases al on al.old_code = s.spu
$$;

-- Nạp video_fact.
--   p_from / p_to rỗng  → TĂNG DẦN: bài có updated_at > mốc (lùi 5 phút cho an toàn); bài mất mã / không còn là video thì xoá khỏi bảng.
--   p_from, p_to        → DỰNG LẠI các bài đăng trong [p_from, p_to) (ngày VN): dùng để dựng đầy đủ lần đầu (chia khoảng để mỗi lượt gọi < 8 giây) và bản dựng đêm.
-- Bản đầu có 2 tham số: gỡ để không bị trùng tên ("function is not unique") khi gọi theo tên tham số
drop function if exists sales.refresh_video_fact(date, date);

create or replace function sales.refresh_video_fact(p_from date default null, p_to date default null, p_mark_at timestamptz default null)
returns jsonb
language plpgsql
as $$
declare
  v_wm timestamptz;
  v_now timestamptz := now();
  v_keep date := ((now() at time zone 'Asia/Ho_Chi_Minh')::date - 359);
  v_up int := 0; v_del int := 0;
begin
  -- Một lượt nạp / dựng tại một thời điểm: hai lượt chạy chồng nhau (đồng bộ + làm mới bảng tổng hợp) sẽ tranh nhau xoá / chèn cùng khoá → lỗi trùng khoá; khoá cố vấn của giao dịch xếp chúng nối đuôi
  perform pg_advisory_xact_lock(8900001);
  if p_from is not null and p_to is not null then
    delete from sales.video_fact where day >= p_from and day < p_to;
    get diagnostics v_del = row_count;
    insert into sales.video_fact (post_id, day, channel_id, codes, views, src_updated_at)
    select p.id, (p.published_at at time zone 'Asia/Ho_Chi_Minh')::date, p.channel_id, vc.codes, coalesce(p.views, 0), p.updated_at
    from social.posts p cross join lateral (select sales.video_codes(p.product_codes) as codes) vc
    where p.kind in ('video', 'reel') and p.product_codes <> '{}'
      and (p.published_at at time zone 'Asia/Ho_Chi_Minh')::date >= greatest(p_from, v_keep)
      and (p.published_at at time zone 'Asia/Ho_Chi_Minh')::date < p_to
      and cardinality(vc.codes) > 0
    on conflict (post_id) do update set day = excluded.day, channel_id = excluded.channel_id, codes = excluded.codes, views = excluded.views, src_updated_at = excluded.src_updated_at;
    get diagnostics v_up = row_count;
    -- Lượt dựng đầy đủ cuối cùng truyền thời điểm BẮT ĐẦU cả lần dựng → các lần tăng dần sau đó lấy mọi bài đổi kể từ mốc này
    if p_mark_at is not null then update sales.video_meta set fact_watermark = p_mark_at where id = 1; end if;
  else
    select fact_watermark into v_wm from sales.video_meta where id = 1;
    -- Chưa dựng đầy đủ lần nào: KHÔNG quét cả bảng bài đăng trong một câu (quá thời gian 8 giây) — chờ dựng đầy đủ trước
    if v_wm is null then return jsonb_build_object('skipped', true, 'reason', 'chưa dựng đầy đủ lần đầu'); end if;
    -- bài đã đổi nhưng không còn đủ điều kiện (mất mã / đổi loại)
    with ch as materialized (select id, kind, product_codes from social.posts where updated_at > v_wm - interval '5 minutes')
    delete from sales.video_fact f using ch
    where ch.id = f.post_id
      and not (ch.kind in ('video', 'reel') and ch.product_codes <> '{}' and cardinality(sales.video_codes(ch.product_codes)) > 0);
    get diagnostics v_del = row_count;
    insert into sales.video_fact (post_id, day, channel_id, codes, views, src_updated_at)
    select p.id, (p.published_at at time zone 'Asia/Ho_Chi_Minh')::date, p.channel_id, vc.codes, coalesce(p.views, 0), p.updated_at
    from social.posts p cross join lateral (select sales.video_codes(p.product_codes) as codes) vc
    where p.kind in ('video', 'reel') and p.product_codes <> '{}' and p.updated_at > v_wm - interval '5 minutes'
      and (p.published_at at time zone 'Asia/Ho_Chi_Minh')::date >= v_keep
      and cardinality(vc.codes) > 0
    on conflict (post_id) do update set day = excluded.day, channel_id = excluded.channel_id, codes = excluded.codes, views = excluded.views, src_updated_at = excluded.src_updated_at;
    get diagnostics v_up = row_count;
    update sales.video_meta set fact_watermark = v_now where id = 1;
  end if;
  delete from sales.video_fact where day < v_keep;   -- cắt tỉa quá 360 ngày
  update sales.video_meta set fact_refreshed = v_now, fact_rows = (select count(*) from sales.video_fact) where id = 1;
  return jsonb_build_object('upserted', v_up, 'deleted', v_del, 'rows', (select fact_rows from sales.video_meta where id = 1));
end
$$;

-- Dựng lại video_daily từ video_fact (một giao dịch: người đọc thấy bản cũ cho tới khi xong rồi chuyển sang bản mới)
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
  update sales.video_meta set daily_refreshed = now(), daily_rows = v_rows where id = 1;
  return jsonb_build_object('rows', v_rows);
end
$$;

-- Đối chiếu với bảng cũ (lượt hiện hành của spu_summary_meta): cùng khoảng 360 ngày, cùng khoá (ngày, mã, kênh).
-- Bảng cũ CHỈ có mã nằm trong danh sách SPU của bảng tổng hợp (mã test, mã R&D, mã công cụ dụng cụ… bị bỏ) nên so trong phạm vi các mã đó; số dòng của mã còn lại báo riêng (extra_codes_rows, không phải lỗi).
-- Lệch nhỏ về lượt xem (diff_rows) là bình thường nếu đồng bộ đã cập nhật lượt xem SAU lần làm mới bảng tổng hợp.
create or replace function sales.video_parity()
returns jsonb
language sql stable
as $$
  with m as (select run_id from sales.spu_summary_meta limit 1),
  lo as (select ((now() at time zone 'Asia/Ho_Chi_Minh')::date - 359) as d),
  codes as (select code from sales.spu_summary where run_id = (select run_id from m)),
  o as (select day, code, channel_id, videos, views from sales.spu_video_daily where run_id = (select run_id from m) and day >= (select d from lo)),
  n as (select day, code, channel_id, videos, views from sales.video_daily where day >= (select d from lo)),
  j as (select coalesce(o.day, n.day) as day, coalesce(o.code, n.code) as code, o.videos as ov, o.views as ow, n.videos as nv, n.views as nw from o full join n using (day, code, channel_id)),
  jin as (select * from j where code in (select code from codes))
  select jsonb_build_object(
    'old_rows', (select count(*) from o), 'new_rows_in_summary', (select count(*) from n where code in (select code from codes)),
    'old_videos', (select coalesce(sum(videos), 0) from o), 'new_videos_in_summary', (select coalesce(sum(videos), 0) from n where code in (select code from codes)),
    'only_old', (select count(*) from jin where nv is null), 'only_new', (select count(*) from jin where ov is null),
    'diff_rows', (select count(*) from jin where ov is not null and nv is not null and (ov <> nv or ow <> nw)),
    'diff_videos', (select count(*) from jin where ov is not null and nv is not null and ov <> nv),
    'extra_codes_rows', (select count(*) from j where code not in (select code from codes)),
    'sample', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select * from jin where ov is distinct from nv or ow is distinct from nw order by day desc limit 8) x))
$$;

do $$
begin
  execute 'grant execute on function sales.video_codes(text[]) to service_role';
  execute 'grant execute on function sales.refresh_video_fact(date, date, timestamptz) to service_role';
  execute 'grant execute on function sales.refresh_video_daily() to service_role';
  execute 'grant execute on function sales.video_parity() to service_role';
  execute 'revoke all on function sales.video_codes(text[]), sales.refresh_video_fact(date, date, timestamptz), sales.refresh_video_daily(), sales.video_parity() from anon, authenticated, public';
end $$;

notify pgrst, 'reload schema';
