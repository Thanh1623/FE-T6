import WorkspacePage from "./WorkspacePage";

// Bảng Sưu tầm (sheet "Nghiên cứu SP"). Duyệt mẫu = "Đã duyệt" → bản ghi tự sang bảng Thiết kế 3D.
// Mô tả luồng, cột ẩn mặc định, quyền thêm / xoá: components/grid/RndWorkspace (META) + lib/rnd-workspace.
export default function CollectionPage() {
  return <WorkspacePage table="collection" />;
}
