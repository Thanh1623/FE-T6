-- 096: Đổi tên trạng thái đơn đặt hàng mẫu cho khớp thực tế: đã có sẵn 3D nên đặt xưởng = chốt đúc luôn. CHẠY TAY trong Supabase SQL Editor. Chạy lại vẫn an toàn.
--   Trước: Đặt hàng → Chốt đúc → Hoàn thành (+ Huỷ)   — "Đặt hàng" thực ra là đơn NHÁP hệ thống tự tạo khi 3D đạt, chưa đặt xưởng
--   Sau  : Chưa đặt → Đã đặt hàng → Hoàn thành mẫu (+ Huỷ) — "Chưa đặt" = đơn nháp; "Đã đặt hàng" = đã đặt xưởng (cũ: Chốt đúc); "Hoàn thành mẫu" = xưởng giao xong (cũ: Hoàn thành)
--  • Cập nhật: danh sách trạng thái ở Cấu hình (core.settings.rnd_options.order_status), các đơn hiện có (rnd.sample_orders.status) và nhật ký trạng thái (rnd.status_log).
--  • Chưa chạy migration này: ứng dụng vẫn đọc đúng ("Đặt hàng" → hiện "Chưa đặt", "Chốt đúc" → hiện "Đã đặt hàng"), nhưng nên chạy để dữ liệu và Cấu hình khớp tên mới.

-- 1) Đơn hiện có
update rnd.sample_orders set status = 'Chưa đặt'    where status = 'Đặt hàng';
update rnd.sample_orders set status = 'Đã đặt hàng' where status = 'Chốt đúc';
update rnd.sample_orders set status = 'Hoàn thành mẫu' where status = 'Hoàn thành';

-- 2) Nhật ký trạng thái (thời gian ở từng bước)
update rnd.status_log set value = 'Chưa đặt'    where entity = 'order' and value = 'Đặt hàng';
update rnd.status_log set value = 'Đã đặt hàng' where entity = 'order' and value = 'Chốt đúc';
update rnd.status_log set value = 'Hoàn thành mẫu' where entity = 'order' and value = 'Hoàn thành';

-- 3) Danh sách trạng thái trong Cấu hình (giữ các trạng thái người dùng tự thêm; đổi tên + cờ cho 2 trạng thái trên)
update core.settings
set value = jsonb_set(
  value, '{order_status}',
  (
    select coalesce(jsonb_agg(
      case
        when x->>'value' = 'Đặt hàng' then '{"value": "Chưa đặt", "color": 18, "flag": "draft"}'::jsonb
        when x->>'value' = 'Chốt đúc' then (x || '{"value": "Đã đặt hàng"}'::jsonb)
        when x->>'value' = 'Hoàn thành' then (x || '{"value": "Hoàn thành mẫu"}'::jsonb)
        else x
      end order by ord), '[]'::jsonb)
    from jsonb_array_elements(value->'order_status') with ordinality as t(x, ord)
  )
)
where key = 'rnd_options' and jsonb_typeof(value->'order_status') = 'array';

notify pgrst, 'reload schema';
