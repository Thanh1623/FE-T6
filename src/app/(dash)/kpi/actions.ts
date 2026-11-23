"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/session";
import { sb } from "@/lib/supabase/admin";
import { TAG, bust } from "@/lib/cache-tags";
import { parseRules } from "@/lib/kpi-constants";
import { evaluateAll } from "@/lib/eval/engine";
import { SPU_RULES_KEY } from "@/lib/spu-rules";
import { COMMERCIAL_RULES_KEY } from "@/lib/commercial-eval";
import { logged } from "@/lib/system-log";

export type KpiFormState = { error?: string; ok?: boolean; message?: string };

const str = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? null : v; };
const int = (f: FormData, k: string, min = 0) => { const n = Math.round(Number(f.get(k))); return Number.isFinite(n) && n >= min ? n : null; };

// ---------- Trang KPI đánh giá Win: 2 bộ KPI mặc định (Traffic, Bán hàng) + cửa sổ test ----------
// Lưu xong chấm lại ngay mọi mã để kết quả trên trang khớp KPI mới (không phải chờ lần đồng bộ sau).
async function reevaluate() {
  try { const r = await evaluateAll(); return `Đã chấm lại ${r.evaluated} mã theo KPI mới.`; }
  catch (e) { console.error("reevaluate:", e); return "Đã lưu; kết quả sẽ cập nhật ở lần đồng bộ kế tiếp."; }
}
function refreshPages() {
  for (const p of ["/kpi", "/rnd/dashboard", "/spu"]) revalidatePath(p);
  void import("@/lib/spu-summary").then((m) => m.scheduleSpuSummaryRefresh()).catch(() => {});   // KPI đổi → cờ Ngôi sao / Win trong bảng tổng hợp phải tính lại
}

// Sửa bộ KPI mặc định của mục tiêu "traffic" hoặc "sales" (bộ máy tự đánh giá chỉ dùng 2 bộ này)
async function saveDefaultKpiRaw(_: KpiFormState, form: FormData): Promise<KpiFormState> {
  const user = await requireActionUser(["admin"]);
  const goal = str(form, "goal_code");
  if (goal !== "traffic" && goal !== "sales") return { error: "Chỉ sửa được KPI Traffic hoặc KPI Bán hàng" };
  let raw: unknown;
  try { raw = JSON.parse(String(form.get("rules") ?? "[]")); } catch { return { error: "Điều kiện KPI không hợp lệ" }; }
  const rules = parseRules(raw);
  if (typeof rules === "string") return { error: rules };
  const minDays = int(form, "min_days"), minViews = int(form, "min_views");
  if (minDays === null || minViews === null) return { error: "Số ngày / lượt xem tối thiểu phải là số hợp lệ" };

  const { data, error } = await sb.rnd().from("kpi_templates").update({
    rules, match: form.get("match") === "any" ? "any" : "all", min_days: minDays, min_views: minViews,
    updated_by: user.id, updated_at: new Date().toISOString(),
  }).eq("goal_code", goal).eq("is_default", true).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Chưa có bộ KPI mặc định cho mục tiêu này" };
  const message = await reevaluate();
  refreshPages();
  return { ok: true, message };
}

// Cửa sổ test tự động: số ngày kể từ video đầu tiên. Hết cửa sổ mà chưa đạt KPI nào → FAIL.
async function saveWindowDaysRaw(_: KpiFormState, form: FormData): Promise<KpiFormState> {
  const user = await requireActionUser(["admin"]);
  const days = int(form, "window_days", 3);
  if (days === null || days > 90) return { error: "Cửa sổ test phải từ 3 đến 90 ngày" };
  const db = sb.core();
  const { data: cur } = await db.from("settings").select("value").eq("key", "evaluation").maybeSingle();
  if (!cur) return { error: "Chưa có cài đặt đánh giá (core.settings.evaluation)" };
  const { error } = await db.from("settings").update({ value: { ...(cur.value as object), window_days: days }, updated_by: user.id, updated_at: new Date().toISOString() }).eq("key", "evaluation");
  if (error) return { error: error.message };
  const message = await reevaluate();
  refreshPages();
  return { ok: true, message };
}

