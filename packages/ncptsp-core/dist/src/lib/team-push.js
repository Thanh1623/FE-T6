"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPush = loadPush;
exports.loadPushRequests = loadPushRequests;
require("server-only");
const cache_1 = require("next/cache");
const admin_1 = require("@/lib/supabase/admin");
const cache_tags_1 = require("@/lib/cache-tags");
const spu_tracking_1 = require("@/lib/spu-tracking");
// BẢNG 3 của QLHH: Tồn kho & Đẩy hàng theo team (migration 085). Dữ liệu gốc: mọi SPU đang tồn kho (không lấy từ danh sách đã bán) kèm video / lượt xem / SL bán từng team trong kỳ.
__exportStar(require("@/lib/team-push-types"), exports);
const team_push_types_1 = require("@/lib/team-push-types");
const rpcCached = (from, to) => (0, cache_1.unstable_cache)(async () => {
    const { data, error } = await admin_1.sb.sales().rpc("tr_push", { p_from: from, p_to: to });
    if (error)
        throw error;
    return data;
}, ["team-push", "v1", from, to], { tags: [cache_tags_1.TAG.spuData], revalidate: 21_600 })();
const verdictOf = (videos, sold) => (videos === 0 ? (sold > 0 ? "sold_no_video" : "idle") : sold >= videos ? "pushing" : "weak");
async function loadPush(from, to, rules) {
    const raw = await rpcCached(from, to);
    // Team vận hành video: có ít nhất 1 video trong kỳ (loại team không đăng video như Cửa Hàng, Thương Mại Điện Tử, ADS khỏi cột "chưa đẩy")
    const active = new Set();
    for (const r of raw.spus)
        for (const [t, v] of r[6])
            if (t && v > 0 && t !== "ADS")
                active.add(t);
    const teams = [...active].sort((a, b) => a.localeCompare(b, "vi"));
    const rows = raw.spus.map(([code, name, stock, incoming, age, sold30, tm]) => {
        const cells = tm.map(([t, v, w, s]) => ({ team: t || team_push_types_1.UNASSIGNED, videos: v, views: Number(w), sold: s, verdict: verdictOf(v, s) }));
        for (const t of teams)
            if (!cells.some((c) => c.team === t))
                cells.push({ team: t, videos: 0, views: 0, sold: 0, verdict: "idle" });
        const real = cells.filter((c) => active.has(c.team));
        const pushing = real.filter((c) => c.videos > 0).map((c) => c.team);
        const idle = real.filter((c) => c.videos === 0).map((c) => c.team);
        const fl = (0, spu_tracking_1.saleFlags)(stock, sold30, rules);
        const cls = fl.bad ? "bad" : fl.hot ? "hot" : fl.normal ? "normal" : "slow";
        const teamVideos = real.reduce((n, c) => n + c.videos, 0); // phân nhóm đẩy hàng chỉ theo team vận hành video
        const videos = cells.reduce((n, c) => n + c.videos, 0), views = cells.reduce((n, c) => n + c.views, 0), sold = cells.reduce((n, c) => n + c.sold, 0); // số liệu: toàn công ty
        // Nhóm hành động + ưu tiên
        let group, priority, why;
        if (cls === "bad") {
            group = "dead";
            priority = stock >= 30 || (age ?? 0) >= 90 ? "high" : "mid";
            why = `Tồn xấu: còn ${stock}, không bán được trong 30 ngày${age ? `, tồn ${age} ngày` : ""}`;
        }
        else if (teamVideos === 0) {
            group = "unpushed";
            priority = stock >= 50 ? "high" : "mid";
            why = cls === "slow" ? "Có tồn, bán chậm và chưa team nào đăng video" : "Có tồn nhưng chưa team nào đăng video trong kỳ";
        }
        else if (cls === "slow") {
            group = "ineffective";
            priority = "mid";
            why = `Đã có ${teamVideos} video nhưng bán chậm: xem lại nội dung, giá, mức phù hợp`;
        }
        else {
            group = "healthy";
            priority = "low";
            why = cls === "hot" ? "Đang đẩy và bán tốt: theo dõi tốc độ tiêu thụ, tránh thiếu hàng" : "Đang đẩy, bán ổn";
        }
        cells.sort((a, b) => b.videos - a.videos || b.sold - a.sold || a.team.localeCompare(b.team, "vi"));
        return { code, name, stock, incoming, age, sold30, cls, videos, views, sold, teamVideos, pushing, idle, teams: cells, group, priority, why };
    });
    const rank = { high: 0, mid: 1, low: 2 };
    rows.sort((a, b) => rank[a.priority] - rank[b.priority] || b.stock - a.stock || a.code.localeCompare(b.code));
    return { rows, teams, refreshedAt: raw.refreshed_at };
}
// Danh sách yêu cầu đẩy hàng (luôn đọc mới: có thao tác ghi) — team = chỉ yêu cầu của team đó
async function loadPushRequests(team) {
    const { data, error } = await admin_1.sb.sales().rpc("tr_push_requests", { p_team: team });
    if (error)
        throw error;
    return (data ?? []);
}
