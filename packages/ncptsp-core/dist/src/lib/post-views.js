"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.snapshotsAt = snapshotsAt;
exports.codeViewsInRange = codeViewsInRange;
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
const views_window_1 = require("@/lib/eval/views-window");
const vnDay = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(ms));
// Ảnh chụp mới nhất của từng bài tính đến `day` (RPC social.post_stats_at, migration 026). Chưa có migration → rỗng (rơi về cách "chỉ bài đăng trong kỳ").
async function snapshotsAt(postIds, day) {
    const out = new Map();
    if (!postIds.length)
        return out;
    const chunks = [];
    for (let i = 0; i < postIds.length; i += 800)
        chunks.push(postIds.slice(i, i + 800));
    const results = await Promise.all(chunks.map((ids) => admin_1.sb.social().rpc("post_stats_at", { p_post_ids: ids, p_day: day })));
    for (const { data, error } of results) {
        if (error)
            continue;
        for (const r of (data ?? [])) {
            out.set(r.post_id, { day: r.day, views: Number(r.views), viewers: Number(r.viewers), reactions: Number(r.reactions), clicks: Number(r.clicks) });
        }
    }
    return out;
}
// Lượt xem (cùng người xem, tương tác) TRONG [from, to] theo từng mã SP — gồm cả video đăng từ trước kỳ nếu đã có ảnh chụp đủ gần.
// Bài đăng nhiều mã được tính cho từng mã. unknown = số bài cũ chưa đủ lịch sử (không tính vào số); approx = số bài phải xấp xỉ mốc cuối.
async function codeViewsInRange(posts, from, to) {
    const today = vnDay(Date.now());
    const pubDay = new Map(posts.map((p) => [p.id, vnDay(Date.parse(p.published_at))]));
    const old = posts.filter((p) => pubDay.get(p.id) < from).map((p) => p.id);
    const [endSnaps, baseSnaps] = await Promise.all([
        to < today ? snapshotsAt(posts.filter((p) => pubDay.get(p.id) <= to).map((p) => p.id), to) : new Map(),
        old.length ? snapshotsAt(old, (0, views_window_1.shiftDay)(from, -1)) : new Map(),
    ]);
    const out = new Map();
    for (const p of posts) {
        const d = pubDay.get(p.id);
        if (d > to)
            continue;
        const g = (0, views_window_1.gainInRange)({
            pubDay: d, from, to, today,
            cur: { views: Number(p.views), viewers: Number(p.viewers), reactions: Number(p.reactions), clicks: Number(p.clicks) },
            end: endSnaps.get(p.id), base: baseSnaps.get(p.id),
        });
        const published = d >= from;
        for (const c of p.product_codes) {
            const t = out.get(c) ?? (0, views_window_1.emptyTotals)();
            (0, views_window_1.addGain)(t, g, { published, video: p.kind === "video" || p.kind === "reel" });
            out.set(c, t);
        }
    }
    return out;
}
