"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.limitAccounts = exports.isTeamLimited = void 0;
exports.getTeamScope = getTeamScope;
exports.scopedPageIds = scopedPageIds;
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
const data_1 = require("@/lib/data");
const isTeamLimited = (u) => u.role !== "admin";
exports.isTeamLimited = isTeamLimited;
async function getTeamScope(user) {
    if (!(0, exports.isTeamLimited)(user))
        return { limited: false, teamId: user.team_id, teamName: null, channelIds: [] };
    if (!user.team_id)
        return { limited: true, teamId: null, teamName: null, channelIds: [] };
    const [{ data: ch }, { data: team }] = await Promise.all([
        admin_1.sb.social().from("channels").select("id").eq("team_id", user.team_id).eq("is_active", true),
        admin_1.sb.core().from("teams").select("name").eq("id", user.team_id).maybeSingle(),
    ]);
    return { limited: true, teamId: user.team_id, teamName: team?.name ?? null, channelIds: (ch ?? []).map((c) => c.id) };
}
// Danh sách Page được phép xem (giữ thứ tự gốc)
const limitAccounts = (accounts, scope) => scope.limited ? accounts.filter((a) => scope.channelIds.includes(a.id)) : accounts;
exports.limitAccounts = limitAccounts;
// Page dùng để lọc số bán: người bị giới hạn KHÔNG BAO GIỜ được "toàn hệ thống" (null) — luôn là danh sách Page của team
function scopedPageIds(f, accounts, scope) {
    const picked = (0, data_1.scopePageIds)(f, accounts.map((a) => a.id));
    if (!scope.limited)
        return picked;
    const mine = new Set(accounts.map((a) => a.id));
    return (picked ?? [...mine]).filter((id) => mine.has(id));
}
