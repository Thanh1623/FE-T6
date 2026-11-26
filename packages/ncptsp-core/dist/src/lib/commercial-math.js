"use strict";
// Công thức đánh giá thương mại hoá — hàm thuần (dùng ở máy chủ, trình duyệt và kiểm thử). Chỉ áp dụng cho mẫu mới của R&D và mẫu Media test đã vào R&D.
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUGGESTION_LABEL = exports.DEFAULT_COMMERCIAL_RULES = void 0;
exports.evaluateCommercialMath = evaluateCommercialMath;
exports.DEFAULT_COMMERCIAL_RULES = {
    opsRatePct: 10, minMarginPct: 30, maxBreakEvenDays: 60, maxReturnPct: 15, safetyDays: 15, defaultLeadDays: 30, minDataDays: 7, minDataQty: 10,
};
const ceilTo = (n, step) => Math.ceil(n / step) * step;
function evaluateCommercialMath(i, r) {
    const missing = [];
    if (i.price === null)
        missing.push("chưa có giá bán");
    if (i.unitCost === null)
        missing.push("chưa có giá vốn");
    if (!i.launchDate)
        missing.push("chưa có ngày mở bán");
    const sunk = i.sampleCost + i.adsCost + i.videoCost;
    const ops = i.opsCost ?? (i.price !== null ? (i.price * r.opsRatePct) / 100 : null);
    const unitMargin = i.price !== null && i.unitCost !== null && ops !== null ? i.price - i.unitCost - ops : null;
    const marginPct = unitMargin !== null && i.price ? (unitMargin / i.price) * 100 : null;
    const breakEvenQty = unitMargin !== null && unitMargin > 0 ? Math.ceil(sunk / unitMargin) : null;
    const remainingQty = breakEvenQty === null ? null : Math.max(0, breakEvenQty - i.sold);
    const daysFor = (perDay) => (remainingQty === null ? null : remainingQty === 0 ? 0 : perDay !== null && perDay > 0 ? Math.ceil(remainingQty / perDay) : null);
    const scenarios = [
        { label: "Bi quan (30 ngày gần nhất)", perDay: i.perDay.d30, days: daysFor(i.perDay.d30) },
        { label: "Cơ sở (14 ngày gần nhất)", perDay: i.perDay.d14, days: daysFor(i.perDay.d14) },
        { label: "Lạc quan (7 ngày gần nhất)", perDay: i.perDay.d7, days: daysFor(i.perDay.d7) },
    ];
    const base = i.perDay.d14;
    const profitAt = (n) => (unitMargin !== null && base !== null ? Math.round((i.sold + base * n) * unitMargin - sunk) : null);
    // Số lượng đề xuất đặt: nhu cầu trong thời gian chờ hàng + tồn an toàn − tồn hiện có − hàng đang về, làm tròn lên theo bội số đặt
    const demand = base !== null ? base * i.leadDays : null;
    const safety = base !== null ? base * r.safetyDays : null;
    const need = demand !== null && safety !== null ? demand + safety - (i.onHand ?? 0) - i.incoming : null;
    const suggested = need === null ? null : Math.max(0, ceilTo(Math.max(0, need), Math.max(1, i.minOrderQty)));
    const capital = suggested !== null && i.unitCost !== null ? suggested * i.unitCost : null;
    const returnPct = i.soldGross > 0 ? (i.returned / i.soldGross) * 100 : null;
    const enough = (i.daysSinceLaunch ?? 0) >= r.minDataDays && i.soldGross >= r.minDataQty;
    const bestDays = scenarios[1].days ?? scenarios[0].days;
    const checks = [
        { key: "win", label: "Đã đạt Win theo tiêu chuẩn họp", ok: i.winMet, detail: i.winMet ? "Hệ thống đánh giá Win / Win Traffic" : "Chưa đạt Win" },
        { key: "margin", label: `Biên lợi nhuận ≥ ${r.minMarginPct}%`, ok: marginPct === null ? null : marginPct >= r.minMarginPct,
            detail: marginPct === null ? "Thiếu giá bán / giá vốn" : `${marginPct.toFixed(1)}% (đã trừ chi phí vận hành ${i.opsCost !== null ? `${Math.round(i.opsCost).toLocaleString("vi-VN")}đ / sp` : `${r.opsRatePct}%`})` },
        { key: "breakeven", label: `Hoà vốn trong ≤ ${r.maxBreakEvenDays} ngày`, ok: remainingQty === 0 ? true : bestDays === null ? null : bestDays <= r.maxBreakEvenDays,
            detail: remainingQty === 0 ? "Đã hoà vốn" : bestDays === null ? "Chưa tính được (thiếu tốc độ bán hoặc lãi gộp ≤ 0)" : `${bestDays} ngày theo kịch bản cơ sở` },
        { key: "returns", label: `Tỉ lệ hoàn ≤ ${r.maxReturnPct}%`, ok: returnPct === null ? null : returnPct <= r.maxReturnPct, detail: returnPct === null ? "Chưa có đơn bán" : `${returnPct.toFixed(1)}%` },
        { key: "data", label: "Đủ dữ liệu để kết luận", ok: enough, detail: `${i.daysSinceLaunch ?? 0} ngày · ${i.soldGross} sp đã bán (cần ≥ ${r.minDataDays} ngày và ≥ ${r.minDataQty} sp)` },
    ];
    // Gợi ý: lãi gộp ≤ 0, chưa đạt Win, hoặc vừa lãi mỏng vừa hoà vốn quá lâu → không nên duyệt; đạt hết → nên duyệt; còn lại → duyệt có điều kiện
    const get = (k) => checks.find((c) => c.key === k)?.ok;
    const hardFail = (unitMargin !== null && unitMargin <= 0) || !i.winMet || (get("breakeven") === false && get("margin") === false);
    const suggestion = hardFail ? "reject" : checks.every((c) => c.ok === true) ? "approve" : "conditional";
    return { sunk, unitMargin, marginPct, breakEvenQty, remainingQty, scenarios, profit: { d30: profitAt(30), d60: profitAt(60), d90: profitAt(90) },
        order: { demand, safety, suggested, capital }, returnPct, checks, suggestion, missing };
}
exports.SUGGESTION_LABEL = { approve: "Nên duyệt", conditional: "Duyệt có điều kiện", reject: "Chưa nên duyệt" };
