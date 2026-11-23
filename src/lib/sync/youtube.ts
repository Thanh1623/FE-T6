import "server-only";
import { sb } from "@/lib/supabase/admin";
import { channelSubscribers, getVideos, listUploadIds, uploadsOf, youtubeConfigured } from "@/lib/youtube/api";
import { dailyDelta, followDelta, type Counts } from "@/lib/tiktok/delta";
import { snapshotPosts } from "@/lib/sync/snapshots";

const DAY_MS = 86_400_000;
const vnDay = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(ms));
// Kênh chưa có bài nào (mới thêm): chỉ nhập video 90 ngày gần nhất (giữ được một quý để so sánh); sau đó chỉ xem lại postDays ngày gần nhất.
// Trước đây 400 ngày: đo thực tế 60 kênh mới (21/11/2026) = 24.937 video; 90 ngày = 7.577; 30 ngày = 2.631. 400 ngày làm tăng ~47% số bài trong social.posts, quá nặng cho database. Cần video cũ hơn của một kênh thì đặt tạm số lớn hơn rồi đồng bộ lại.
export const YT_INITIAL_DAYS = 90;

export type YouTubeChannel = { id: string; platform: string; name: string; last_synced_at?: string | null };

// Kênh YouTube đang hoạt động (chưa cấu hình YOUTUBE_API_KEY → không có kênh nào để đồng bộ, không làm hỏng đồng bộ Facebook / TikTok)
export async function activeYouTube(): Promise<YouTubeChannel[]> {
  if (!youtubeConfigured()) return [];
  const { data, error } = await sb.social().from("channels").select("id, platform, name, last_synced_at").eq("is_active", true).eq("platform", "youtube");
  return error ? [] : ((data ?? []) as YouTubeChannel[]);
}

// Đồng bộ 1 kênh YouTube: video gần đây → social.posts (tiêu đề, hashtag, thumbnail, view / like / comment); số liệu ngày = chênh lệch so với lần trước → social.channel_daily
export async function syncYouTubeChannel(
  ch: YouTubeChannel, postDays: number, extractHashtags: (t?: string | null) => string[],
): Promise<{ posts: number; newViews: number }> {
  if (!ch.id.startsWith("yt:")) throw new Error("ID kênh YouTube phải có dạng yt:UC…");
  const channelId = ch.id.slice(3), nowMs = Date.now();
  const { count: have } = await sb.social().from("posts").select("*", { count: "exact", head: true }).eq("channel_id", ch.id);
  const since = nowMs - (have ? postDays : Math.max(postDays, YT_INITIAL_DAYS)) * DAY_MS;
  const [ids, subs, { data: prevCh }] = await Promise.all([
    listUploadIds(uploadsOf(channelId), since), channelSubscribers(channelId),
    sb.social().from("channels").select("followers_count").eq("id", ch.id).maybeSingle(),
  ]);
  const videos = (await getVideos(ids)).filter((v) => !v.liveOrUpcoming);

  // Số liệu lần trước của các video này (để tính chênh lệch lượt xem theo ngày)
  const keys = videos.map((v) => `yt:${v.id}`);
  const prev = new Map<string, Counts>();
  for (let i = 0; i < keys.length; i += 100) {
    const { data } = await sb.social().from("posts").select("id, views, reactions, comments, shares").in("id", keys.slice(i, i + 100));
    for (const r of data ?? []) prev.set(r.id as string, { views: Number(r.views), reactions: Number(r.reactions), comments: Number(r.comments ?? 0), shares: Number(r.shares ?? 0) });
  }
  const now = videos.map((v) => ({ id: `yt:${v.id}`, createdSec: Date.parse(v.publishedAt) / 1000, views: v.views, reactions: v.likes ?? 0, comments: v.comments ?? 0, shares: 0 }));
  const delta = dailyDelta(prev, now, nowMs);
  const fol = followDelta(prevCh?.followers_count as number | null | undefined, subs ?? undefined);

  if (videos.length) {
    const stamp = new Date().toISOString();
    // Nhãn (product_codes…) KHÔNG ghi ở đây — retagPosts tính lại sau. Hashtag lấy từ tiêu đề + mô tả + thẻ ẩn (snippet.tags)
    const rows = videos.map((v) => {
      const short = v.seconds > 0 && v.seconds <= 180;   // Shorts (≤ 3 phút) tính là reel
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
    const { error } = await sb.social().from("posts").upsert(rows);
    if (error) throw error;
    await snapshotPosts(rows);   // ảnh chụp lượt xem theo ngày → biểu đồ xu hướng
  }

  const today = vnDay(nowMs);
  if (delta.views || delta.engagements || fol.gained || fol.lost) {
    const { data: cur } = await sb.social().from("channel_daily").select("*").eq("channel_id", ch.id).eq("date", today).maybeSingle();
    const { error } = await sb.social().from("channel_daily").upsert({
      channel_id: ch.id, date: today,
      views: Number(cur?.views ?? 0) + delta.views, video_views: Number(cur?.video_views ?? 0) + delta.views,
      engagements: Number(cur?.engagements ?? 0) + delta.engagements,
      new_follows: Number(cur?.new_follows ?? 0) + fol.gained, unfollows: Number(cur?.unfollows ?? 0) + fol.lost,
      viewers: Number(cur?.viewers ?? 0), page_views: Number(cur?.page_views ?? 0), updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  } else {
    await sb.social().from("channel_daily").upsert({ channel_id: ch.id, date: today }, { ignoreDuplicates: true });
  }
  await sb.social().from("channels").update({ followers_count: subs ?? null, updated_at: new Date().toISOString() }).eq("id", ch.id);
  return { posts: videos.length, newViews: delta.views };
}
