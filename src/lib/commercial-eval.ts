import { orderCost } from "@/lib/order-cost";
import "server-only";
import { fetchAll, sb } from "@/lib/supabase/admin";
import { loadDailySales, type SaleRow as Sale } from "@/lib/daily-sales";
import { isTestCode } from "@/lib/tags";
import { flagged } from "@/lib/rnd-options";
import { getRndOptions } from "@/lib/pipeline";
import { loadCodeLinks } from "@/lib/code-links";
import { DEFAULT_COMMERCIAL_RULES, evaluateCommercialMath, type CommercialInput, type CommercialResult, type CommercialRules } from "@/lib/commercial-math";

// Đánh giá thương mại hoá cho 1 mẫu — CHỈ mẫu mới trong quy trình R&D (có P-stage: mẫu R&D và mẫu Media test đã được đưa vào R&D), không áp dụng cho mẫu cũ trong kho.
// Nguồn: chi phí mẫu (đơn đặt mẫu + chi phí khác), Ads, chi phí quay mẫu (nhập tay) · số bán thực tế toàn hệ thống từ ngày mở bán (trừ kênh bảo hành) · giá vốn / giá bán dự kiến khi chưa đủ số bán.
export const COMMERCIAL_RULES_KEY = "commercial_rules";

const DAY = 86_400_000;
const vnDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(d);
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const num = (v: unknown, d: number, min = 0) => (typeof v === "number" && Number.isFinite(v) && v >= min ? v : d);

export function mergeCommercialRules(saved: unknown): CommercialRules {
  const s = (saved ?? {}) as Record<string, unknown>, d = DEFAULT_COMMERCIAL_RULES;
  return {
    opsRatePct: Math.min(100, num(s.opsRatePct, d.opsRatePct)), minMarginPct: Math.min(100, num(s.minMarginPct, d.minMarginPct)),
    maxBreakEvenDays: num(s.maxBreakEvenDays, d.maxBreakEvenDays, 1), maxReturnPct: Math.min(100, num(s.maxReturnPct, d.maxReturnPct)),
    safetyDays: num(s.safetyDays, d.safetyDays), defaultLeadDays: num(s.defaultLeadDays, d.defaultLeadDays),
    minDataDays: num(s.minDataDays, d.minDataDays), minDataQty: num(s.minDataQty, d.minDataQty),
  };
}
export async function loadCommercialRules(): Promise<CommercialRules> {
  const { data } = await sb.core().from("settings").select("value").eq("key", COMMERCIAL_RULES_KEY).maybeSingle();
  return mergeCommercialRules(data?.value);
}

export type CommercialEval = { input: CommercialInput; result: CommercialResult; rules: CommercialRules; salesCodes: string[]; evaluatedAt: string };

