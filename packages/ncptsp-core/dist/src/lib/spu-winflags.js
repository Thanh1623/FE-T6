"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMPTY_WIN = void 0;
exports.computeWinFlags = computeWinFlags;
exports.loadLaunchWinFlags = loadLaunchWinFlags;
exports.loadRollingWin = loadRollingWin;
exports.loadRollingWinByMarket = loadRollingWinByMarket;
exports.loadLaunchWinFlagsByMarket = loadLaunchWinFlagsByMarket;
require("server-only");
const cache_1 = require("next/cache");
const admin_1 = require("@/lib/supabase/admin");
const cache_tags_1 = require("@/lib/cache-tags");
const daily_sales_1 = require("@/lib/daily-sales");
const spu_alias_1 = require("@/lib/spu-alias");
const db_gate_1 = require("@/lib/db-gate");
// QUY TẮC WIN DUY NHẤT (biên bản họp R&D × ĐVKD, ngưỡng chỉnh ở trang KPI → core.settings 'spu_rules'.win) — xem docs/KIEN-TRUC-TONG-HOP-SPU.md, mục 6.1.
// Cùng một bộ ngưỡng, HAI cách tính tuỳ đối tượng:
//   1) CUỐN CHIẾU (loadRollingWin) — SPU đang bán (trang Theo dõi đẩy hàng, Dashboard S2–S4). KHÔNG phụ thuộc kỳ lọc, luôn tính theo "ngày gần nhất":
//        Win Traffic  = lượt xem TĂNG THÊM ≥ traffic.views VÀ bình luận TĂNG THÊM ≥ traffic.comments trong traffic.days ngày gần nhất, cộng dồn MỌI video gắn mã SPU
//                       (tăng thêm = số hiện tại − ảnh chụp cuối ngày [hôm nay − N]; xem SQL sales.spu_traffic_gain, migration 062).
//        Win Đơn hàng = số sản phẩm bán thuần (bán − hoàn) ≥ order.qty trong order.days ngày gần nhất (không cần có video).
//        Ngôi sao     = đạt cả hai.   Team / Page đang lọc vẫn có tác dụng (chỉ tính video của Page đó và số bán của Page đó); kỳ ngày thì không.
//   2) THEO MỐC VIDEO ĐẦU TIÊN (loadLaunchWinFlags) — mẫu MỚI: mã test và SP R&D (Báo cáo R&D). "Ngày đầu" = bài video đầu tiên của mã từ trước đến nay (400 ngày dữ liệu):
//        Win Traffic = tổng lượt xem + bình luận của các video đăng trong traffic.days ngày đầu · Win Đơn hàng = bán ≥ order.qty trong order.days ngày kể từ video đầu tiên.
// Cả hai đánh giá cấp SẢN PHẨM (gộp mọi video gắn mã), không chấm riêng từng video. Lưu đệm chung 5 phút theo bộ tham số, xoá khi đồng bộ / nhập file (TAG.spuData).
const DAY = 86_400_000;
const addDays = (d, n) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const vnDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
// Hàm thuần của bước tính (tách ra để kiểm thử): posts + dòng bán → tập mã đạt
function computeWinFlags(posts, sales, rules, saleCode = (c) => c) {
    const first = new Map();
    const byCode = new Map();
    for (const p of posts) {
        const day = vnDay(p.published_at);
        for (const c of new Set(p.product_codes.map((x) => x.toUpperCase()))) {
            if (!first.has(c) || day < first.get(c))
                first.set(c, day);
            const l = byCode.get(c);
            const e = { day, views: Number(p.views ?? 0), comments: Number(p.comments ?? 0) };
            if (l)
                l.push(e);
            else
                byCode.set(c, [e]);
        }
    }
    const wt = new Set();
    for (const [c, f] of first) {
        const end = addDays(f, rules.traffic.days - 1);
        let v = 0, cm = 0;
        for (const e of byCode.get(c))
            if (e.day <= end) {
                v += e.views;
                cm += e.comments;
            }
        if (v >= rules.traffic.views && cm >= rules.traffic.comments)
            wt.add(c);
    }
    const bySale = new Map();
    for (const r of sales) {
        const l = bySale.get(r.code);
        if (l)
            l.push(r);
        else
            bySale.set(r.code, [r]);
    }
    const order = new Set();
    for (const [c, f] of first) {
        const end = addDays(f, rules.order.days - 1);
        const qty = (bySale.get(saleCode(c)) ?? []).filter((r) => r.date >= f && r.date <= end).reduce((n, r) => n + Number(r.qty_sold) - Number(r.qty_returned), 0);
        if (qty >= rules.order.qty)
            order.add(c);
    }
    return { wt: [...wt].sort(), order: [...order].sort() };
}
async function computeFromDb(a) {
    const want = a.codes ? [...new Set(a.codes.map((c) => c.toUpperCase()))] : null;
    const [{ data: ch }, { data: prod }, aliases] = await Promise.all([
        admin_1.sb.social().from("channels").select("id").eq("is_active", true),
        admin_1.sb.rnd().from("products").select("code, sapo_code").not("sapo_code", "is", null), // mã R&D có mã Sapo riêng (số bán nằm ở mã Sapo)
        (0, spu_alias_1.loadSpuAliases)(), // quy đổi mã SPU cũ → mới (migration 066)
    ]);
    const canon = (0, spu_alias_1.canonOf)(aliases);
    const sapo = new Map((prod ?? []).filter((p) => p.code && p.sapo_code).map((p) => [String(p.code).toUpperCase(), String(p.sapo_code).toUpperCase()]));
    const saleCode = (c) => canon(sapo.get(c) ?? c);
    const loadSales = (codes) => codes.length ? (0, daily_sales_1.loadDailySales)({
        codes: (0, spu_alias_1.expandCodes)(aliases, [...new Set(codes.map(saleCode))]), from: a.from, to: addDays(a.to, a.rules.order.days),
        channels: a.channels.length ? a.channels : undefined, pageIds: a.pageIds ? (a.pageIds.length ? a.pageIds : ["-"]) : undefined,
    }) : Promise.resolve([]);
    const postsQuery = () => {
        let q = admin_1.sb.social().from("posts").select("channel_id, published_at, product_codes, views, comments")
            .in("kind", ["video", "reel"]).neq("product_codes", "{}").gte("published_at", `${a.from}T00:00:00+07:00`).lte("published_at", `${a.to}T23:59:59+07:00`);
        if (a.pageIds)
            q = q.in("channel_id", a.pageIds.length ? a.pageIds : ["-"]);
        if (want) {
            const ex = (0, spu_alias_1.expandCodes)(aliases, want);
            q = q.overlaps("product_codes", [...new Set([...ex, ...ex.map((c) => c.toLowerCase())])]);
        }
        return q;
    };
    // Theo khoá published_at thay cho OFFSET (≤ 4 bài cùng thời điểm) — xem lib/paging.ts
    const loadPosts = () => (0, admin_1.fetchAllByKey)((after, limit) => { let q = postsQuery(); if (after)
        q = q.gt("published_at", after); return q.order("published_at").order("id").limit(limit); }, (r) => r.published_at, () => (0, admin_1.fetchAll)((x, y) => postsQuery().order("published_at").order("id").range(x, y)));
    const active = new Set((ch ?? []).map((c) => c.id));
    let posts, sales;
    if (want)
        [posts, sales] = await Promise.all([loadPosts(), loadSales(want)]); // biết trước danh sách mã → lấy video và số bán song song
    else {
        posts = await loadPosts();
        sales = await loadSales([...new Set(posts.filter((p) => active.has(p.channel_id)).flatMap((p) => p.product_codes.map((c) => c.toUpperCase())))]);
    }
    const kept = (0, spu_alias_1.canonPosts)(aliases, posts.filter((p) => active.has(p.channel_id))); // chỉ kênh đang bật (cùng quy tắc với số video ở bảng tổng hợp); mã cũ gộp vào mã mới
    const salesC = aliases.size ? sales.map((r) => ({ ...r, code: canon(r.code) })) : sales;
    return computeWinFlags(kept, salesC, a.rules, saleCode);
}
const cached = (0, cache_1.unstable_cache)(async (a) => computeFromDb(a), ["spu-winflags", "v3"], { tags: [cache_tags_1.TAG.spuData], revalidate: 21_600 });
async function loadLaunchWinFlags(a) {
    const norm = { ...a, codes: a.codes ? [...new Set(a.codes.map((c) => c.toUpperCase()))].sort() : undefined, pageIds: a.pageIds ? [...a.pageIds].sort() : null, channels: [...a.channels].sort() }; // cùng bộ lọc → cùng khoá đệm
    let out;
    try {
        out = await cached(norm);
    }
    catch {
        out = await computeFromDb(norm);
    }
    return { wt: new Set(out.wt), order: new Set(out.order) };
}
exports.EMPTY_WIN = { wt: new Set(), order: new Set() };
async function rollingFromDb(a) {
    const [gainRes, sales] = await Promise.all([
        (0, db_gate_1.heavyQuery)(async () => admin_1.sb.sales().rpc("spu_traffic_gain", { p: { today: a.today, days: a.rules.traffic.days, ...(a.pageIds ? { channels: a.pageIds } : {}) } })),
        (0, daily_sales_1.loadDailySales)({
            from: addDays(a.today, -(a.rules.order.days - 1)), to: a.today,
            channels: a.channels.length ? a.channels : undefined, pageIds: a.pageIds ? (a.pageIds.length ? a.pageIds : ["-"]) : undefined,
        }),
    ]);
    const wt = [];
    let meta = { base: addDays(a.today, -a.rules.traffic.days), trafficReady: false, videos: 0, unknownVideos: 0 };
    if (!gainRes.error && gainRes.data) {
        const g = gainRes.data;
        for (const r of g.rows)
            if (Number(r.views) >= a.rules.traffic.views && Number(r.comments) >= a.rules.traffic.comments)
                wt.push(r.code.toUpperCase());
        meta = { base: g.base, trafficReady: true, videos: g.videos, unknownVideos: g.unknown };
    }
    const canon = (0, spu_alias_1.canonOf)(await (0, spu_alias_1.loadSpuAliases)()); // số bán của mã cũ cộng vào SPU mới (bảng quy đổi mã, migration 066)
    const net = new Map();
    for (const r of sales) {
        const c = canon(r.code);
        net.set(c, (net.get(c) ?? 0) + Number(r.qty_sold) - Number(r.qty_returned));
    }
    const order = [...net].filter(([, q]) => q >= a.rules.order.qty).map(([c]) => c).sort();
    return { wt: wt.sort(), order, meta };
}
// Lưu đệm 1 giờ: bị xoá ngay khi đồng bộ / nhập file (TAG.spuData) và được làm nóng lại sau mỗi lần làm mới bảng tổng hợp (spu-summary.ts), nên người dùng hầu như không phải chờ
// Kết quả KHÔNG tính được Win Traffic (hàm SQL lỗi / quá thời gian) thì ném lỗi để KHÔNG lưu đệm: trước đây kết quả lỗi bị lưu 6 giờ nên thông báo "chưa tính được Win Traffic" còn mãi dù đã chạy migration 062
const rollingCached = (0, cache_1.unstable_cache)(async (a) => {
    const r = await rollingFromDb(a);
    if (!r.meta.trafficReady)
        throw new Error("spu_traffic_gain chưa tính được");
    return r;
}, ["spu-rollingwin", "v2"], { tags: [cache_tags_1.TAG.spuData], revalidate: 21_600 });
async function loadRollingWin(a) {
    const today = a.today ?? vnDay(new Date().toISOString());
    const norm = { today, pageIds: a.pageIds ? [...a.pageIds].sort() : null, channels: [...a.channels].sort(), rules: a.rules }; // cùng bộ lọc → cùng khoá đệm
    let out;
    try {
        out = await rollingCached(norm);
    }
    catch {
        out = await rollingFromDb(norm);
    }
    return { wt: new Set(out.wt), order: new Set(out.order), meta: out.meta };
}
const idsOf = (a, m) => (a.pageIds ?? a.poolIds).filter((id) => (a.markets[id] ?? "vn") === m); // kênh chưa phân loại coi là trong nước
const union = (x, y) => new Set([...x, ...y]);
async function loadRollingWinByMarket(a) {
    const base = { channels: a.channels, rules: a.rules, today: a.today };
    if (a.market !== "all")
        return loadRollingWin({ ...base, pageIds: idsOf(a, a.market) });
    const [all, vn, intl] = await Promise.all([
        loadRollingWin({ ...base, pageIds: a.pageIds }),
        loadRollingWin({ ...base, pageIds: idsOf(a, "vn") }),
        loadRollingWin({ ...base, pageIds: idsOf(a, "intl") }),
    ]);
    return {
        wt: union(vn.wt, intl.wt), order: all.order,
        meta: { ...all.meta, trafficReady: all.meta.trafficReady && vn.meta.trafficReady && intl.meta.trafficReady },
    };
}
async function loadLaunchWinFlagsByMarket(a) {
    const { pageIds: _p, poolIds: _o, markets: _m, market: _k, ...rest } = a;
    void _p;
    void _o;
    void _m;
    void _k;
    if (a.market !== "all")
        return loadLaunchWinFlags({ ...rest, pageIds: idsOf(a, a.market) });
    const [all, vn, intl] = await Promise.all([
        loadLaunchWinFlags({ ...rest, pageIds: a.pageIds }),
        loadLaunchWinFlags({ ...rest, pageIds: idsOf(a, "vn") }),
        loadLaunchWinFlags({ ...rest, pageIds: idsOf(a, "intl") }),
    ]);
    return { wt: union(vn.wt, intl.wt), order: all.order };
}
