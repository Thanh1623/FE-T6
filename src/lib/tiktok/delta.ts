// Display API của TikTok chỉ trả số liệu CỘNG DỒN của từng video (không có theo ngày) →
// số liệu theo ngày được tính bằng chênh lệch giữa lần đồng bộ này và lần trước. Hàm thuần, dùng được trong kịch bản kiểm thử.

export type Counts = { views: number; reactions: number; comments: number; shares: number };
export type VideoNow = { id: string; createdSec: number } & Counts;

// Video mới ra trong vòng này (giờ) mà chưa có bản ghi → tính TOÀN BỘ số liệu vào hôm nay; video cũ lần đầu thấy → chỉ làm mốc (không tính)
export const FRESH_HOURS = 48;

export function dailyDelta(prev: Map<string, Counts>, now: VideoNow[], nowMs: number) {
  const d = { views: 0, engagements: 0 };
  for (const v of now) {
    const old = prev.get(v.id);
    if (old) {
      d.views += Math.max(0, v.views - old.views);
      d.engagements += Math.max(0, v.reactions - old.reactions) + Math.max(0, v.comments - old.comments) + Math.max(0, v.shares - old.shares);
    } else if (nowMs - v.createdSec * 1000 <= FRESH_HOURS * 3_600_000) {
      d.views += v.views;
      d.engagements += v.reactions + v.comments + v.shares;
    }
  }
  return d;
}

// Thay đổi follow so với lần trước (null = chưa có mốc)
export function followDelta(prev: number | null | undefined, cur: number | undefined) {
  if (prev === null || prev === undefined || cur === undefined) return { gained: 0, lost: 0 };
  return { gained: Math.max(0, cur - prev), lost: Math.max(0, prev - cur) };
}
