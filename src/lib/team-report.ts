import "server-only";
import { unstable_cache } from "next/cache";
import { heavyQuery } from "@/lib/db-gate";
import { fetchAll, sb, supabaseOrders } from "@/lib/supabase/admin";
import { TAG } from "@/lib/cache-tags";
import { addDays, daysBetween, todayVN } from "@/lib/data";

// QLHN (/qlhn): số liệu đơn hàng, giao hàng, cơ cấu bán, tồn / thiếu hàng, đang order của MỘT team trong khoảng ngày.
// Nguồn: hàm SQL sales.tr_* (migration 067) trên DB của app + đọc bảng đơn đặt hàng / PO của dự án Qlydonhang (chỉ đọc).
// Quy tắc tính nằm ở migration 067 (đọc phần đầu file trước khi sửa). Giá vốn là dữ liệu nhạy cảm: loadCost chỉ gọi cho Quản lý.

export type OrderStats = {
  orders: number; qty: number; delivered_qty: number; cancelled: number; delivered_orders: number; avg_days: number | null;
  st: { done: number; running: number; booked: number; archived: number };
  daily: { d: string; q: number; o?: number; c?: number }[];   // o: số đơn, c: số đơn huỷ trong ngày (migration 075)   // o, dl, c, av: migration 075 (đơn, đã giao khách, huỷ, ngày giao TB)
  staff: { name: string; orders: number; qty: number; delivered_orders: number; cancelled: number }[];
};
// Đơn chế tác của kỳ: orders = còn mã trung gian (đang chế tác); ready = đã xong gắn SPU thật nhưng chưa giao; done = đã giao (migration 070 ghi nhớ đơn chế tác)
export type ChetacRow = { kind: string; orders: number; running: number; booked: number; archived: number; over14: number; ready: number; done: number };
export type ShortRow = { code: string; name: string; pending: number; pending7: number; stock: number; incoming: number; short: number };
export type CurrentStats = { pending_qty: number; pending_over7: number; chetac: ChetacRow[]; short: ShortRow[] };
export type CostMat = { mat: number; q: number; orders?: number; rev: number; revc: number; cost: number };   // orders: migration 074
export type CostStats = { orders?: number; mat: CostMat[]; flagged: { order_id: string; sku: string; price: number; cost: number; qty: number }[] };
export type MixStats = {
  grp: { name: string; q: number; spus: number }[];
  age: { cat: "old" | "new" | "made" | "out"; q: number; spus: number; orders?: number; sup: number }[];
  new_list: { code: string; name: string; grp: string; q: number; created: string | null; first_order: string | null }[];   // SPU mới (quy tắc migration 077) team đã bán trong kỳ
};
export type SpuListRow = { code: string; name: string; team_qty: number; sold30: number; stock: number; incoming: number; cover: number | null; cover_in: number | null };
export type PushRow = { code: string; name: string; stock: number; age_days: number | null; sold30: number; has_video: boolean; n_teams: number };
export type SpuStats = {
  videos: number; views: number; video_spus: number; last_video_day: string | null;
  spus: number; in_stock: number; with_video: number; hot: number; normal: number; slow: number; dead: number; hot_short_stock: number; hot_short: number;
  short_list: SpuListRow[]; push_list: PushRow[];
};
export type TestStats = { codes: number; win: number; win_traffic: number; fail: number; testing: number; videos: number; views: number; list: { code: string; result: string | null }[] };

// Danh sách mới (migration 071)
export type LineStatus = "d" | "c" | "t" | "m" | "r";   // đã giao · còn hàng chưa giao · thiếu hàng · đang chế tác · đã hoàn hàng (migration 087)
export type OrderLine = [od: string, orderId: string, code: string, sku: string, name: string, qty: number, status: LineStatus, days: number, ret?: "" | "i" | "p" | "f"];
export type SpuRow = [code: string, name: string, sold: number, delivered: number, videos: number, stock: number, sold30: number | null];
export type TopRow = { code: string; name: string; q: number; stock: number; incoming: number; sold30: number; image: string | null; result: string | null; has_video: boolean };
export type WinRowRaw = [code: string, name: string, result: string, sold: number, videos: number, views: number, age: string];   // result = kết quả đánh giá CÔNG TY
// Hàng bảng SPU win: thêm kết quả "Win của team" (lib/team-win.ts); chuỗi rỗng khi chưa tính được thì dùng kết quả công ty
export type WinRow = [...WinRowRaw, team: string];
export type MediaStats = {
  new_total: number; new_video: number; new_no_video: { code: string; name: string; q: number; stock: number; incoming: number; sold30: number }[];
  video_spus: number; win: number; win_traffic: number; fail: number; win_list: WinRowRaw[];
};

