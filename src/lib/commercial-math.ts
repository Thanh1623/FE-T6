// Công thức đánh giá thương mại hoá — hàm thuần (dùng ở máy chủ, trình duyệt và kiểm thử). Chỉ áp dụng cho mẫu mới của R&D và mẫu Media test đã vào R&D.

export type CommercialRules = {
  opsRatePct: number;          // chi phí vận hành mỗi đơn (phí sàn, vận chuyển, đóng gói) — % giá bán, dùng khi mẫu chưa nhập số tiền cụ thể
  minMarginPct: number;        // biên lợi nhuận gộp tối thiểu (sau chi phí vận hành)
  maxBreakEvenDays: number;    // thời gian hoà vốn tối đa chấp nhận
  maxReturnPct: number;        // tỉ lệ hoàn tối đa
  safetyDays: number;          // tồn an toàn: số ngày bán đệm
  defaultLeadDays: number;     // thời gian sản xuất mặc định khi mẫu chưa nhập
  minDataDays: number;         // số ngày bán tối thiểu để tin số liệu
  minDataQty: number;          // số sản phẩm đã bán tối thiểu để tin số liệu
};
export const DEFAULT_COMMERCIAL_RULES: CommercialRules = {
  opsRatePct: 10, minMarginPct: 30, maxBreakEvenDays: 60, maxReturnPct: 15, safetyDays: 15, defaultLeadDays: 30, minDataDays: 7, minDataQty: 10,
};

export type CommercialInput = {
  price: number | null;            // giá bán / sản phẩm
  priceSource: "thực tế" | "dự kiến" | null;
  unitCost: number | null;         // giá vốn / sản phẩm
  costSource: "thực tế" | "dự kiến" | null;
  sampleCost: number;              // chi phí làm mẫu
  adsCost: number;
  videoCost: number;               // chi phí quay mẫu / video (nhập tay)
  opsCost: number | null;          // chi phí vận hành mỗi sản phẩm nhập tay (đồng); null = dùng % mặc định
  launchDate: string | null;       // ngày mở bán (yyyy-mm-dd)
  daysSinceLaunch: number | null;
  sold: number;                    // đã bán thuần (trừ hoàn) từ ngày mở bán
  soldGross: number;               // đã bán chưa trừ hoàn
  returned: number;
  perDay: { d7: number | null; d14: number | null; d30: number | null };   // số bán thuần / ngày trong 7 / 14 / 30 ngày gần nhất (không vượt quá số ngày đã bán)
  onHand: number | null;           // tồn kho hiện có (null = chưa có dữ liệu tồn)
  incoming: number;
  leadDays: number;
  minOrderQty: number;
  winMet: boolean;                 // hệ thống đã đánh giá Win / Win Traffic
};

export type Scenario = { label: string; perDay: number | null; days: number | null };
export type Check = { key: string; label: string; ok: boolean | null; detail: string };   // ok null = chưa đủ dữ liệu
export type Suggestion = "approve" | "conditional" | "reject";
export type CommercialResult = {
  sunk: number;
  unitMargin: number | null;       // lãi gộp / sp sau giá vốn và chi phí vận hành
  marginPct: number | null;
  breakEvenQty: number | null;
  remainingQty: number | null;
  scenarios: Scenario[];           // bi quan (30 ngày) · cơ sở (14 ngày) · lạc quan (7 ngày) — số ngày còn lại để hoà vốn
  profit: { d30: number | null; d60: number | null; d90: number | null };   // lợi nhuận luỹ kế sau N ngày nữa (kịch bản cơ sở, đã trừ vốn đã bỏ)
  order: { demand: number | null; safety: number | null; suggested: number | null; capital: number | null };
  returnPct: number | null;
  checks: Check[];
  suggestion: Suggestion;
  missing: string[];               // lý do chưa tính được
};

const ceilTo = (n: number, step: number) => Math.ceil(n / step) * step;

