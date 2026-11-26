"use strict";
// Khoảng ngày của bộ lọc báo cáo — hàm thuần, dùng chung máy chủ (parseFilters) và trình duyệt (ô chọn thả xuống).
// range: "today" · "7" | "30" | "90" | "365" (N ngày gần nhất, kết thúc HÔM QUA) · "this_month" · "last_month" · "custom".
Object.defineProperty(exports, "__esModule", { value: true });
exports.rangeLabel = exports.RANGE_OPTIONS = exports.shiftDay = void 0;
exports.resolveRange = resolveRange;
const DAY_MS = 86_400_000;
const shiftDay = (d, n) => new Date(Date.parse(d) + n * DAY_MS).toISOString().slice(0, 10);
exports.shiftDay = shiftDay;
exports.RANGE_OPTIONS = [
    { value: "today", label: "Hôm nay" },
    { value: "7", label: "7 ngày qua" },
    { value: "30", label: "30 ngày qua" },
    { value: "90", label: "90 ngày qua" },
    { value: "this_month", label: "Tháng này" },
    { value: "last_month", label: "Tháng trước" },
    { value: "365", label: "1 năm qua" },
];
const rangeLabel = (range) => range === "custom" ? "Tuỳ chọn" : exports.RANGE_OPTIONS.find((o) => o.value === range)?.label ?? "30 ngày qua";
exports.rangeLabel = rangeLabel;
// today: YYYY-MM-DD (giờ VN). Trả null nếu không phải khoảng cố định (custom / không hợp lệ).
function resolveRange(range, today) {
    const monthStart = `${today.slice(0, 8)}01`;
    if (range === "today")
        return { from: today, to: today }; // video / bài vừa đăng hôm nay
    if (range === "this_month")
        return { from: monthStart, to: today }; // từ ngày 1 tới HÔM NAY
    if (range === "last_month") {
        const end = (0, exports.shiftDay)(monthStart, -1);
        return { from: `${end.slice(0, 8)}01`, to: end };
    }
    const n = Number(range);
    if ([7, 30, 90, 365].includes(n))
        return { from: (0, exports.shiftDay)(today, -(n - 1)), to: today };
    return null;
}
