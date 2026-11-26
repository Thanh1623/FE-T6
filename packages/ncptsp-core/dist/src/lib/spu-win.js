"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.spuWinStats = spuWinStats;
require("server-only");
const cache_1 = require("next/cache");
const admin_1 = require("@/lib/supabase/admin");
const cache_tags_1 = require("@/lib/cache-tags");
const daily_sales_1 = require("@/lib/daily-sales");
const spu_alias_1 = require("@/lib/spu-alias");
const tags_1 = require("@/lib/tags");
const video_win_1 = require("@/lib/video-win");
const video_win_data_1 = require("@/lib/video-win-data");
// Thống kê video theo team / bảng đẩy hàng / trạng thái tồn của video cho Dashboard.
// Win Traffic / Win Đơn hàng / Ngôi sao (S2–S4) KHÔNG tính ở đây: quy tắc Win duy nhất nằm ở lib/spu-winflags.ts (cài đặt ở trang KPI) và dùng chung với trang Theo dõi đẩy hàng.
// "SPU Win Traffic" của bảng team dùng quy tắc Win (đánh giá cấp SPU). "Video Win" của bảng đẩy hàng là chấm RIÊNG TỪNG VIDEO theo cài đặt Video Win ở trang KPI, dựa trên số liệu N ngày đầu kể từ NGÀY ĐĂNG của chính video (khác quy tắc Win cấp SPU).
const DAY = 86_400_000;
const vnDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
const addDays = (d, n) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const WEEK = 7 * DAY;
const postWeek = (0, cache_1.unstable_cache)(async (fromDay, toDay, pageIds) => {
    const rows = await (0, admin_1.fetchAll)((a, b) => {
        let q = admin_1.sb.social().from("posts").select("id, viewers, channel_id, published_at, kind, product_codes, views, comments")
            .neq("product_codes", "{}").gte("published_at", `${fromDay}T00:00:00+07:00`).lte("published_at", `${toDay}T23:59:59+07:00`);
        if (pageIds)
            q = q.in("channel_id", pageIds.length ? pageIds : ["-"]);
        return q.order("published_at").order("id").range(a, b);
    });
    return rows.map((r) => [r.id, r.viewers, r.channel_id, r.published_at, r.kind, r.product_codes, r.views, r.comments]);
}, ["spu-win-posts", "v1"], { tags: [cache_tags_1.TAG.spuData], revalidate: 21_600 });
async function loadPostsCached(from, to, pageIds) {
    const ids = pageIds ? [...pageIds].sort() : null;
    const start = Math.floor(Date.parse(from) / WEEK) * WEEK, end = Date.parse(to);
    const parts = [];
    for (let t = start; t <= end; t += WEEK)
        parts.push(postWeek(new Date(t).toISOString().slice(0, 10), new Date(t + WEEK - DAY).toISOString().slice(0, 10), ids));
    const lo = Date.parse(`${from}T00:00:00+07:00`), hi = Date.parse(`${to}T23:59:59+07:00`);
    const out = [];
    for (const part of await Promise.all(parts))
        for (const r of part) {
            const ms = Date.parse(r[3]);
            if (ms >= lo && ms <= hi)
                out.push({ id: r[0], viewers: r[1], channel_id: r[2], published_at: r[3], kind: r[4], product_codes: r[5], views: r[6], comments: r[7] });
        }
    return out;
}
// Mỗi mã SPU: ngày bài đầu tiên + view / bình luận trong cửa sổ N ngày đầu (N theo quy tắc Win ở trang KPI)
function trafficOf(posts, wr) {
    const first = new Map();
    for (const p of posts)
        for (const c of p.product_codes) {
            const d = vnDay(p.published_at);
            if (!first.has(c) || d < first.get(c))
                first.set(c, d);
        }
    const out = new Map();
    for (const [c, d] of first)
        out.set(c, { first: d, views: 0, comments: 0, win: false });
    for (const p of posts) {
        const d = vnDay(p.published_at);
        for (const c of p.product_codes) {
            const o = out.get(c);
            if (d <= addDays(o.first, wr.traffic.days - 1)) {
                o.views += Number(p.views ?? 0);
                o.comments += Number(p.comments ?? 0);
            }
        }
    }
    for (const o of out.values())
        o.win = o.views >= wr.traffic.views && o.comments >= wr.traffic.comments;
    return out;
}
// pageIds: Page đang lọc (null = toàn hệ thống; đã gộp lọc team + quyền) · channels: kênh bán tính số bán (rỗng = mọi kênh trừ bảo hành) · teams: team đang lọc (chỉ để lọc bảng theo team)
async function spuWinStats(f) {
    // Bốn nhóm truy vấn KHÔNG phụ thuộc nhau (kênh + team · bài đăng · đánh giá + mẫu R&D) → bắt đầu cùng lúc, trước đây nối đuôi nhau 3 bước (~0,9 giây)
    const refsP = Promise.all([
        admin_1.sb.social().from("channels").select("id, team_id").eq("is_active", true),
        admin_1.sb.core().from("teams").select("id, name").eq("is_active", true).order("name"),
    ]);
    // Hai bảng nhỏ (đánh giá ~vài trăm dòng, mẫu R&D ~vài chục dòng): đọc cả bảng song song 1 lượt rồi lọc theo mã có trong kỳ
    const tablesP = Promise.all([
        (0, admin_1.fetchAll)((a, b) => admin_1.sb.rnd().from("evaluations").select("code, age").order("code").range(a, b)),
        (0, admin_1.fetchAll)((a, b) => admin_1.sb.rnd().from("products").select("code, name, sapo_code, stage, created_by").not("code", "is", null).order("code").range(a, b)),
    ]);
    const teamChannels = f.pageIds;
    const allP = loadPostsCached(f.from, f.to, teamChannels);
    const [[{ data: chRaw }, { data: teamRaw }], allRaw, [evAll, prAll], aliases] = await Promise.all([refsP, allP, tablesP, (0, spu_alias_1.loadSpuAliases)()]);
    const canon = (0, spu_alias_1.canonOf)(aliases);
    const all = (0, spu_alias_1.canonPosts)(aliases, allRaw); // mã SPU cũ đã đổi → gộp vào SPU mới (bảng quy đổi, migration 066)
    const chTeam = new Map((chRaw ?? []).map((c) => [c.id, c.team_id ?? null]));
    const traffic = trafficOf(all, f.winRules);
    const codes = [...traffic.keys()];
    // Mã mới / cũ: mẫu R&D (đang trong quy trình), mã test, hoặc hệ thống đánh giá là "new"
    const sysTest = new Set(prAll.filter((p) => (0, tags_1.isSystemTestCode)(p.code, p.created_by)).map((p) => p.code)); // mã test tạo trên hệ thống (mã đồ da / hồ sơ tự sinh không tính)
    const newCodes = new Set(codes.filter((c) => sysTest.has(c)));
    const sapo = new Map();
    const info = new Map();
    for (const e of evAll)
        if (e.age === "new" && traffic.has(e.code))
            newCodes.add(e.code);
    for (const p of prAll) {
        if (!traffic.has(p.code))
            continue;
        info.set(p.code, { name: String(p.name ?? p.code), rnd: !!p.stage && !(0, tags_1.isTestCode)(p.code) });
        if (p.stage)
            newCodes.add(p.code);
        if (p.sapo_code)
            sapo.set(p.code, String(p.sapo_code).toUpperCase());
    }
    const salesCode = (c) => sapo.get(c) ?? c.toUpperCase();
    // Theo team (team đăng video): số video, số SPU có video, lượt xem, SPU Win Traffic và tỉ lệ Win
    const teams = (teamRaw ?? []).map((t) => {
        const mine = all.filter((p) => chTeam.get(p.channel_id) === t.id);
        const vids = mine.filter((p) => p.kind === "video" || p.kind === "reel");
        const tr = trafficOf(mine, f.winRules);
        const withVideo = new Set(vids.flatMap((p) => p.product_codes));
        const winCodes = [...withVideo].filter((c) => tr.get(c)?.win).length;
        return {
            id: t.id, name: t.name, videos: vids.length, codes: withVideo.size,
            views: vids.reduce((n, p) => n + Number(p.views ?? 0), 0), winCodes, winRate: withVideo.size ? winCodes / withVideo.size : null,
        };
    }).filter((t) => (f.teams.length ? f.teams.includes(t.id) : true)).sort((a, b) => b.videos - a.videos);
    // Bảng theo team: phân loại video theo mã SPU (một video có nhiều mã được tính vào mỗi nhóm có mã đó)
    const stockCtx = await f.stockInfo; // chờ ở đây: các truy vấn nặng ở trên đã chạy song song với việc tải số liệu SPU
    const st = stockCtx?.stockStatus ?? new Map();
    const teamName = new Map((teamRaw ?? []).map((t) => [t.id, t.name]));
    const teamOrder = (teamRaw ?? []).map((t) => t.id).filter((id) => (f.teams.length ? f.teams.includes(id) : true));
    const isVideo = (p) => p.kind === "video" || p.kind === "reel";
    const isRnd = (c) => !!info.get(c)?.rnd;
    const breakdown = teamOrder.map((id) => {
        const vids = all.filter((p) => isVideo(p) && chTeam.get(p.channel_id) === id);
        const has = (fn) => vids.filter((p) => p.product_codes.some(fn)).length;
        return { id, name: teamName.get(id), total: vids.length, bad: has((c) => st.get(c) === "bad"), slow: has((c) => st.get(c) === "slow"), hot: has((c) => st.get(c) === "hot"), test: has((c) => sysTest.has(c)), rnd: has(isRnd) };
    }).sort((a, b) => b.total - a.total);
    const push = new Map();
    // Video Win từng video: số liệu N ngày đầu kể từ ngày đăng (lib/video-win-data); thiếu thì dùng số hiện tại
    const pushVideos = all.filter((p) => { const tid = chTeam.get(p.channel_id); return isVideo(p) && !!tid && teamOrder.includes(tid) && p.product_codes.some(isRnd); });
    const first3d = await (0, video_win_data_1.loadFirstDays)(pushVideos.map((p) => p.id), f.winRules.traffic.days);
    for (const p of pushVideos) {
        const tid = chTeam.get(p.channel_id);
        const d = first3d.get(p.id);
        const win = (0, video_win_1.videoWinOf)(d ?? { views: Number(p.views ?? 0), viewers: p.viewers }, f.videoWin);
        for (const c of new Set(p.product_codes)) {
            if (!isRnd(c))
                continue;
            const k = `${tid}\u0000${c}`, r = push.get(k) ?? { teamId: tid, team: teamName.get(tid), code: c.toUpperCase(), name: info.get(c).name, videos: 0, winVideos: 0, qty: 0, verdict: null };
            r.videos += 1;
            if (win)
                r.winVideos += 1;
            push.set(k, r);
        }
    }
    const pushCodes = [...new Set([...push.values()].map((r) => r.code))];
    if (pushCodes.length) {
        const rows = await (0, daily_sales_1.loadDailySales)({
            codes: (0, spu_alias_1.expandCodes)(aliases, [...new Set(pushCodes.map((c) => canon(salesCode(c))))]), from: f.from, to: f.to,
            channels: f.channels.length ? f.channels : undefined, pageIds: teamChannels ? (teamChannels.length ? teamChannels : ["-"]) : undefined,
        });
        const net = new Map(); // team|mã bán → số bán thuần của các Page của team
        for (const r of rows) {
            const t = chTeam.get(r.page_id), c = canon(r.code);
            if (t)
                net.set(`${t}\u0000${c}`, (net.get(`${t}\u0000${c}`) ?? 0) + Number(r.qty_sold) - Number(r.qty_returned));
        }
        for (const r of push.values())
            r.qty = net.get(`${r.teamId}\u0000${canon(salesCode(r.code))}`) ?? 0;
    }
    const wf = await f.winFlags?.(pushCodes); // đánh giá cấp SPU (tổng mọi team): Ngôi sao = đạt cả Win Traffic và Win Đơn hàng
    for (const r of push.values()) {
        const wt = !!wf?.wt.has(r.code), od = !!wf?.order.has(r.code);
        r.verdict = wt && od ? "star" : od ? "win" : wt ? "wintraffic" : null;
    }
    const order = new Map(teamOrder.map((id, i) => [id, i]));
    const pushRows = [...push.values()].sort((a, b) => (order.get(a.teamId) - order.get(b.teamId)) || b.videos - a.videos || b.qty - a.qty);
    return {
        // S1 = SPU Active có video trong kỳ (stockCtx.s1Codes, lib/spu-dash); chia mới / cũ theo đánh giá + quy trình R&D + mã test
        s1: (() => {
            const list = stockCtx ? [...stockCtx.s1Codes] : codes;
            const fresh = list.filter((c) => newCodes.has(c)).length;
            return { newCodes: fresh, oldCodes: list.length - fresh };
        })(),
        teams, breakdown, push: pushRows,
    };
}
