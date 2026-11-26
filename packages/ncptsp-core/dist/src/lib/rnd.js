"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RND_STATUS = exports.RND_FIELDS = exports.RND_BUCKET = void 0;
exports.listRndProducts = listRndProducts;
exports.getRndProduct = getRndProduct;
exports.getRndHistory = getRndHistory;
exports.signImages = signImages;
exports.signThumbs = signThumbs;
exports.getFieldSuggestions = getFieldSuggestions;
exports.getCardStats = getCardStats;
exports.loadTrafficKpi = loadTrafficKpi;
exports.gradeVideo = gradeVideo;
exports.getProductVideos = getProductVideos;
require("server-only");
const cache_1 = require("next/cache");
const admin_1 = require("@/lib/supabase/admin");
const daily_sales_1 = require("@/lib/daily-sales");
const rnd_code_stats_1 = require("@/lib/rnd-code-stats");
const session_1 = require("@/lib/session");
const media_1 = require("@/lib/media");
const rnd_constants_1 = require("@/lib/rnd-constants");
const pipeline_constants_1 = require("@/lib/pipeline-constants");
const code_links_1 = require("@/lib/code-links");
const spu_rules_1 = require("@/lib/spu-rules");
const rules_1 = require("@/lib/eval/rules");
const kpi_constants_1 = require("@/lib/kpi-constants");
var rnd_constants_2 = require("@/lib/rnd-constants");
Object.defineProperty(exports, "RND_BUCKET", { enumerable: true, get: function () { return rnd_constants_2.RND_BUCKET; } });
Object.defineProperty(exports, "RND_FIELDS", { enumerable: true, get: function () { return rnd_constants_2.RND_FIELDS; } });
Object.defineProperty(exports, "RND_STATUS", { enumerable: true, get: function () { return rnd_constants_2.RND_STATUS; } });
// Kết luận R&D hiện hành (view rnd.current_decisions — dòng mới nhất của rnd.decisions)
async function currentResults(ids) {
    if (!ids.length)
        return new Map();
    const { data } = await admin_1.sb.rnd().from("current_decisions").select("product_id, result").in("product_id", ids);
    return new Map((data ?? []).map((d) => [d.product_id, d.result]));
}
async function listRndProducts(status) {
    // Chỉ mẫu đã có mã (hashtag) — mẫu sưu tầm chưa gắn SKU nằm ở bảng quy trình
    const base = () => { let q = admin_1.sb.rnd().from("products").select("*").not("code", "is", null); if (status && status in rnd_constants_1.RND_STATUS)
        q = q.eq("status", status); return q; };
    // Phân trang (bảng > 1.000 hồ sơ có mã); sắp theo cập nhật mới nhất rồi theo id cho ổn định thứ tự giữa các trang
    const rows = await (0, admin_1.fetchAll)((a, b) => base().order("updated_at", { ascending: false }).order("id").range(a, b));
    const [names, results] = await Promise.all([(0, session_1.profileNames)(rows.map((r) => r.created_by)), currentResults(rows.map((r) => r.id))]);
    return rows.map((p) => ({ ...p, code: p.code, created_by_name: p.created_by ? names.get(p.created_by) ?? null : null, confirmed_result: results.get(p.id) ?? null }));
}
async function getRndProduct(id) {
    const { data, error } = await admin_1.sb.rnd().from("products").select("*").eq("id", id).maybeSingle();
    if (error)
        throw error;
    if (!data)
        return null;
    const results = await currentResults([id]);
    return { ...data, confirmed_result: results.get(id) ?? null };
}
async function getRndHistory(productId) {
    const { data, error } = await admin_1.sb.rnd().from("product_events")
        .select("id, action, changes, created_at, actor_id")
        .eq("product_id", productId).order("created_at", { ascending: false }).limit(50);
    if (error)
        throw error;
    const names = await (0, session_1.profileNames)(data.map((r) => r.actor_id));
    return data.map(({ actor_id, ...r }) => ({ ...r, actor: actor_id && names.has(actor_id) ? { full_name: names.get(actor_id) } : null }));
}
// Ảnh trong bucket private → URL ký 1 giờ
// Link ký giữ lại trong bộ nhớ tiến trình: không phải ký lại mỗi lần tải trang (bớt 1 lượt gọi Storage),
// và cùng 1 ảnh giữ nguyên URL → trình duyệt dùng lại ảnh đã tải thay vì tải lại.
const SIGN_TTL = 6 * 3600; // link sống 6 giờ
const REUSE_MS = 5 * 3600_000; // dùng lại tối đa 5 giờ → luôn còn ≥ 1 giờ hiệu lực
const signedCache = new Map();
async function signImages(paths) {
    if (!paths.length)
        return {};
    const now = Date.now();
    const out = {};
    const missing = [];
    for (const p of paths) {
        const c = signedCache.get(p);
        if (c && now - c.at < REUSE_MS)
            out[p] = c.url;
        else
            missing.push(p);
    }
    for (const p of missing.filter(media_1.isCld))
        out[p] = (0, media_1.cloudinaryUrl)(p); // ảnh ở Cloudinary: ký tại chỗ, không gọi mạng
    const legacy = missing.filter((p) => !(0, media_1.isCld)(p));
    if (legacy.length) {
        const { data, error } = await (0, admin_1.supabaseAdmin)().storage.from(rnd_constants_1.RND_BUCKET).createSignedUrls(legacy, SIGN_TTL);
        if (error) {
            console.error("signImages:", error.message);
            return out;
        }
        for (const d of data)
            if (d.path && d.signedUrl) {
                out[d.path] = d.signedUrl;
                signedCache.set(d.path, { url: d.signedUrl, at: now });
            }
        if (signedCache.size > 20_000)
            for (const [k, v] of signedCache)
                if (now - v.at >= REUSE_MS)
                    signedCache.delete(k);
    }
    return out;
}
// Ảnh nhỏ cho bảng / thẻ thư viện: Supabase Storage tự thu nhỏ (360px, ~5–15KB thay vì ảnh gốc 200KB+).
// Ảnh gốc chỉ tải khi bấm phóng to. API ký ảnh nhỏ không ký hàng loạt được → ký từng ảnh. Giữ 2 tầng:
// bộ nhớ tiến trình (nhanh nhất) + cache dùng chung của Next/Vercel (máy chủ mới khởi động không phải ký lại từ đầu).
const THUMB = { width: 360, height: 360, resize: "cover", quality: 70 };
const thumbCache = new Map();
const sharedThumb = (0, cache_1.unstable_cache)(async (path) => {
    const { data } = await (0, admin_1.supabaseAdmin)().storage.from(rnd_constants_1.RND_BUCKET).createSignedUrl(path, SIGN_TTL, { transform: THUMB });
    return data?.signedUrl ?? null;
}, ["rnd-thumb-v1"], { revalidate: REUSE_MS / 1000 });
async function signThumbs(paths) {
    const now = Date.now();
    const out = {};
    const missing = [];
    for (const p of paths) {
        if ((0, media_1.isCld)(p)) {
            out[p] = (0, media_1.cloudinaryUrl)(p, true);
            continue;
        }
        const c = thumbCache.get(p);
        if (c && now - c.at < REUSE_MS)
            out[p] = c.url;
        else
            missing.push(p);
    }
    for (let i = 0; i < missing.length; i += 16) {
        await Promise.all(missing.slice(i, i + 16).map(async (p) => {
            const url = await sharedThumb(p);
            if (url) {
                out[p] = url;
                thumbCache.set(p, { url, at: now });
            }
        }));
    }
    if (thumbCache.size > 20_000)
        for (const [k, v] of thumbCache)
            if (now - v.at >= REUSE_MS)
                thumbCache.delete(k);
    return out;
}
// Gợi ý cho ô nhập (line, chất liệu...) từ giá trị đã dùng
async function getFieldSuggestions() {
    const data = await (0, admin_1.fetchAll)((a, b) => admin_1.sb.rnd().from("products").select("line, category, material, stone").order("id").range(a, b)); // phân trang: bảng > 1.000 hồ sơ
    const pick = (k) => [...new Set((data ?? []).map((r) => r[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi"));
    return { line: pick("line"), category: pick("category"), material: pick("material"), stone: pick("stone") };
}
const DAY_MS = 86_400_000;
const vnToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const shift = (d, n) => new Date(Date.parse(d) + n * DAY_MS).toISOString().slice(0, 10);
async function getCardStats(input) {
    const out = {};
    // Mẫu chưa gắn mã (đang sưu tầm) không có dữ liệu thị trường
    const products = input.filter((p) => !!p.code);
    if (!products.length)
        return out;
    const today = vnToday();
    // Mẫu Media đã gắn mã SPU: tính cả bài gắn #SPU và số bán của mã SPU (xem lib/code-links)
    const skuOf = new Map();
    for (const l of await (0, code_links_1.loadCodeLinks)())
        skuOf.set(l.test_code, [...(skuOf.get(l.test_code) ?? []), l.sku_code]);
    const codesOf = (p) => [p.code.toUpperCase(), ...(skuOf.get(p.code.toUpperCase()) ?? [])];
    const codes = [...new Set(products.flatMap(codesOf))];
    for (const p of products) {
        out[p.code] = { since: null, days: null, posts: 0, videos: 0, views: 0, viewers: 0, reactions: 0, clicks: 0,
            ctr: null, qtyNet: 0, conversion: null, daily: Array(30).fill(0), trendPct: null };
    }
    // Traffic: chỉ số trọn đời (cột) của mọi bài có mã đã nhận diện — database tính sẵn (migration 057); chưa có hàm thì kéo bài về cộng như cũ
    const dbStats = await (0, rnd_code_stats_1.rndCodeStats)(products.map((p) => ({ id: p.code, codes: codesOf(p), from: (0, pipeline_constants_1.trafficFrom)(p) ?? null })));
    let posts = [];
    if (dbStats) {
        for (const p of products) {
            const r = dbStats.get(p.code), s = out[p.code];
            if (r) {
                s.posts = r.posts;
                s.videos = r.videos;
                s.views = r.views;
                s.viewers = r.viewers;
                s.reactions = r.reactions;
                s.clicks = r.clicks;
                s.since = r.first;
            }
        }
    }
    else {
        const { data, error } = await admin_1.sb.social().from("posts")
            .select("published_at, kind, product_codes, views, viewers, reactions, clicks")
            .overlaps("product_codes", codes);
        if (error)
            throw error;
        posts = (data ?? []);
    }
    for (const post of posts) {
        const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(post.published_at));
        for (const p of products) {
            if (!codesOf(p).some((c) => post.product_codes.includes(c)))
                continue;
            const from = (0, pipeline_constants_1.trafficFrom)(p);
            if (from && day < from)
                continue;
            const s = out[p.code];
            s.posts += 1;
            if (post.kind === "video" || post.kind === "reel")
                s.videos += 1;
            s.views += Number(post.views);
            s.viewers += Number(post.viewers);
            s.reactions += Number(post.reactions);
            s.clicks += Number(post.clicks);
            if (!s.since || day < s.since)
                s.since = day;
        }
    }
    // Bán hàng: lấy từ đủ xa để phủ cả ngày bài đầu tiên lẫn 30 ngày cho biểu đồ
    const salesCodes = (p) => skuOf.get(p.code.toUpperCase()) ?? [(p.sapo_code ?? p.code).toUpperCase()];
    const earliest = Object.values(out).map((s) => s.since).filter(Boolean).sort()[0];
    const from = earliest && earliest < shift(today, -29) ? earliest : shift(today, -29);
    // Số bán theo ngày dùng chung (lib/daily-sales): file đơn hàng đã nhập cho ngày file phủ được, số đồng bộ Qlydonhang cho ngày ngoài khoảng đó
    const rows = await (0, daily_sales_1.loadDailySales)({ codes: [...new Set(products.flatMap(salesCodes))], from });
    for (const p of products) {
        const s = out[p.code], mine = salesCodes(p);
        const add = (date, qty) => {
            if (s.since && date >= s.since)
                s.qtyNet += qty;
            const idx = 29 - Math.round((Date.parse(today) - Date.parse(date)) / DAY_MS);
            if (idx >= 0 && idx < 30)
                s.daily[idx] += qty;
        };
        for (const r of rows) {
            if (!mine.includes(r.code))
                continue;
            add(r.date, r.qty_sold - r.qty_returned);
        }
        s.days = s.since ? Math.round((Date.parse(today) - Date.parse(s.since)) / DAY_MS) + 1 : null;
        s.ctr = s.views > 0 ? (s.clicks / s.views) * 100 : null;
        s.conversion = s.viewers > 0 ? (s.qtyNet / s.viewers) * 100 : null;
        const last7 = s.daily.slice(23).reduce((a, b) => a + b, 0), prev7 = s.daily.slice(16, 23).reduce((a, b) => a + b, 0);
        s.trendPct = prev7 > 0 ? ((last7 - prev7) / prev7) * 100 : last7 > 0 ? null : 0;
    }
    return out;
}
async function loadTrafficKpi() {
    // Tiêu chí Video Win (trang Mục tiêu) là tiêu chí chấm từng video; chưa chỉnh thì mặc định của mục đó, không còn lấy KPI Traffic của mã
    return (0, spu_rules_1.loadVideoWinRules)();
}
function gradeVideo(raw, kpi) {
    const m = (0, rules_1.buildMetrics)({ ...raw, qty_net: 0, posts: 1, videos: 1 });
    const checks = kpi.rules.length ? (0, rules_1.checkRules)(kpi.rules, m) : [];
    const fmt = (v, metric) => (v === null ? "—" : kpi_constants_1.KPI_METRICS[metric].unit === "%" ? `${v.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%` : Math.round(v).toLocaleString("vi-VN"));
    return {
        trafficPass: kpi.rules.length ? (0, rules_1.rulesPass)(checks, kpi.match) : null,
        kpiProgress: checks.length ? Math.round(100 * (kpi.match === "all" ? Math.min(...checks.map((c) => c.progress)) : Math.max(...checks.map((c) => c.progress)))) : null,
        kpiLines: checks.map((c) => `${c.pass ? "✓" : "○"} ${kpi_constants_1.KPI_METRICS[c.metric].label} ${fmt(c.actual, c.metric)} / ${c.op === "<=" ? "≤" : ""}${fmt(c.target, c.metric)}`),
    };
}
async function getProductVideos(p) {
    if (!p.code)
        return [];
    const skus = (await (0, code_links_1.loadCodeLinks)()).filter((l) => l.test_code === p.code.toUpperCase()).map((l) => l.sku_code); // mẫu Media đã gắn SPU: gộp cả video #SPU
    const code = p.code.toUpperCase();
    const { data, error } = await admin_1.sb.social().from("posts")
        .select("id, channel_id, published_at, message, permalink_url, thumbnail_url, views, viewers, reactions, clicks, comments, shares, kind, product_codes")
        .overlaps("product_codes", [code, ...skus]).in("kind", ["video", "reel"]).order("published_at", { ascending: false }).limit(60);
    if (error)
        throw error;
    const kpi = await loadTrafficKpi();
    const from = (0, pipeline_constants_1.trafficFrom)(p);
    const day = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
    return (data ?? []).filter((x) => !from || day(x.published_at) >= from).map((x) => ({
        id: x.id, channel_id: x.channel_id, published_at: x.published_at, message: x.message ?? null,
        permalink_url: x.permalink_url ?? null, thumbnail_url: x.thumbnail_url ?? null,
        views: Number(x.views ?? 0), reactions: Number(x.reactions ?? 0), comments: x.comments === null ? null : Number(x.comments), shares: x.shares === null ? null : Number(x.shares),
        ...gradeVideo({ views: Number(x.views ?? 0), viewers: Number(x.viewers ?? 0), reactions: Number(x.reactions ?? 0), clicks: Number(x.clicks ?? 0) }, kpi),
    }));
}
