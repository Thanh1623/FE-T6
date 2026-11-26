"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canSeeHandoff = exports.canWorkHandoff = exports.canAssignHandoff = exports.HANDOFF_STATUS = void 0;
exports.listHandoffs = listHandoffs;
exports.latestHandoff = latestHandoff;
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
const session_1 = require("@/lib/session");
const handoff_status_1 = require("@/lib/handoff-status");
Object.defineProperty(exports, "HANDOFF_STATUS", { enumerable: true, get: function () { return handoff_status_1.HANDOFF_STATUS; } });
const SELECT = `*, product:products(code, name, line, category, material, stone, image_paths, team_id, stage),
  events:handoff_events(id, action, note, created_at, actor_id)`;
// Gắn tên người (core.profiles) vào người tạo / người phụ trách / người thao tác
async function withNames(rows) {
    const names = await (0, session_1.profileNames)(rows.flatMap((h) => [h.created_by, h.assignee_id, ...h.events.map((e) => e.actor_id)]));
    const n = (id) => (id && names.has(id) ? { full_name: names.get(id) } : null);
    const { data: teams } = await admin_1.sb.core().from("teams").select("id, name");
    const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
    return rows.map((h) => ({
        ...h, creator: n(h.created_by), assignee: n(h.assignee_id), team_id: h.team_id ?? null, deadline: h.deadline ?? null, // chưa chạy migration 033 → hai cột này không có
        teamName: h.team_id ? teamName.get(h.team_id) ?? null : null,
        events: h.events.map(({ actor_id, ...e }) => ({ ...e, actor: n(actor_id) })),
    }));
}
async function listHandoffs() {
    const { data, error } = await admin_1.sb.rnd().from("handoffs").select(SELECT).order("created_at", { ascending: false });
    if (error)
        throw error;
    return withNames(data);
}
// Lần chuyển giao gần nhất của 1 mẫu (kể cả đã trả lại)
async function latestHandoff(productId) {
    const { data, error } = await admin_1.sb.rnd().from("handoffs").select(SELECT)
        .eq("product_id", productId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error)
        throw error;
    return data ? (await withNames([data]))[0] : null;
}
// ---------- Quyền phân công / làm việc ----------
// Phân công: Quản lý, hoặc người của team sở hữu mẫu (team R&D yêu cầu). Mẫu chưa gắn team → vai trò R&D nào cũng giao được.
const canAssignHandoff = (u, productTeamId) => u.role === "admin" || (u.role === "rnd" && (!productTeamId || (0, session_1.inTeam)(u, productTeamId))); // team chính hoặc team 2
exports.canAssignHandoff = canAssignHandoff;
// Làm việc trên phiếu (tiếp nhận / từ chối / đã lên video / hoàn thành): CHỈ người thuộc đúng team được giao.
// Quản lý không thuộc team nào nên không thao tác thay team (chỉ giao, giao lại, huỷ phiếu chưa tiếp nhận).
const canWorkHandoff = (u, teamId) => u.role === "rnd" && (0, session_1.inTeam)(u, teamId);
exports.canWorkHandoff = canWorkHandoff;
// Thấy phiếu: Quản lý · team yêu cầu · team được giao; người chưa thuộc team nào (tài khoản cũ) thấy hết như trước
const canSeeHandoff = (u, h) => u.role === "admin" || !u.team_id || (0, session_1.inTeam)(u, h.team_id) || (0, session_1.inTeam)(u, h.product?.team_id ?? null);
exports.canSeeHandoff = canSeeHandoff;
