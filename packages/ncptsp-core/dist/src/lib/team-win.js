"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadTeamWin = void 0;
require("server-only");
const cache_1 = require("next/cache");
const admin_1 = require("@/lib/supabase/admin");
const cache_tags_1 = require("@/lib/cache-tags");
const data_1 = require("@/lib/data");
const rules_1 = require("@/lib/eval/rules");
const spu_rules_1 = require("@/lib/spu-rules");
const tags_1 = require("@/lib/tags");
const DAY = 86_400_000;
const vnDate = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
const daysBetweenIso = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
async function load(team, teamId, codes, from, to) {
    if (!codes.length)
        return {};
    const [{ data: chans }, { data: setting }, { data: kpis }, salesRes] = await Promise.all([
        admin_1.sb.social().from("channels").select("id").eq("team_id", teamId),
        admin_1.sb.core().from("settings").select("value").eq("key", "evaluation").maybeSingle(),
        admin_1.sb.rnd().from("kpi_templates").select("goal_code, rules, match, min_views").eq("is_default", true).in("goal_code", ["sales", "traffic"]),
        admin_1.sb.sales().rpc("tr_code_sales", { p_team: team, p_codes: codes }),
    ]);
    if (salesRes.error)
        throw salesRes.error;
    const salesKpi = kpis?.find((k) => k.goal_code === "sales"), trafficKpi = kpis?.find((k) => k.goal_code === "traffic");
    const channelIds = (chans ?? []).map((c) => c.id);
    if (!salesKpi || !trafficKpi || !channelIds.length)
        return {};
    const N = Math.max(1, Number(setting?.value?.window_days ?? 14));
    // Bài đăng của team có gắn một trong các mã (đọc theo lô kênh để không vượt giới hạn của bộ lọc)
    const posts = [];
    for (let i = 0; i < channelIds.length; i += 100) {
        posts.push(...(await (0, admin_1.fetchAll)((a, b) => admin_1.sb.social().from("posts").select("channel_id, published_at, kind, product_codes, views, viewers, reactions, clicks")
            .in("channel_id", channelIds.slice(i, i + 100)).overlaps("product_codes", codes).order("published_at").order("id").range(a, b))));
    }
    const byCode = new Map();
    for (const p of posts)
        for (const c of p.product_codes)
            if (codes.includes(c))
                byCode.set(c, [...(byCode.get(c) ?? []), { ...p, d: vnDate(p.published_at) }]);
    const sales = new Map();
    for (const [code, od, q] of salesRes.data) {
        const m = sales.get(code) ?? new Map();
        m.set(od, q);
        sales.set(code, m);
    }
    // Hai điều kiện Win Traffic như bộ máy đánh giá (lib/eval/engine.ts): SP test (mã T, mẫu R&D P0–P5) theo KPI Traffic ở Cài đặt trong N ngày;
    // SP đang bán (còn lại) cần `sell.views` lượt xem trong `sell.days` ngày. Win bán hàng của hai nhóm như nhau (KPI bán, cửa sổ N ngày).
    const sell = (await (0, spu_rules_1.loadSpuRules)()).win.traffic;
    const { data: stRows } = await admin_1.sb.rnd().from("products").select("code, stage").in("code", codes);
    const stageOf = new Map((stRows ?? []).map((r) => [r.code, r.stage ?? null]));
    const today = (0, data_1.todayVN)(), out = {};
    const span = daysBetweenIso(from, to); // kỳ ngắn hơn cửa sổ: cửa sổ bị cắt ở cuối kỳ nên vẫn là một phần của kỳ
    for (const [code, ps] of byCode) {
        const st = stageOf.get(code), isTest = (0, tags_1.isTestCode)(code) || (!!st && st !== "p6");
        const firstVideo = ps.map((p) => p.d).sort()[0], sm = sales.get(code) ?? new Map();
        let salesWin = false, trafficWin = false, bestQty = 0, bestViews = 0;
        const metricsAt = (ws, len) => {
            const we = (0, data_1.addDays)(ws, len - 1) > to ? to : (0, data_1.addDays)(ws, len - 1);
            const inWin = ps.filter((p) => p.d >= ws && p.d <= we);
            let qty = 0;
            for (const [od, q] of sm)
                if (od >= ws && od <= we)
                    qty += q;
            const t = inWin.reduce((n, p) => ({ views: n.views + Number(p.views), viewers: n.viewers + Number(p.viewers), reactions: n.reactions + Number(p.reactions), clicks: n.clicks + Number(p.clicks) }), { views: 0, viewers: 0, reactions: 0, clicks: 0 });
            return { t, qty, m: (0, rules_1.buildMetrics)({ ...t, qty_net: qty, posts: inWin.length, videos: inWin.filter((p) => p.kind === "video" || p.kind === "reel").length }) };
        };
        const trafficLen = isTest ? N : sell.days;
        for (let k = 0; k <= span; k++) {
            const ws = (0, data_1.addDays)(from, k);
            const a = metricsAt(ws, N), b = trafficLen === N ? a : metricsAt(ws, trafficLen);
            if ((0, rules_1.rulesPass)((0, rules_1.checkRules)(salesKpi.rules, a.m), salesKpi.match) && a.t.views >= salesKpi.min_views)
                salesWin = true;
            if (isTest ? (0, rules_1.rulesPass)((0, rules_1.checkRules)(trafficKpi.rules, b.m), trafficKpi.match) : b.t.views >= sell.views)
                trafficWin = true;
            bestQty = Math.max(bestQty, a.qty);
            bestViews = Math.max(bestViews, b.t.views);
        }
        out[code] = { result: (0, rules_1.decideAuto)(salesWin, trafficWin, daysBetweenIso(firstVideo, today) >= trafficLen), qty: bestQty, views: bestViews };
    }
    return out;
}
const loadTeamWin = (team, teamId, codes, from, to) => (0, cache_1.unstable_cache)(() => load(team, teamId, codes, from, to), ["team-win", "v2", team, teamId, from, to, [...codes].sort().join(",")], { tags: [cache_tags_1.TAG.spuData], revalidate: 21_600 })();
exports.loadTeamWin = loadTeamWin;
