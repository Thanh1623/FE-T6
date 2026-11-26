"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRndEditor = exports.canApprove = exports.inTeam = exports.canSeeProfit = exports.getCurrentUser = exports.roleLabel = exports.ROLE_LABELS = void 0;
exports.requireUser = requireUser;
exports.requireActionUser = requireActionUser;
exports.profileNames = profileNames;
require("server-only");
const react_1 = require("react");
const cache_1 = require("next/cache");
const cache_tags_1 = require("@/lib/cache-tags");
const navigation_1 = require("next/navigation");
const admin_1 = require("@/lib/supabase/admin");
const server_1 = require("@/lib/supabase/server");
const roles_1 = require("@/lib/roles");
var roles_2 = require("@/lib/roles");
Object.defineProperty(exports, "ROLE_LABELS", { enumerable: true, get: function () { return roles_2.ROLE_LABELS; } });
Object.defineProperty(exports, "roleLabel", { enumerable: true, get: function () { return roles_2.roleLabel; } });
// Hồ sơ người dùng lưu tạm tối đa 60 giây (dùng chung mọi máy chủ) — bớt 1 lượt hỏi cơ sở dữ liệu (~0,2–0,3 giây) ở MỖI trang.
// Khoá tài khoản / đổi vai trò / đổi team đều gọi bust(TAG.profiles) (users/actions) nên có hiệu lực ngay, không phải chờ hết hạn.
const profileOf = (uid) => (0, cache_1.unstable_cache)(async () => {
    const { data } = await admin_1.sb.core().from("profiles").select("*").eq("id", uid).maybeSingle();
    return data;
}, ["profile", uid], { tags: [cache_tags_1.TAG.profiles], revalidate: 60 })();
// Người dùng hiện tại (1 lần/request). null nếu chưa đăng nhập hoặc tài khoản bị khoá.
exports.getCurrentUser = (0, react_1.cache)(async () => {
    // getClaims: kiểm chữ ký JWT (ES256) ngay tại máy chủ bằng khoá công khai đã cache — không gọi lên Supabase Auth
    // như getUser (bớt 1 lượt mạng mỗi trang). Khoá / vô hiệu tài khoản vẫn có hiệu lực ngay nhờ kiểm is_active bên dưới.
    const { data } = await (await (0, server_1.supabaseAuth)()).auth.getClaims();
    const uid = data?.claims?.sub;
    if (!uid)
        return null;
    const profile = await profileOf(uid);
    if (!profile?.is_active)
        return null;
    return {
        id: profile.id, email: profile.email, full_name: profile.full_name, role: (0, roles_1.normalizeRole)(profile.role),
        // Trước migration 015 chưa có 2 cột này
        team_id: profile.team_id ?? null, is_team_lead: !!profile.is_team_lead,
        team2_id: profile.team2_id ?? null,
    };
});
// Trang: chưa đăng nhập → /login; sai vai trò → về trang chủ
async function requireUser(roles) {
    const user = await (0, exports.getCurrentUser)();
    if (!user)
        (0, navigation_1.redirect)("/login");
    if (roles && !roles.includes(user.role))
        (0, navigation_1.redirect)("/");
    return user;
}
// Server action: ném lỗi thay vì redirect
async function requireActionUser(roles) {
    const user = await (0, exports.getCurrentUser)();
    if (!user)
        throw new Error("Chưa đăng nhập");
    if (roles && !roles.includes(user.role))
        throw new Error("Bạn không có quyền thực hiện thao tác này");
    return user;
}
// Giá vốn / lợi nhuận là dữ liệu nhạy cảm: chỉ Quản lý
const canSeeProfit = (u) => u.role === "admin";
exports.canSeeProfit = canSeeProfit;
// Duyệt mẫu sưu tầm (→ P0) và duyệt Win (P5): Quản lý, hoặc trưởng team của mẫu (team chính HOẶC team 2 của người đó).
// Mẫu chưa gắn team (vd mã tự động từ hashtag): Quản lý hoặc trưởng team bất kỳ.
const inTeam = (u, teamId) => !!teamId && (teamId === u.team_id || teamId === u.team2_id);
exports.inTeam = inTeam;
const canApprove = (u, productTeamId) => u.role === "admin" || (u.is_team_lead && (!productTeamId || (0, exports.inTeam)(u, productTeamId)));
exports.canApprove = canApprove;
// Nhập/sửa mẫu, đặt xưởng, giao việc 3D/media, duyệt 3D/source
const isRndEditor = (u) => u.role === "admin" || u.role === "rnd";
exports.isRndEditor = isRndEditor;
// Tên người theo id (core.profiles). Dùng thay cho nối bảng xuyên schema (rnd → core).
async function profileNames(ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length)
        return new Map();
    const { data } = await admin_1.sb.core().from("profiles").select("id, full_name").in("id", unique);
    return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}
