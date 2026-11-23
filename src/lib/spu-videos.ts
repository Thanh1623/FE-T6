import type { SpuRow } from "@/lib/spu-tracking";
import type { First3d } from "@/lib/video-win";

// Danh sách video của 1 SPU (bài đăng thật gắn mã SPU, nạp ở lib/spu-data) — hiện ở ngăn "Video đã đăng" / "Số team đăng" của trang Theo dõi SPU và ở cảnh báo Dashboard.
export type SpuVideo = { id: string; title: string; platform: "FB" | "IG" | "TT"; channel: string; team: string | null; date: string; views: number; url: string | null; thumb: string | null; first3d?: First3d };   // first3d = số N ngày đầu kể từ ngày đăng (Video Win); không có thì chấm theo số hiện tại

// Video đăng trong kỳ [endAge, endAge + days) (tính lùi từ hôm nay), mới nhất trước — khớp số "Video đã đăng" trên bảng
export function spuVideos(row: SpuRow, opt: { days: number; endAge?: number }, today: string): SpuVideo[] {
  const end = opt.endAge ?? 0;
  return row.vids.filter((v) => v.age >= end && v.age < end + opt.days)
    .map((v) => ({
      id: v.id ?? "", title: v.title?.trim() || "(không có nội dung)", platform: v.platform ?? "FB", channel: v.channel ?? "—", team: v.team ?? null,
      date: new Date(Date.parse(today) - v.age * 86_400_000).toISOString().slice(0, 10), views: v.views, url: v.url ?? null, thumb: v.thumb ?? null, first3d: v.first3d,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
