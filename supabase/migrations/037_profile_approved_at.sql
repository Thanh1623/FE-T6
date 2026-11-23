-- 037: Ghi nhận thời điểm Quản lý DUYỆT tài khoản (core.profiles.approved_at). CHẠY TAY trong Supabase SQL Editor, SAU 036. Chạy lại vẫn an toàn.
--  • Lỗi cũ: "chờ duyệt" được suy ra từ "đang khoá + chưa từng đăng nhập". Người mới đăng ký thử đăng nhập một lần (bị chặn vì chưa duyệt) thì Supabase
--    vẫn ghi last_sign_in_at → tài khoản rơi sang mục "Đã khoá" dù chưa ai duyệt, và không còn nút Từ chối.
--  • Giờ: approved_at null + is_active = false → CHỜ DUYỆT (đăng nhập thử bao nhiêu lần cũng vẫn chờ duyệt); đã duyệt rồi mà bị khoá → "Đã khoá".
--  • Dữ liệu cũ giữ nguyên cách phân loại hiện tại: đang hoạt động → coi là đã duyệt; đang khoá và đã từng đăng nhập → đã duyệt (nay bị khoá);
--    đang khoá và chưa đăng nhập lần nào → vẫn chờ duyệt.

alter table core.profiles add column if not exists approved_at timestamptz;

update core.profiles p set approved_at = coalesce(u.last_sign_in_at, p.created_at, now())
  from auth.users u
 where u.id = p.id and p.approved_at is null and (p.is_active or u.last_sign_in_at is not null);
update core.profiles set approved_at = coalesce(created_at, now()) where approved_at is null and is_active;

notify pgrst, 'reload schema';
