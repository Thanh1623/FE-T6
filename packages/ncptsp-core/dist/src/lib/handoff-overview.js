"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHandoffOverview = void 0;
exports.buildTeamRows = buildTeamRows;
exports.buildChannelRows = buildChannelRows;
exports.handoffOverview = handoffOverview;
require("server-only");
const cache_1 = require("next/cache");
const daily_sales_1 = require("@/lib/daily-sales");
const cache_tags_1 = require("@/lib/cache-tags");
const admin_1 = require("@/lib/supabase/admin");
const handoff_1 = require("@/lib/handoff");
const rnd_1 = require("@/lib/rnd");
const vnDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
// Bảng "Theo team": thống kê CHỈ trên tập mẫu `samples` truyền vào (nên lọc theo mẫu thì số liệu team cũng chỉ tính các mẫu đó)
function buildTeamRows(samples, teams, channels) {
    const chByTeam = new Map();
    for (const c of channels)
        if (c.teamId)
            chByTeam.set(c.teamId, [...(chByTeam.get(c.teamId) ?? []), c]);
    const live = (a) => a.status !== "returned";
    const rows = [];
    for (const t of teams) {
        const mine = samples.flatMap((s) => s.assignments).filter((a) => a.team?.id === t.id);
        if (!mine.length)
            continue;
        const byStatus = { pending: 0, received: 0, developing: 0, done: 0, returned: 0, unassigned: 0 };
        for (const a of mine)
            byStatus[a.status] += 1;
        const ch = chByTeam.get(t.id) ?? [];
        const posted = new Set(mine.filter(live).flatMap((a) => a.posted.map((c) => c.id)));
        rows.push({
            team: t, samples: new Set(mine.map((a) => a.productId)).size, byStatus,
            videos: mine.reduce((n, a) => n + a.videos.length, 0), winVideos: mine.reduce((n, a) => n + a.winCount, 0),
            views: mine.reduce((n, a) => n + a.views, 0), sold: mine.reduce((n, a) => n + a.sold, 0), channels: ch.length, channelsPosted: posted.size,
        });
    }
    return rows.sort((a, b) => b.sold - a.sold || b.videos - a.videos);
}
// Bảng "Theo kênh": kênh của các team trong `teamRows`, thống kê chỉ trên tập mẫu `samples`
function buildChannelRows(samples, teamRows, teams, channels) {
    const teamById = new Map(teams.map((t) => [t.id, t]));
    const assignedTeams = new Set(teamRows.map((r) => r.team.id));
    const assignments = samples.flatMap((s) => s.assignments);
    return channels.filter((c) => c.teamId && assignedTeams.has(c.teamId)).map((c) => {
        const vids = assignments.flatMap((a) => a.videos.filter((v) => v.channelId === c.id).map((v) => ({ v, productId: a.productId })));
        const sold = assignments.filter((a) => a.team?.id === c.teamId).reduce((n, a) => n + (a.soldByChannel[c.id] ?? 0), 0);
        return { channel: c, teamName: c.teamId ? teamById.get(c.teamId)?.name ?? null : null, samples: new Set(vids.map((x) => x.productId)).size, videos: vids.length,
            winVideos: vids.filter((x) => x.v.win).length, views: vids.reduce((t, x) => t + x.v.views, 0), sold };
    }).sort((a, b) => b.videos - a.videos || a.channel.name.localeCompare(b.channel.name));
}
async function handoffOverview() {
    const handoffs = await (0, handoff_1.listHandoffs)();
    const [{ data: teamsRaw }, { data: chRaw }, kpi] = await Promise.all([
        admin_1.sb.core().from("teams").select("id, name").eq("is_active", true).order("name"),
        admin_1.sb.social().from("channels").select("id, name, platform, team_id").eq("is_active", true).order("name"),
        (0, rnd_1.loadTrafficKpi)(),
    ]);
    const teams = (teamsRaw ?? []);
    const teamById = new Map(teams.map((t) => [t.id, t]));
    const channels = (chRaw ?? []).map((c) => ({ id: c.id, name: c.name, platform: c.platform, teamId: c.team_id }));
    const chByTeam = new Map();
    for (const c of channels)
        if (c.teamId)
            chByTeam.set(c.teamId, [...(chByTeam.get(c.teamId) ?? []), c]);
    const codes = [...new Set(handoffs.map((h) => h.product?.code).filter(Boolean))];
    const { data: prods } = codes.length ? await admin_1.sb.rnd().from("products").select("id, code, sapo_code, team_id").in("code", codes) : { data: [] };
    const prodByCode = new Map((prods ?? []).map((p) => [p.code, p]));
    const posts = codes.length ? await (0, admin_1.fetchAll)((a, b) => admin_1.sb.social().from("posts").select("id, channel_id, published_at, product_codes, permalink_url, thumbnail_url, message, views, viewers, reactions, clicks")
        .overlaps("product_codes", codes).in("kind", ["video", "reel"]).order("published_at", { ascending: false }).order("id").range(a, b)) : [];
    const salesCodes = [...new Set([...prodByCode.values()].map((p) => (p.sapo_code ?? p.code).toUpperCase()))];
    const minDate = handoffs.length ? vnDay(handoffs.map((h) => h.created_at).sort()[0]) : null;
    const sales = salesCodes.length && minDate ? await (0, daily_sales_1.loadDailySales)({ codes: salesCodes, from: minDate }) : []; // file đơn hàng đã nhập + số đồng bộ cho ngày ngoài khoảng file
    // ---- Phiếu → Assignment
    const samplesMap = new Map();
    for (const h of handoffs) {
        const code = h.product?.code;
        if (!code)
            continue;
        const prod = prodByCode.get(code);
        const team = h.team_id ? teamById.get(h.team_id) ?? (h.teamName ? { id: h.team_id, name: h.teamName } : null) : null;
        const teamCh = h.team_id ? chByTeam.get(h.team_id) ?? [] : [];
        const chIds = new Set(teamCh.map((c) => c.id));
        const videos = posts
            .filter((p) => p.product_codes.includes(code) && chIds.has(p.channel_id) && p.published_at >= h.created_at)
            .map((p) => {
            const g = (0, rnd_1.gradeVideo)({ views: Number(p.views), viewers: Number(p.viewers), reactions: Number(p.reactions), clicks: Number(p.clicks) }, kpi);
            return { id: p.id, channelId: p.channel_id, publishedAt: p.published_at, url: p.permalink_url, thumb: p.thumbnail_url, message: p.message, views: Number(p.views),
                win: g.trafficPass, progress: g.kpiProgress, kpiLines: g.kpiLines };
        });
        const postedIds = new Set(videos.map((v) => v.channelId));
        const sapo = (prod?.sapo_code ?? code).toUpperCase(), since = vnDay(h.created_at);
        const sold = h.team_id ? sales.filter((r) => r.code === sapo && r.date >= since && chIds.has(r.page_id)).reduce((t, r) => t + Number(r.qty_sold) - Number(r.qty_returned), 0) : 0;
        const soldByChannel = {};
        if (h.team_id)
            for (const c of teamCh)
                soldByChannel[c.id] = sales.filter((r) => r.code === sapo && r.date >= since && r.page_id === c.id).reduce((t, r) => t + Number(r.qty_sold) - Number(r.qty_returned), 0);
        const a = {
            handoffId: h.id, productId: h.product_id, team, status: h.status, deadline: h.deadline, createdAt: h.created_at, receivedAt: h.received_at, doneAt: h.done_at,
            note: h.rnd_note, teamNote: h.saobien_note, videos,
            posted: teamCh.filter((c) => postedIds.has(c.id)), notPosted: teamCh.filter((c) => !postedIds.has(c.id)),
            sold, soldByChannel, views: videos.reduce((t, v) => t + v.views, 0), winCount: videos.filter((v) => v.win).length,
        };
        const s = samplesMap.get(h.product_id) ?? { productId: h.product_id, code, name: h.product?.name ?? code, ownTeam: h.product?.team_id ? teamById.get(h.product.team_id) ?? null : null, result: h.result, assignments: [] };
        s.assignments.push(a);
        samplesMap.set(h.product_id, s);
    }
    const samples = [...samplesMap.values()].sort((a, b) => b.assignments.length - a.assignments.length || a.code.localeCompare(b.code));
    const teamRows = buildTeamRows(samples, teams, channels);
    const channelRows = buildChannelRows(samples, teamRows, teams, channels);
    const all = samples.flatMap((s) => s.assignments);
    return {
        samples, teams, channels, teamRows, channelRows,
        totals: {
            samples: samples.length, assignments: all.filter((a) => a.team).length, teams: teamRows.length,
            teamsPosted: teamRows.filter((r) => r.videos > 0).length, channelsPosted: channelRows.filter((r) => r.videos > 0).length, channelsTotal: channelRows.length,
            videos: all.reduce((n, a) => n + a.videos.length, 0), winVideos: all.reduce((n, a) => n + a.winCount, 0), sold: all.reduce((n, a) => n + a.sold, 0),
        },
    };
}
// Bản có cache dùng chung (60 giây, hoặc xoá ngay khi phân công / đổi trạng thái phiếu): dựng dữ liệu mất ~1 giây (nhiều truy vấn), nên
// tìm kiếm / sắp xếp / chuyển trang lặp lại không phải truy vấn lại.
exports.getHandoffOverview = (0, cache_1.unstable_cache)(handoffOverview, ["handoff-overview-v2"], { tags: [cache_tags_1.TAG.handoffs, cache_tags_1.TAG.channels, cache_tags_1.TAG.teams], revalidate: 60 });
