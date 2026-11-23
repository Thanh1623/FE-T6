import "server-only";
import { fetchAll, sb } from "@/lib/supabase/admin";
import { entryDate, type PipelineItem } from "@/lib/pipeline";
import { stageIndex, type Stage } from "@/lib/pipeline-constants";

// Tốc độ ra mẫu mới của R&D: số mẫu đạt từng mốc MỖI TUẦN (không theo lứa — đếm theo ngày xảy ra sự kiện) + thời gian xử lý trung vị.
// Mốc lấy từ dữ liệu từng bảng (như dashboard theo lứa): sưu tầm · duyệt · 3D đạt · nhận mẫu · source xong · lên video · Win.

const DAY = 86_400_000;
export const EVENTS = [
  { key: "created", label: "Sưu tầm mới" },
  { key: "approved", label: "Được duyệt" },
  { key: "design", label: "3D đạt" },
  { key: "received", label: "Ra mẫu (nhận mẫu)" },
  { key: "source", label: "Source xong" },
  { key: "video", label: "Lên video" },
  { key: "win", label: "Win" },
] as const;
export type EventKey = (typeof EVENTS)[number]["key"];

const vn = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
const dayMs = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
// Thứ Hai của tuần chứa ngày d (YYYY-MM-DD)
const weekStart = (d: string) => new Date(dayMs(d) - ((new Date(dayMs(d)).getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export type Throughput = Awaited<ReturnType<typeof rndThroughput>>;

export async function rndThroughput(team: string | null, weeks = 12) {
  let pq = sb.rnd().from("products").select("*").not("stage", "is", null);
  if (team) pq = pq.eq("team_id", team);
  const [{ data: prods, error }, design, orders, media, evals, decs] = await Promise.all([
    pq,
    fetchAll<{ product_id: string; done_at: string | null }>((a, b) => sb.rnd().from("design_tasks").select("product_id, done_at").order("product_id").range(a, b)),
    fetchAll<{ product_id: string; received_at: string | null }>((a, b) => sb.rnd().from("sample_orders").select("product_id, received_at").order("product_id").range(a, b)),
    fetchAll<{ product_id: string; done_at: string | null }>((a, b) => sb.rnd().from("media_requests").select("product_id, done_at").order("product_id").range(a, b)),
    fetchAll<{ code: string; first_post_date: string | null }>((a, b) => sb.rnd().from("evaluations").select("code, first_post_date").order("code").range(a, b)),
    fetchAll<{ product_id: string; result: string; decided_at: string }>((a, b) => sb.rnd().from("current_decisions").select("product_id, result, decided_at").order("product_id").range(a, b)),
  ]);
  if (error) throw error;
  const items = (prods ?? []) as PipelineItem[];
  const first = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort()[0];
  const last = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort().at(-1);
  const group = <T extends { product_id: string }>(rows: T[]) => { const m = new Map<string, T[]>(); for (const r of rows) m.set(r.product_id, [...(m.get(r.product_id) ?? []), r]); return m; };
  const dBy = group(design), oBy = group(orders), mBy = group(media);
  const firstPost = new Map(evals.filter((e) => e.first_post_date).map((e) => [e.code, e.first_post_date as string]));
  const decBy = new Map(decs.map((d) => [d.product_id, d]));

  // Ngày đạt từng mốc của mỗi mẫu (YYYY-MM-DD, giờ VN)
  const dates = new Map<string, Partial<Record<EventKey, string>>>();
  for (const p of items) {
    const ev: Partial<Record<EventKey, string>> = { created: vn(entryDate(p)) };
    const idx = stageIndex(p.stage);
    if (p.approved_at && idx >= 1) ev.approved = vn(p.approved_at);
    const d3 = first((dBy.get(p.id) ?? []).map((x) => x.done_at));
    if (d3 && idx >= 2) ev.design = vn(d3);
    const rc = first((oBy.get(p.id) ?? []).map((x) => x.received_at));
    if (rc && idx >= 3) ev.received = vn(rc);
    const sd = last((mBy.get(p.id) ?? []).map((x) => x.done_at));
    if (sd && idx >= 4) ev.source = vn(sd);
    const fp = p.code ? firstPost.get(p.code) : undefined;
    if (fp && idx >= 4) ev.video = fp.slice(0, 10);
    const dc = decBy.get(p.id);
    // P5 = hệ thống đánh giá Win (tự lên mốc); mẫu đã sang P6 lấy ngày duyệt
    const winAt = p.stage === "p5" ? p.stage_at : dc && ["win", "win_traffic", "win_sp"].includes(dc.result) ? dc.decided_at : p.stage_at;
    if (idx >= 5 && winAt) ev.win = vn(winAt);
    dates.set(p.id, ev);
  }

  // Số mẫu đạt mốc theo tuần (N tuần gần nhất, tuần hiện tại ở cuối)
  const thisWeek = weekStart(vn(new Date().toISOString()));
  const starts = Array.from({ length: weeks }, (_, i) => new Date(dayMs(thisWeek) - (weeks - 1 - i) * 7 * DAY).toISOString().slice(0, 10));
  const idxOf = new Map(starts.map((s, i) => [s, i]));
  const series = starts.map((s) => ({ week: s, label: `${s.slice(8, 10)}/${s.slice(5, 7)}`, ...Object.fromEntries(EVENTS.map((e) => [e.key, 0])) as Record<EventKey, number> }));
  for (const ev of dates.values()) for (const e of EVENTS) {
    const d = ev[e.key];
    const i = d ? idxOf.get(weekStart(d)) : undefined;
    if (i !== undefined) series[i][e.key] += 1;
  }

  // Tốc độ: trung bình / tuần của 4 tuần liền trước tuần này so với 4 tuần trước nữa (bỏ tuần hiện tại vì chưa đủ)
  const avg = (key: EventKey, from: number, to: number) => series.slice(from, to).reduce((t, w) => t + w[key], 0) / Math.max(1, to - from);
  const n = series.length;
  const rate = (key: EventKey) => ({ cur: avg(key, n - 5, n - 1), prev: avg(key, n - 9, n - 5), thisWeek: series[n - 1][key] });
  const rates = Object.fromEntries(EVENTS.map((e) => [e.key, rate(e.key)])) as Record<EventKey, ReturnType<typeof rate>>;

  // Thời gian xử lý trung vị (ngày) của các mẫu đạt mốc sau trong 90 ngày gần nhất
  const since = new Date(Date.now() - 90 * DAY).toISOString().slice(0, 10);
  const gap = (a: EventKey, b: EventKey) => median([...dates.values()].flatMap((ev) => {
    const x = ev[a], y = ev[b];
    return x && y && y >= since ? [Math.max(0, (dayMs(y) - dayMs(x)) / DAY)] : [];
  }));
  const lead = [
    { key: "created-approved", label: "Sưu tầm → duyệt", days: gap("created", "approved") },
    { key: "approved-design", label: "Duyệt → 3D đạt", days: gap("approved", "design") },
    { key: "design-received", label: "3D → nhận mẫu", days: gap("design", "received") },
    { key: "received-source", label: "Nhận mẫu → quay video xong", days: gap("received", "source") },
    { key: "source-video", label: "Quay video → đăng video", days: gap("source", "video") },
    { key: "approved-received", label: "Duyệt → ra mẫu", days: gap("approved", "received") },
    { key: "created-video", label: "Sưu tầm → lên video", days: gap("created", "video") },
  ];

  // Tồn: số mẫu đang ở từng mốc (chưa bị dừng)
  const live = items.filter((p) => !p.killed_at);
  const wip = (["p0", "p1", "p2", "p3", "p4", "p5"] as Stage[]).map((s) => ({ stage: s, count: live.filter((p) => p.stage === s).length }));
  return { series, rates, lead, wip, total: items.length, killed: items.length - live.length };
}
