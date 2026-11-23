# Nhật ký hệ thống (Cài đặt → tab "Nhật ký")

Ghi lại các thao tác **cập nhật dữ liệu** để Quản lý biết ai / hệ thống đã làm gì, lúc nào, kết quả ra sao. Chỉ **Quản lý** thấy tab này (`/kpi?tab=log`).

- Bảng `core.system_logs` (migration `073_system_logs.sql`, chạy tay trong Supabase SQL Editor): thời gian, loại thao tác (`kind`), kết quả (`ok`), tóm tắt, chi tiết (jsonb), người làm (`actor_name`) hoặc tự động (`source = auto`). Tự xoá dòng quá 180 ngày.
- Ghi bằng `src/lib/system-log.ts`: `logSystem()` ghi một dòng; `logged()` bọc một server action (kiểm quyền, chạy, ghi thành công / lỗi rồi trả nguyên kết quả). **Ghi nhật ký không bao giờ làm hỏng thao tác chính** (lỗi, kể cả chưa chạy migration 073, chỉ in ra console).
- Không lưu nội dung file, chỉ tên file và các số tổng.

| Loại (`kind`) | Nơi ghi |
|---|---|
| `import_inventory`, `import_sales` | `spu/actions.ts` (Nhập tồn kho, Nhập số bán) |
| `import_images` | `kpi/image-actions.ts` (ảnh / danh sách sản phẩm) |
| `import_receipts` | `kpi/receipt-actions.ts` (đơn nhập hàng) |
| `sync_videos` | `lib/sync/api-videos.ts` `runApiVideoSync` (nút ở Cài đặt và lịch hằng ngày) |
| `sync_all` | `lib/sync/index.ts` `syncAll` (nút "Đồng bộ" và lịch GitHub Actions; mỗi lô một dòng) |
| `refresh_summary` | `lib/spu-summary.ts` `refreshSpuSummary` (làm mới bảng tổng hợp SPU; tự chạy sau nhập file, đồng bộ, đổi KPI) |
| `settings_kpi`, `_window`, `_win`, `_stock`, `_video`, `_commercial` | `kpi/actions.ts` (lưu cài đặt) |

Thêm loại mới: gọi `logSystem` / `logged` với `kind` mới và thêm tên hiển thị vào `LOG_KINDS` (`lib/system-log.ts`).
