"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggestTemplate = void 0;
exports.listGoals = listGoals;
exports.listTemplates = listTemplates;
exports.listSessions = listSessions;
exports.latestSessions = latestSessions;
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
const session_1 = require("@/lib/session");
async function listGoals(includeInactive = false) {
    let q = admin_1.sb.rnd().from("goals").select("*").order("sort_order").order("code");
    if (!includeInactive)
        q = q.eq("is_active", true);
    const { data, error } = await q;
    if (error)
        throw error;
    return data;
}
async function listTemplates(includeInactive = false) {
    let q = admin_1.sb.rnd().from("kpi_templates")
        .select("id, name, goal_code, line, campaign, rules, match, min_days, min_views, duration_days, is_default, is_active, updated_at")
        .order("goal_code").order("is_default", { ascending: false }).order("name");
    if (!includeInactive)
        q = q.eq("is_active", true);
    const { data, error } = await q;
    if (error)
        throw error;
    return data;
}
var kpi_constants_1 = require("@/lib/kpi-constants");
Object.defineProperty(exports, "suggestTemplate", { enumerable: true, get: function () { return kpi_constants_1.suggestTemplate; } });
const withResult = (s) => {
    const { decisions, ...rest } = s;
    const latest = [...(decisions ?? [])].sort((a, b) => b.decided_at.localeCompare(a.decided_at))[0];
    return { ...rest, result: latest?.result ?? null };
};
async function listSessions(productId) {
    const { data, error } = await admin_1.sb.rnd().from("test_sessions")
        .select("*, decisions(result, decided_at)")
        .eq("product_id", productId).order("start_date", { ascending: false }).order("created_at", { ascending: false });
    if (error)
        throw error;
    const rows = data;
    const names = await (0, session_1.profileNames)(rows.map((r) => r.created_by));
    return rows.map((r) => ({ ...withResult(r), creator: r.created_by && names.has(r.created_by) ? { full_name: names.get(r.created_by) } : null }));
}
// Phiên gần nhất của mỗi mẫu (đang chạy hoặc đã kết thúc) — cho thẻ danh sách
async function latestSessions(productIds) {
    if (!productIds.length)
        return {};
    const { data, error } = await admin_1.sb.rnd().from("test_sessions").select("*, decisions(result, decided_at)")
        .in("product_id", productIds).order("created_at", { ascending: false });
    if (error)
        throw error;
    const out = {};
    for (const s of data.map(withResult))
        out[s.product_id] ??= s;
    return out;
}