// ---------- Ngưỡng phân loại SPU (trang Theo dõi SPU) ----------
// core.settings 'spu_rules' = { win: {traffic, order}, sales: {slowBelow, normalBelow}, video: {rules, match} }; mỗi hàm chỉ ghi phần của mình, giữ nguyên phần còn lại.
async function patchSpuRules(userId: string, patch: Record<string, unknown> | null) {
  const db = sb.core();
  if (patch === null) { const { error } = await db.from("settings").delete().eq("key", SPU_RULES_KEY); return error?.message ?? null; }
  const { data: cur } = await db.from("settings").select("value").eq("key", SPU_RULES_KEY).maybeSingle();
  const { error } = await db.from("settings").upsert({ key: SPU_RULES_KEY, value: { ...((cur?.value as object) ?? {}), ...patch }, updated_by: userId, updated_at: new Date().toISOString() });
  return error?.message ?? null;
}
const refreshSpu = () => {
  for (const p of ["/kpi", "/spu", "/rnd/dashboard"]) revalidatePath(p);
  void import("@/lib/spu-summary").then((m) => m.scheduleSpuSummaryRefresh()).catch(() => {});   // ngưỡng / KPI SPU đổi → làm mới bảng tổng hợp
};

// Quy tắc Win theo biên bản họp (dùng chung Dashboard + trang Theo dõi đẩy hàng): Win Traffic = lượt xem + bình luận trong N ngày đầu; Win Đơn hàng = số sản phẩm bán trong N ngày kể từ bài đầu tiên
async function saveWinRulesRaw(_: KpiFormState, form: FormData): Promise<KpiFormState> {
  const user = await requireActionUser(["admin"]);
  if (form.get("intent") === "reset") {   // không đặt tên nút là "reset": trùng form.reset() của trình duyệt
    const err = await patchSpuRules(user.id, { win: null });
    if (err) return { error: err };
    const message = await reevaluate();
    refreshSpu(); refreshPages();
    return { ok: true, message: "Đã khôi phục quy tắc Win theo biên bản họp · " + message };
  }
  const views = int(form, "traffic_views", 1), comments = int(form, "traffic_comments"), tDays = int(form, "traffic_days", 1);
  const qty = int(form, "order_qty", 1), oDays = int(form, "order_days", 1);
  if (views === null || comments === null || tDays === null || qty === null || oDays === null) return { error: "Mọi ô phải là số nguyên (lượt xem, số sản phẩm và số ngày từ 1 trở lên)" };
  if (tDays > 30 || oDays > 30) return { error: "Số ngày tối đa là 30 (dữ liệu bán chỉ có 30 ngày gần nhất ở bảng tổng hợp)" };
  const err = await patchSpuRules(user.id, { win: { traffic: { days: tDays, views, comments }, order: { days: oDays, qty } } });
  if (err) return { error: err };
  const message = await reevaluate();   // SP đang bán chấm Win Traffic theo quy tắc này
  refreshSpu(); refreshPages();
  return { ok: true, message: "Đã lưu quy tắc Win · " + message };
}

// Phân loại bán theo SL bán 30 ngày: tồn xấu (SL = 0) · bán chậm · bán thường · bán chạy (hoặc khôi phục mặc định cả bộ ngưỡng SPU)
async function saveStockRulesRaw(_: KpiFormState, form: FormData): Promise<KpiFormState> {
  const user = await requireActionUser(["admin"]);
  if (form.get("intent") === "reset") {   // không đặt tên nút là "reset": trùng form.reset() của trình duyệt
    const err = await patchSpuRules(user.id, null);
    if (err) return { error: err };
    refreshSpu();
    return { ok: true, message: "Đã khôi phục ngưỡng mặc định" };
  }
  const slowBelow = int(form, "slow_below"), normalBelow = int(form, "normal_below");
  if (slowBelow === null || normalBelow === null) return { error: "Hai ô phải là số nguyên từ 0 trở lên" };
  if (slowBelow < 1) return { error: "Ngưỡng bán chậm phải từ 1 sản phẩm (SL = 0 luôn là tồn xấu)" };
  if (normalBelow <= slowBelow) return { error: "Ngưỡng bán thường phải lớn hơn ngưỡng bán chậm" };
  const err = await patchSpuRules(user.id, { sales: { slowBelow, normalBelow } });
  if (err) return { error: err };
  refreshSpu();
  return { ok: true, message: "Đã lưu quy tắc phân loại bán" };
}

