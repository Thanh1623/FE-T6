"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESULT_FILTERS = void 0;
exports.getRndChannels = getRndChannels;
exports.codeInfos = codeInfos;
exports.filterCodes = filterCodes;
exports.cardProducts = cardProducts;
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
const data_1 = require("@/lib/eval/data");
const rules_1 = require("@/lib/eval/rules");
// Các kênh được đánh dấu R&D (migration 022). null = chưa chạy migration.
async function getRndChannels() {
    const { data, error } = await admin_1.sb.social().from("channels").select("id, name, platform").eq("is_active", true).eq("is_rnd", true).order("created_at");
    if (error)
        return error.code === "42703" || error.code === "PGRST204" ? null : (() => { throw error; })();
    return (data ?? []).map((c, i) => ({ id: c.id, name: c.name, platform: c.platform, color: `var(--series-${(i % 8) + 1})` }));
}
exports.RESULT_FILTERS = {
    all: "Tất cả", any_win: "Mọi loại WIN", win: "WIN", win_traffic: "WIN TRAFFIC", testing: "Đang test", fail: "FAIL",
};
// Mã SP → kết quả đánh giá (đã gồm kết luận R&D), sản phẩm R&D, link source, số lần các team đã lấy source
async function codeInfos() {
    const [evals, { data: prods }, { data: taken }] = await Promise.all([
        (0, data_1.listEvaluationResults)(),
        (0, admin_1.fetchAll)((a, b) => admin_1.sb.rnd().from("products").select("id, code, name, source_url").not("code", "is", null).order("id").range(a, b)).then((data) => ({ data })), // phân trang: bảng > 1.000 hồ sơ
        admin_1.sb.rnd().from("product_events").select("product_id").eq("action", "source_taken"),
    ]);
    const takenBy = new Map();
    for (const t of taken ?? [])
        takenBy.set(t.product_id, (takenBy.get(t.product_id) ?? 0) + 1);
    const out = new Map();
    for (const p of prods ?? []) {
        out.set(p.code.toUpperCase(), {
            result: null, productId: p.id, name: p.name ?? null, sourceUrl: p.source_url || null, taken: takenBy.get(p.id) ?? 0,
        });
    }
    for (const e of evals) {
        const cur = out.get(e.code.toUpperCase());
        if (cur)
            cur.result = e.result;
        else
            out.set(e.code.toUpperCase(), { result: e.result, productId: e.product_id, name: e.name, sourceUrl: null, taken: 0 });
    }
    return out;
}
// Danh sách mã thoả bộ lọc kết quả / chỉ-có-source (null = không lọc theo mã)
function filterCodes(infos, result, onlySource) {
    if (result === "all" && !onlySource)
        return null;
    const ok = (r) => result === "all" ? true : result === "any_win" ? (0, rules_1.isWinResult)(r) : r === result;
    return [...infos.entries()].filter(([, i]) => ok(i.result) && (!onlySource || !!i.sourceUrl)).map(([c]) => c);
}
const isMissingTable = (e) => !!e && (e.code === "PGRST205" || e.code === "42P01");
// Mỗi video → các sản phẩm gắn trong đó (mã hashtag + gắn tay), kèm kết quả, link source, giá bán
//   giá bán: "Giá bán dự kiến" R&D đã nhập (không còn lấy giá thực tế từ doanh thu)
async function cardProducts(posts, infos) {
    const postIds = posts.map((p) => p.id);
    const { data: links, error: lErr } = postIds.length ? await admin_1.sb.social().from("post_links").select("post_id, product_id").in("post_id", postIds) : { data: [], error: null };
    if (lErr && !isMissingTable(lErr))
        throw lErr;
    // Mã SPU gắn tay (migration 081); chưa chạy migration thì bỏ qua
    const { data: mcodes, error: mErr } = postIds.length ? await admin_1.sb.social().from("post_codes").select("post_id, code").in("post_id", postIds) : { data: [], error: null };
    if (mErr && !isMissingTable(mErr))
        throw mErr;
    const manualOf = new Set((mcodes ?? []).map((m) => `${m.post_id}|${String(m.code).toUpperCase()}`));
    const linkIds = [...new Set((links ?? []).map((l) => l.product_id))];
    const codes = [...new Set(posts.flatMap((p) => p.product_codes.map((c) => c.toUpperCase())))];
    const [byId, byCode] = await Promise.all([
        linkIds.length ? admin_1.sb.rnd().from("products").select("id, code, st_code, name, source_url, expected_price").in("id", linkIds) : { data: [] },
        codes.length ? admin_1.sb.rnd().from("products").select("id, code, st_code, name, source_url, expected_price").in("code", codes) : { data: [] },
    ]);
    const prodById = new Map();
    const prodByCode = new Map();
    for (const p of [...(byId.data ?? []), ...(byCode.data ?? [])]) {
        prodById.set(p.id, p);
        if (p.code)
            prodByCode.set(p.code.toUpperCase(), p);
    }
    // Số lần lấy source của sản phẩm chưa có mã
    const [{ data: ev }] = await Promise.all([
        prodById.size ? admin_1.sb.rnd().from("product_events").select("product_id").eq("action", "source_taken").in("product_id", [...prodById.keys()]) : { data: [] },
    ]);
    const takenById = new Map();
    for (const e of ev ?? [])
        takenById.set(e.product_id, (takenById.get(e.product_id) ?? 0) + 1);
    const priceOf = (p, code) => {
        if (p?.expected_price && Number(p.expected_price) > 0)
            return { price: Number(p.expected_price), kind: "du_kien" };
        void code;
        return { price: null, kind: null };
    };
    const linksOf = new Map();
    for (const l of links ?? [])
        linksOf.set(l.post_id, [...(linksOf.get(l.post_id) ?? []), l.product_id]);
    const out = new Map();
    for (const post of posts) {
        const list = [];
        const seen = new Set();
        const add = (code, prod, manual, manualCode = false) => {
            const id = prod?.id ?? null, key = id ?? code ?? "";
            if (!key || seen.has(key))
                return;
            seen.add(key);
            const info = code ? infos.get(code) : undefined;
            const pr = priceOf(prod, code);
            list.push({
                key, label: code ?? prod?.st_code ?? "—", name: prod?.name ?? info?.name ?? null, result: info?.result ?? null, productId: id,
                sourceUrl: prod?.source_url || info?.sourceUrl || null, taken: id ? (takenById.get(id) ?? info?.taken ?? 0) : info?.taken ?? 0,
                price: pr.price, priceKind: pr.kind, manual, manualCode,
            });
        };
        for (const pid of linksOf.get(post.id) ?? []) {
            const p = prodById.get(pid);
            if (p)
                add(p.code?.toUpperCase() ?? null, p, true);
        }
        for (const c of post.product_codes) {
            const code = c.toUpperCase();
            add(code, prodByCode.get(code), false, manualOf.has(`${post.id}|${code}`));
        }
        out.set(post.id, list);
    }
    return out;
}