export class MigrationMissing extends Error {}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await heavyQuery(async () => sb.sales().rpc(fn, args));   // xếp hàng ≤ 3 hàm nặng cùng lúc (xem lib/db-gate)
  if (error) {
    if ((error as { code?: string }).code === "PGRST202" || /could not find the function/i.test(error.message)) throw new MigrationMissing("Chưa chạy đủ migration 067 đến 072 (hàm sales.tr_*).");
    throw error;
  }
  return data as T;
}
// Đổi CACHE_V mỗi khi migration đổi KẾT QUẢ của một hàm tr_* (nếu không, trang vẫn trả số cũ trong cache tới 6 giờ / tới lần đồng bộ kế tiếp)
const CACHE_V = "v087";
const cached = <T>(key: string, fn: () => Promise<T>) => unstable_cache(fn, ["team-report", CACHE_V, key], { tags: [TAG.spuData], revalidate: 21_600 })();

export const loadOrders = (team: string, from: string, to: string) => cached<OrderStats>(`orders|${team}|${from}|${to}`, () => rpc("tr_orders", { p_team: team, p_from: from, p_to: to }));
// Đơn đặt từ p_from (đầu khoảng đang lọc) mà chưa giao: cùng phạm vi với thẻ Đơn hàng để hai số khớp nhau (migration 068)
export const loadCurrent = (team: string, from: string) => cached<CurrentStats>(`current|${team}|${from}`, () => rpc("tr_current", { p_team: team, p_from: from }));
export const loadMix = (team: string, from: string, to: string) => cached<MixStats>(`mix|${team}|${from}|${to}`, () => rpc("tr_mix", { p_team: team, p_from: from, p_to: to }));
export const loadSpu = (team: string, from: string, to: string) => cached<SpuStats>(`spu|${team}|${from}|${to}`, () => rpc("tr_spu", { p_team: team, p_from: from, p_to: to }));
export const loadOrderList = (team: string, from: string, to: string) => cached<OrderLine[]>(`olist|${team}|${from}|${to}`, () => rpc("tr_order_list", { p_team: team, p_from: from, p_to: to }));
export const loadSpuList = (team: string, from: string, to: string) => cached<SpuRow[]>(`spulist|${team}|${from}|${to}`, () => rpc("tr_spu_list", { p_team: team, p_from: from, p_to: to }));
export const loadTop = (team: string, from: string, to: string) => cached<TopRow[]>(`top|${team}|${from}|${to}`, () => rpc("tr_top", { p_team: team, p_from: from, p_to: to, p_n: 15 }));
export const loadMedia = (team: string, from: string, to: string) => cached<MediaStats>(`media|${team}|${from}|${to}`, () => rpc("tr_media", { p_team: team, p_from: from, p_to: to }));
// Doanh thu theo cơ cấu SPU cũ / mới / chế tác / bảo hành (migration 078, tab Doanh thu — chỉ Quản lý)
export type RevCat = "old" | "new" | "made" | "out";
export type RevMix = {
  cats: { cat: RevCat; q: number; orders: number; spus: number; rev: number; rev_del: number; revc: number; cost: number }[];
};
export const loadRevMix = (team: string, from: string, to: string, by: "order" | "delivery") => cached<RevMix>(`revmix|${by}|${team}|${from}|${to}`, () => rpc("tr_revenue_mix", { p_team: team, p_from: from, p_to: to, p_by: by }));
export type CompanyClass = { active: number; in_stock: number; hot: number; normal: number; slow: number; bad: number };
export const loadCompanyClass = (slow: number, normal: number) => cached<CompanyClass>(`cclass|${slow}|${normal}`, () => rpc("tr_company_class", { p_slow: slow, p_normal: normal }));
export type ExtraStats = { receipts_today: number; last_receipt: string | null; orders_at: string | null; summary_at: string | null };
export const loadExtra = (team: string) => cached<ExtraStats>(`extra|${team}`, () => rpc("tr_extra", { p_team: team }));
export const loadTest = (team: string) => cached<TestStats>(`test|${team}`, () => rpc("tr_test", { p_team: team }));
// Giá vốn / giá bán: NHẠY CẢM — nơi gọi phải đã kiểm canSeeProfit (chỉ Quản lý)
export const loadCost = (team: string, from: string, to: string, by: "order" | "delivery", excl: boolean) =>
  cached<CostStats>(`cost|${team}|${from}|${to}|${by}|${excl}`, () => rpc("tr_cost", { p_team: team, p_from: from, p_to: to, p_by: by, p_excl: excl }));

