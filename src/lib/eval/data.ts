import "server-only";
import { sb } from "@/lib/supabase/admin";
import type { AutoResult, Check, Metrics } from "@/lib/eval/rules";

export type Forecast = { views: number; viewers: number; qty_net: number; predicted: AutoResult; days_left: number } | null;
export type VideoRank = { id: string; channel_id: string; date: string; url: string | null; thumb: string | null; views: number; viewers: number; ctr: number | null };

export type Evaluation = {
  code: string; product_id: string | null; first_post_date: string; window_end: string; days_elapsed: number;
  age: "new" | "old"; age_reason: string; age_reliable: boolean;
  source: "auto" | "session"; session_id: string | null; result: AutoResult;
  sales_status: string; traffic_status: string;
  metrics: Metrics; checks: { group: string; items: Check[] }[]; forecast: Forecast; videos: VideoRank[];
  evaluated_at: string;
  product?: {
    name: string; line: string | null; category: string | null; material: string | null; stone: string | null; image_paths: string[];
    confirmed_result?: "win" | "win_traffic" | "win_sp" | "fail" | null;
    // Luồng: stage có giá trị = mẫu thuộc luồng R&D; null = Media tự test. media_review = quyết định của team khi Media WIN
    stage?: string | null; st_code?: string | null; media_review?: "accepted" | "dismissed" | null; team_id?: string | null;
  } | null;
  confirmed?: boolean;   // true = result đã được R&D xác nhận (ghi đè đề xuất)
};

export const RESULT_TEXT: Record<AutoResult, string> = { win: "WIN", win_traffic: "WIN TRAFFIC", win_sp: "WIN SP", fail: "FAIL", testing: "ĐANG TEST" };
export const RESULT_COLOR: Record<AutoResult, string> = {
  win: "var(--res-win)", win_traffic: "var(--res-wt)", win_sp: "var(--res-wsp)", fail: "var(--res-fail)", testing: "var(--res-testing)",
};
export const AGE_REASON: Record<string, string> = {
  not_in_sapo: "Chưa có trên Sapo khi đăng video đầu", new_listing: "Vừa lên Sapo trước video đầu",
  no_sales: "Gần như chưa bán trước video đầu", old_hot: "Mẫu cũ bán chạy", old_slow: "Mẫu cũ ít bán (test lại)",
  override: "R&D tự phân loại",
};
export const STATUS_TEXT: Record<string, string> = { pass: "Đạt", partial: "Gần đạt", weak: "Yếu", not_enough: "Chưa đủ dữ liệu" };

// Bản đầy đủ rất nặng (~2,3 MB: videos, checks, metrics + cả hồ sơ sản phẩm): lọc ngay ở database khi chỉ cần một phần
//   age = chỉ mẫu mới / cũ · from–to = khoảng ngày video đầu · testOnly = chỉ mã bắt đầu bằng T (mã SPU test)
export async function listEvaluations(opts: { age?: "new" | "old"; from?: string; to?: string; testOnly?: boolean } = {}) {
  let q = sb.rnd().from("evaluations").select("*, product:products(*)");
  if (opts.age) q = q.eq("age", opts.age);
  if (opts.from) q = q.gte("first_post_date", opts.from);
  if (opts.to) q = q.lte("first_post_date", opts.to);
  if (opts.testOnly) q = q.like("code", "T%");
  const [{ data, error }, { data: decided, error: dErr }] = await Promise.all([
    q.order("first_post_date", { ascending: false }),
    sb.rnd().from("current_decisions").select("product_id, result"),
  ]);
  if (error) throw error;
  if (dErr) throw dErr;
  const confirmedOf = new Map((decided ?? []).map((d) => [d.product_id as string, d.result as "win" | "win_traffic" | "win_sp" | "fail"]));
  // Kết quả hiệu lực: R&D đã xác nhận thì dùng kết quả xác nhận
  return (data as Evaluation[]).map((e) => {
    const c = e.product_id ? confirmedOf.get(e.product_id) : undefined;
    return c ? { ...e, result: c, confirmed: true, product: e.product ? { ...e.product, confirmed_result: c } : e.product }
      : { ...e, confirmed: false };
  });
}

