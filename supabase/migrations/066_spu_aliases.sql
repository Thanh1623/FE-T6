-- 066: Bảng ĐỔI MÃ SPU cũ → mới (gộp SPU). CHẠY TAY trong Supabase SQL Editor, SAU 065. Chạy lại vẫn an toàn.
--  • Nguồn: file "doi ma.xlsx" (R&D, source 'doi-ma-xlsx') đối chiếu với bản xuất Sapo ngày 29/10; các chỗ sheet điền nhầm đã sửa tay. Thêm các mã Sapo có tên "(Đổi mã) … (mã mới)" mà file không có (source 'ten-sapo') và L300109 → L0042 (source 'xac-nhan-nguoi-dung').
--  • sales.spu_aliases: mỗi mã SPU CŨ (vd N400124) gộp vào đúng 1 mã SPU MỚI (vd N0001). KHÔNG sửa dữ liệu gốc (tồn, số bán, bài đăng, đánh giá vẫn mang mã cũ);
--    ứng dụng đọc bảng này để quy mã cũ về mã mới khi tổng hợp (có thể xoá dòng để hoàn tác).
--  • Mã cũ TÁCH THEO CỠ ĐÁ sang nhiều SPU mới (B001521, B400815, B401002) KHÔNG nằm ở bảng này mà ghi theo từng SKU vào sales.sku_spu_overrides (cơ chế đã có từ migration 050; có hiệu lực từ lần nhập file tồn / đơn hàng kế tiếp).
--  • Chỉ ghi bằng service role (RLS bật, không mở policy cho client).

create table if not exists sales.spu_aliases (
  old_code   text primary key,
  new_code   text not null check (new_code <> old_code),
  source     text not null default 'doi-ma-xlsx',
  note       text,
  updated_at timestamptz not null default now()
);
create index if not exists spu_aliases_new_idx on sales.spu_aliases (new_code);

alter table sales.spu_aliases enable row level security;
grant all on sales.spu_aliases to service_role;
revoke all on sales.spu_aliases from anon, authenticated;

