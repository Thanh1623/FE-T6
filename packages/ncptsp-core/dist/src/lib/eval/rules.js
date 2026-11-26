"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isWinResult = exports.WIN_VAR = exports.WIN_NAME = exports.WIN_RESULTS = exports.rulesPass = void 0;
exports.buildMetrics = buildMetrics;
exports.checkRules = checkRules;
exports.groupStatus = groupStatus;
exports.decideAuto = decideAuto;
exports.determineProductAge = determineProductAge;
const tags_ts_1 = require("../tags.ts");
// Tính các chỉ số KPI từ số thô. Tỉ lệ = null khi mẫu số = 0 (không phải 0%).
function buildMetrics(raw) {
    return {
        ...raw,
        ctr: raw.views > 0 ? (raw.clicks / raw.views) * 100 : null,
        engagement_rate: raw.viewers > 0 ? ((raw.reactions + raw.clicks) / raw.viewers) * 100 : null,
        conversion: raw.viewers > 0 ? (raw.qty_net / raw.viewers) * 100 : null,
    };
}
function checkRules(rules, m) {
    return rules.map((r) => {
        const actual = m[r.metric];
        const pass = actual !== null && (r.op === ">=" ? actual >= r.value : actual <= r.value);
        // Tiến độ tới ngưỡng (cho ">="): 0..1, để biết "sắp đạt"
        const progress = actual === null ? 0 : r.op === ">=" ? (r.value > 0 ? Math.min(1, actual / r.value) : 1) : pass ? 1 : 0;
        return { metric: r.metric, op: r.op, target: r.value, actual, pass, progress };
    });
}
const rulesPass = (checks, match) => checks.length > 0 && (match === "all" ? checks.every((c) => c.pass) : checks.some((c) => c.pass));
exports.rulesPass = rulesPass;
// Trạng thái 1 nhóm KPI: pass / partial (≥ 50% chặng đường) / weak / not_enough (chưa đủ dữ liệu)
function groupStatus(checks, match, enoughData) {
    if ((0, exports.rulesPass)(checks, match))
        return "pass";
    if (!enoughData)
        return "not_enough";
    const avg = checks.reduce((s, c) => s + c.progress, 0) / Math.max(1, checks.length);
    const best = Math.max(0, ...checks.map((c) => c.progress));
    return (match === "all" ? avg : best) >= 0.5 ? "partial" : "weak";
}
exports.WIN_RESULTS = ["win", "win_traffic", "win_sp"];
exports.WIN_NAME = { win: "WIN", win_traffic: "WIN TRAFFIC", win_sp: "WIN SP" };
exports.WIN_VAR = { win: "--res-win", win_traffic: "--res-wt", win_sp: "--res-wsp" };
const isWinResult = (r) => !!r && exports.WIN_RESULTS.includes(r);
exports.isWinResult = isWinResult;
// Quy tắc chung (không phân loại mục tiêu test): đạt KPI bán → WIN; chưa bán đủ mà đạt KPI traffic → WIN TRAFFIC (bán đủ sau đó thì nâng lên WIN).
// Chưa đạt vế nào: còn trong cửa sổ test → ĐANG TEST; hết cửa sổ → FAIL.
function decideAuto(salesPass, trafficPass, windowOver) {
    if (salesPass)
        return "win"; // bán nhiều (đạt KPI bán) → WIN, dù traffic chưa đạt
    if (trafficPass)
        return "win_traffic"; // chưa bán đủ nhưng traffic đạt → WIN TRAFFIC (bán đạt sau đó thì nâng lên WIN)
    return windowOver ? "fail" : "testing";
}
function shiftIsoDate(date, days) {
    const d = new Date(date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
/**
 * Xác định sản phẩm Mới / Cũ tương đối theo kỳ lọc:
 * - Override: R&D chỉ định thủ công
 * - Mới (Media): Mẫu test do đội Media tự tìm source và test (T10001, T20003...)
 * - Mới R&D: có giai đoạn (stage) hoặc nghiên cứu thủ công (origin === 'manual')
 * - Cũ: đã bán trước kỳ lọc > 15 cái, HOẶC đã từng phát sinh đơn từ các tháng trước (> 21 ngày trước kỳ),
 *       HOẶC đã lên video > 14 ngày trước kỳ, HOẶC đã có trên Sapo catalog > 21 ngày trước kỳ.
 * - Mới: mới lên video và test bán lần đầu trong kỳ lọc (hoặc sát kỳ lọc).
 */
function determineProductAge(params) {
    const { code, ageOverride, stage, origin, priorQty, oldHistoryQty = 0, firstPostDate, firstSeenAt, periodFrom } = params;
    if (ageOverride) {
        return { age: ageOverride, age_reason: "override" };
    }
    // Mẫu test do đội Media tự tìm source (T10001 nhẫn test, T20003 lắc test...)
    if ((code && (0, tags_ts_1.isTestCode)(code)) || origin === "media") {
        return { age: "new", age_reason: "media_test" };
    }
    if (stage || origin === "manual") {
        return { age: "new", age_reason: "rnd" };
    }
    if (priorQty > 15) {
        return { age: "old", age_reason: "has_sales" };
    }
    if (oldHistoryQty > 0) {
        return { age: "old", age_reason: "old_history" };
    }
    if (firstPostDate && firstPostDate < shiftIsoDate(periodFrom, -14)) {
        return { age: "old", age_reason: "old_video" };
    }
    if (firstSeenAt && firstSeenAt < shiftIsoDate(periodFrom, -21)) {
        return { age: "old", age_reason: "old_catalog" };
    }
    return { age: "new", age_reason: "new_test" };
}
