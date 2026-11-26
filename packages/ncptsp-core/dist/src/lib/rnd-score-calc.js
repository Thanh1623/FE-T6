"use strict";
// BẢNG CHẤM ĐIỂM MẪU SƯU TẦM (mẫu BM23 — Scorecard) — hàm thuần, dùng được ở máy chủ và trình duyệt.
// Mỗi người chấm 6 tiêu chí, mỗi tiêu chí 0–5 điểm. Điểm quy đổi thang 100 = Σ trọng số × điểm ÷ 5.
// ĐẠT khi: điểm quy đổi ≥ ngưỡng đạt (70) VÀ không tiêu chí nào dưới ngưỡng liệt (2 điểm) VÀ không ai tích "Loại ngay".
// Điểm CHÍNH THỨC của mẫu = trung bình từng tiêu chí của những người đã chấm (rồi quy đổi + xét đạt như trên).
Object.defineProperty(exports, "__esModule", { value: true });
exports.fmt = exports.spreadIds = exports.scoreTotal = exports.DEFAULT_SCORE_CFG = void 0;
exports.mergeScoreCfg = mergeScoreCfg;
exports.verdictOf = verdictOf;
exports.combine = combine;
exports.DEFAULT_SCORE_CFG = {
    pass: 70, fatal: 2, minScorers: 2, spread: 2,
    criteria: [
        { id: "c1", name: "Sức hút thị giác & Trend Social", weight: 25, guide: ["Mẫu cũ, không bắt mắt.", "Bắt mắt vừa phải.", "Mẫu đang cực HOT trên Douyin/TikTok, bắt sáng tốt, sinh ra để làm clip ngắn viral."] },
        { id: "c2", name: "Độ tươi của Trend & Độ bão hòa", weight: 20, guide: ["Mẫu đã bão hòa (Shopee bán tràn lan, giá tụt thảm hại).", "Đã có vài shop bán.", "Trend mới nổi 1-2 tuần, ít shop Việt Nam bán, dư địa khai thác còn rất dài."] },
        { id: "c3", name: "Tín hiệu nhu cầu (Data Source)", weight: 20, guide: ["Chỉ thích cảm tính.", "Có lượt tương tác vừa phải.", "Có dữ liệu thật: lượt view/bán ở nguồn gốc cực cao, comment hỏi mua dồn dập."] },
        { id: "c4", name: "Biên lợi nhuận & Cạnh tranh giá", weight: 15, guide: ["Giá nguồn cao, không thể cạnh tranh.", "Biên an toàn 45-50%.", "Giá vốn ước tính <= 40-45% giá bán, biên gộp dày, dư địa chạy Ads/Social tốt."] },
        { id: "c5", name: "Rủi ro bản quyền & Thương hiệu", weight: 10, guide: ["Trùng logo/nhân vật bản quyền lớn (Disney, Chanel...) → LOẠI NGAY.", "Cần tinh chỉnh nhẹ.", "Mẫu thời trang đại chúng, dễ dàng tinh chỉnh 1 chi tiết để né bản quyền ở F2."] },
        { id: "c6", name: "Khả thi làm mẫu nhanh", weight: 10, guide: ["Kết cấu quá phức tạp, xưởng không thể làm mẫu trong 3-5 ngày.", "Cần thợ tay nghề khá.", "Kết cấu cơ bản, xưởng ra mẫu cực nhanh (3-5 ngày)."] },
    ],
};
// Gộp cấu hình đã lưu (core.settings) với mặc định: chỉ nhận số hợp lệ; tiêu chí lấy theo id
function mergeScoreCfg(saved) {
    const d = exports.DEFAULT_SCORE_CFG;
    const s = (saved && typeof saved === "object" ? saved : {});
    const num = (v, def, min, max) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : def);
    const byId = new Map((Array.isArray(s.criteria) ? s.criteria : []).filter((c) => c && typeof c.id === "string").map((c) => [c.id, c]));
    return {
        pass: num(s.pass, d.pass, 1, 100), fatal: num(s.fatal, d.fatal, 0, 5), minScorers: Math.round(num(s.minScorers, d.minScorers, 1, 10)), spread: num(s.spread, d.spread, 1, 5),
        criteria: d.criteria.map((c) => {
            const o = byId.get(c.id);
            return {
                id: c.id, name: typeof o?.name === "string" && o.name.trim() ? o.name.trim() : c.name,
                weight: num(o?.weight, c.weight, 0, 100),
                guide: Array.isArray(o?.guide) && o.guide.length === 3 && o.guide.every((g) => typeof g === "string") ? o.guide : c.guide,
            };
        }),
    };
}
const totalWeight = (cfg) => cfg.criteria.reduce((n, c) => n + c.weight, 0) || 100;
// Điểm quy đổi thang 100 (tiêu chí chưa có điểm tính 0)
const scoreTotal = (scores, cfg) => Math.round((cfg.criteria.reduce((n, c) => n + c.weight * (Number(scores[c.id]) || 0) / 5, 0) / totalWeight(cfg)) * 100 * 100) / 100;
exports.scoreTotal = scoreTotal;
function verdictOf(scores, cfg, fatalFlag = false) {
    const total = (0, exports.scoreTotal)(scores, cfg);
    const fatalIds = cfg.criteria.filter((c) => (Number(scores[c.id]) || 0) < cfg.fatal).map((c) => c.id);
    const reasons = [];
    if (total < cfg.pass)
        reasons.push(`Tổng ${(0, exports.fmt)(total)} < ${cfg.pass} điểm`);
    for (const id of fatalIds)
        reasons.push(`${cfg.criteria.find((c) => c.id === id).name} dưới ${cfg.fatal} điểm (điểm liệt)`);
    if (fatalFlag)
        reasons.push("Có người tích “Loại ngay” (bản quyền)");
    return { total, passed: reasons.length === 0, fatalIds, reasons };
}
// Điểm chính thức: trung bình từng tiêu chí của mọi người đã chấm
function combine(cards, cfg) {
    if (!cards.length)
        return null;
    const avg = Object.fromEntries(cfg.criteria.map((c) => [c.id, Math.round((cards.reduce((n, k) => n + (Number(k.scores[c.id]) || 0), 0) / cards.length) * 100) / 100]));
    return { ...verdictOf(avg, cfg, cards.some((k) => k.fatal)), n: cards.length, avg };
}
// Tiêu chí mà hai người chấm lệch nhau từ cfg.spread điểm trở lên
const spreadIds = (cards, cfg) => cfg.criteria.filter((c) => {
    const v = cards.map((k) => Number(k.scores[c.id]) || 0);
    return v.length > 1 && Math.max(...v) - Math.min(...v) >= cfg.spread;
}).map((c) => c.id);
exports.spreadIds = spreadIds;
const fmt = (n) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
exports.fmt = fmt;
