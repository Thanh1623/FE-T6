import WorkspacePage from "../WorkspacePage";

// Bảng Theo dõi hiệu quả sau mở bán: số bán 30 ngày tính từ Ngày mở bán (mặc định = ngày duyệt Win).
// Mô tả luồng, cột ẩn mặc định, quyền thêm / xoá: components/grid/RndWorkspace (META) + lib/rnd-workspace.
export default function EffectPage() {
  return <WorkspacePage table="effect" />;
}
