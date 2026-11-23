-- 029: Đảm bảo các cột chỉ số của social.posts luôn có default 0 và not null
alter table social.posts
  alter column views set default 0,
  alter column viewers set default 0,
  alter column reactions set default 0,
  alter column clicks set default 0,
  alter column video_views set default 0;

notify pgrst, 'reload schema';
