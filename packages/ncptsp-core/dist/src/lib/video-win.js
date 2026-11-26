"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.videoWinOf = videoWinOf;
const rules_1 = require("@/lib/eval/rules");
// Chưa có số người xem (không nạp được ảnh chụp) thì quy theo tỉ lệ cố định như trước đây
function videoWinOf(f, kpi) {
    if (f.unknown)
        return false; // video đã quá N ngày mà không có số tại mốc N ngày: không đủ dữ liệu để chấm
    const views = Number(f.views) || 0;
    const viewers = f.viewers === null || f.viewers === undefined ? Math.round(views * 0.65) : Number(f.viewers) || 0;
    return (0, rules_1.rulesPass)((0, rules_1.checkRules)(kpi.rules, (0, rules_1.buildMetrics)({ views, viewers, reactions: Math.round(views * 0.02), clicks: Math.round(views * 0.015), qty_net: 0, posts: 1, videos: 1 })), kpi.match);
}
