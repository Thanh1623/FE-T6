-- 039: Đánh giá khi duyệt thương mại hoá (P6) + báo cáo chi phí test. CHẠY TAY trong Supabase SQL Editor, SAU 038. Chạy lại vẫn an toàn.
--  • Thêm cho mẫu: chi phí quay mẫu / video (nhập tay), chi phí vận hành mỗi sản phẩm (nhập tay), thời gian sản xuất hàng loạt (ngày), SL đặt tối thiểu (bội số đặt).
--  • rnd.commercial_reviews: ảnh chụp các chỉ số (hoà vốn, thời gian hoà vốn, SL đề xuất đặt…) tại lúc duyệt, để đối chiếu về sau.
--  • Ngưỡng đánh giá nằm ở core.settings key commercial_rules (Quản lý chỉnh ở trang KPI) — không cần bảng riêng.

alter table rnd.products
  add column if not exists video_cost    bigint  check (video_cost is null or video_cost >= 0),      -- chi phí quay + dựng video (đồng)
  add column if not exists ops_cost      bigint  check (ops_cost is null or ops_cost >= 0),          -- chi phí vận hành mỗi sản phẩm (đồng): phí sàn, vận chuyển, đóng gói; trống = dùng % mặc định
  add column if not exists lead_days     integer check (lead_days is null or lead_days >= 0),        -- ngày từ lúc đặt tới lúc hàng về kho (sản xuất hàng loạt); trống = mặc định 30
  add column if not exists min_order_qty integer check (min_order_qty is null or min_order_qty >= 1); -- bội số đặt tối thiểu

create table if not exists rnd.commercial_reviews (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references rnd.products(id) on delete cascade,
  decided_by   uuid references core.profiles(id) on delete set null,
  decided_at   timestamptz not null default now(),
  decision     text not null check (decision in ('approve', 'reject')),
  suggestion   text check (suggestion in ('approve', 'conditional', 'reject')),   -- gợi ý của hệ thống lúc duyệt
  approved_qty integer,
  note         text,
  snapshot     jsonb not null                                                     -- toàn bộ chỉ số + ngưỡng lúc duyệt
);
create index if not exists commercial_reviews_product_idx on rnd.commercial_reviews (product_id, decided_at desc);

alter table rnd.commercial_reviews enable row level security;
grant all on rnd.commercial_reviews to service_role;

notify pgrst, 'reload schema';
