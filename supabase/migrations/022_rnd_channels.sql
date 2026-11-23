-- Chạy TAY trong Supabase SQL Editor (project fb-traffic). Chạy lại được.
-- Đánh dấu Page / kênh DO R&D QUẢN LÝ (đăng video sản phẩm mẫu). Trang "Video R&D" chỉ liệt kê bài của các kênh này
-- và hiển thị cho mọi team (không giới hạn theo team) để team chọn video win / sản phẩm đẹp rồi lấy source.
alter table social.channels add column if not exists is_rnd boolean not null default false;
create index if not exists channels_rnd_idx on social.channels (is_rnd) where is_rnd and is_active;
notify pgrst, 'reload schema';
