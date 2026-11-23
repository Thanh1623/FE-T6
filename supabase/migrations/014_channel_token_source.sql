-- 014: ghi nhận kênh được phát hiện qua token nào (Người dùng hệ thống / token cá nhân) và lần cuối còn thấy.
-- Chạy trên project fb-traffic, sau 013. Chạy lại vẫn an toàn.
-- Dùng cho trang "Kết nối Meta": kênh lâu không còn thấy = token đã mất quyền với kênh đó.

alter table social.channels add column if not exists token_source text check (token_source in ('system', 'user'));
alter table social.channels add column if not exists last_seen_at timestamptz;

comment on column social.channels.token_source is 'Token phát hiện kênh gần nhất: system = Người dùng hệ thống (Business Manager), user = token cá nhân';
comment on column social.channels.last_seen_at is 'Lần cuối token còn liệt kê kênh này (me/accounts)';

notify pgrst, 'reload schema';
