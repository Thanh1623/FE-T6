-- 073: Nhật ký hệ thống — ghi lại các thao tác cập nhật dữ liệu (nhập file, đồng bộ, đổi cài đặt), hiện ở Cài đặt → tab "Nhật ký" (chỉ Quản lý).
-- CHẠY TAY trong Supabase SQL Editor. Chạy lại an toàn. Chưa chạy thì app vẫn hoạt động bình thường, chỉ chưa ghi nhật ký (lỗi ghi bị bỏ qua).
--  • Chỉ máy chủ (service_role) đọc / ghi; anon / authenticated bị thu quyền, bật RLS không policy.
--  • Không lưu nội dung file, chỉ tên file và các số tổng. Tự dọn dòng cũ hơn 180 ngày (lib/system-log.ts).

create table if not exists core.system_logs (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  kind       text not null,                       -- import_inventory · import_sales · import_images · import_receipts · sync_videos · sync_all · refresh_summary · settings_* …
  ok         boolean not null default true,
  summary    text not null default '',
  detail     jsonb,
  actor_id   uuid,
  actor_name text,
  source     text not null default 'user' check (source in ('user', 'auto'))
);
create index if not exists system_logs_at_idx on core.system_logs (at desc);
create index if not exists system_logs_kind_idx on core.system_logs (kind, at desc);

alter table core.system_logs enable row level security;
grant all on core.system_logs to service_role;
revoke all on core.system_logs from anon, authenticated, public;

notify pgrst, 'reload schema';
