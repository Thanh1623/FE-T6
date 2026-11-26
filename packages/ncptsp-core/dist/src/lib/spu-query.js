"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.spuReadMode = void 0;
exports.queryLegacy = queryLegacy;
exports.rpcParams = rpcParams;
exports.viewFromSql = viewFromSql;
exports.querySql = querySql;
exports.querySpu = querySpu;
exports.loadSpuVids = loadSpuVids;
exports.resolveOpenView = resolveOpenView;
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
const db_gate_1 = require("@/lib/db-gate");
const spu_data_1 = require("@/lib/spu-data");
const data_1 = require("@/lib/data");
const pipeline_1 = require("@/lib/pipeline");
const channel_market_1 = require("@/lib/channel-market");
const video_win_data_1 = require("@/lib/video-win-data");
const spu_tracking_1 = require("@/lib/spu-tracking");
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0); // so sánh theo mã ký tự (giống collate "C" của SQL)
// ===== Đường cũ: tính trực tiếp từ SpuRow[] (logic gốc của trang, chuyển nguyên sang đây) =====
function queryLegacy(allRows, q) {
    const { days, endAge, group, words, teams, rules: R, win } = q;
    const warehouses = [...new Set(allRows.flatMap((r) => Object.keys(r.stockBy)))].sort();
    const wh = warehouses.includes(q.wh) ? q.wh : "";
    const search = (r) => `${r.code} ${r.name}`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
    const inFilter = (r) => (!group || r.group === group) && (!wh || (r.stockBy[wh] ?? 0) > 0) && (!words.length || words.every((w) => search(r).includes(w)));
    const base = allRows.filter(inFilter).map((r) => (0, spu_tracking_1.viewOf)(r, { wh: wh || null, days, endAge, rules: R, win })).filter((v) => v.flags.active);
    // Danh sách SPU và phân loại theo tồn / SL bán 30 ngày luôn toàn công ty (companyClass); lọc team chỉ đổi SL bán, số video, lượt xem của team — không lọc bớt danh sách (khớp sales.spu_query, migration 082)
    const scope = teams.length
        ? allRows.filter(inFilter).map((r) => (0, spu_tracking_1.viewOf)(r, { wh: wh || null, days, endAge, rules: R, teams, win, companyClass: true })).filter((v) => v.flags.active)
        : base;
    const hasTeamVideo = (v) => !teams.length || v.row.vids.some((x) => x.age >= endAge && x.age < endAge + days && !!x.team && teams.includes(x.team));
    const vidsOf = (v) => v.row.vids.filter((x) => x.age >= endAge && x.age < endAge + days && (!teams.length || (!!x.team && teams.includes(x.team)))).length;
    // Team đã đăng video TRONG kỳ lọc (và thuộc team đang lọc) — không phải mọi team từng đăng mã này
    const periodTeams = (v) => [...new Set(v.row.vids.filter((x) => x.age >= endAge && x.age < endAge + days && !!x.team && (!teams.length || teams.includes(x.team))).map((x) => x.team))];
    const count = (f) => {
        const withVideo = base.filter((v) => f(v) && v.flags.hasVideo && hasTeamVideo(v));
        return { all: base.filter(f).length, video: withVideo.length, vids: withVideo.reduce((n, v) => n + vidsOf(v), 0) };
    };
    const cards = { active: count(() => true), instock: count((v) => v.flags.inStock), hot: count((v) => v.flags.hot), normal: count((v) => v.flags.normal), slow: count((v) => v.flags.slow), bad: count((v) => v.flags.bad) };
    const statusCounts = Object.fromEntries(spu_tracking_1.STATUS_FILTERS.map((s) => [s.id, scope.filter((v) => s.test(v.flags)).length]));
    const test = spu_tracking_1.STATUS_FILTERS.find((s) => s.id === q.status).test;
    const dirMul = q.dir === "asc" ? 1 : -1;
    const val = (v) => (q.sort === "stock" ? v.stock : q.sort === "available" ? v.available : q.sort === "incoming" ? v.row.incoming : q.sort === "age" ? v.row.ageDays : q.sort === "sold" ? v.sold : q.sort === "videos" ? v.videos : q.sort === "teams" ? (v.videos > 0 ? periodTeams(v).length : 0) : q.sort === "views3" ? (v.views3 ?? null) : v.views);
    const filtered = scope.filter((v) => test(v.flags)).sort((a, b) => {
        const x = val(a), y = val(b);
        if (x === null && y === null)
            return cmpStr(a.row.code, b.row.code);
        if (x === null)
            return 1; // chưa có dữ liệu luôn xuống cuối, kể cả khi sắp xếp tăng dần
        if (y === null)
            return -1;
        return (x - y) * dirMul || cmpStr(a.row.code, b.row.code);
    });
    const pages = Math.max(1, Math.ceil(filtered.length / q.pageSize));
    const page = Math.min(q.page, pages);
    const sum = (f) => filtered.reduce((n, v) => n + (f(v) ?? 0), 0);
    const totals = {
        stock: sum((v) => v.stock), available: sum((v) => v.available), incoming: sum((v) => v.row.incoming), sold: sum((v) => v.sold), videos: sum((v) => v.videos), views: sum((v) => v.views),
        teams: new Set(filtered.flatMap(periodTeams)).size,
    };
    return { wh, spus: allRows.length, warehouses, cards, statusCounts, total: filtered.length, page, pages, totals, rows: filtered.slice((page - 1) * q.pageSize, page * q.pageSize).map((v) => ({ ...v, row: { ...v.row, teams: periodTeams(v) } })) };
}
function rpcParams(q) {
    return {
        today: q.today, days: q.days, end_age: q.endAge, teams: q.teams, wh: q.wh, grp: q.group, words: q.words,
        slow_below: q.rules.sales.slowBelow, normal_below: q.rules.sales.normalBelow,
        status: q.status, sort: q.sort, dir: q.dir, page: q.page, page_size: q.pageSize,
        wt: [...q.win.wt], ord: [...q.win.order], market: (0, channel_market_1.marketForSql)(q.market),
    };
}
// Dựng View từ một dòng SQL. Phần "gợi ý hành động" dùng CHUNG actionOf với đường cũ. row.vids / row.sales để trống (ngăn video nạp riêng theo từng SPU).
function viewFromSql(r, q) {
    const sf = (0, spu_tracking_1.saleFlags)(r.stock, r.sl30, q.rules);
    const flags = { active: sf.active, inStock: sf.inStock, hot: sf.hot, normal: sf.normal, other: sf.other, slow: sf.slow, bad: sf.bad, star: r.star, win: r.win, winTraffic: r.wt, hasVideo: r.videos > 0 };
    const row = {
        code: r.code, name: r.name, group: r.grp, variants: r.variants ?? 1, image: r.image ?? null, stockBy: {}, availBy: null, incoming: r.incoming,
        ageDays: r.age_days, ageApprox: r.age_approx, sold30: r.sold30, sales: [], soldBy: {}, vids: [], footage: null, teams: r.video_teams,
    };
    const action = (0, spu_tracking_1.actionOf)({ stock: r.stock, inStock: sf.inStock, sl30: r.sl30, sold: r.sold, videos: r.videos, ageDays: r.age_days, footage: null, days: q.days, flags: { star: r.star, win: r.win, winTraffic: r.wt, bad: sf.bad, slow: sf.slow } }, q.rules);
    return { row, stock: r.stock, available: r.available ?? null, sold: r.sold, videos: r.videos, views: r.views, views3: r.views3 ?? null, flags, action };
}
async function querySql(q) {
    const { data, error } = await (0, db_gate_1.heavyRpc)(() => admin_1.sb.sales().rpc("spu_query", { p: rpcParams(q) })); // quá thời gian → thử lại 1 lần thay vì rơi ngay sang đường tính trực tiếp (rất nặng)
    if (error || !data) {
        if (error)
            console.error("spu_query lỗi:", error.message);
        return null;
    }
    const d = data;
    if (q.status === "outstock" && d.status_counts?.outstock === undefined)
        return null; // hàm SQL chưa có bộ lọc này (chưa chạy migration 095) → đường tính trực tiếp
    if (!d.refreshed_at && d.total === 0 && d.warehouses.length === 0)
        return null; // bảng tổng hợp chưa được làm mới lần nào → dùng đường cũ
    return {
        refreshedAt: d.refreshed_at, wh: d.wh, spus: d.spus,
        meta: { salesSource: d.meta?.sales_source ?? "none", salesLines: d.meta?.sales_lines ?? 0, salesQty: d.meta?.sales_qty ?? 0, salesFrom: d.meta?.sales_from ?? null, salesTo: d.meta?.sales_to ?? null, skus: d.meta?.skus ?? 0, teamQty: d.meta?.team_qty ?? 0 },
        warehouses: d.warehouses, cards: d.cards, statusCounts: d.status_counts, total: d.total, page: d.page, pages: d.pages,
        totals: d.totals, rows: d.rows.map((r) => viewFromSql(r, q)),
        marketApplied: !(0, channel_market_1.marketForSql)(q.market) || d.market === (0, channel_market_1.marketForSql)(q.market),
    };
}
const spuReadMode = () => (process.env.SPU_READ_MODE === "legacy" ? "legacy" : "sql");
exports.spuReadMode = spuReadMode;
async function querySpu(q) {
    if ((0, exports.spuReadMode)() === "sql") {
        const r = await querySql(q);
        if (r)
            return { ...r, source: "sql" };
    }
    const [rows, meta] = await Promise.all([(0, spu_data_1.loadSpuRows)(), (0, spu_data_1.loadSpuMeta)()]);
    return { ...queryLegacy(rows, q), meta, source: "legacy", refreshedAt: null };
}
// ===== Ngăn video của một SPU =====
// Đường SQL không mang danh sách video (chỉ số theo ngày × kênh) → nạp video của ĐÚNG SPU đang mở trực tiếp từ bài đăng (1 truy vấn nhỏ).
// Giữ cùng quy tắc với lib/spu-data: chỉ video / reel của kênh đang bật, tuổi tính theo ngày giờ VN, team theo kênh.
async function loadSpuVids(code, today, marketSel = "all") {
    const market = (0, channel_market_1.marketForSql)(marketSel);
    const [accounts, teams, markets, { data }] = await Promise.all([
        (0, data_1.getAccounts)(), (0, pipeline_1.getTeams)(), market ? (0, channel_market_1.loadChannelMarkets)() : Promise.resolve({}),
        admin_1.sb.social().from("posts").select("id, channel_id, published_at, views").in("kind", ["video", "reel"]).contains("product_codes", [code])
            .gte("published_at", `${new Date(Date.parse(today) - 400 * 86_400_000).toISOString().slice(0, 10)}T00:00:00+07:00`).order("published_at", { ascending: false }).limit(5000),
    ]);
    const chan = new Map(accounts.map((a) => [a.id, a])), teamName = new Map(teams.map((t) => [t.id, t.name]));
    const vnDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
    const PLATFORM = { facebook: "FB", instagram: "IG", tiktok: "TT" };
    const out = [];
    for (const p of data ?? []) {
        const ch = chan.get(p.channel_id);
        if (!ch)
            continue;
        if (market && (markets[p.channel_id] ?? "vn") !== market)
            continue; // lọc thị trường: ngăn video khớp với số trên bảng
        out.push({
            id: String(p.id), channelId: p.channel_id, age: Math.max(0, Math.round((Date.parse(today) - Date.parse(vnDay(p.published_at))) / 86_400_000)),
            views: Number(p.views ?? 0), platform: PLATFORM[ch.platform] ?? "FB", channel: ch.name, team: ch.team_id ? teamName.get(ch.team_id) ?? null : null,
        });
    }
    return out;
}
// View của SPU đang mở ngăn video: ưu tiên dòng đã có trong trang hiện tại; không có thì truy vấn riêng theo mã. Đường SQL thì gắn thêm danh sách video.
async function resolveOpenView(code, q, res) {
    let v = res.rows.find((x) => x.row.code === code) ?? null;
    if (!v) {
        const one = await querySpu({ ...q, words: [code.toLowerCase()], status: "all", page: 1, pageSize: 20 });
        v = one.rows.find((x) => x.row.code === code) ?? null;
    }
    if (!v)
        return null;
    if (res.source === "sql")
        v = { ...v, row: { ...v.row, vids: await loadSpuVids(code, q.today, q.market ?? "all") } };
    // Video Win theo N ngày đầu kể từ ngày đăng của từng video (lib/video-win-data)
    const first = await (0, video_win_data_1.loadFirstDays)(v.row.vids.map((x) => x.id ?? ""), q.rules.win.traffic.days);
    return { ...v, row: { ...v.row, vids: v.row.vids.map((x) => ({ ...x, first3d: x.id ? first.get(x.id) : undefined })) } };
}
