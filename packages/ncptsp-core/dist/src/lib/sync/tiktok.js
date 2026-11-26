"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activeTikTok = activeTikTok;
exports.syncTikTokChannel = syncTikTokChannel;
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
const api_1 = require("@/lib/tiktok/api");
const delta_1 = require("@/lib/tiktok/delta");
const snapshots_1 = require("@/lib/sync/snapshots");
const DAY_MS = 86_400_000;
const vnDay = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(ms));
// Kênh TikTok đang hoạt động kèm token (token ở schema private, đọc qua hàm security definer)
async function activeTikTok() {
    const [{ data: ch, error }, { data: toks, error: tErr }] = await Promise.all([
        admin_1.sb.social().from("channels").select("id, platform, name, last_synced_at").eq("is_active", true).eq("platform", "tiktok"),
        admin_1.sb.social().rpc("tiktok_tokens"),
    ]);
    // Chưa chạy migration 020/021 → coi như chưa có kênh TikTok (không làm hỏng đồng bộ Facebook)
    if (error || tErr)
        return [];
    const tokenOf = new Map(toks.map((t) => [t.channel_id, t]));
    return (ch ?? []).filter((c) => tokenOf.has(c.id)).map((c) => ({ ...c, token: tokenOf.get(c.id) }));
}
// Access token TikTok sống ~24 giờ → làm mới khi còn dưới 30 phút (refresh token sống ~1 năm và có thể đổi mỗi lần làm mới)
async function freshAccess(ch) {
    const t = ch.token;
    if (Date.parse(t.refresh_expires_at) < Date.now())
        throw new Error("Refresh token TikTok đã hết hạn — chủ tài khoản cần kết nối lại");
    if (Date.parse(t.access_expires_at) - Date.now() > 30 * 60_000)
        return t.access_token;
    const n = await (0, api_1.refreshToken)(t.refresh_token);
    const { error } = await admin_1.sb.social().rpc("save_tiktok_token", {
        p_channel_id: ch.id, p_open_id: n.open_id ?? t.open_id, p_access: n.access_token, p_refresh: n.refresh_token ?? t.refresh_token,
        p_access_exp: new Date(Date.now() + n.expires_in * 1000).toISOString(),
        p_refresh_exp: new Date(Date.now() + (n.refresh_expires_in ?? 365 * 86_400) * 1000).toISOString(), p_scope: n.scope ?? t.scope,
    });
    if (error)
        throw error;
    return n.access_token;
}
// Đồng bộ 1 kênh TikTok: video gần đây → social.posts; số liệu ngày = chênh lệch so với lần đồng bộ trước → social.channel_daily
async function syncTikTokChannel(ch, postDays, extractHashtags) {
    const access = await freshAccess(ch);
    const nowMs = Date.now();
    // Kênh chưa có bài nào (mới kết nối) → nhập 90 ngày video như Facebook; sau đó chỉ cần xem lại postDays ngày gần nhất
    const { count: have } = await admin_1.sb.social().from("posts").select("*", { count: "exact", head: true }).eq("channel_id", ch.id);
    const sinceSec = Math.floor((nowMs - (have ? postDays : Math.max(postDays, 90)) * DAY_MS) / 1000);
    const [user, videos, { data: prevCh }] = await Promise.all([
        (0, api_1.getUser)(access), (0, api_1.listVideos)(access, sinceSec),
        admin_1.sb.social().from("channels").select("followers_count").eq("id", ch.id).maybeSingle(),
    ]);
    // Số liệu lần trước của các video này (để tính chênh lệch)
    const ids = videos.map((v) => `tt:${v.id}`);
    const prev = new Map();
    for (let i = 0; i < ids.length; i += 100) {
        const { data } = await admin_1.sb.social().from("posts").select("id, views, reactions, comments, shares").in("id", ids.slice(i, i + 100));
        for (const r of data ?? [])
            prev.set(r.id, { views: Number(r.views), reactions: Number(r.reactions), comments: Number(r.comments ?? 0), shares: Number(r.shares ?? 0) });
    }
    const now = videos.map((v) => ({ id: `tt:${v.id}`, createdSec: v.create_time, views: v.view_count ?? 0, reactions: v.like_count ?? 0, comments: v.comment_count ?? 0, shares: v.share_count ?? 0 }));
    const delta = (0, delta_1.dailyDelta)(prev, now, nowMs);
    const fol = (0, delta_1.followDelta)(prevCh?.followers_count, user.follower_count);
    if (videos.length) {
        const stamp = new Date().toISOString();
        // Nhãn (product_codes…) KHÔNG ghi ở đây — retagPosts tính lại sau
        const rows = videos.map((v) => {
            const text = v.video_description || v.title || null;
            return {
                id: `tt:${v.id}`, channel_id: ch.id, platform: "tiktok", published_at: new Date(v.create_time * 1000).toISOString(),
                kind: "video", message: text, permalink_url: v.share_url ?? null, thumbnail_url: v.cover_image_url ?? null, hashtags: extractHashtags(text),
                views: v.view_count ?? 0, viewers: 0, reactions: v.like_count ?? 0, comments: v.comment_count ?? 0, shares: v.share_count ?? 0,
                clicks: 0, video_views: v.view_count ?? 0, stats_at: stamp,
            };
        });
        const { error } = await admin_1.sb.social().from("posts").upsert(rows);
        if (error)
            throw error;
        await (0, snapshots_1.snapshotPosts)(rows); // ảnh chụp lượt xem theo ngày → biểu đồ xu hướng
    }
    // Số liệu ngày: cộng dồn vào hôm nay (đồng bộ nhiều lần trong ngày không bị nhân đôi vì chỉ cộng phần chênh lệch)
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
        // Đảm bảo kênh có ít nhất 1 dòng số liệu (kênh chưa có dòng nào bị coi là "kênh mới" và kéo lại 365 ngày)
        await admin_1.sb.social().from("channel_daily").upsert({ channel_id: ch.id, date: today }, { ignoreDuplicates: true });
    }
    await admin_1.sb.social().from("channels").update({
        followers_count: user.follower_count ?? null, ...(user.display_name ? { name: user.display_name } : {}), updated_at: new Date().toISOString(),
    }).eq("id", ch.id);
    return { posts: videos.length, newViews: delta.views };
}
