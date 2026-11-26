"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fmtDateTime = exports.fmtDate = exports.fmtMoney = exports.fmtInt = exports.fmtCompact = exports.getLatestSyncLogs = exports.getPostsPageCached = exports.OVERVIEW_METRICS = exports.getAccounts = exports.limitByTeams = exports.CHANNELS = exports.RANGE_PRESETS = void 0;
exports.todayVN = todayVN;
exports.addDays = addDays;
exports.daysBetween = daysBetween;
exports.parseFilters = parseFilters;
exports.scopePageIds = scopePageIds;
exports.previousPeriod = previousPeriod;
exports.getDailyMetrics = getDailyMetrics;
exports.getSalesByChannel = getSalesByChannel;
exports.getPosts = getPosts;
exports.getPostsPage = getPostsPage;
exports.getProductInfo = getProductInfo;
exports.fmtMoneyShort = fmtMoneyShort;
require("server-only");
const date_range_1 = require("@/lib/date-range");
const daily_sales_1 = require("@/lib/daily-sales");
const cache_1 = require("next/cache");
const admin_1 = require("@/lib/supabase/admin");
const cache_tags_1 = require("@/lib/cache-tags");
const DAY_MS = 86_400_000;
// ---------- Ngày & bộ lọc ----------
// Ngày hôm nay theo giờ VN, dạng YYYY-MM-DD
function todayVN() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}
function addDays(date, n) {
    return new Date(Date.parse(date) + n * DAY_MS).toISOString().slice(0, 10);
}
function daysBetween(from, to) {
    return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
}
exports.RANGE_PRESETS = [7, 30, 90, 365];
exports.CHANNELS = {
    facebook: "Facebook",
    tiktok_shop: "TikTok Shop",
    tiktok: "TikTok",
    shopee: "Shopee",
    web: "Web",
    cua_hang: "Cửa hàng",
    zalo: "Zalo",
    instagram: "Instagram",
    khac: "Khác",
    bao_hanh: "Bảo hành",
};
const one = (v) => (Array.isArray(v) ? v[0] : v);
const isDate = (v) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
// Mặc định kết thúc ở HÔM NAY: gồm cả bài đăng, video và mẫu R&D mới tạo trong ngày
function parseFilters(sp) {
    let range = one(sp.range) ?? "30";
    let from, to;
    if (range === "custom" && isDate(one(sp.from)) && isDate(one(sp.to))) {
        from = one(sp.from);
        to = one(sp.to);
        if (from > to)
            [from, to] = [to, from];
    }
    else {
        // 7 / 30 / 90 / 365 ngày qua, Tháng này, Tháng trước; giá trị lạ → 30 ngày
        let r = (0, date_range_1.resolveRange)(range, todayVN());
        if (!r) {
            range = "30";
            r = (0, date_range_1.resolveRange)("30", todayVN());
        }
        ({ from, to } = r);
    }
    const channels = (one(sp.channels) ?? "").split(",").filter((c) => c in exports.CHANNELS);
    const teams = (one(sp.team) ?? "").split(",").filter(Boolean);
    return { from, to, range, scope: one(sp.scope) ?? "all", teams, channels };
}
// Page đang lọc: null = toàn hệ thống (không lọc theo Page)
// Chỉ giữ các Page thuộc team đang lọc (không chọn team → giữ nguyên)
const limitByTeams = (accounts, f) => f.teams.length ? accounts.filter((a) => !!a.team_id && f.teams.includes(a.team_id)) : accounts;
exports.limitByTeams = limitByTeams;
// myPageIds: các Page đã được giới hạn (quyền + team). Đang lọc theo team thì KHÔNG BAO GIỜ là "toàn hệ thống":
// luôn là Page của team (giao với Page tick chọn); team không có Page nào → danh sách giả để không ra số liệu nào.
function scopePageIds(f, myPageIds) {
    if (f.teams.length) {
        const picked = !f.scope || f.scope === "all" || f.scope === "mine" ? myPageIds : f.scope.split(",").filter((id) => myPageIds.includes(id));
        return picked.length ? picked : ["__none__"];
    }
    if (!f.scope || f.scope === "all")
        return null;
    if (f.scope === "mine")
        return myPageIds;
    return f.scope.split(",").filter(Boolean);
}
// Kỳ liền trước cùng độ dài
function previousPeriod(f) {
    const n = daysBetween(f.from, f.to);
    return { from: addDays(f.from, -n), to: addDays(f.from, -1) };
}
// Màu đi theo kênh (thứ tự tạo cố định), không theo thứ hạng
// Cache dùng chung (xoá khi đồng bộ / sửa kênh — bust(TAG.channels))
exports.getAccounts = (0, cache_1.unstable_cache)(async () => {
    const { data, error } = await admin_1.sb.social()
        .from("channels").select("id, name, platform, team_id").eq("is_active", true)
        .order("created_at").order("id");
    if (error)
        throw error;
    return data.map((a, i) => ({ ...a, color: `var(--series-${(i % 8) + 1})` }));
}, ["accounts"], { tags: [cache_tags_1.TAG.channels], revalidate: 3600 });
// Chỉ số kênh theo ngày = cột của social.channel_daily
exports.OVERVIEW_METRICS = {
    views: "Lượt xem",
    viewers: "Người xem",
    new_follows: "Theo dõi mới",
    engagements: "Tương tác",
    video_views: "Lượt xem video",
};
// Trả về dạng dài {account_id, metric, date, value} để trang Traffic gom nhóm linh hoạt
async function getDailyMetrics(channelIds, from, to) {
    const rows = await (0, admin_1.fetchAll)((a, b) => admin_1.sb.social().from("channel_daily")
        .select("channel_id, date, views, viewers, new_follows, engagements, video_views")
        .in("channel_id", channelIds).gte("date", from).lte("date", to)
        .order("date").order("channel_id").range(a, b));
    return rows.flatMap((r) => Object.keys(exports.OVERVIEW_METRICS).map((m) => ({ account_id: r.channel_id, metric: m, date: r.date, value: Number(r[m]) })));
}
async function getSalesByChannel(code, from, to) {
    // Cùng nguồn các báo cáo khác: file đơn hàng đã nhập (kênh suy từ cột "Nguồn") + số đồng bộ cho ngày ngoài khoảng file
    const rows = await (0, daily_sales_1.loadDailySales)({ codes: [code], from, to, keepWarranty: true });
    const by = new Map();
    for (const r of rows)
        by.set(r.channel, (by.get(r.channel) ?? 0) + r.qty_sold - r.qty_returned);
    return [...by].map(([channel, qty_net]) => ({ channel, qty_net })).sort((a, b) => b.qty_net - a.qty_net);
}
async function getPosts(channelIds, from, to) {
    // published_at là timestamptz; lọc theo ngày giờ VN (+07)
    return (0, admin_1.fetchAll)((a, b) => admin_1.sb.social().from("posts")
        .select("id, channel_id, published_at, kind, message, hashtags, product_codes, unknown_codes, content_line, concept, staff_code, permalink_url, thumbnail_url, views, viewers, reactions, comments, shares, clicks, video_views")
        .in("channel_id", channelIds)
        .gte("published_at", `${from}T00:00:00+07:00`).lte("published_at", `${to}T23:59:59+07:00`)
        .order("published_at", { ascending: false }).range(a, b));
}
async function getPostsPage(channelIds, from, to, sort, page, size, sku = "all", kind = "all", codes, minViews, search) {
    const first = (page - 1) * size;
    let q = admin_1.sb.social().from("posts")
        .select("id, channel_id, published_at, kind, message, hashtags, product_codes, unknown_codes, content_line, concept, staff_code, permalink_url, thumbnail_url, views, viewers, reactions, comments, shares, clicks, video_views", { count: "exact" })
        .in("channel_id", channelIds)
        .gte("published_at", `${from}T00:00:00+07:00`).lte("published_at", `${to}T23:59:59+07:00`);
    if (sku === "with")
        q = q.neq("product_codes", "{}");
    else if (sku === "without")
        q = q.eq("product_codes", "{}");
    else if (sku === "unknown")
        q = q.neq("unknown_codes", "{}");
    if (kind === "video")
        q = q.in("kind", ["video", "reel"]);
    if (codes) { // chỉ bài gắn ít nhất 1 trong các mã này (lọc theo kết quả đánh giá / có source)
        if (!codes.length)
            return { posts: [], total: 0 };
        q = q.overlaps("product_codes", codes);
    }
    // Lọc theo lượt xem (cùng bộ lọc với ngăn video ở trang Theo dõi SPU): số = lượt xem tối thiểu; đối tượng = tiêu chí Video Win
    // (chỉ các chỉ số lưu sẵn ở DB: lượt xem, người xem, cảm xúc, lượt nhấp, phép ≥; chỉ số tính ra như CTR bỏ qua)
    // Tìm kiếm: nội dung bài (gồm cả hashtag), mã SP gõ đúng dạng mã, hoặc TÊN sản phẩm trong danh mục (tên → các mã → bài gắn mã đó)
    const term = (search ?? "").replace(/[,()"'\\%*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
    if (term) {
        const conds = [`message.ilike.*${term}*`];
        if (/^#?[A-Za-z]{1,4}\d{3,}$/.test(term))
            conds.push(`product_codes.cs.{${term.replace(/^#/, "").toUpperCase()}}`);
        if (term.length >= 2) {
            const [{ data: named }, { data: namedOwn }] = await Promise.all([
                admin_1.sb.sales().from("catalog").select("code").ilike("name", `%${term}%`).limit(60),
                admin_1.sb.sales().from("spu_images").select("code").ilike("name", `%${term}%`).limit(60), // tên từ file Sapo (migration 054)
            ]);
            const codes = [...new Set([...(named ?? []), ...(namedOwn ?? [])].map((r) => String(r.code).toUpperCase().split("-")[0]))];
            if (codes.length)
                conds.push(`product_codes.ov.{${codes.join(",")}}`);
        }
        q = q.or(conds.join(","));
    }
    if (typeof minViews === "number")
        q = q.gte("views", minViews);
    else if (minViews) {
        const cols = { views: "views", viewers: "viewers", reactions: "reactions", clicks: "clicks" };
        const conds = minViews.rules.filter((r) => r.op === ">=" && r.metric in cols);
        if (minViews.match === "any" && conds.length)
            q = q.or(conds.map((r) => `${cols[r.metric]}.gte.${r.value}`).join(","));
        else
            for (const r of conds)
                q = q.gte(cols[r.metric], r.value);
    }
    const { data, count, error } = await q
        .order(sort, { ascending: false, nullsFirst: false }).order("published_at", { ascending: false }).order("id")
        .range(first, first + size - 1);
    if (error)
        throw error;
    return { posts: (data ?? []), total: count ?? 0 };
}
// Trang Bài đăng mở cho mọi người + mặc định mọi Page: mỗi lượt mở đếm chính xác + sắp xếp toàn bộ bài trong kỳ ở database.
// Lưu đệm 6 giờ (số traffic đồng bộ ~1 lần/ngày) DÙNG CHUNG theo đúng bộ lọc / trang (đổi trang, mở lại, nhiều người cùng mở không đụng database); đồng bộ xong thì xoá (TAG.sync).
exports.getPostsPageCached = (0, cache_1.unstable_cache)(getPostsPage, ["posts-page", "v1"], { tags: [cache_tags_1.TAG.sync], revalidate: 21_600 });
const catalogCache = new Map();
// Tên + ảnh của các mã mẫu (sales.catalog, đồng bộ từ kho Qlydonhang)
async function getProductInfo(codes) {
    const unique = [...new Set(codes.map((c) => c.toUpperCase()))];
    if (!unique.length)
        return {};
    const out = {};
    const missing = [];
    for (const c of unique) {
        const cached = catalogCache.get(c);
        if (cached)
            out[c] = cached;
        else
            missing.push(c);
    }
    if (missing.length) {
        const chunks = [];
        for (let i = 0; i < missing.length; i += 200)
            chunks.push(missing.slice(i, i + 200));
        const [results, own] = await Promise.all([
            Promise.all(chunks.map((c) => admin_1.sb.sales().from("catalog").select("code, name, image_url").in("code", c))),
            Promise.all(chunks.map(async (c) => {
                const r = await admin_1.sb.sales().from("spu_images").select("code, image_url, name").in("code", c);
                return r.error ? admin_1.sb.sales().from("spu_images").select("code, image_url").in("code", c) : r;
            })),
        ]);
        const ownImg = new Map();
        for (const { data } of own)
            for (const r of data ?? [])
                ownImg.set(String(r.code).toUpperCase(), { image_url: r.image_url ?? null, name: (r.name ?? null) });
        for (const { data, error } of results) {
            if (error) {
                console.error("getProductInfo:", error.message);
                continue;
            }
            for (const p of data) {
                const o = ownImg.get(String(p.code).toUpperCase());
                const item = { product_code: p.code, name: o?.name || p.name, image_url: o?.image_url ?? p.image_url };
                catalogCache.set(p.code, item);
                out[p.code] = item;
            }
        }
    }
    return out;
}
// Lần chạy gần nhất của mỗi (việc, kênh)
// Cache dùng chung (xoá sau mỗi lần ghi nhật ký đồng bộ — bust(TAG.sync))
exports.getLatestSyncLogs = (0, cache_1.unstable_cache)(async () => {
    const { data, error } = await admin_1.sb.core()
        .from("sync_runs").select("job, channel_id, status, message, finished_at")
        .order("started_at", { ascending: false }).limit(200);
    if (error)
        throw error;
    const seen = new Map();
    for (const l of data) {
        const key = `${l.job}|${l.channel_id ?? ""}`;
        if (!seen.has(key))
            seen.set(key, l);
    }
    return [...seen.values()];
}, ["sync-logs"], { tags: [cache_tags_1.TAG.sync], revalidate: 600 });
// ---------- Định dạng ----------
var format_1 = require("@/lib/format"); // định nghĩa ở lib/format.ts (dùng được ở client)
Object.defineProperty(exports, "fmtCompact", { enumerable: true, get: function () { return format_1.fmtCompact; } });
Object.defineProperty(exports, "fmtInt", { enumerable: true, get: function () { return format_1.fmtInt; } });
const fmtMoney = (n) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
exports.fmtMoney = fmtMoney;
const fmtDate = (d) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" })
    .format(typeof d === "string" ? new Date(d.length === 10 ? `${d}T12:00:00+07:00` : d) : d);
exports.fmtDate = fmtDate;
const fmtDateTime = (d) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(new Date(d));
exports.fmtDateTime = fmtDateTime;
// Tiền gọn cho ô KPI: 1,25 tỷ / 313 tr
function fmtMoneyShort(n) {
    const a = Math.abs(n);
    if (a >= 1e9)
        return `${(n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`;
    if (a >= 1e6)
        return `${(n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
    return (0, exports.fmtMoney)(n);
}
