"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashRpcParams = exports.DASH_GROUPS = void 0;
exports.dashLegacy = dashLegacy;
exports.dashFromSql = dashFromSql;
exports.warmDashSpu = warmDashSpu;
exports.loadDashSpu = loadDashSpu;
require("server-only");
const cache_1 = require("next/cache");
const db_gate_1 = require("@/lib/db-gate");
const admin_1 = require("@/lib/supabase/admin");
const cache_tags_1 = require("@/lib/cache-tags");
const data_1 = require("@/lib/data");
const spu_data_1 = require("@/lib/spu-data");
const spu_query_1 = require("@/lib/spu-query");
const spu_tracking_1 = require("@/lib/spu-tracking");
const spu_videos_1 = require("@/lib/spu-videos");
exports.DASH_GROUPS = [["SPU Active", "var(--ink-1)"], ["SPU còn hàng", "var(--good)"], ["SPU bán chậm", "var(--warn-ink)"], ["SPU tồn xấu", "var(--bad)"], ["SPU bán chạy", "var(--star)"]];
// ===== Đường cũ =====
function dashLegacy(rows, q) {
    const { days, endAge, teams, rules: R, win } = q;
    const period = rows.map((r) => (0, spu_tracking_1.viewOf)(r, { wh: null, days, endAge, rules: R, teams, pageIds: q.pageIds ?? undefined, win }));
    const company = rows.map((r) => (0, spu_tracking_1.viewOf)(r, { wh: null, days, endAge, rules: R, win }));
    const stockStatus = new Map();
    for (const v of period) {
        if (v.flags.bad)
            stockStatus.set(v.row.code, "bad");
        else if (v.flags.slow)
            stockStatus.set(v.row.code, "slow");
        else if (v.flags.hot)
            stockStatus.set(v.row.code, "hot");
    }
    const videoCats = [...period.reduce((m, v) => m.set(v.row.group, (m.get(v.row.group) ?? 0) + v.videos), new Map())]
        .map(([name, posted]) => ({ name, posted })).filter((c) => c.posted > 0).sort((a, b) => b.posted - a.posted || (a.name < b.name ? -1 : 1));
    const picks = [(v) => v.flags.active, (v) => v.flags.inStock, (v) => v.flags.slow, (v) => v.flags.bad, (v) => v.flags.hot];
    const videoGroups = exports.DASH_GROUPS.map(([label, tone], i) => {
        const inGroup = new Set(company.filter(picks[i]).map((v) => v.row.code));
        const vs = period.filter((v) => inGroup.has(v.row.code));
        return { label, tone, spu: inGroup.size, withVideo: vs.filter((v) => v.videos > 0).length, posted: vs.reduce((n, v) => n + v.videos, 0) };
    });
    const act = company.filter((v) => v.flags.active);
    const s0 = { active: act.length, hot: act.filter((v) => v.flags.hot).length, normal: act.filter((v) => v.flags.normal).length, slow: act.filter((v) => v.flags.slow).length, bad: act.filter((v) => v.flags.bad).length, noStockSold: act.filter((v) => !v.flags.inStock).length };
    // S1: SPU Active có video trong kỳ (video theo team / Page đang lọc). S2–S4: SPU Active ĐANG Win (cờ cuốn chiếu, không theo kỳ)
    const s1Codes = new Set(period.filter((v, i) => company[i].flags.active && v.videos > 0).map((v) => v.row.code));
    const s1 = { total: s1Codes.size };
    const winNow = { wt: act.filter((v) => v.flags.winTraffic).length, win: act.filter((v) => v.flags.win).length, star: act.filter((v) => v.flags.star).length };
    const alertViews = company.filter((v) => !teams.length || v.row.teams.some((n) => teams.includes(n)));
    const vids = alertViews.filter((v) => v.flags.inStock && v.videos > 0)
        .flatMap((v) => (0, spu_videos_1.spuVideos)(v.row, { days, endAge }, q.today).map((x) => ({ x, code: v.row.code }))).sort((a, b) => b.x.views - a.x.views);
    return { s0, s1, winNow, s1Codes, videoCats, videoGroups, stockStatus, activeCodes: new Set(act.map((v) => v.row.code)), alertViews, vids: { total: vids.length, items: vids.slice(0, q.limit) } };
}
const dashRpcParams = (q) => ({
    today: q.today, days: q.days, end_age: q.endAge, teams: q.teams, channels: q.pageIds, slow_below: q.rules.sales.slowBelow, normal_below: q.rules.sales.normalBelow, alert_limit: q.limit,
    wt: [...q.win.wt], ord: [...q.win.order],
});
exports.dashRpcParams = dashRpcParams;
async function dashFromSql(d, q) {
    const accounts = await (0, data_1.getAccounts)();
    const chan = new Map(accounts.map((a) => [a.id, a]));
    const vnDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
    const PLATFORM = { facebook: "FB", instagram: "IG", tiktok: "TT" };
    const items = d.alerts.top_videos.map((t) => {
        const ch = chan.get(t.channel_id);
        return { code: t.code, x: { id: t.id, title: "(không có nội dung)", platform: ch ? PLATFORM[ch.platform] ?? "FB" : "FB", channel: ch?.name ?? "—", team: null, date: vnDay(t.published_at), views: Number(t.views), url: null, thumb: null } };
    });
    const stockStatus = new Map();
    for (const k of ["hot", "slow", "bad"])
        for (const c of d.stock_status[k])
            stockStatus.set(c, k);
    const tones = new Map(exports.DASH_GROUPS);
    return {
        s0: { active: d.s0.active, hot: d.s0.hot, normal: d.s0.normal, slow: d.s0.slow, bad: d.s0.bad, noStockSold: d.s0.no_stock_sold },
        s1: d.s1, winNow: d.win, s1Codes: new Set(d.s1_codes),
        videoCats: d.cats, videoGroups: d.groups.map((g) => ({ label: g.label, tone: tones.get(g.label) ?? "var(--ink-1)", spu: g.spu, withVideo: g.with_video, posted: g.posted })),
        stockStatus, activeCodes: new Set(d.active_codes),
        alertViews: d.alerts.rows.map((r) => (0, spu_query_1.viewFromSql)(r, { days: q.days, rules: q.rules })),
        vids: { total: Number(d.alerts.vids_total), items },
    };
}
// Kết quả hàm SQL lưu đệm 5 phút theo bộ tham số (xoá khi đồng bộ / nhập file / làm mới bảng tổng hợp: TAG.spuData) — mở lại Dashboard không phải chờ tính lại
const dashRpc = (0, cache_1.unstable_cache)(async (p) => {
    const { data, error } = await (0, db_gate_1.heavyRpc)(() => admin_1.sb.sales().rpc("spu_dash", { p }));
    if (error)
        throw new Error(error.message);
    return data;
}, ["spu-dash-rpc", "v1"], { tags: [cache_tags_1.TAG.spuData], revalidate: 21_600 });
// Làm nóng đệm của hàm SQL spu_dash (cùng khoá với loadDashSpu: cùng tham số) — CHỈ đường SQL, lỗi thì bỏ qua; KHÔNG BAO GIỜ rơi sang đường tính trực tiếp (rất nặng) khi chỉ để làm nóng
async function warmDashSpu(q) {
    try {
        await dashRpc((0, exports.dashRpcParams)(q));
    }
    catch { /* không làm hỏng lần làm mới */ }
}
async function loadDashSpu(q) {
    if ((0, spu_query_1.spuReadMode)() === "sql") {
        let data = null, error = null;
        try {
            data = await dashRpc((0, exports.dashRpcParams)(q));
        }
        catch (e) {
            error = { message: e instanceof Error ? e.message : String(e) };
        }
        if (!error && data && data.s0 && data.refreshed_at)
            return { ...(await dashFromSql(data, q)), source: "sql" };
        if (error)
            console.error("spu_dash lỗi:", error.message);
    }
    return { ...dashLegacy(await (0, spu_data_1.loadSpuRows)(), q), source: "legacy" };
}