insert into sales.spu_aliases (old_code, new_code, source) values
  ('B000355', 'B0014', 'doi-ma-xlsx'),
  ('B001072', 'B0018', 'doi-ma-xlsx'),
  ('B001522', 'B0004', 'doi-ma-xlsx'),
  ('B400002', 'B0033', 'doi-ma-xlsx'),
  ('B400305', 'B0015', 'doi-ma-xlsx'),
  ('B400583', 'B0011', 'doi-ma-xlsx'),
  ('B400882', 'B0027', 'doi-ma-xlsx'),
  ('B401557', 'B0008', 'doi-ma-xlsx'),
  ('B410118', 'B0005', 'doi-ma-xlsx'),
  ('B410577', 'B0006', 'doi-ma-xlsx'),
  ('B610007', 'B0032', 'ten-sapo'),
  ('B610072', 'B0001', 'doi-ma-xlsx'),
  ('B610101', 'B0028', 'doi-ma-xlsx'),
  ('B610102', 'B0020', 'ten-sapo'),
  ('B610103', 'B0029', 'doi-ma-xlsx'),
  ('B610104', 'B0016', 'doi-ma-xlsx'),
  ('B610105', 'B0017', 'doi-ma-xlsx'),
  ('D000856', 'D0028', 'doi-ma-xlsx'),
  ('D000904', 'D0017', 'doi-ma-xlsx'),
  ('D000984', 'D0052', 'doi-ma-xlsx'),
  ('D400535', 'D0007', 'doi-ma-xlsx'),
  ('D400544', 'D0006', 'doi-ma-xlsx'),
  ('D400545', 'D0008', 'doi-ma-xlsx'),
  ('D400782', 'D0001', 'doi-ma-xlsx'),
  ('D400785', 'D0020', 'doi-ma-xlsx'),
  ('D401055', 'D0018', 'doi-ma-xlsx'),
  ('D401096', 'D0005', 'doi-ma-xlsx'),
  ('D401099', 'D0029', 'doi-ma-xlsx'),
  ('D410075', 'D0010', 'doi-ma-xlsx'),
  ('D410353', 'D0011', 'doi-ma-xlsx'),
  ('D410578', 'D0013', 'doi-ma-xlsx'),
  ('D410873', 'D0012', 'doi-ma-xlsx'),
  ('D610004', 'D0023', 'doi-ma-xlsx'),
  ('D610064', 'D0019', 'doi-ma-xlsx'),
  ('D610100', 'D0015', 'doi-ma-xlsx'),
  ('D610103', 'D0016', 'doi-ma-xlsx'),
  ('D610105', 'D0009', 'doi-ma-xlsx'),
  ('D610331', 'D0014', 'doi-ma-xlsx'),
  ('D610423', 'D0003', 'doi-ma-xlsx'),
  ('D610472', 'D0004', 'doi-ma-xlsx'),
  ('K400013', 'K0002', 'doi-ma-xlsx'),
  ('L000220', 'L0022', 'doi-ma-xlsx'),
  ('L000963', 'L0006', 'doi-ma-xlsx'),
  ('L001347', 'K0001', 'doi-ma-xlsx'),
  ('L020028', 'L0013', 'doi-ma-xlsx'),
  ('L100940', 'L0014', 'ten-sapo'),
  ('L100941', 'L0015', 'ten-sapo'),
  ('L100942', 'L0011', 'doi-ma-xlsx'),
  ('L100943', 'L0012', 'doi-ma-xlsx'),
  ('L100944', 'L0008', 'doi-ma-xlsx'),
  ('L300109', 'L0042', 'xac-nhan-nguoi-dung'),
  ('L400186', 'L0017', 'ten-sapo'),
  ('L400187', 'L0002', 'doi-ma-xlsx'),
  ('L400236', 'L0016', 'ten-sapo'),
  ('L400311', 'L0003', 'doi-ma-xlsx'),
  ('L400745', 'L0005', 'doi-ma-xlsx'),
  ('L400997', 'L0033', 'doi-ma-xlsx'),
  ('L401038', 'L0028', 'ten-sapo'),
  ('L410585', 'L0009', 'doi-ma-xlsx'),
  ('L410885', 'L0010', 'doi-ma-xlsx'),
  ('L500412', 'L0004', 'doi-ma-xlsx'),
  ('L610007', 'L0030', 'doi-ma-xlsx'),
  ('L610013', 'L0007', 'doi-ma-xlsx'),
  ('L610274', 'L0001', 'doi-ma-xlsx'),
  ('M400545', 'M0001', 'doi-ma-xlsx'),
  ('M610105', 'M0002', 'doi-ma-xlsx'),
  ('M610108', 'M0003', 'doi-ma-xlsx'),
  ('M610115', 'M0004', 'ten-sapo'),
  ('MD64', 'D0002', 'doi-ma-xlsx'),
  ('N000903', 'N0005', 'doi-ma-xlsx'),
  ('N000905', 'N0053', 'ten-sapo'),
  ('N001323', 'N0020', 'doi-ma-xlsx'),
  ('N001347', 'N0011', 'doi-ma-xlsx'),
  ('N001361V', 'N0044', 'ten-sapo'),
  ('N101220', 'N0024', 'ten-sapo'),
  ('N101276', 'N0025', 'ten-sapo'),
  ('N300999', 'N0035', 'ten-sapo'),
  ('N301001', 'N0033', 'ten-sapo'),
  ('N400004', 'N0046', 'ten-sapo'),
  ('N400007', 'N0023', 'ten-sapo'),
  ('N400124', 'N0001', 'doi-ma-xlsx'),
  ('N400128', 'N0038', 'ten-sapo'),
  ('N400191', 'N0079', 'ten-sapo'),
  ('N400232', 'N0054', 'ten-sapo'),
  ('N401022', 'N0026', 'ten-sapo'),
  ('N401046', 'N0027', 'ten-sapo'),
  ('N401099', 'N0034', 'ten-sapo'),
  ('N401266', 'N0021', 'ten-sapo'),
  ('N401267', 'N0013', 'doi-ma-xlsx'),
  ('N401501', 'N0028', 'ten-sapo'),
  ('N405787', 'N0019', 'doi-ma-xlsx'),
  ('N410101', 'N0078', 'ten-sapo'),
  ('N4101016', 'N0078', 'ten-sapo'),
  ('N610001', 'N0082', 'ten-sapo'),
  ('N610004', 'N0040', 'ten-sapo'),
  ('N610005', 'N0009', 'doi-ma-xlsx'),
  ('N610005T', 'N0008', 'doi-ma-xlsx'),
  ('N610006', 'N0036', 'ten-sapo'),
  ('N610008', 'N0018', 'doi-ma-xlsx'),
  ('N610009', 'N0012', 'doi-ma-xlsx'),
  ('N610011', 'N0031', 'ten-sapo'),
  ('N610033', 'N0010', 'doi-ma-xlsx'),
  ('N610038', 'N0043', 'ten-sapo'),
  ('N610102', 'N0066', 'ten-sapo'),
  ('N610104', 'N0048', 'ten-sapo'),
  ('N610106', 'N0067', 'ten-sapo'),
  ('N610108', 'N0029', 'ten-sapo'),
  ('N610116', 'N0004', 'doi-ma-xlsx'),
  ('N610118', 'N0014', 'doi-ma-xlsx'),
  ('N610188', 'N0002', 'doi-ma-xlsx'),
  ('N610189', 'N0007', 'doi-ma-xlsx'),
  ('N610196', 'N0055', 'ten-sapo'),
  ('N610211', 'N0050', 'ten-sapo'),
  ('N610212', 'N0051', 'ten-sapo'),
  ('N610215', 'N0015', 'doi-ma-xlsx'),
  ('N610254', 'N0058', 'ten-sapo'),
  ('N610265', 'N0052', 'ten-sapo'),
  ('N610290', 'N0098', 'ten-sapo'),
  ('N610423', 'N0003', 'doi-ma-xlsx'),
  ('N620003', 'N0030', 'ten-sapo'),
  ('N620005', 'N0016', 'doi-ma-xlsx'),
  ('N620103', 'N0049', 'ten-sapo'),
  ('N620112', 'N0017', 'doi-ma-xlsx'),
  ('N620137', 'N0057', 'ten-sapo'),
  ('N620144', 'N0045', 'ten-sapo'),
  ('N630001', 'N0037', 'ten-sapo'),
  ('NM101', 'N0006', 'doi-ma-xlsx')
