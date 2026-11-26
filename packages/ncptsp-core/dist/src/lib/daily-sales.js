"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidateImportWindow = exports.channelOfSource = void 0;
exports.pageOfTags = pageOfTags;
exports.importWindow = importWindow;
exports.loadDailySales = loadDailySales;
require("server-only");
const cache_1 = require("next/cache");
const admin_1 = require("@/lib/supabase/admin");
const cache_tags_1 = require("@/lib/cache-tags");
const name_1 = require("@/lib/tiktok/name");
const DAY = 86_400_000;
const vnDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
const addDays = (d, n) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
// Nguồn đơn (cột "Nguồn" của file Sapo) → mã kênh bán đã dùng ở số đồng bộ
const CHANNEL_OF_SOURCE = [
    [/bao\s*hanh|bảo\s*hành/i, "bao_hanh"], [/tiktok\s*shop/i, "tiktok_shop"], [/tiktok/i, "tiktok"], [/shopee/i, "shopee"], [/zalo/i, "zalo"],
    [/facebook|live[-\s]*fb|messenger/i, "facebook"], [/instagram/i, "instagram"], [/pos|cửa\s*hàng|cua\s*hang|store/i, "cua_hang"], [/web/i, "web"],
];
const channelOfSource = (source) => {
    const s = String(source ?? "").normalize("NFC");
    return CHANNEL_OF_SOURCE.find(([re]) => re.test(s))?.[1] ?? "khac";
};
exports.channelOfSource = channelOfSource;
// Page / kênh TikTok của đơn: tag "page_id_<số>" → Trang Facebook; "tiktok_business_<tên>" → kênh TikTok (cùng cách ghép của số đồng bộ)
function pageOfTags(tags) {
    if (!tags)
        return "";
    const parts = tags.split(",").map((t) => t.trim());
    for (const t of parts) {
        const m = t.match(/^(?:page_id_)?(\d{6,})$/i);
        if (m)
            return m[1];
    }
    for (const t of parts) {
        const m = t.match(/^tiktok_business_(?!id_)(.+)$/i);
        if (m)
            return name_1.TT_NAME_PREFIX + (0, name_1.normTikTokName)(m[1]);
    }
    return "";
}
// Khoảng ngày file đơn hàng phủ được (giờ VN); null = chưa nhập file / chưa có bảng. Nhớ 60 giây trong tiến trình
let winCache = null;
async function importWindow() {
    if (winCache && Date.now() - winCache.at < 60_000)
        return winCache.win;
    let win = null;
    try {
        const edge = async (asc) => {
            const { data, error } = await admin_1.sb.sales().from("imported_order_lines").select("ordered_at").gt("price", 0).order("ordered_at", { ascending: asc }).limit(1);
            if (error)
                throw error;
            return data?.[0]?.ordered_at;
        };
        const [a, b] = await Promise.all([edge(true), edge(false)]);
        if (a && b)
            win = { from: vnDay(a), to: vnDay(b) };
    }
    catch {
        win = null;
    }
    winCache = { at: Date.now(), win };
    return win;
}
const invalidateImportWindow = () => { winCache = null; };
exports.invalidateImportWindow = invalidateImportWindow;
const chunks = (l, n) => { const o = []; for (let i = 0; i < l.length; i += n)
    o.push(l.slice(i, i + n)); return o; };
