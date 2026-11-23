import WorkspacePage from "../WorkspacePage";

// Bảng Thiết kế 3D. Người vẽ báo "Hoàn thành" → R&D / trưởng team chọn Duyệt 3D = "Đạt" → tự sang bảng Theo dõi đặt hàng.
// Mô tả luồng, cột ẩn mặc định, quyền thêm / xoá: components/grid/RndWorkspace (META) + lib/rnd-workspace.
export default function DesignPage() {
  return <WorkspacePage table="design" />;
}
