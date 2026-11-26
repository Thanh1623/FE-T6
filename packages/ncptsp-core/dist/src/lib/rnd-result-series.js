"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TREND_SERIES = void 0;
// Thứ tự chồng của biểu đồ kết quả test: WIN, WIN TRAFFIC, ĐANG TEST, FAIL — WIN và FAIL không đứng cạnh nhau (cặp màu cần mã hoá phụ).
// Đặt ở file riêng (không "use client") để cả máy chủ (chú thích ở TestResults) lẫn biểu đồ (client) dùng được giá trị này.
exports.TREND_SERIES = [
    ["win", "WIN", "var(--res-win)"],
    ["win_traffic", "WIN TRAFFIC", "var(--res-wt)"],
    ["testing", "Đang test", "var(--res-testing)"],
    ["fail", "FAIL", "var(--res-fail)"],
];
