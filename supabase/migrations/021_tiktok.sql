-- Chạy TAY trong Supabase SQL Editor (project fb-traffic). Chạy lại được.
-- TikTok (Display API, tài khoản cá nhân): mỗi chủ tài khoản đăng nhập TikTok → hệ thống giữ access token (24 giờ) + refresh token (~1 năm).
-- Token nằm ở schema private (không qua API), chỉ đọc/ghi qua hàm security definer cho service_role — giống token Page Facebook.

create table if not exists private.tiktok_tokens (
  channel_id         text primary key references social.channels(id) on delete cascade,
  open_id            text not null,
  access_token       text not null,
  refresh_token      text not null,
  access_expires_at  timestamptz not null,
  refresh_expires_at timestamptz not null,
  scope              text,
  updated_at         timestamptz not null default now()
);
alter table private.tiktok_tokens enable row level security;

create or replace function social.save_tiktok_token(
  p_channel_id text, p_open_id text, p_access text, p_refresh text, p_access_exp timestamptz, p_refresh_exp timestamptz, p_scope text
) returns void
language sql security definer set search_path = '' as $$
  insert into private.tiktok_tokens (channel_id, open_id, access_token, refresh_token, access_expires_at, refresh_expires_at, scope)
  values (p_channel_id, p_open_id, p_access, p_refresh, p_access_exp, p_refresh_exp, p_scope)
  on conflict (channel_id) do update set
    open_id = excluded.open_id, access_token = excluded.access_token, refresh_token = excluded.refresh_token,
    access_expires_at = excluded.access_expires_at, refresh_expires_at = excluded.refresh_expires_at,
    scope = excluded.scope, updated_at = now()
$$;

create or replace function social.tiktok_tokens()
returns table (channel_id text, open_id text, access_token text, refresh_token text, access_expires_at timestamptz, refresh_expires_at timestamptz, scope text)
language sql stable security definer set search_path = '' as $$
  select t.channel_id, t.open_id, t.access_token, t.refresh_token, t.access_expires_at, t.refresh_expires_at, t.scope
  from private.tiktok_tokens t join social.channels c on c.id = t.channel_id where c.is_active
$$;

revoke execute on function social.save_tiktok_token(text, text, text, text, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke execute on function social.tiktok_tokens() from public, anon, authenticated;
grant execute on function social.save_tiktok_token(text, text, text, text, timestamptz, timestamptz, text) to service_role;
grant execute on function social.tiktok_tokens() to service_role;

notify pgrst, 'reload schema';
