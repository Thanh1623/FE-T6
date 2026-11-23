// Danh mục nền tảng — dùng chung server + client.
// Thêm nền tảng mới (YouTube, TikTok, Instagram):
//   1. Viết bộ kết nối (adapter) đúng interface PlatformAdapter trong src/lib/sync/ (đọc kênh, số liệu ngày, bài đăng)
//   2. Ghi số liệu vào CÁC CỘT CHUẨN của social.channel_daily / social.posts → dashboard tự hiện, không phải sửa giao diện
//   3. Đổi `connected: true`

// Màu theo thứ tự slot chuẩn 1–4 (đã kiểm định cho đường/cột). KHÔNG dùng cho biểu đồ tròn 4 phần — tròn tối đa 3 màu.
export const PLATFORMS = {
  facebook:  { label: "Facebook",  color: "var(--series-1)", connected: true },
  instagram: { label: "Instagram", color: "var(--series-2)", connected: false },
  tiktok:    { label: "TikTok",    color: "var(--series-3)", connected: true },
  youtube:   { label: "YouTube",   color: "var(--series-4)", connected: true },
} as const;
export type Platform = keyof typeof PLATFORMS;

// Số liệu chuẩn = CÁC CỘT của social.channel_daily (views, viewers, engagements, new_follows, unfollows, page_views,
// video_views) và social.posts (views, viewers, reactions, comments, shares, clicks, video_views).
// Mỗi bộ kết nối tự ánh xạ chỉ số riêng của nền tảng vào các cột này (Facebook: src/lib/meta/metrics.ts).

// Giao diện bộ kết nối mỗi nền tảng (Facebook hiện cài trong src/lib/sync/index.ts)
export interface PlatformAdapter {
  platform: Platform;
  listChannels(): Promise<{ id: string; name: string; followers_count: number | null; access_token: string }[]>;
  syncDaily(channelId: string, days: number): Promise<number>;   // ghi social.channel_daily (các cột chuẩn)
  syncPosts(channelId: string, days: number): Promise<number>;   // ghi social.posts (+ hashtags, kind, cột chỉ số chuẩn)
}

// Loại nội dung (cột social.posts.kind) và nhãn hiển thị
export const KIND_LABELS = { reel: "Reel", video: "Video", photo: "Ảnh", status: "Bài đăng", other: "Khác" } as const;
export type Kind = keyof typeof KIND_LABELS;

export function kindOf(type: string | null | undefined, permalink: string | null | undefined): Kind {
  if (permalink?.includes("/reel/") || permalink?.includes("/shorts/")) return "reel";
  if (type === "added_video") return "video";
  if (type === "added_photos") return "photo";
  if (type === "mobile_status_update") return "status";
  return "other";
}