// Video Win: điều kiện chấm riêng từng video
async function saveVideoKpiRaw(_: KpiFormState, form: FormData): Promise<KpiFormState> {
  const user = await requireActionUser(["admin"]);
  let raw: unknown;
  try { raw = JSON.parse(String(form.get("rules") ?? "[]")); } catch { return { error: "Điều kiện không hợp lệ" }; }
  const rules = parseRules(raw);
  if (typeof rules === "string") return { error: rules };
  if (rules.some((r) => r.metric === "qty_net" || r.metric === "conversion")) return { error: "Video Win chỉ dùng chỉ số traffic (lượt xem, người xem, tương tác…): số bán không tính được cho từng video" };
  const err = await patchSpuRules(user.id, { video: { rules, match: form.get("match") === "any" ? "any" : "all" } });
  if (err) return { error: err };
  refreshSpu();
  bust(TAG.handoffs);   // tổng quan Đẩy mẫu có đếm "Video Win"
  for (const p of ["/sample-push", "/sample-push/overview", "/rnd-library"]) revalidatePath(p);
  return { ok: true, message: "Đã lưu" };
}

// ---------- Ngưỡng đánh giá thương mại hoá (bảng đánh giá khi duyệt P6) ----------
// core.settings 'commercial_rules'
async function saveCommercialRulesRaw(_: KpiFormState, form: FormData): Promise<KpiFormState> {
  const user = await requireActionUser(["admin"]);
  if (form.get("intent") === "reset") {
    const { error } = await sb.core().from("settings").delete().eq("key", COMMERCIAL_RULES_KEY);
    if (error) return { error: error.message };
    for (const p of ["/kpi", "/rnd"]) revalidatePath(p);
    return { ok: true, message: "Đã khôi phục ngưỡng mặc định" };
  }
  const keys = ["opsRatePct", "minMarginPct", "maxBreakEvenDays", "maxReturnPct", "safetyDays", "defaultLeadDays", "minDataDays", "minDataQty"] as const;
  const v: Record<string, number> = {};
  for (const k of keys) { const n = int(form, k); if (n === null) return { error: "Mọi ô phải là số nguyên từ 0 trở lên" }; v[k] = n; }
  if (v.opsRatePct > 100 || v.minMarginPct > 100 || v.maxReturnPct > 100) return { error: "Các tỉ lệ % tối đa 100" };
  if (v.maxBreakEvenDays < 1) return { error: "Thời gian hoà vốn tối đa phải từ 1 ngày" };
  const { error } = await sb.core().from("settings").upsert({ key: COMMERCIAL_RULES_KEY, value: v, updated_by: user.id, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };
  for (const p of ["/kpi", "/rnd"]) revalidatePath(p);
  return { ok: true, message: "Đã lưu ngưỡng đánh giá thương mại hoá" };
}

export async function saveDefaultKpi(prev: KpiFormState, form: FormData): Promise<KpiFormState> {
  return logged("settings_kpi", ["admin"], () => saveDefaultKpiRaw(prev, form), (r) => (r.message ? `Đã sửa KPI mặc định · ${r.message}` : "Đã sửa KPI mặc định"));
}
export async function saveWindowDays(prev: KpiFormState, form: FormData): Promise<KpiFormState> {
  return logged("settings_window", ["admin"], () => saveWindowDaysRaw(prev, form), (r) => (r.message ? `Đã sửa cửa sổ test · ${r.message}` : "Đã sửa cửa sổ test"));
}
export async function saveWinRules(prev: KpiFormState, form: FormData): Promise<KpiFormState> {
  return logged("settings_win", ["admin"], () => saveWinRulesRaw(prev, form), (r) => (r.message ? `Đã sửa quy tắc Win · ${r.message}` : "Đã sửa quy tắc Win"));
}
export async function saveStockRules(prev: KpiFormState, form: FormData): Promise<KpiFormState> {
  return logged("settings_stock", ["admin"], () => saveStockRulesRaw(prev, form), (r) => (r.message ? `Đã sửa phân loại bán · ${r.message}` : "Đã sửa phân loại bán"));
}
export async function saveVideoKpi(prev: KpiFormState, form: FormData): Promise<KpiFormState> {
  return logged("settings_video", ["admin"], () => saveVideoKpiRaw(prev, form), (r) => (r.message ? `Đã sửa KPI video · ${r.message}` : "Đã sửa KPI video"));
}
export async function saveCommercialRules(prev: KpiFormState, form: FormData): Promise<KpiFormState> {
  return logged("settings_commercial", ["admin"], () => saveCommercialRulesRaw(prev, form), (r) => (r.message ? `Đã sửa đánh giá thương mại hoá · ${r.message}` : "Đã sửa đánh giá thương mại hoá"));
}