// Khoảng liền trước, cùng độ dài (so sánh kỳ)
export const previousRange = (from: string, to: string) => {
  const n = daysBetween(from, to);
  return { from: addDays(from, -n), to: addDays(from, -1) };
};

// ===================== Qlydonhang (chỉ đọc) =====================
// Lệnh order của team (stock_order_requests) + PO đã gom + phiếu nhập kho nháp (QC nhận chưa nhập Sapo)
export type TeamOrderRow = {
  createdAt: string; sku: string; qty: number; received: number; remaining: number;
  poNo: string | null; poDate: string | null; eta: string | null; qc: number; overdueDays: number;
};
export type TeamOrders = { rows: TeamOrderRow[]; ordered: number; received: number; remaining: number; overduePos: number; qcPending: number };

const spuOf = (sku: string) => sku.split("-")[0].toUpperCase();
const chunks = <T,>(a: T[], n = 100) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function loadTeamOrdersRaw(teamName: string): Promise<TeamOrders> {
  const db = supabaseOrders();
  const empty: TeamOrders = { rows: [], ordered: 0, received: 0, remaining: 0, overduePos: 0, qcPending: 0 };
  const { data: team } = await db.from("teams").select("id").eq("name", teamName).maybeSingle();
  if (!team) return empty;
  const { data: reqs } = await db.from("stock_order_requests").select("id, status, created_at").eq("team_id", team.id).neq("status", "cancelled");
  // Giống màn hình Qlydonhang: gồm cả yêu cầu đã từ chối nếu SL còn lại = 0 (hiện "Đã về đủ", vd K0006 báo "đã đặt"); từ chối mà còn thiếu thì bỏ, không phải nhu cầu thật
  const reqById = new Map((reqs ?? []).map((r) => [r.id as string, r]));
  if (!reqById.size) return empty;
  const items = (await Promise.all(chunks([...reqById.keys()]).map((ids) =>
    db.from("stock_order_request_items").select("request_id, sku, qty, qty_remaining, gathered_into_po_id").in("request_id", ids).then((r) => r.data ?? [])))).flat();
  const poIds = [...new Set(items.map((i) => i.gathered_into_po_id as string | null).filter((x): x is string => !!x))];
  const pos = poIds.length ? ((await db.from("purchase_orders").select("id, no, date, eta").in("id", poIds)).data ?? []) : [];
  const poById = new Map(pos.map((p) => [p.id as string, p]));
  const recs = poIds.length ? ((await db.from("po_receipts").select("id, po_id, status").in("po_id", poIds).eq("status", "draft")).data ?? []) : [];
  const recPo = new Map(recs.map((r) => [r.id as string, r.po_id as string]));
  const rItems = recs.length ? ((await db.from("po_receipt_items").select("receipt_id, sku, received_qty").in("receipt_id", [...recPo.keys()])).data ?? []) : [];
  const qc = new Map<string, number>();   // `${poId}|${sku}` → số QC đã nhận nhưng phiếu còn nháp
  for (const r of rItems) { const k = `${recPo.get(r.receipt_id as string)}|${r.sku}`; qc.set(k, (qc.get(k) ?? 0) + Number(r.received_qty ?? 0)); }

  const today = todayVN();
  const rows: TeamOrderRow[] = items.filter((i) => !(reqById.get(i.request_id as string)?.status === "rejected" && Number(i.qty_remaining) > 0)).map((i) => {
    const po = i.gathered_into_po_id ? poById.get(i.gathered_into_po_id as string) : undefined;
    const qty = Number(i.qty), remaining = Number(i.qty_remaining);
    const eta = (po?.eta as string | null) ?? null;
    return {
      createdAt: String(reqById.get(i.request_id as string)?.created_at ?? "").slice(0, 10), sku: String(i.sku), qty, remaining, received: qty - remaining,
      poNo: (po?.no as string) ?? null, poDate: (po?.date as string) ?? null, eta,
      qc: remaining > 0 && po ? Math.min(qc.get(`${po.id}|${i.sku}`) ?? 0, remaining) : 0,
      overdueDays: remaining > 0 && eta && eta < today ? daysBetween(eta, today) - 1 : 0,
    };
  }).sort((a, b) => (b.remaining > 0 ? 1 : 0) - (a.remaining > 0 ? 1 : 0) || b.createdAt.localeCompare(a.createdAt));
  const overdue = new Set(rows.filter((r) => r.overdueDays > 0 && r.poNo).map((r) => r.poNo));
  return {
    rows, ordered: rows.reduce((n, r) => n + r.qty, 0), received: rows.reduce((n, r) => n + r.received, 0), remaining: rows.reduce((n, r) => n + r.remaining, 0),
    overduePos: overdue.size, qcPending: rows.reduce((n, r) => n + r.qc, 0),
  };
}
export const loadTeamOrders = (teamName: string) => cached<TeamOrders>(`qldh-orders|${teamName}`, () => loadTeamOrdersRaw(teamName));

