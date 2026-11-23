import WorkspacePage from "../WorkspacePage";

// Bảng Duyệt SP Win: Quản lý / trưởng team chọn kết quả → WIN sang Theo dõi hiệu quả (+ chuyển Sao Biển nếu có kho Source); FAIL dừng mẫu.
// Mô tả luồng, cột ẩn mặc định, quyền thêm / xoá: components/grid/RndWorkspace (META) + lib/rnd-workspace.
export default function WinPage() {
  return <WorkspacePage table="win" />;
}
