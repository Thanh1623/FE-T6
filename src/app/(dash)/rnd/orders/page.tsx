import WorkspacePage from "../WorkspacePage";

// Bảng Theo dõi đặt hàng. Trạng thái theo Cấu hình; "Quay chế tác" → tạo yêu cầu Media; "Hoàn thành" → nhận mẫu, sang Media.
// Mô tả luồng, cột ẩn mặc định, quyền thêm / xoá: components/grid/RndWorkspace (META) + lib/rnd-workspace.
export default function OrdersPage() {
  return <WorkspacePage table="orders" />;
}
