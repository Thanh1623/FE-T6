"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.spuVideos = spuVideos;
// Video đăng trong kỳ [endAge, endAge + days) (tính lùi từ hôm nay), mới nhất trước — khớp số "Video đã đăng" trên bảng
function spuVideos(row, opt, today) {
    const end = opt.endAge ?? 0;
    return row.vids.filter((v) => v.age >= end && v.age < end + opt.days)
        .map((v) => ({
        id: v.id ?? "", title: v.title?.trim() || "(không có nội dung)", platform: v.platform ?? "FB", channel: v.channel ?? "—", team: v.team ?? null,
        date: new Date(Date.parse(today) - v.age * 86_400_000).toISOString().slice(0, 10), views: v.views, url: v.url ?? null, thumb: v.thumb ?? null, first3d: v.first3d,
    }))
        .sort((a, b) => b.date.localeCompare(a.date));
}
