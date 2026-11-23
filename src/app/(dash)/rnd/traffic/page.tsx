import WorkspacePage from "../WorkspacePage";

// Bảng Traffic: chỉ mẫu đã lên video — số liệu video + số bán tự động, đánh giá KPI của hệ thống.
// Mô tả luồng, cột ẩn mặc định, quyền thêm / xoá: components/grid/RndWorkspace (META) + lib/rnd-workspace.
export default function TrafficPage() {
  return <WorkspacePage table="traffic" />;
}