// Mọi PO đang đặt (mọi team) theo SPU: còn bao nhiêu chưa về, ETA sớm nhất, có PO quá hạn không. Dùng để biết SPU thiếu hàng đã được mua hàng order chưa.
export type PoCoverage = { pending: number; pos: number; nextEta: string | null; overdue: boolean };
export type PoLine = { code: string; po: string; eta: string | null; left: number; sup: string };
async function loadPoRaw(): Promise<{ cov: Record<string, PoCoverage>; lines: PoLine[] }> {
  const db = supabaseOrders();
  const { data: pos } = await db.from("purchase_orders").select("id, no, eta, status, supplier_name").in("status", ["ordered", "partial"]);
  const poList = pos ?? [];
  if (!poList.length) return { cov: {}, lines: [] };
  const ids = poList.map((p) => p.id as string);
  const items = (await Promise.all(chunks(ids, 40).map((c) => fetchAll<{ po_id: string; sku: string; qty: number }>((a, b) =>
    db.from("po_items").select("po_id, sku, qty").in("po_id", c).order("id").range(a, b) as never)))).flat();
  const recs = (await Promise.all(chunks(ids, 40).map((c) => db.from("po_receipts").select("id, po_id").in("po_id", c).then((r) => r.data ?? [])))).flat();
  const recPo = new Map(recs.map((r) => [r.id as string, r.po_id as string]));
  const rItems = (await Promise.all(chunks([...recPo.keys()], 40).map((c) => fetchAll<{ receipt_id: string; sku: string; received_qty: number }>((a, b) =>
    db.from("po_receipt_items").select("receipt_id, sku, received_qty").in("receipt_id", c).order("id").range(a, b) as never)))).flat();
  const per = new Map<string, { qty: number; got: number }>();   // `${po}|${spu}`
  for (const i of items) { const k = `${i.po_id}|${spuOf(i.sku)}`; const o = per.get(k) ?? { qty: 0, got: 0 }; o.qty += Number(i.qty); per.set(k, o); }
  for (const r of rItems) { const k = `${recPo.get(r.receipt_id)}|${spuOf(r.sku)}`; const o = per.get(k); if (o) o.got += Number(r.received_qty ?? 0); }
  const poById = new Map(poList.map((p) => [p.id as string, p]));
  const today = todayVN(), out: Record<string, PoCoverage> = {}, lines: PoLine[] = [];
  for (const [k, v] of per) {
    const [poId, code] = k.split("|"), left = Math.max(v.qty - v.got, 0);
    if (!left) continue;
    const eta = (poById.get(poId)?.eta as string | null) || null;
    lines.push({ code, po: String(poById.get(poId)?.no ?? ""), eta, left, sup: String(poById.get(poId)?.supplier_name ?? "") });
    const o = out[code] ?? { pending: 0, pos: 0, nextEta: null, overdue: false };
    o.pending += left; o.pos += 1;
    if (eta && (!o.nextEta || eta < o.nextEta)) o.nextEta = eta;
    if (eta && eta < today) o.overdue = true;
    out[code] = o;
  }
  return { cov: out, lines };
}
export const loadPo = () => cached<{ cov: Record<string, PoCoverage>; lines: PoLine[] }>("qldh-po", loadPoRaw);
