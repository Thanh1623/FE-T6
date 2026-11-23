import WorkspacePage from "../WorkspacePage";

// Bảng Media: nhiều yêu cầu / mẫu. Mọi yêu cầu của mẫu "Đạt" → mẫu sang bảng Traffic.
// Mô tả luồng, cột ẩn mặc định, quyền thêm / xoá: components/grid/RndWorkspace (META) + lib/rnd-workspace.
export default function MediaPage() {
  return <WorkspacePage table="media" />;
}