// Lưu đệm 6 giờ (số bán nhập ~1 lần/ngày) DÙNG CHUNG theo đúng tham số truy vấn (hàm này là truy vấn lặp nhiều nhất vào database); bị xoá khi nhập đơn hàng / đồng bộ xong (TAG.spuData).
// Kết quả quá 2 MB thì Next không lưu được — vẫn trả đúng, chỉ không đệm.
const salesCached = (0, cache_1.unstable_cache)(async (q, day) => { void day; return loadDailySalesDb(q); }, ["daily-sales", "v1"], { tags: [cache_tags_1.TAG.spuData], revalidate: 21_600 });
async function loadDailySales(q) {
    if (q.fresh)
        return loadDailySalesDb(q);
    const norm = { ...q, codes: q.codes ? [...new Set(q.codes.map((c) => c.toUpperCase()))].sort() : undefined, channels: q.channels ? [...q.channels].sort() : undefined, pageIds: q.pageIds ? [...q.pageIds].sort() : undefined };
    return salesCached(norm, vnDay(new Date().toISOString())); // day: sang ngày mới thì khoá đệm đổi
}
async function loadDailySalesDb(q) {
    const today = vnDay(new Date().toISOString());
    const to = q.to && q.to < today ? q.to : today; // chưa có số bán của ngày tương lai: không hỏi DB các ngày đó (trước đây hỏi cả 7 ngày kế tiếp, luôn trả rỗng)
    if (to < q.from)
        return [];
    const codes = q.codes ? [...new Set(q.codes.map((c) => c.toUpperCase()))] : null;
    if (codes && !codes.length)
        return [];
    const win = await importWindow();
    const fileFrom = win ? (q.from > win.from ? q.from : win.from) : null, fileTo = win ? (to < win.to ? to : win.to) : null;
    const useFile = !!(win && fileFrom && fileTo && fileFrom <= fileTo);
    // Các khoảng ngày lấy từ số đồng bộ: phần nằm ngoài khoảng file
    const syncRanges = [];
    if (!useFile)
        syncRanges.push([q.from, to]);
    else {
        if (q.from < win.from)
            syncRanges.push([q.from, addDays(win.from, -1) < to ? addDays(win.from, -1) : to]);
        if (to > win.to)
            syncRanges.push([addDays(win.to, 1) > q.from ? addDays(win.to, 1) : q.from, to]);
    }
    const out = [];
    const keepCh = (ch) => (q.channels?.length ? q.channels.includes(ch) : q.keepWarranty || ch !== "bao_hanh");
    const keepPage = (p) => !q.pageIds || q.pageIds.includes(p);
    const jobs = [];
    // 1) Số đồng bộ Qlydonhang (daily_sales) cho các ngày ngoài khoảng file
    for (const [a, b] of syncRanges) {
        for (const part of codes ? chunks(codes, 100) : [null]) {
            jobs.push((async () => {
                const read = (cols) => (0, admin_1.fetchAll)((x, y) => {
                    let sel = admin_1.sb.sales().from("daily_sales").select(cols).gte("date", a).lte("date", b);
                    if (part)
                        sel = sel.in("code", part);
                    return sel.order("date").order("code").range(x, y);
                });
                // cột tiền (revenue, cost…) đã bị bỏ ở migration 028 trên một số môi trường → đọc lại không kèm
                const rows = await read("code, date, page_id, channel, qty_sold, qty_returned, revenue, returned_value, cost, returned_cost").catch(() => read("code, date, page_id, channel, qty_sold, qty_returned"));
                for (const r of rows) {
                    const ch = r.channel ?? "khac", page = r.page_id ?? "";
                    if (!keepCh(ch) || !keepPage(page))
                        continue;
                    out.push({ code: String(r.code).toUpperCase(), date: r.date, page_id: page, channel: ch, qty_sold: Number(r.qty_sold ?? 0), qty_returned: Number(r.qty_returned ?? 0), fromFile: false,
                        revenue: Number(r.revenue ?? 0), returned_value: Number(r.returned_value ?? 0), cost: Number(r.cost ?? 0), returned_cost: Number(r.returned_cost ?? 0) });
                }
            })());
        }
    }
    // 2) File đơn hàng đã nhập cho các ngày trong khoảng file
    if (useFile) {
        for (const part of codes ? chunks(codes, 100) : [null]) {
            jobs.push((async () => {
                const lines = await (0, admin_1.fetchAll)((x, y) => {
                    let sel = admin_1.sb.sales().from("imported_order_lines").select("code, ordered_at, qty, price, status, source, tags").gt("price", 0)
                        .gte("ordered_at", `${fileFrom}T00:00:00+07:00`).lte("ordered_at", `${fileTo}T23:59:59+07:00`);
                    if (part)
                        sel = sel.in("code", part);
                    return sel.order("order_id").order("sku").range(x, y);
                }).catch(async () => {
                    return (await (0, admin_1.fetchAll)((x, y) => {
                        let sel = admin_1.sb.sales().from("imported_order_lines").select("code, ordered_at, qty, price, status, source").gt("price", 0)
                            .gte("ordered_at", `${fileFrom}T00:00:00+07:00`).lte("ordered_at", `${fileTo}T23:59:59+07:00`);
                        if (part)
                            sel = sel.in("code", part);
                        return sel.order("order_id").order("sku").range(x, y);
                    })).map((l) => ({ ...l, tags: null }));
                });
                for (const l of lines) {
                    if (/hủy|huỷ/i.test(l.status ?? ""))
                        continue;
                    const ch = (0, exports.channelOfSource)(l.source), page = pageOfTags(l.tags);
                    if (!keepCh(ch) || !keepPage(page))
                        continue;
                    const qty = Number(l.qty ?? 0);
                    out.push({ code: l.code.toUpperCase(), date: vnDay(l.ordered_at), page_id: page, channel: ch, qty_sold: qty, qty_returned: 0, fromFile: true,
                        revenue: Number(l.price ?? 0) * qty, returned_value: 0, cost: 0, returned_cost: 0 });
                }
            })());
        }
    }
    await Promise.all(jobs);
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}
