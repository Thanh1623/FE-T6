-- 099: Mọi mẫu trong quy trình R&D thuộc team R&D (team "PT Sản Phẩm"). CHẠY TAY trong Supabase SQL Editor. Chạy lại vẫn an toàn.
--   Trước đây team của mẫu = team của người sưu tầm (Đá quý, Hồng Ngọc, Global…) → báo cáo theo team / chi phí theo team bị chia nhỏ sai.
--   Ghi nhật ký mẫu (product_events) cho mỗi mẫu đổi team. Mẫu mới thêm từ nay mặc định team PT Sản Phẩm (ứng dụng).
with t as (select id from core.teams where name = 'PT Sản Phẩm' limit 1),
moved as (
  update rnd.products p set team_id = t.id, updated_at = now()
  from t
  where p.stage is not null and p.team_id is distinct from t.id
  returning p.id, t.id as new_team
)
insert into rnd.product_events (product_id, actor_id, action, changes)
select id, null, 'updated', jsonb_build_object('team_id', jsonb_build_array(null, new_team), 'note', jsonb_build_array(null, 'Mẫu R&D thuộc team PT Sản Phẩm (migration 099)')) from moved;
