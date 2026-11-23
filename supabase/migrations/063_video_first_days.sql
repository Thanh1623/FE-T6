-- 063: Lượt xem / người xem của TỪNG VIDEO trong N ngày đầu kể từ NGÀY ĐĂNG của chính video (để chấm Video Win theo ngày đăng). CHẠY TAY trong Supabase SQL Editor, SAU 062. Chạy lại vẫn an toàn.
--  • Tài liệu: docs/KIEN-TRUC-TONG-HOP-SPU.md (mục 6.2).
--  • sales.video_first_days(p): p = { ids: [mã bài], days: N }. Với mỗi bài trả { id, views, viewers, exact }.
--      exact = true : bài đã đủ N ngày kể từ ngày đăng và có ảnh chụp ≤ (ngày đăng + N) → lấy ảnh chụp gần nhất đó (đồng bộ ghi ảnh chụp mỗi khi chỉ số đổi, nên đó là số đúng tại mốc N ngày).
--      exact = false, unknown = false: bài CHƯA đủ N ngày → trả số HIỆN TẠI (tạm tính, vẫn đang trong N ngày đầu).
--      unknown = true: bài ĐÃ đủ N ngày nhưng chưa từng được chụp → KHÔNG biết số tại mốc đó (số hiện tại đã cộng dồn quá N ngày nên không dùng được) → không chấm Win.

create or replace function sales.video_first_days(p jsonb) returns jsonb
language plpgsql stable
as $$
declare
  v_days int := greatest(1, coalesce((p->>'days')::int, 3));
  v_ids  text[] := coalesce(array(select jsonb_array_elements_text(coalesce(p->'ids', '[]'::jsonb))), '{}');
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'views', t.views, 'viewers', t.viewers, 'exact', t.exact, 'unknown', (not t.exact and t.matured)))
    from (
      select po.id,
             case when s.post_id is not null then s.views else coalesce(po.views, 0) end as views,
             case when s.post_id is not null then coalesce(s.viewers, 0) else coalesce(po.viewers, 0) end as viewers,
             (s.post_id is not null) as exact,
             ((po.published_at at time zone 'Asia/Ho_Chi_Minh')::date + v_days <= v_today) as matured
      from social.posts po
      left join lateral (
        select d.post_id, d.views, d.viewers
        from social.post_daily d
        where d.post_id = po.id
          and (po.published_at at time zone 'Asia/Ho_Chi_Minh')::date + v_days <= v_today
          and d.date <= (po.published_at at time zone 'Asia/Ho_Chi_Minh')::date + v_days
        order by d.date desc limit 1
      ) s on true
      where po.id = any(v_ids)
    ) t
  ), '[]'::jsonb);
end;
$$;

grant execute on function sales.video_first_days(jsonb) to service_role;
revoke all on function sales.video_first_days(jsonb) from anon, authenticated, public;

notify pgrst, 'reload schema';
