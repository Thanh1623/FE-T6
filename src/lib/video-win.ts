import { buildMetrics, checkRules, rulesPass } from "@/lib/eval/rules";
import type { KpiRule } from "@/lib/kpi-constants";

// VIDEO WIN — chấm RIÊNG TỪNG VIDEO theo ngưỡng "Video Win" ở trang KPI (vd lượt xem ≥ 30.000 và người xem ≥ 3.000), dựa trên số liệu trong N ngày đầu
// kể từ NGÀY ĐĂNG của chính video (lib/video-win-data.ts, hàm SQL sales.video_first_days). Khác quy tắc Win cấp SPU (lib/spu-winflags.ts).
// Hàm thuần: dùng được ở máy chủ và trình duyệt.
export type First3d = { views: number; viewers: number; exact: boolean; unknown?: boolean };   // exact = số đúng tại mốc N ngày; chưa đủ N ngày = tạm tính (số hiện tại); unknown = đã đủ N ngày nhưng chưa có ảnh chụp → không chấm
export type VideoWinRule = { rules: KpiRule[]; match: "all" | "any" };

// Chưa có số người xem (không nạp được ảnh chụp) thì quy theo tỉ lệ cố định như trước đây
export function videoWinOf(f: { views: number; viewers?: number | null; unknown?: boolean }, kpi: VideoWinRule): boolean {
  if (f.unknown) return false;   // video đã quá N ngày mà không có số tại mốc N ngày: không đủ dữ liệu để chấm
  const views = Number(f.views) || 0;
  const viewers = f.viewers === null || f.viewers === undefined ? Math.round(views * 0.65) : Number(f.viewers) || 0;
  return rulesPass(checkRules(kpi.rules, buildMetrics({ views, viewers, reactions: Math.round(views * 0.02), clicks: Math.round(views * 0.015), qty_net: 0, posts: 1, videos: 1 })), kpi.match);
}