// Bản NHẸ cho báo cáo chỉ cần "mã → kết quả hiệu lực, mới/cũ, tên mẫu" (Nội dung & Traffic): không kéo videos / checks / metrics / forecast
// (trước đây ~310 KB mỗi lần mở trang, giờ ~20 KB)
// first_post_date / window_end / win_views / win_qty = cửa sổ test mà kết quả được chấm trên đó (để bảng giải thích vì sao ra kết quả này)
export type EvaluationLite = {
  code: string; result: AutoResult; age: "new" | "old";
  age_reason?: string | null;
  product: { name: string; stage?: string | null; origin?: string | null; age_override?: "new" | "old" | null } | null;
  first_post_date: string; window_end: string; win_views: number | null; win_qty: number | null;
  win_kind: "first" | "recent" | null; win_from: string | null; win_to: string | null;   // cửa sổ đã tạo ra kết quả (metrics.window)
};
export async function listEvaluationsLite(): Promise<EvaluationLite[]> {
  const [{ data, error }, { data: decided, error: dErr }] = await Promise.all([
    sb.rnd().from("evaluations").select("code, result, age, age_reason, product_id, first_post_date, window_end, win_views:metrics->views, win_qty:metrics->qty_net, win_kind:metrics->window->>kind, win_from:metrics->window->>from, win_to:metrics->window->>to, product:products(name, stage, origin, age_override)"),
    sb.rnd().from("current_decisions").select("product_id, result"),
  ]);
  if (error) throw error;
  if (dErr) throw dErr;
  const confirmedOf = new Map((decided ?? []).map((d) => [d.product_id as string, d.result as AutoResult]));
  return (data as unknown as (EvaluationLite & { product_id: string | null })[]).map((e) => ({
    code: e.code, age: e.age, age_reason: e.age_reason ?? null, product: e.product, first_post_date: e.first_post_date, window_end: e.window_end, win_views: e.win_views, win_qty: e.win_qty,
    win_kind: e.win_kind ?? null, win_from: e.win_from ?? null, win_to: e.win_to ?? null,
    result: (e.product_id ? confirmedOf.get(e.product_id) : undefined) ?? e.result,   // R&D đã xác nhận thì dùng kết quả xác nhận
  }));
}

// Chỉ "mã → kết quả hiệu lực + mẫu + tên" (codeInfos): không kéo videos / checks / metrics và hồ sơ sản phẩm đầy đủ
export async function listEvaluationResults(): Promise<{ code: string; product_id: string | null; result: AutoResult; name: string | null }[]> {
  const [{ data, error }, { data: decided, error: dErr }] = await Promise.all([
    sb.rnd().from("evaluations").select("code, result, product_id, product:products(name)"),
    sb.rnd().from("current_decisions").select("product_id, result"),
  ]);
  if (error) throw error;
  if (dErr) throw dErr;
  const confirmedOf = new Map((decided ?? []).map((d) => [d.product_id as string, d.result as AutoResult]));
  return (data as unknown as { code: string; result: AutoResult; product_id: string | null; product: { name: string | null } | null }[]).map((e) => ({
    code: e.code, product_id: e.product_id, name: e.product?.name ?? null,
    result: (e.product_id ? confirmedOf.get(e.product_id) : undefined) ?? e.result,
  }));
}

export async function getEvaluation(code: string) {
  const { data, error } = await sb.rnd().from("evaluations").select("*").eq("code", code.toUpperCase()).maybeSingle();
  if (error) throw error;
  return data as Evaluation | null;
}

export async function getEvaluationsByProduct(ids: string[]) {
  if (!ids.length) return {} as Record<string, Evaluation>;
  const { data, error } = await sb.rnd().from("evaluations").select("*").in("product_id", ids);
  if (error) throw error;
  return Object.fromEntries((data as Evaluation[]).map((e) => [e.product_id!, e]));
}

// ---------- Tổng hợp cho dashboard ----------

export type Tally = { total: number; win: number; win_traffic: number; win_sp: number; fail: number; testing: number };
export const emptyTally = (): Tally => ({ total: 0, win: 0, win_traffic: 0, win_sp: 0, fail: 0, testing: 0 });

export function tally(list: Evaluation[]): Tally {
  const t = emptyTally();
  for (const e of list) { t.total++; t[e.result]++; }
  return t;
}

// Tỉ lệ tính trên số mẫu ĐÃ KẾT LUẬN (đang test chưa tính, để không kéo tỉ lệ xuống giả)
export function rates(t: Tally) {
  const done = t.win + t.win_traffic + t.win_sp + t.fail;
  const r = (n: number) => (done ? (n / done) * 100 : null);
  return { done, win: r(t.win), win_traffic: r(t.win_traffic), win_sp: r(t.win_sp), anyWin: r(t.win + t.win_traffic + t.win_sp), fail: r(t.fail) };
}

// Tuần bắt đầu thứ Hai (YYYY-MM-DD)
export function weekOf(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * 86_400_000).toISOString().slice(0, 10);
}
