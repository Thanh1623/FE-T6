"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeRole = exports.roleLabel = exports.ROLES = exports.ROLE_LABELS = void 0;
exports.ROLE_LABELS = {
    admin: "Quản lý", rnd: "R&D", design3d: "Thiết kế 3D", media: "Media",
};
exports.ROLES = Object.keys(exports.ROLE_LABELS);
// Nhãn vai trò của 1 người: R&D kèm tên team ("R&D · Hồng Ngọc"); vai trò khác giữ nguyên
const roleLabel = (role, teamName) => (role === "rnd" && teamName ? `${exports.ROLE_LABELS.rnd} · ${teamName}` : exports.ROLE_LABELS[role]);
exports.roleLabel = roleLabel;
// Giá trị vai trò đọc từ DB → vai trò hiện hành. Tài khoản "saobien" cũ (trước khi gộp) được hiểu là "rnd",
// nên app chạy đúng cả khi chưa chạy migration 018 dọn dữ liệu.
const normalizeRole = (r) => (r === "saobien" ? "rnd" : r);
exports.normalizeRole = normalizeRole;
