"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPo = exports.loadTeamOrders = exports.previousRange = exports.loadCost = exports.loadTest = exports.loadExtra = exports.loadCompanyClass = exports.loadRevMix = exports.loadMedia = exports.loadTop = exports.loadSpuList = exports.loadOrderList = exports.loadSpu = exports.loadMix = exports.loadCurrent = exports.loadOrders = exports.MigrationMissing = void 0;
require("server-only");
const cache_1 = require("next/cache");
const db_gate_1 = require("@/lib/db-gate");
const admin_1 = require("@/lib/supabase/admin");
const cache_tags_1 = require("@/lib/cache-tags");
const data_1 = require("@/lib/data");
class MigrationMissing extends Error {
}
exports.MigrationMissing = MigrationMissing;
async function rpc(fn, args) {
    const { data, error } = await (0, db_gate_1.heavyQuery)(async () => admin_1.sb.sales().rpc(fn, args)); // xếp hàng ≤ 3 hàm nặng cùng lúc (xem lib/db-gate)
    if (error) {
        if (error.code === "PGRST202" || /could not find the function/i.test(error.message))
            throw new MigrationMissing("Chưa chạy đủ migration 067 đến 072 (hàm sales.tr_*).");
        throw error;
    }
    return data;
}
// Đổi CACHE_V mỗi khi migration đổi KẾT QUẢ của một hàm tr_* (nếu không, trang vẫn trả số cũ trong cache tới 6 giờ / tới lần đồng bộ kế tiếp)
const CACHE_V = "v087";
const cached = (key, fn) => (0, cache_1.unstable_cache)(fn, ["team-report", CACHE_V, key], { tags: [cache_tags_1.TAG.spuData], revalidate: 21_600 })();
const loadOrders = (team, from, to) => cached(`orders|${team}|${from}|${to}`, () => rpc("tr_orders", { p_team: team, p_from: from, p_to: to }));
exports.loadOrders = loadOrders;
// Đơn đặt từ p_from (đầu khoảng đang lọc) mà chưa giao: cùng phạm vi với thẻ Đơn hàng để hai số khớp nhau (migration 068)
const loadCurrent = (team, from) => cached(`current|${team}|${from}`, () => rpc("tr_current", { p_team: team, p_from: from }));
exports.loadCurrent = loadCurrent;
const loadMix = (team, from, to) => cached(`mix|${team}|${from}|${to}`, () => rpc("tr_mix", { p_team: team, p_from: from, p_to: to }));
exports.loadMix = loadMix;
const loadSpu = (team, from, to) => cached(`spu|${team}|${from}|${to}`, () => rpc("tr_spu", { p_team: team, p_from: from, p_to: to }));
exports.loadSpu = loadSpu;
const loadOrderList = (team, from, to) => cached(`olist|${team}|${from}|${to}`, () => rpc("tr_order_list", { p_team: team, p_from: from, p_to: to }));
exports.loadOrderList = loadOrderList;
const loadSpuList = (team, from, to) => cached(`spulist|${team}|${from}|${to}`, () => rpc("tr_spu_list", { p_team: team, p_from: from, p_to: to }));
exports.loadSpuList = loadSpuList;
const loadTop = (team, from, to) => cached(`top|${team}|${from}|${to}`, () => rpc("tr_top", { p_team: team, p_from: from, p_to: to, p_n: 15 }));
exports.loadTop = loadTop;
const loadMedia = (team, from, to) => cached(`media|${team}|${from}|${to}`, () => rpc("tr_media", { p_team: team, p_from: from, p_to: to }));
exports.loadMedia = loadMedia;
const loadRevMix = (team, from, to, by) => cached(`revmix|${by}|${team}|${from}|${to}`, () => rpc("tr_revenue_mix", { p_team: team, p_from: from, p_to: to, p_by: by }));
exports.loadRevMix = loadRevMix;
const loadCompanyClass = (slow, normal) => cached(`cclass|${slow}|${normal}`, () => rpc("tr_company_class", { p_slow: slow, p_normal: normal }));
exports.loadCompanyClass = loadCompanyClass;
const loadExtra = (team) => cached(`extra|${team}`, () => rpc("tr_extra", { p_team: team }));
exports.loadExtra = loadExtra;
const loadTest = (team) => cached(`test|${team}`, () => rpc("tr_test", { p_team: team }));
exports.loadTest = loadTest;
// Giá vốn / giá bán: NHẠY CẢM — nơi gọi phải đã kiểm canSeeProfit (chỉ Quản lý)
const loadCost = (team, from, to, by, excl) => cached(`cost|${team}|${from}|${to}|${by}|${excl}`, () => rpc("tr_cost", { p_team: team, p_from: from, p_to: to, p_by: by, p_excl: excl }));
exports.loadCost = loadCost;
// Khoảng liền trước, cùng độ dài (so sánh kỳ)
const previousRange = (from, to) => {
    const n = (0, data_1.daysBetween)(from, to);
    return { from: (0, data_1.addDays)(from, -n), to: (0, data_1.addDays)(from, -1) };
};
exports.previousRange = previousRange;
const spuOf = (sku) => sku.split("-")[0].toUpperCase();
const chunks = (a, n = 100) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
async function loadTeamOrdersRaw(teamName) {
    const db = (0, admin_1.supabaseOrders)();
    const empty = { rows: [], ordered: 0, received: 0, remaining: 0, overduePos: 0, qcPending: 0 };
    const { data: team } = await db.from("teams").select("id").eq("name", teamName).maybeSingle();
    if (!team)
        return empty;
    const { data: reqs } = await db.from("stock_order_requests").select("id, status, created_at").eq("team_id", team.id).neq("status", "cancelled");
    // Giống màn hình Qlydonhang: gồm cả yêu cầu đã từ chối nếu SL còn lại = 0 (hiện "Đã về đủ", vd K0006 báo "đã đặt"); từ chối mà còn thiếu thì bỏ, không phải nhu cầu thật
    const reqById = new Map((reqs ?? []).map((r) => [r.id, r]));
    if (!reqById.size)
        return empty;
    const items = (await Promise.all(chunks([...reqById.keys()]).map((ids) => db.from("stock_order_request_items").select("request_id, sku, qty, qty_remaining, gathered_into_po_id").in("request_id", ids).then((r) => r.data ?? [])))).flat();
    const poIds = [...new Set(items.map((i) => i.gathered_into_po_id).filter((x) => !!x))];
    const pos = poIds.length ? ((await db.from("purchase_orders").select("id, no, date, eta").in("id", poIds)).data ?? []) : [];
    const poById = new Map(pos.map((p) => [p.id, p]));
    const recs = poIds.length ? ((await db.from("po_receipts").select("id, po_id, status").in("po_id", poIds).eq("status", "draft")).data ?? []) : [];
    const recPo = new Map(recs.map((r) => [r.id, r.po_id]));
    const rItems = recs.length ? ((await db.from("po_receipt_items").select("receipt_id, sku, received_qty").in("receipt_id", [...recPo.keys()])).data ?? []) : [];
    const qc = new Map(); // `${poId}|${sku}` → số QC đã nhận nhưng phiếu còn nháp
    for (const r of rItems) {
        const k = `${recPo.get(r.receipt_id)}|${r.sku}`;
        qc.set(k, (qc.get(k) ?? 0) + Number(r.received_qty ?? 0));
    }
    const today = (0, data_1.todayVN)();
    const rows = items.filter((i) => !(reqById.get(i.request_id)?.status === "rejected" && Number(i.qty_remaining) > 0)).map((i) => {
        const po = i.gathered_into_po_id ? poById.get(i.gathered_into_po_id) : undefined;
        const qty = Number(i.qty), remaining = Number(i.qty_remaining);
        const eta = po?.eta ?? null;
        return {
            createdAt: String(reqById.get(i.request_id)?.created_at ?? "").slice(0, 10), sku: String(i.sku), qty, remaining, received: qty - remaining,
            poNo: po?.no ?? null, poDate: po?.date ?? null, eta,
            qc: remaining > 0 && po ? Math.min(qc.get(`${po.id}|${i.sku}`) ?? 0, remaining) : 0,
            overdueDays: remaining > 0 && eta && eta < today ? (0, data_1.daysBetween)(eta, today) - 1 : 0,
        };
    }).sort((a, b) => (b.remaining > 0 ? 1 : 0) - (a.remaining > 0 ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));
    const overdue = new Set(rows.filter((r) => r.overdueDays > 0 && r.poNo).map((r) => r.poNo));
    return {
        rows, ordered: rows.reduce((n, r) => n + r.qty, 0), received: rows.reduce((n, r) => n + r.received, 0), remaining: rows.reduce((n, r) => n + r.remaining, 0),
        overduePos: overdue.size, qcPending: rows.reduce((n, r) => n + r.qc, 0),
    };
}
const loadTeamOrders = (teamName) => cached(`qldh-orders|${teamName}`, () => loadTeamOrdersRaw(teamName));
exports.loadTeamOrders = loadTeamOrders;
async function loadPoRaw() {
    const db = (0, admin_1.supabaseOrders)();
    const { data: pos } = await db.from("purchase_orders").select("id, no, eta, status, supplier_name").in("status", ["ordered", "partial"]);
    const poList = pos ?? [];
    if (!poList.length)
        return { cov: {}, lines: [] };
    const ids = poList.map((p) => p.id);
    const items = (await Promise.all(chunks(ids, 40).map((c) => (0, admin_1.fetchAll)((a, b) => db.from("po_items").select("po_id, sku, qty").in("po_id", c).order("id").range(a, b))))).flat();
    const recs = (await Promise.all(chunks(ids, 40).map((c) => db.from("po_receipts").select("id, po_id").in("po_id", c).then((r) => r.data ?? [])))).flat();
    const recPo = new Map(recs.map((r) => [r.id, r.po_id]));
    const rItems = (await Promise.all(chunks([...recPo.keys()], 40).map((c) => (0, admin_1.fetchAll)((a, b) => db.from("po_receipt_items").select("receipt_id, sku, received_qty").in("receipt_id", c).order("id").range(a, b))))).flat();
    const per = new Map(); // `${po}|${spu}`
    for (const i of items) {
        const k = `${i.po_id}|${spuOf(i.sku)}`;
        const o = per.get(k) ?? { qty: 0, got: 0 };
        o.qty += Number(i.qty);
        per.set(k, o);
    }
    for (const r of rItems) {
        const k = `${recPo.get(r.receipt_id)}|${spuOf(r.sku)}`;
        const o = per.get(k);
        if (o)
            o.got += Number(r.received_qty ?? 0);
    }
    const poById = new Map(poList.map((p) => [p.id, p]));
    const today = (0, data_1.todayVN)(), out = {}, lines = [];
    for (const [k, v] of per) {
        const [poId, code] = k.split("|"), left = Math.max(v.qty - v.got, 0);
        if (!left)
            continue;
        const eta = poById.get(poId)?.eta || null;
        lines.push({ code, po: String(poById.get(poId)?.no ?? ""), eta, left, sup: String(poById.get(poId)?.supplier_name ?? "") });
        const o = out[code] ?? { pending: 0, pos: 0, nextEta: null, overdue: false };
        o.pending += left;
        o.pos += 1;
        if (eta && (!o.nextEta || eta < o.nextEta))
            o.nextEta = eta;
        if (eta && eta < today)
            o.overdue = true;
        out[code] = o;
    }
    return { cov: out, lines };
}
const loadPo = () => cached("qldh-po", loadPoRaw);
exports.loadPo = loadPo;