export function evaluateCommercialMath(i: CommercialInput, r: CommercialRules): CommercialResult {
  const missing: string[] = [];
  if (i.price === null) missing.push("chưa có giá bán");
  if (i.unitCost === null) missing.push("chưa có giá vốn");
  if (!i.launchDate) missing.push("chưa có ngày mở bán");

  const sunk = i.sampleCost + i.adsCost + i.videoCost;
  const ops = i.opsCost ?? (i.price !== null ? (i.price * r.opsRatePct) / 100 : null);
  const unitMargin = i.price !== null && i.unitCost !== null && ops !== null ? i.price - i.unitCost - ops : null;
  const marginPct = unitMargin !== null && i.price ? (unitMargin / i.price) * 100 : null;
  const breakEvenQty = unitMargin !== null && unitMargin > 0 ? Math.ceil(sunk / unitMargin) : null;
  const remainingQty = breakEvenQty === null ? null : Math.max(0, breakEvenQty - i.sold);
  const daysFor = (perDay: number | null) => (remainingQty === null ? null : remainingQty === 0 ? 0 : perDay !== null && perDay > 0 ? Math.ceil(remainingQty / perDay) : null);
  const scenarios: Scenario[] = [
    { label: "Bi quan (30 ngày gần nhất)", perDay: i.perDay.d30, days: daysFor(i.perDay.d30) },
    { label: "Cơ sở (14 ngày gần nhất)", perDay: i.perDay.d14, days: daysFor(i.perDay.d14) },
    { label: "Lạc quan (7 ngày gần nhất)", perDay: i.perDay.d7, days: daysFor(i.perDay.d7) },
  ];
  const base = i.perDay.d14;
  const profitAt = (n: number) => (unitMargin !== null && base !== null ? Math.round((i.sold + base * n) * unitMargin - sunk) : null);

  // Số lượng đề xuất đặt: nhu cầu trong thời gian chờ hàng + tồn an toàn − tồn hiện có − hàng đang về, làm tròn lên theo bội số đặt
  const demand = base !== null ? base * i.leadDays : null;
  const safety = base !== null ? base * r.safetyDays : null;
  const need = demand !== null && safety !== null ? demand + safety - (i.onHand ?? 0) - i.incoming : null;
  const suggested = need === null ? null : Math.max(0, ceilTo(Math.max(0, need), Math.max(1, i.minOrderQty)));
  const capital = suggested !== null && i.unitCost !== null ? suggested * i.unitCost : null;

  const returnPct = i.soldGross > 0 ? (i.returned / i.soldGross) * 100 : null;
  const enough = (i.daysSinceLaunch ?? 0) >= r.minDataDays && i.soldGross >= r.minDataQty;
  const bestDays = scenarios[1].days ?? scenarios[0].days;
  const checks: Check[] = [
    { key: "win", label: "Đã đạt Win theo tiêu chuẩn họp", ok: i.winMet, detail: i.winMet ? "Hệ thống đánh giá Win / Win Traffic" : "Chưa đạt Win" },
    { key: "margin", label: `Biên lợi nhuận ≥ ${r.minMarginPct}%`, ok: marginPct === null ? null : marginPct >= r.minMarginPct,
      detail: marginPct === null ? "Thiếu giá bán / giá vốn" : `${marginPct.toFixed(1)}% (đã trừ chi phí vận hành ${i.opsCost !== null ? `${Math.round(i.opsCost).toLocaleString("vi-VN")}đ / sp` : `${r.opsRatePct}%`})` },
    { key: "breakeven", label: `Hoà vốn trong ≤ ${r.maxBreakEvenDays} ngày`, ok: remainingQty === 0 ? true : bestDays === null ? null : bestDays <= r.maxBreakEvenDays,
      detail: remainingQty === 0 ? "Đã hoà vốn" : bestDays === null ? "Chưa tính được (thiếu tốc độ bán hoặc lãi gộp ≤ 0)" : `${bestDays} ngày theo kịch bản cơ sở` },
    { key: "returns", label: `Tỉ lệ hoàn ≤ ${r.maxReturnPct}%`, ok: returnPct === null ? null : returnPct <= r.maxReturnPct, detail: returnPct === null ? "Chưa có đơn bán" : `${returnPct.toFixed(1)}%` },
    { key: "data", label: "Đủ dữ liệu để kết luận", ok: enough, detail: `${i.daysSinceLaunch ?? 0} ngày · ${i.soldGross} sp đã bán (cần ≥ ${r.minDataDays} ngày và ≥ ${r.minDataQty} sp)` },
  ];

  // Gợi ý: lãi gộp ≤ 0, chưa đạt Win, hoặc vừa lãi mỏng vừa hoà vốn quá lâu → không nên duyệt; đạt hết → nên duyệt; còn lại → duyệt có điều kiện
  const get = (k: string) => checks.find((c) => c.key === k)?.ok;
  const hardFail = (unitMargin !== null && unitMargin <= 0) || !i.winMet || (get("breakeven") === false && get("margin") === false);
  const suggestion: Suggestion = hardFail ? "reject" : checks.every((c) => c.ok === true) ? "approve" : "conditional";
  return { sunk, unitMargin, marginPct, breakEvenQty, remainingQty, scenarios, profit: { d30: profitAt(30), d60: profitAt(60), d90: profitAt(90) },
    order: { demand, safety, suggested, capital }, returnPct, checks, suggestion, missing };
}

export const SUGGESTION_LABEL: Record<Suggestion, string> = { approve: "Nên duyệt", conditional: "Duyệt có điều kiện", reject: "Chưa nên duyệt" };
