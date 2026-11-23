// Chấm KPI — hàm thuần, không đọc DB (dùng chung server/client, dễ kiểm thử).
import type { KpiMetric, KpiRule } from "@/lib/kpi-constants";
import { isTestCode } from "../tags.ts";

export type Metrics = Record<KpiMetric, number | null> & { posts: number; videos: number };
export type Check = { metric: KpiMetric; op: KpiRule["op"]; target: number; actual: number | null; pass: boolean; progress: number };

// Tính các chỉ số KPI từ số thô. Tỉ lệ = null khi mẫu số = 0 (không phải 0%).
export function buildMetrics(raw: {
  views: number; viewers: number; reactions: number; clicks: number; qty_net: number; posts: number; videos: number;
}): Metrics {
  return {
    ...raw,
    ctr: raw.views > 0 ? (raw.clicks / raw.views) * 100 : null,
    engagement_rate: raw.viewers > 0 ? ((raw.reactions + raw.clicks) / raw.viewers) * 100 : null,
    conversion: raw.viewers > 0 ? (raw.qty_net / raw.viewers) * 100 : null,
  };
}

export function checkRules(rules: KpiRule[], m: Metrics): Check[] {
  return rules.map((r) => {
    const actual = m[r.metric];
    const pass = actual !== null && (r.op === ">=" ? actual >= r.value : actual <= r.value);
    // Tiến độ tới ngưỡng (cho ">="): 0..1, để biết "sắp đạt"
    const progress = actual === null ? 0 : r.op === ">=" ? (r.value > 0 ? Math.min(1, actual / r.value) : 1) : pass ? 1 : 0;
    return { metric: r.metric, op: r.op, target: r.value, actual, pass, progress };
  });
}

export const rulesPass = (checks: Check[], match: "all" | "any") =>
  checks.length > 0 && (match === "all" ? checks.every((c) => c.pass) : checks.some((c) => c.pass));

// Trạng thái 1 nhóm KPI: pass / partial (≥ 50% chặng đường) / weak / not_enough (chưa đủ dữ liệu)
export function groupStatus(checks: Check[], match: "all" | "any", enoughData: boolean) {
  if (rulesPass(checks, match)) return "pass";
  if (!enoughData) return "not_enough";
  const avg = checks.reduce((s, c) => s + c.progress, 0) / Math.max(1, checks.length);
  const best = Math.max(0, ...checks.map((c) => c.progress));
  return (match === "all" ? avg : best) >= 0.5 ? "partial" : "weak";
}

// win = đạt KPI bán hàng (bán nhiều); win_traffic = chưa bán đủ nhưng đạt KPI traffic. win_sp là giá trị CŨ (đã bỏ): chỉ còn để đọc dữ liệu đã lưu, hệ thống không tạo ra nữa.
export type AutoResult = "testing" | "win" | "win_traffic" | "win_sp" | "fail";
export const WIN_RESULTS = ["win", "win_traffic", "win_sp"] as const;
export type WinResult = (typeof WIN_RESULTS)[number];
export const WIN_NAME: Record<WinResult, string> = { win: "WIN", win_traffic: "WIN TRAFFIC", win_sp: "WIN SP" };
export const WIN_VAR: Record<WinResult, string> = { win: "--res-win", win_traffic: "--res-wt", win_sp: "--res-wsp" };
export const isWinResult = (r: string | null | undefined): r is WinResult => !!r && (WIN_RESULTS as readonly string[]).includes(r);

// Quy tắc chung (không phân loại mục tiêu test): đạt KPI bán → WIN; chưa bán đủ mà đạt KPI traffic → WIN TRAFFIC (bán đủ sau đó thì nâng lên WIN).
// Chưa đạt vế nào: còn trong cửa sổ test → ĐANG TEST; hết cửa sổ → FAIL.
export function decideAuto(salesPass: boolean, trafficPass: boolean, windowOver: boolean): AutoResult {
  if (salesPass) return "win";             // bán nhiều (đạt KPI bán) → WIN, dù traffic chưa đạt
  if (trafficPass) return "win_traffic";   // chưa bán đủ nhưng traffic đạt → WIN TRAFFIC (bán đạt sau đó thì nâng lên WIN)
  return windowOver ? "fail" : "testing";
}

function shiftIsoDate(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type ProductAgeInfo = {
  age: "new" | "old";
  age_reason: string;
};

/**
 * Xác định sản phẩm Mới / Cũ tương đối theo kỳ lọc:
 * - Override: R&D chỉ định thủ công
 * - Mới (Media): Mẫu test do đội Media tự tìm source và test (T10001, T20003...)
 * - Mới R&D: có giai đoạn (stage) hoặc nghiên cứu thủ công (origin === 'manual')
 * - Cũ: đã bán trước kỳ lọc > 15 cái, HOẶC đã từng phát sinh đơn từ các tháng trước (> 21 ngày trước kỳ),
 *       HOẶC đã lên video > 14 ngày trước kỳ, HOẶC đã có trên Sapo catalog > 21 ngày trước kỳ.
 * - Mới: mới lên video và test bán lần đầu trong kỳ lọc (hoặc sát kỳ lọc).
 */
export function determineProductAge(params: {
  code?: string;
  ageOverride?: "new" | "old" | null;
  stage?: string | null;
  origin?: string | null;
  priorQty: number;
  oldHistoryQty?: number;
  firstPostDate?: string | null;
  firstSeenAt?: string | null;
  periodFrom: string;
}): ProductAgeInfo {
  const { code, ageOverride, stage, origin, priorQty, oldHistoryQty = 0, firstPostDate, firstSeenAt, periodFrom } = params;

  if (ageOverride) {
    return { age: ageOverride, age_reason: "override" };
  }
  // Mẫu test do đội Media tự tìm source (T10001 nhẫn test, T20003 lắc test...)
  if ((code && isTestCode(code)) || origin === "media") {
    return { age: "new", age_reason: "media_test" };
  }
  if (stage || origin === "manual") {
    return { age: "new", age_reason: "rnd" };
  }
  if (priorQty > 15) {
    return { age: "old", age_reason: "has_sales" };
  }
  if (oldHistoryQty > 0) {
    return { age: "old", age_reason: "old_history" };
  }
  if (firstPostDate && firstPostDate < shiftIsoDate(periodFrom, -14)) {
    return { age: "old", age_reason: "old_video" };
  }
  if (firstSeenAt && firstSeenAt < shiftIsoDate(periodFrom, -21)) {
    return { age: "old", age_reason: "old_catalog" };
  }
  return { age: "new", age_reason: "new_test" };
}