on conflict (old_code) do update set new_code = excluded.new_code, source = excluded.source, updated_at = now();

-- SKU cũ của các SPU tách theo cỡ đá → SPU mới (mã thay thế không có dấu "-")
insert into sales.sku_spu_overrides (sku, spu_code, reason) values
  ('B001521-5', 'B0019', 'đổi mã: tách theo cỡ đá 5li'),
  ('B001521-6', 'B0002', 'đổi mã: tách theo cỡ đá 6li'),
  ('B400815', 'B0012', 'đổi mã: tách theo cỡ đá 5li'),
  ('B400815-1', 'B0003', 'đổi mã: tách theo cỡ đá 6.5li — SUY RA (file đổi mã không có SKU này): kiểm tra lại'),
  ('B400815-V', 'B0003', 'đổi mã: tách theo cỡ đá 6.5li'),
  ('B401002-4', 'B0007', 'đổi mã: tách theo cỡ đá 4li'),
  ('B401002-5', 'B0009', 'đổi mã: tách theo cỡ đá 5li'),
  ('B401002-6', 'B0010', 'đổi mã: tách theo cỡ đá 6li')
on conflict (sku) do update set spu_code = excluded.spu_code, reason = excluded.reason, updated_at = now();

-- sales.spu_traffic_gain (Win Traffic cuốn chiếu, bản gốc ở migration 062) — thêm quy đổi mã cũ → mới
create or replace function sales.spu_traffic_gain(p jsonb) returns jsonb
language plpgsql stable
as $$
declare
  v_today date := (p->>'today')::date;
  v_days  int  := greatest(1, coalesce((p->>'days')::int, 3));
  v_has_channels boolean := p ? 'channels' and jsonb_typeof(p->'channels') = 'array';
  v_channels text[] := case when p ? 'channels' and jsonb_typeof(p->'channels') = 'array' then array(select jsonb_array_elements_text(p->'channels')) else '{}' end;
  v_base  date;
  v_result jsonb;
begin
  v_base := v_today - v_days;   -- mốc đầu cửa sổ: cuối ngày (hôm nay − N)

  with
  changed as (select distinct post_id from social.post_daily where date > v_base),   -- video có ảnh chụp mới hơn mốc = đã đổi trong cửa sổ
  b as (
    select po.id, po.product_codes, (po.published_at at time zone 'Asia/Ho_Chi_Minh')::date as pday,
           coalesce(po.views, 0) as views, coalesce(po.comments, 0) as comments
    from social.posts po
    join social.channels ch on ch.id = po.channel_id and ch.is_active
    where po.kind in ('video', 'reel') and cardinality(po.product_codes) > 0
      and (not v_has_channels or po.channel_id = any(v_channels))
      and (po.published_at >= (v_base + 1)::timestamptz - interval '7 hours' or po.id in (select post_id from changed))
  ),
  snap as (
    select b.id, s.v0, s.c0
    from b
    join lateral (select d.views as v0, d.comments as c0 from social.post_daily d where d.post_id = b.id and d.date <= v_base order by d.date desc limit 1) s on true
  ),
  g as (
    select b.id, b.product_codes,
      case when b.pday > v_base then b.views
           when s.id is not null then greatest(b.views - coalesce(s.v0, 0), 0) end as gv,
      case when b.pday > v_base then b.comments
           when s.id is not null and s.c0 is not null then greatest(b.comments - s.c0, 0)
           when s.id is not null and b.views = coalesce(s.v0, 0) then 0 end as gc
    from b left join snap s on s.id = b.id
  ),
  -- quy mã cũ về mã SPU mới (sales.spu_aliases); một bài gắn cả mã cũ và mã mới của cùng SPU chỉ tính MỘT lần
  pc as (
    select distinct g.id, coalesce(al.new_code, upper(c)) as code, g.gv, g.gc
    from g cross join lateral unnest(g.product_codes) c
    left join sales.spu_aliases al on al.old_code = upper(c)
  ),
  per as (
    select code, sum(coalesce(gv, 0))::bigint as views, sum(coalesce(gc, 0))::bigint as comments,
           count(*)::int as videos, count(*) filter (where gv is null)::int as unknown
    from pc
    group by code
  )
  select jsonb_build_object(
    'base', v_base,
    'rows', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'views', views, 'comments', comments, 'videos', videos, 'unknown', unknown) order by code) from per where views > 0 or comments > 0), '[]'::jsonb),
    'videos', (select count(*) from b), 'unknown', (select count(*) from g where gv is null)
  ) into v_result;
  return v_result;
end;
$$;

grant execute on function sales.spu_traffic_gain(jsonb) to service_role;
revoke all on function sales.spu_traffic_gain(jsonb) from anon, authenticated, public;

notify pgrst, 'reload schema';
