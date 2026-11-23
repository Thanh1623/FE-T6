// Vai trò dùng chung server + client (không "server-only")
// "R&D" là MỘT vai trò (khoá "rnd") gộp vai trò Sao Biển cũ: team Sao Biển có bộ phận R&D riêng.
// Khi hiển thị cho người dùng cụ thể thì kèm tên team: "R&D · Hồng Ngọc" (xem roleLabel).
export type Role = "admin" | "rnd" | "design3d" | "media";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Quản lý", rnd: "R&D", design3d: "Thiết kế 3D", media: "Media",
};
export const ROLES = Object.keys(ROLE_LABELS) as Role[];

// Nhãn vai trò của 1 người: R&D kèm tên team ("R&D · Hồng Ngọc"); vai trò khác giữ nguyên
export const roleLabel = (role: Role, teamName?: string | null) => (role === "rnd" && teamName ? `${ROLE_LABELS.rnd} · ${teamName}` : ROLE_LABELS[role]);

// Giá trị vai trò đọc từ DB → vai trò hiện hành. Tài khoản "saobien" cũ (trước khi gộp) được hiểu là "rnd",
// nên app chạy đúng cả khi chưa chạy migration 018 dọn dữ liệu.
export const normalizeRole = (r: string): Role => (r === "saobien" ? "rnd" : (r as Role));
