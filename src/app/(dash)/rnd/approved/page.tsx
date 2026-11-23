import WorkspacePage from "../WorkspacePage";

// Bảng Đã duyệt (P1): mẫu đã duyệt chờ R&D chọn mẫu nào đi sản xuất trước. Trạng thái → "Bắt đầu sản xuất" → sang P2 (Sản xuất mẫu).
// Mô tả luồng, cột ẩn mặc định, quyền thêm / xoá: components/grid/RndWorkspace (META) + lib/rnd-workspace.
export default function ApprovedPage() {
  return <WorkspacePage table="approved" />;
}
