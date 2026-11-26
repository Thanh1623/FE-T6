"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.YT_INITIAL_DAYS = void 0;
exports.activeYouTube = activeYouTube;
exports.syncYouTubeChannel = syncYouTubeChannel;
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
const api_1 = require("@/lib/youtube/api");
const delta_1 = require("@/lib/tiktok/delta");
const snapshots_1 = require("@/lib/sync/snapshots");
const DAY_MS = 86_400_000;
const vnDay = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(ms));
// Kênh chưa có bài nào (mới thêm): chỉ nhập video 90 ngày gần nhất (giữ được một quý để so sánh); sau đó chỉ xem lại postDays ngày gần nhất.
// Trước đây 400 ngày: đo thực tế 60 kênh mới (21/11/2026) = 24.937 video; 90 ngày = 7.577; 30 ngày = 2.631. 400 ngày làm tăng ~47% số bài trong social.posts, quá nặng cho database. Cần video cũ hơn của một kênh thì đặt tạm số lớn hơn rồi đồng bộ lại.
exports.YT_INITIAL_DAYS = 90;
// Kênh YouTube đang hoạt động (chưa cấu hình YOUTUBE_API_KEY → không có kênh nào để đồng bộ, không làm hỏng đồng bộ Facebook / TikTok)
async function activeYouTube() {
    if (!(0, api_1.youtubeConfigured)())
        return [];
    const { data, error } = await admin_1.sb.social().from("channels").select("id, platform, name, last_synced_at").eq("is_active", true).eq("platform", "youtube");
    return error ? [] : (data ?? []);
}
// Đồng bộ 1 kênh YouTube: video gần đây → social.posts (tiêu đề, hashtag, thumbnail, view / like / comment); số liệu ngày = chênh lệch so với lần trước → social.channel_daily
async function syncYouTubeChannel(ch, postDays, extractHashtags) {
    if (!ch.id.startsWith("yt:"))
        throw new Error("ID kênh YouTube phải có dạng yt:UC…");
    const channelId = ch.id.slice(3), nowMs = Date.now();
    const { count: have } = await admin_1.sb.social().from("posts").select("*", { count: "exact", head: true }).eq("channel_id", ch.id);
    const since = nowMs - (have ? postDays : Math.max(postDays, exports.YT_INITIAL_DAYS)) * DAY_MS;
    const [ids, subs, { data: prevCh }] = await Promise.all([
        (0, api_1.listUploadIds)((0, api_1.uploadsOf)(channelId), since), (0, api_1.channelSubscribers)(channelId),
        admin_1.sb.social().from("channels").select("followers_count").eq("id", ch.id).maybeSingle(),
    ]);
    const videos = (await (0, api_1.getVideos)(ids)).filter((v) => !v.liveOrUpcoming);
    // Số liệu lần trước của các video này (để tính chênh lệch lượt xem theo ngày)
    const keys = videos.map((v) => `yt:${v.id}`);
    const prev = new Map();
    for (let i = 0; i < keys.length; i += 100) {
        const { data } = await admin_1.sb.social().from("posts").select("id, views, reactions, comments, shares").in("id", keys.slice(i, i + 100));
        for (const r of data ?? [])
            prev.set(r.id, { views: Number(r.views), reactions: Number(r.reactions), comments: Number(r.comments ?? 0), shares: Number(r.shares ?? 0) });
    }
    const now = videos.map((v) => ({ id: `yt:${v.id}`, createdSec: Date.parse(v.publishedAt) / 1000, views: v.views, reactions: v.likes ?? 0, comments: v.comments ?? 0, shares: 0 }));
    const delta = (0, delta_1.dailyDelta)(prev, now, nowMs);
    const fol = (0, delta_1.followDelta)(prevCh?.followers_count, subs ?? undefined);
    if (videos.length) {
        const stamp = new Date().toISOString();
        // Nhãn (product_codes…) KHÔNG ghi ở đây — retagPosts tính lại sau. Hashtag lấy từ tiêu đề + mô tả + thẻ ẩn (snippet.tags)
        const rows = videos.map((v) => {
            const short = v.seconds > 0 && v.seconds <= 180; // Shorts (≤ 3 phút) tính là reel
            const tagText = v.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ");
            return {
                id: `yt:${v.id}`, channel_id: ch.id, platform: "youtube", published_at: v.publishedAt,
                kind: short ? "reel" : "video", message: v.title,
                permalink_url: short ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`,
                thumbnail_url: v.thumbnail, hashtags: [...new Set([...extractHashtags(`${v.title}\n${v.description}`), ...extractHashtags(tagText)])],
                views: v.views, viewers: 0, reactions: v.likes ?? 0, comments: v.comments, shares: null,
                clicks: 0, video_views: v.views, stats_at: stamp,
            };
        });
        const { error } = await admin_1.sb.social().from("posts").upsert(rows);
        if (error)
            throw error;
        await (0, snapshots_1.snapshotPosts)(rows); // ảnh chụp lượt xem theo ngày → biểu đồ xu hướng
    }
    const today = vnDay(nowMs);
    if (delta.views || delta.engagements || fol.gained || fol.lost) {
        const { data: cur } = await admin_1.sb.social().from("channel_daily").select("*").eq("channel_id", ch.id).eq("date", today).maybeSingle();
        const { error } = await admin_1.sb.social().from("channel_daily").upsert({
            channel_id: ch.id, date: today,
            views: Number(cur?.views ?? 0) + delta.views, video_views: Number(cur?.video_views ?? 0) + delta.views,
            engagements: Number(cur?.engagements ?? 0) + delta.engagements,
            new_follows: Number(cur?.new_follows ?? 0) + fol.gained, unfollows: Number(cur?.unfollows ?? 0) + fol.lost,
            viewers: Number(cur?.viewers ?? 0), page_views: Number(cur?.page_views ?? 0), updated_at: new Date().toISOString(),
        });
        if (error)
            throw error;
    }
    else {
        await admin_1.sb.social().from("channel_daily").upsert({ channel_id: ch.id, date: today }, { ignoreDuplicates: true });
    }
    await admin_1.sb.social().from("channels").update({ followers_count: subs ?? null, updated_at: new Date().toISOString() }).eq("id", ch.id);
    return { posts: videos.length, newViews: delta.views };
}
