"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emptyTally = exports.STATUS_TEXT = exports.AGE_REASON = exports.RESULT_COLOR = exports.RESULT_TEXT = void 0;
exports.listEvaluations = listEvaluations;
exports.listEvaluationsLite = listEvaluationsLite;
exports.listEvaluationResults = listEvaluationResults;
exports.getEvaluation = getEvaluation;
exports.getEvaluationsByProduct = getEvaluationsByProduct;
exports.tally = tally;
exports.rates = rates;
exports.weekOf = weekOf;
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
exports.RESULT_TEXT = { win: "WIN", win_traffic: "WIN TRAFFIC", win_sp: "WIN SP", fail: "FAIL", testing: "ĐANG TEST" };
exports.RESULT_COLOR = {
    win: "var(--res-win)", win_traffic: "var(--res-wt)", win_sp: "var(--res-wsp)", fail: "var(--res-fail)", testing: "var(--res-testing)",
};
exports.AGE_REASON = {
    not_in_sapo: "Chưa có trên Sapo khi đăng video đầu", new_listing: "Vừa lên Sapo trước video đầu",
    no_sales: "Gần như chưa bán trước video đầu", old_hot: "Mẫu cũ bán chạy", old_slow: "Mẫu cũ ít bán (test lại)",
    override: "R&D tự phân loại",
};
exports.STATUS_TEXT = { pass: "Đạt", partial: "Gần đạt", weak: "Yếu", not_enough: "Chưa đủ dữ liệu" };
// Bản đầy đủ rất nặng (~2,3 MB: videos, checks, metrics + cả hồ sơ sản phẩm): lọc ngay ở database khi chỉ cần một phần
//   age = chỉ mẫu mới / cũ · from–to = khoảng ngày video đầu · testOnly = chỉ mã bắt đầu bằng T (mã SPU test)
async function listEvaluations(opts = {}) {
    let q = admin_1.sb.rnd().from("evaluations").select("*, product:products(*)");
    if (opts.age)
        q = q.eq("age", opts.age);
    if (opts.from)
        q = q.gte("first_post_date", opts.from);
    if (opts.to)
        q = q.lte("first_post_date", opts.to);
    if (opts.testOnly)
        q = q.like("code", "T%");
    const [{ data, error }, { data: decided, error: dErr }] = await Promise.all([
        q.order("first_post_date", { ascending: false }),
        admin_1.sb.rnd().from("current_decisions").select("product_id, result"),
    ]);
    if (error)
        throw error;
    if (dErr)
        throw dErr;
    const confirmedOf = new Map((decided ?? []).map((d) => [d.product_id, d.result]));
    // Kết quả hiệu lực: R&D đã xác nhận thì dùng kết quả xác nhận
    return data.map((e) => {
        const c = e.product_id ? confirmedOf.get(e.product_id) : undefined;
        return c ? { ...e, result: c, confirmed: true, product: e.product ? { ...e.product, confirmed_result: c } : e.product }
            : { ...e, confirmed: false };
    });
}
async function listEvaluationsLite() {
    const [{ data, error }, { data: decided, error: dErr }] = await Promise.all([
        admin_1.sb.rnd().from("evaluations").select("code, result, age, age_reason, product_id, first_post_date, window_end, win_views:metrics->views, win_qty:metrics->qty_net, win_kind:metrics->window->>kind, win_from:metrics->window->>from, win_to:metrics->window->>to, product:products(name, stage, origin, age_override)"),
        admin_1.sb.rnd().from("current_decisions").select("product_id, result"),
    ]);
    if (error)
        throw error;
    if (dErr)
        throw dErr;
    const confirmedOf = new Map((decided ?? []).map((d) => [d.product_id, d.result]));
    return data.map((e) => ({
        code: e.code, age: e.age, age_reason: e.age_reason ?? null, product: e.product, first_post_date: e.first_post_date, window_end: e.window_end, win_views: e.win_views, win_qty: e.win_qty,
        win_kind: e.win_kind ?? null, win_from: e.win_from ?? null, win_to: e.win_to ?? null,
        result: (e.product_id ? confirmedOf.get(e.product_id) : undefined) ?? e.result, // R&D đã xác nhận thì dùng kết quả xác nhận
    }));
}
// Chỉ "mã → kết quả hiệu lực + mẫu + tên" (codeInfos): không kéo videos / checks / metrics và hồ sơ sản phẩm đầy đủ
async function listEvaluationResults() {
    const [{ data, error }, { data: decided, error: dErr }] = await Promise.all([
        admin_1.sb.rnd().from("evaluations").select("code, result, product_id, product:products(name)"),
        admin_1.sb.rnd().from("current_decisions").select("product_id, result"),
    ]);
    if (error)
        throw error;
    if (dErr)
        throw dErr;
    const confirmedOf = new Map((decided ?? []).map((d) => [d.product_id, d.result]));
    return data.map((e) => ({
        code: e.code, product_id: e.product_id, name: e.product?.name ?? null,
        result: (e.product_id ? confirmedOf.get(e.product_id) : undefined) ?? e.result,
    }));
}
async function getEvaluation(code) {
    const { data, error } = await admin_1.sb.rnd().from("evaluations").select("*").eq("code", code.toUpperCase()).maybeSingle();
    if (error)
        throw error;
    return data;
}
async function getEvaluationsByProduct(ids) {
    if (!ids.length)
        return {};
    const { data, error } = await admin_1.sb.rnd().from("evaluations").select("*").in("product_id", ids);
    if (error)
        throw error;
    return Object.fromEntries(data.map((e) => [e.product_id, e]));
}
const emptyTally = () => ({ total: 0, win: 0, win_traffic: 0, win_sp: 0, fail: 0, testing: 0 });
exports.emptyTally = emptyTally;
function tally(list) {
    const t = (0, exports.emptyTally)();
    for (const e of list) {
        t.total++;
        t[e.result]++;
    }
    return t;
}
// Tỉ lệ tính trên số mẫu ĐÃ KẾT LUẬN (đang test chưa tính, để không kéo tỉ lệ xuống giả)
function rates(t) {
    const done = t.win + t.win_traffic + t.win_sp + t.fail;
    const r = (n) => (done ? (n / done) * 100 : null);
    return { done, win: r(t.win), win_traffic: r(t.win_traffic), win_sp: r(t.win_sp), anyWin: r(t.win + t.win_traffic + t.win_sp), fail: r(t.fail) };
}
// Tuần bắt đầu thứ Hai (YYYY-MM-DD)
function weekOf(date) {
    const d = new Date(`${date}T00:00:00Z`);
    const dow = (d.getUTCDay() + 6) % 7;
    return new Date(d.getTime() - dow * 86_400_000).toISOString().slice(0, 10);
}
