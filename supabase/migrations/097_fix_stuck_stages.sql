-- 097: Đưa các mẫu đang KẸT MỐC về đúng mốc theo dữ liệu thật. CHẠY TAY trong Supabase SQL Editor. Chạy lại vẫn an toàn.
--   Nguyên nhân: đơn hàng / yêu cầu source của một số mẫu được nhập từ file hoặc sửa thẳng ở bảng nên luồng tự chuyển mốc không chạy
--   (vd MST0028 / MST0063 / MST0071: đơn đã "Hoàn thành mẫu" + source quay đã Đạt nhưng mốc vẫn ở P2; MST0075: source Đạt nhưng vẫn ở P3).
--   Luật (khớp ứng dụng): đơn đã Hoàn thành mẫu → ít nhất P3; mọi yêu cầu source (ưu tiên "quay trên tay", không có thì lấy yêu cầu còn lại) đã Duyệt Đạt → P4.
--   Ghi nhật ký mẫu (product_events) cho mỗi lần chuyển. Mẫu đã dừng (killed_at) không đụng tới.
--   Chưa chạy: cột "Giai đoạn hiện tại" ở ứng dụng vẫn hiện đúng mốc thực tế (tính theo dữ liệu); chạy để mốc đã lưu (tab P0–P6, Kanban) khớp theo.

with src as (   -- source của mẫu: yêu cầu "quay trên tay" (không phải chỉ "Quay chế tác"); không có thì lấy mọi yêu cầu
  select m.product_id,
         bool_and(m.approval = 'pass') filter (where m.request_type <> 'Quay chế tác') as hand_ok,
         count(*) filter (where m.request_type <> 'Quay chế tác') as hand_n,
         bool_and(m.approval = 'pass') as all_ok,
         count(*) as all_n
  from rnd.media_requests m group by m.product_id
),
done_order as (
  select distinct o.product_id from rnd.sample_orders o where o.status in ('Hoàn thành mẫu', 'Hoàn thành')
),
target as (
  select p.id, p.stage as from_stage,
         case
           when p.stage in ('p2', 'p3') and coalesce(case when s.hand_n > 0 then s.hand_ok else s.all_ok end, false)
                and (p.stage = 'p3' or d.product_id is not null) then 'p4'
           when p.stage = 'p2' and d.product_id is not null then 'p3'
         end as to_stage
  from rnd.products p
  left join src s on s.product_id = p.id
  left join done_order d on d.product_id = p.id
  where p.killed_at is null and p.stage in ('p2', 'p3')
),
moved as (
  update rnd.products p set stage = t.to_stage, stage_at = now()
  from target t where p.id = t.id and t.to_stage is not null
  returning p.id, t.from_stage, t.to_stage
)
insert into rnd.product_events (product_id, actor_id, action, changes)
select id, null, 'stage_changed', jsonb_build_object('stage', jsonb_build_array(from_stage, to_stage), 'note', jsonb_build_array(null, 'Đồng bộ mốc theo dữ liệu (migration 097)')) from moved;

notify pgrst, 'reload schema';
