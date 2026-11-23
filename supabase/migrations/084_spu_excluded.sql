-- 084: LOẠI TRỪ SPU thuộc nhóm "CÔNG CỤ DỤNG CỤ" (loại sản phẩm trên Sapo: hộp, khăn lau bạc, bộ đo ni, kiềm, máy hàn, quà tặng, mã trung gian…) khỏi mọi thống kê SPU
-- (tồn kho, Active, phân loại tồn, Theo dõi hiệu quả SPU, Dashboard, QLHH): các mã này không phải sản phẩm bán và hay lệch tồn / lỗi đồng bộ.
-- CHẠY TAY trong Supabase SQL Editor. Chạy lại vẫn an toàn. Danh sách lấy từ file Sapo sp2910.xlsx (cột "Loại sản phẩm" = CÔNG CỤ DỤNG CỤ, 51 mã).
-- Thêm mã mới sau này: insert into sales.spu_excluded (code, name) values ('MÃ', 'Tên') on conflict do nothing; (hoặc bỏ loại trừ: delete from sales.spu_excluded where code = 'MÃ';) rồi bấm Đồng bộ ngay để bảng tổng hợp tính lại.
create table if not exists sales.spu_excluded (
  code       text primary key,
  name       text,
  reason     text not null default 'Công cụ dụng cụ',
  created_at timestamptz not null default now()
);
alter table sales.spu_excluded enable row level security;
grant all on sales.spu_excluded to service_role;
revoke all on sales.spu_excluded from anon, authenticated;

insert into sales.spu_excluded (code, name) values
  ('BCS01', 'Búa cao su'),
  ('C500021', 'ĐÁNH SÁNG'),
  ('C500045', 'Tấm bạc S925'),
  ('C500162', 'Dây buộc tóc (Quà tặng)'),
  ('C500163', 'Nút bông tai bạc S925'),
  ('C500203', '(DỪNG BÁN) Combo gấu hoa dây chỉ đỏ'),
  ('C500380', '(DỪNG BÁN) Móc khoá bấm'),
  ('C500389', 'Bộ đo ni nhẫn US màu vàng'),
  ('C500391', 'Bộ đo ni nhẫn tiêu chuẩn HK màu vàng'),
  ('C500393', 'Bộ đo ni nhẫn tiêu chuẩn HK màu tím'),
  ('C500395', 'Bộ đo ni cổ tay màu tím'),
  ('C500440', 'Thanh bạc tròn 20cm S925'),
  ('C800013', '(CHẾ TÁC) Cài áo thiết kế đính đá 18k'),
  ('CGS01', 'Cây gõ size nhẫn'),
  ('CMN01', 'Cây mã não'),
  ('CP01', 'Compa vẽ màu'),
  ('CTS01', 'Chùm thử size nhẫn'),
  ('D100061', '(DỪNG BÁN) Dây hạt gỗ nâu'),
  ('H001', 'Hộp VCB âm dương to'),
  ('H002', 'Khăn lau bạc Viễn Chí Bảo'),
  ('H004', 'Nút bông tai cao su - 1 đôi'),
  ('H005', 'Hộp VCB âm dương nhỏ 5x5x3cm'),
  ('H006', 'Hộp đựng nhẫn DR'),
  ('H008', 'HỘP MIÊU BẠC'),
  ('H012', 'Hộp đựng trang sức'),
  ('H013', '(DỪNG BÁN) Hộp Vòng Cartier'),
  ('KMD01', 'Kiềm mũi dài'),
  ('KMP01', 'Kiềm mũi phẳng'),
  ('KMT01', 'Kiềm mũi tròn'),
  ('KT04C', '(DỪNG BÁN) Cài tóc đồng hồ'),
  ('KT07', '(DỪNG BÁN) Kẹp tóc càng cua kim loại KT07-11'),
  ('KT08', '(DỪNG BÁN) Kẹp tóc càng cua màu hot trend Minco Accessories '),
  ('KT10', 'Dây buộc tóc đơn giản - random màu'),
  ('KT11', 'Dây buộc tóc (Quà tặng)'),
  ('LX', 'Lì Xì'),
  ('M300528', 'Lá bồ đề Phật Văn Thù Bồ Tát'),
  ('M400551', 'Móc chữ S bạc ta'),
  ('MATRUNGGIANBAC', 'Mã trung gian Bạc'),
  ('MATRUNGGIANVANG', 'Mã trung gian VÀNG'),
  ('MDL01', 'Máy đánh lửa đa hướng'),
  ('MDL02', 'Máy đánh lửa đơn'),
  ('MH01', 'Máy hàn 5A'),
  ('MK001', 'Móc khóa Madala Bình An May Mắn'),
  ('MR01', 'Nước rửa bạc Miêu bạc'),
  ('MR02', 'Nước rửa bạc Miêu bạc nhãn xanh'),
  ('MS01', 'MÁY SỦI'),
  ('NRB001', 'Nước rửa bạc Viễn nhãn xanh'),
  ('SPAO', 'Sản phẩm ảo của sàn'),
  ('T001', 'Túi đựng hàng viễn'),
  ('THIEP', 'Thiệp quà tặng'),
  ('TUI', 'Túi quà tặng')
on conflict (code) do nothing;

notify pgrst, 'reload schema';
