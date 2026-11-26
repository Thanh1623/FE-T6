"use strict";
// Định dạng số dùng được ở cả máy chủ lẫn trình duyệt (lib/data.ts có "server-only" nên component client không import trực tiếp được)
Object.defineProperty(exports, "__esModule", { value: true });
exports.fmtTr = exports.fmtInt = void 0;
exports.fmtCompact = fmtCompact;
// Số thu gọn kiểu Facebook / Reels: 611 · 1,2K · 35K · 1,2 Tr (dưới 10 nghìn / 10 triệu giữ 1 số lẻ)
function fmtCompact(n) {
    const f = (v) => (v < 10 ? v.toLocaleString("vi-VN", { maximumFractionDigits: 1 }) : Math.round(v).toLocaleString("vi-VN"));
    const a = Math.abs(n);
    if (a >= 999_500)
        return `${f(n / 1_000_000)} Tr`; // 999.9K làm tròn thành 1 Tr, không hiện "1.000K"
    if (a >= 1000)
        return `${f(n / 1000)}K`;
    return Math.round(n).toLocaleString("vi-VN");
}
const fmtInt = (n) => Math.round(n).toLocaleString("vi-VN");
exports.fmtInt = fmtInt;
// Số tiền theo triệu đồng: 1.314,3 tr
const fmtTr = (n) => `${(n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
exports.fmtTr = fmtTr;
