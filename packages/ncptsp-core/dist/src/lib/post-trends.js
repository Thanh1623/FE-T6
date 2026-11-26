"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postTrends = postTrends;
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
const trend_1 = require("@/lib/trend");
// Xu hướng lượt xem cho 1 nhóm bài (đọc social.post_daily, ~16 ngày gần nhất). Chưa chạy migration 024 → trả bản đồ rỗng.
async function postTrends(postIds) {
    const out = new Map();
    if (!postIds.length)
        return out;
    const since = new Date(Date.now() - 17 * 86_400_000).toISOString().slice(0, 10);
    const { data, error } = await admin_1.sb.social().from("post_daily").select("post_id, date, views").in("post_id", postIds).gte("date", since).order("date");
    if (error)
        return out;
    const by = new Map();
    for (const r of data ?? [])
        by.set(r.post_id, [...(by.get(r.post_id) ?? []), { date: r.date, views: Number(r.views) }]);
    for (const [id, snaps] of by)
        out.set(id, (0, trend_1.trendOf)(snaps));
    return out;
}
