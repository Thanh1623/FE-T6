// Đánh giá sản phẩm / video TIỀM NĂNG — hàm thuần (dùng chung server + client, dễ kiểm thử).
// "Tiềm năng" = chưa đạt đủ nhưng đang đi đúng hướng, đáng đẩy thêm video / ngân sách.
import type { AutoResult } from "@/lib/eval/rules";   // chỉ kiểu → chạy được cả trong kịch bản kiểm thử Node
const isWinResult = (r: string) => r === "win" || r === "win_traffic" || r === "win_sp";

type EvalLike = {
  result: AutoResult; traffic_status: string; sales_status: string;
  forecast: { predicted: AutoResult } | null;
};

export type Potential = { level: "high" | "mid"; reasons: string[] };

// Sản phẩm tiềm năng:
//   cao  — dự báo hết kỳ đạt WIN; hoặc đã WIN TRAFFIC và KPI bán gần đạt (sắp WIN)
//   vừa  — đang test mà 1 vế KPI gần đạt (≥ 50% chặng đường) hoặc dự báo đạt WIN TRAFFIC
// Mẫu FAIL, mẫu đã WIN đủ → không còn là "tiềm năng".
export function productPotential(e: EvalLike): Potential | null {
  if (e.result === "fail" || e.result === "win") return null;
  const reasons: string[] = [];
  let level: Potential["level"] | null = null;
  const raise = (l: Potential["level"]) => { if (l === "high" || level === null) level = l; };

  if (e.result === "win_traffic" && e.sales_status === "partial") { reasons.push("Đã WIN TRAFFIC, KPI bán gần đạt → sắp WIN"); raise("high"); }
  if (e.result === "testing") {
    if (e.forecast?.predicted === "win") { reasons.push("Dự báo hết kỳ đạt WIN"); raise("high"); }
    else if (e.forecast && isWinResult(e.forecast.predicted)) { reasons.push(`Dự báo hết kỳ đạt WIN TRAFFIC`); raise("mid"); }
    if (e.traffic_status === "partial") { reasons.push("KPI traffic gần đạt"); raise("mid"); }
    if (e.sales_status === "partial") { reasons.push("KPI bán gần đạt"); raise("mid"); }
  }
  return level ? { level, reasons } : null;
}

type VideoLike = { views: number; ctr: number | null };
const quantile = (sorted: number[], q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);

// Ngưỡng video tiềm năng tính theo CHÍNH tập video đang xem (không cứng số): lượt xem ≥ P75 (tối thiểu minViews),
// hoặc CTR ≥ P75 khi lượt xem ≥ trung vị — video "ít xem nhưng bấm nhiều".
export function videoThresholds(videos: VideoLike[], minViews = 500) {
  const views = videos.map((v) => v.views).sort((a, b) => a - b);
  const ctrs = videos.filter((v) => v.ctr !== null).map((v) => v.ctr as number).sort((a, b) => a - b);
  return { views: Math.max(minViews, quantile(views, 0.75)), hotViews: Math.max(minViews, quantile(views, 0.9)), medianViews: quantile(views, 0.5), ctr: quantile(ctrs, 0.75) };
}

export function videoPotential(v: VideoLike, t: ReturnType<typeof videoThresholds>): string | null {
  if (v.views >= t.hotViews) return "Lượt xem thuộc top 10%";
  if (v.views >= t.views) return "Lượt xem thuộc top 25%";
  if (v.ctr !== null && t.ctr > 0 && v.ctr >= t.ctr && v.views >= t.medianViews) return "CTR cao";
  return null;
}