// null = mẫu ngoài phạm vi (chưa vào quy trình R&D)
export async function evaluateCommercial(productId: string): Promise<CommercialEval | null> {
  const { data: p } = await sb.rnd().from("products").select("*").eq("id", productId).maybeSingle();
  if (!p || !p.stage) return null;
  const [rules, options, links, { data: orders }, { data: ev }] = await Promise.all([
    loadCommercialRules(), getRndOptions(), loadCodeLinks(),
    sb.rnd().from("sample_orders").select("cost, cost_other, qty, status").eq("product_id", productId),
    p.code ? sb.rnd().from("evaluations").select("result, first_post_date").eq("code", p.code).maybeSingle() : { data: null },
  ]);
  const cancelled = flagged(options.order_status, "cancel");
  const sampleCost = (orders ?? []).filter((o) => !cancelled.includes(o.status as string)).reduce((t, o) => t + orderCost(o), 0);

  // Mã bán trên Sapo: mã SPU thương mại của mẫu (R&D: sapo_code / mã mẫu; Media test: các mã gắn ở trang Mã SPU test)
  const mine = links.filter((l) => l.product_id === productId);
  const codes = new Set<string>(mine.map((l) => l.sku_code.toUpperCase()));
  if (p.sapo_code) codes.add(String(p.sapo_code).toUpperCase());
  if (p.code && !isTestCode(p.code)) codes.add(String(p.code).toUpperCase());
  const salesCodes = [...codes];
  // Ngày mở bán: ngày ghi ở mẫu → ngày mở bán của mã SPU đã gắn (mẫu Media test). Mẫu R&D chỉ được ghi ngày mở bán khi duyệt P6 nên lúc đánh giá chưa có:
  // tạm lấy ngày video đầu tiên của mã (cùng mốc tính Win Đơn hàng) để vẫn tính được tốc độ bán; mẫu Media test thì không tự suy (phải gắn mã SPU + ngày mở bán)
  const firstPost = (ev?.first_post_date as string | null | undefined) ?? null;
  const launchDate: string | null = (p.launch_date as string | null) ?? (mine.length ? mine.map((l) => l.launch_date).sort()[0] : null) ?? (p.code && !isTestCode(p.code) ? firstPost : null);

  const today = vnDay(new Date());
  let sales: Sale[] = [];
  let onHand: number | null = null;
  if (launchDate && salesCodes.length) {
    sales = await loadDailySales({ codes: salesCodes, from: launchDate, to: today });   // file đơn hàng đã nhập + số đồng bộ cho ngày ngoài khoảng file
  }
  if (salesCodes.length) {
    const { data: st, error } = await sb.sales().from("inventory_stock").select("stock").in("code", salesCodes);
    if (!error && st?.length) onHand = st.reduce((t, r) => t + Number(r.stock ?? 0), 0);   // bảng tồn kho chỉ có khi đã chạy migration 038 và nhập file
  }

  const sum = (rows: Sale[], k: keyof Sale) => rows.reduce((t, r) => t + Number(r[k] ?? 0), 0);
  const soldGross = sum(sales, "qty_sold"), returned = sum(sales, "qty_returned"), sold = soldGross - returned;
  const daysSinceLaunch = launchDate ? Math.max(0, dayDiff(launchDate, today) + 1) : null;
  const perDay = (n: number) => {
    if (!daysSinceLaunch) return null;
    const eff = Math.min(n, daysSinceLaunch), from = addDays(today, -(eff - 1));
    return sum(sales.filter((r) => r.date >= from), "qty_sold") / eff - sum(sales.filter((r) => r.date >= from), "qty_returned") / eff;
  };

  // Giá bán / giá vốn: ưu tiên số thực tế khi đã bán đủ, nếu không dùng số dự kiến
  // Giá bán thực tế: ưu tiên đơn giá trên các đơn trong FILE đã nhập (đơn giá × SL ÷ SL); thiếu thì doanh thu của số đồng bộ (nếu có tiền)
  const fileRows = sales.filter((r) => r.fromFile), syncRows = sales.filter((r) => !r.fromFile);
  const fileQty = sum(fileRows, "qty_sold") - sum(fileRows, "qty_returned"), syncQty = sum(syncRows, "qty_sold") - sum(syncRows, "qty_returned");
  const realPrice = fileQty >= 5 && sum(fileRows, "revenue") > 0 ? sum(fileRows, "revenue") / fileQty
    : syncQty >= 5 && sum(syncRows, "revenue") > 0 ? (sum(syncRows, "revenue") - sum(syncRows, "returned_value")) / syncQty : null;
  const expPrice = Number(p.expected_price) > 0 ? Number(p.expected_price) : null;
  const realCost = syncQty >= 5 && sum(syncRows, "cost") > 0 ? (sum(syncRows, "cost") - sum(syncRows, "returned_cost")) / syncQty : null;   // giá vốn chỉ có ở số đồng bộ
  const expCost = Number(p.expected_cost) > 0 ? Number(p.expected_cost) : null;

  const input: CommercialInput = {
    price: realPrice ?? expPrice, priceSource: realPrice !== null ? "thực tế" : expPrice !== null ? "dự kiến" : null,
    unitCost: expCost ?? realCost, costSource: expCost !== null ? "dự kiến" : realCost !== null ? "thực tế" : null,
    sampleCost, adsCost: Number(p.ads_cost ?? 0), videoCost: Number(p.video_cost ?? 0), opsCost: p.ops_cost === null || p.ops_cost === undefined ? null : Number(p.ops_cost),
    launchDate, daysSinceLaunch, sold, soldGross, returned,
    perDay: { d7: perDay(7), d14: perDay(14), d30: perDay(30) },
    onHand, incoming: 0, leadDays: Number(p.lead_days ?? rules.defaultLeadDays), minOrderQty: Number(p.min_order_qty ?? 1),
    winMet: ["win", "win_traffic", "win_sp"].includes((ev?.result as string | undefined) ?? ""),
  };
  return { input, result: evaluateCommercialMath(input, rules), rules, salesCodes, evaluatedAt: new Date().toISOString() };
}
