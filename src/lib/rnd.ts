import "server-only";
import { unstable_cache } from "next/cache";
import { fetchAll, sb, supabaseAdmin } from "@/lib/supabase/admin";
import { loadDailySales } from "@/lib/daily-sales";
import { rndCodeStats } from "@/lib/rnd-code-stats";
import { profileNames } from "@/lib/session";
import { cloudinaryUrl, isCld } from "@/lib/media";

import { RND_BUCKET, RND_STATUS, type RndStatus } from "@/lib/rnd-constants";
import { trafficFrom } from "@/lib/pipeline-constants";
import { loadCodeLinks } from "@/lib/code-links";
import { loadVideoWinRules } from "@/lib/spu-rules";
import { buildMetrics, checkRules, rulesPass } from "@/lib/eval/rules";
import { KPI_METRICS, type KpiRule } from "@/lib/kpi-constants";
export { RND_BUCKET, RND_FIELDS, RND_STATUS, type RndStatus } from "@/lib/rnd-constants";

export type RndProduct = {
  id: string; code: string | null; sapo_code: string | null; name: string;
  line: string | null; category: string | null; material: string | null; stone: string | null; size: string | null;
  description: string | null; image_paths: string[]; source_url: string | null; status: RndStatus;
  created_at: string; updated_at: string;
  age_override?: "new" | "old" | null;
  confirmed_result?: "win" | "win_traffic" | "win_sp" | "fail" | null;
  created_by_name?: string | null;
  // Quy trình R&D (migration 015) — null với mã tự động
  stage?: import("@/lib/pipeline-constants").Stage | null; st_code?: string | null;
};

// Kết luận R&D hiện hành (view rnd.current_decisions — dòng mới nhất của rnd.decisions)
async function currentResults(ids: string[]) {
  if (!ids.length) return new Map<string, RndProduct["confirmed_result"]>();
  const { data } = await sb.rnd().from("current_decisions").select("product_id, result").in("product_id", ids);
  return new Map((data ?? []).map((d) => [d.product_id as string, d.result as RndProduct["confirmed_result"]]));
}

export async function listRndProducts(status?: string) {
  // Chỉ mẫu đã có mã (hashtag) — mẫu sưu tầm chưa gắn SKU nằm ở bảng quy trình
  const base = () => { let q = sb.rnd().from("products").select("*").not("code", "is", null); if (status && status in RND_STATUS) q = q.eq("status", status); return q; };
  // Phân trang (bảng > 1.000 hồ sơ có mã); sắp theo cập nhật mới nhất rồi theo id cho ổn định thứ tự giữa các trang
  const rows = await fetchAll<RndProduct & { created_by: string | null }>((a, b) => base().order("updated_at", { ascending: false }).order("id").range(a, b));
  const [names, results] = await Promise.all([profileNames(rows.map((r) => r.created_by)), currentResults(rows.map((r) => r.id))]);
  return rows.map((p) => ({ ...p, code: p.code!, created_by_name: p.created_by ? names.get(p.created_by) ?? null : null, confirmed_result: results.get(p.id) ?? null }));
}

export async function getRndProduct(id: string) {
  const { data, error } = await sb.rnd().from("products").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const results = await currentResults([id]);
  return { ...(data as RndProduct), confirmed_result: results.get(id) ?? null };
}

export type HistoryRow = { id: number; action: string; changes: Record<string, [unknown, unknown]> | null; created_at: string; actor: { full_name: string } | null };

export async function getRndHistory(productId: string) {
  const { data, error } = await sb.rnd().from("product_events")
    .select("id, action, changes, created_at, actor_id")
    .eq("product_id", productId).order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  const names = await profileNames(data.map((r) => r.actor_id));
  return data.map(({ actor_id, ...r }) => ({ ...r, actor: actor_id && names.has(actor_id) ? { full_name: names.get(actor_id)! } : null })) as HistoryRow[];
}

// Ảnh trong bucket private → URL ký 1 giờ
// Link ký giữ lại trong bộ nhớ tiến trình: không phải ký lại mỗi lần tải trang (bớt 1 lượt gọi Storage),
// và cùng 1 ảnh giữ nguyên URL → trình duyệt dùng lại ảnh đã tải thay vì tải lại.
const SIGN_TTL = 6 * 3600;                         // link sống 6 giờ
const REUSE_MS = 5 * 3600_000;                     // dùng lại tối đa 5 giờ → luôn còn ≥ 1 giờ hiệu lực
const signedCache = new Map<string, { url: string; at: number }>();

export async function signImages(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const now = Date.now();
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of paths) {
    const c = signedCache.get(p);
    if (c && now - c.at < REUSE_MS) out[p] = c.url; else missing.push(p);
  }
  for (const p of missing.filter(isCld)) out[p] = cloudinaryUrl(p);   // ảnh ở Cloudinary: ký tại chỗ, không gọi mạng
  const legacy = missing.filter((p) => !isCld(p));
  if (legacy.length) {
    const { data, error } = await supabaseAdmin().storage.from(RND_BUCKET).createSignedUrls(legacy, SIGN_TTL);
    if (error) { console.error("signImages:", error.message); return out; }
    for (const d of data) if (d.path && d.signedUrl) { out[d.path] = d.signedUrl; signedCache.set(d.path, { url: d.signedUrl, at: now }); }
    if (signedCache.size > 20_000) for (const [k, v] of signedCache) if (now - v.at >= REUSE_MS) signedCache.delete(k);
  }
  return out;
}

// Ảnh nhỏ cho bảng / thẻ thư viện: Supabase Storage tự thu nhỏ (360px, ~5–15KB thay vì ảnh gốc 200KB+).
// Ảnh gốc chỉ tải khi bấm phóng to. API ký ảnh nhỏ không ký hàng loạt được → ký từng ảnh. Giữ 2 tầng:
// bộ nhớ tiến trình (nhanh nhất) + cache dùng chung của Next/Vercel (máy chủ mới khởi động không phải ký lại từ đầu).
const THUMB = { width: 360, height: 360, resize: "cover" as const, quality: 70 };
const thumbCache = new Map<string, { url: string; at: number }>();
const sharedThumb = unstable_cache(async (path: string) => {
  const { data } = await supabaseAdmin().storage.from(RND_BUCKET).createSignedUrl(path, SIGN_TTL, { transform: THUMB });
  return data?.signedUrl ?? null;
}, ["rnd-thumb-v1"], { revalidate: REUSE_MS / 1000 });

export async function signThumbs(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const p of paths) {
    if (isCld(p)) { out[p] = cloudinaryUrl(p, true); continue; }
    const c = thumbCache.get(p);
    if (c && now - c.at < REUSE_MS) out[p] = c.url; else missing.push(p);
  }
  for (let i = 0; i < missing.length; i += 16) {
    await Promise.all(missing.slice(i, i + 16).map(async (p) => {
      const url = await sharedThumb(p);
      if (url) { out[p] = url; thumbCache.set(p, { url, at: now }); }
    }));
  }
  if (thumbCache.size > 20_000) for (const [k, v] of thumbCache) if (now - v.at >= REUSE_MS) thumbCache.delete(k);
  return out;
}

// Gợi ý cho ô nhập (line, chất liệu...) từ giá trị đã dùng
export async function getFieldSuggestions() {
  const data = await fetchAll<{ line: string | null; category: string | null; material: string | null; stone: string | null }>((a, b) => sb.rnd().from("products").select("line, category, material, stone").order("id").range(a, b));   // phân trang: bảng > 1.000 hồ sơ
  const pick = (k: "line" | "category" | "material" | "stone") =>
    [...new Set((data ?? []).map((r) => r[k]).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "vi"));
  return { line: pick("line"), category: pick("category"), material: pick("material"), stone: pick("stone") };
}

const DAY_MS = 86_400_000;
const vnToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const shift = (d: string, n: number) => new Date(Date.parse(d) + n * DAY_MS).toISOString().slice(0, 10);

export type CardStats = {
  since: string | null;            // ngày bài đầu tiên gắn mã (giờ VN), null nếu chưa có bài
  days: number | null;             // số ngày từ bài đầu tiên đến hôm nay
  posts: number; videos: number;
  views: number; viewers: number; reactions: number; clicks: number;
  ctr: number | null;              // lượt nhấp ÷ lượt xem
  qtyNet: number;                  // số bán thuần từ ngày bài đầu (mọi kênh)
  conversion: number | null;       // qtyNet ÷ người xem
  daily: number[];                 // SL bán thuần 30 ngày gần nhất (cũ → mới)
  trendPct: number | null;         // SL 7 ngày gần nhất so với 7 ngày trước đó
};

// Chỉ số tổng quát cho thẻ mẫu R&D: traffic từ bài gắn hashtag mã, số bán theo mã Sapo
type CardInput = { code: string | null; sapo_code: string | null; stage?: string | null; created_at?: string | null };

type P = { published_at: string; kind: string; product_codes: string[]; views: number; viewers: number; reactions: number; clicks: number };
export async function getCardStats(input: CardInput[]): Promise<Record<string, CardStats>> {
  const out: Record<string, CardStats> = {};
  // Mẫu chưa gắn mã (đang sưu tầm) không có dữ liệu thị trường
  const products = input.filter((p): p is CardInput & { code: string } => !!p.code);
  if (!products.length) return out;
  const today = vnToday();
  // Mẫu Media đã gắn mã SPU: tính cả bài gắn #SPU và số bán của mã SPU (xem lib/code-links)
  const skuOf = new Map<string, string[]>();
  for (const l of await loadCodeLinks()) skuOf.set(l.test_code, [...(skuOf.get(l.test_code) ?? []), l.sku_code]);
  const codesOf = (p: { code: string }) => [p.code.toUpperCase(), ...(skuOf.get(p.code.toUpperCase()) ?? [])];
  const codes = [...new Set(products.flatMap(codesOf))];

  for (const p of products) {
    out[p.code] = { since: null, days: null, posts: 0, videos: 0, views: 0, viewers: 0, reactions: 0, clicks: 0,
      ctr: null, qtyNet: 0, conversion: null, daily: Array(30).fill(0), trendPct: null };
  }
  // Traffic: chỉ số trọn đời (cột) của mọi bài có mã đã nhận diện — database tính sẵn (migration 057); chưa có hàm thì kéo bài về cộng như cũ
  const dbStats = await rndCodeStats(products.map((p) => ({ id: p.code, codes: codesOf(p), from: trafficFrom(p) ?? null })));
  let posts: P[] = [];
  if (dbStats) {
    for (const p of products) {
      const r = dbStats.get(p.code), s = out[p.code];
      if (r) { s.posts = r.posts; s.videos = r.videos; s.views = r.views; s.viewers = r.viewers; s.reactions = r.reactions; s.clicks = r.clicks; s.since = r.first; }
    }
  } else {
    const { data, error } = await sb.social().from("posts")
      .select("published_at, kind, product_codes, views, viewers, reactions, clicks")
      .overlaps("product_codes", codes);
    if (error) throw error;
    posts = (data ?? []) as P[];
  }
  for (const post of posts) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(post.published_at));
    for (const p of products) {
      if (!codesOf(p).some((c) => post.product_codes.includes(c))) continue;
      const from = trafficFrom(p);
      if (from && day < from) continue;
      const s = out[p.code];
      s.posts += 1;
      if (post.kind === "video" || post.kind === "reel") s.videos += 1;
      s.views += Number(post.views);
      s.viewers += Number(post.viewers);
      s.reactions += Number(post.reactions);
      s.clicks += Number(post.clicks);
      if (!s.since || day < s.since) s.since = day;
    }
  }

  // Bán hàng: lấy từ đủ xa để phủ cả ngày bài đầu tiên lẫn 30 ngày cho biểu đồ
  const salesCodes = (p: { code: string; sapo_code: string | null }) => skuOf.get(p.code.toUpperCase()) ?? [(p.sapo_code ?? p.code).toUpperCase()];
  const earliest = Object.values(out).map((s) => s.since).filter(Boolean).sort()[0] as string | undefined;
  const from = earliest && earliest < shift(today, -29) ? earliest : shift(today, -29);
  // Số bán theo ngày dùng chung (lib/daily-sales): file đơn hàng đã nhập cho ngày file phủ được, số đồng bộ Qlydonhang cho ngày ngoài khoảng đó
  const rows = await loadDailySales({ codes: [...new Set(products.flatMap(salesCodes))], from });

  for (const p of products) {
    const s = out[p.code], mine = salesCodes(p);
    const add = (date: string, qty: number) => {
      if (s.since && date >= s.since) s.qtyNet += qty;
      const idx = 29 - Math.round((Date.parse(today) - Date.parse(date)) / DAY_MS);
      if (idx >= 0 && idx < 30) s.daily[idx] += qty;
    };
    for (const r of rows) {
      if (!mine.includes(r.code)) continue;
      add(r.date, r.qty_sold - r.qty_returned);
    }
    s.days = s.since ? Math.round((Date.parse(today) - Date.parse(s.since)) / DAY_MS) + 1 : null;
    s.ctr = s.views > 0 ? (s.clicks / s.views) * 100 : null;
    s.conversion = s.viewers > 0 ? (s.qtyNet / s.viewers) * 100 : null;
    const last7 = s.daily.slice(23).reduce((a, b) => a + b, 0), prev7 = s.daily.slice(16, 23).reduce((a, b) => a + b, 0);
    s.trendPct = prev7 > 0 ? ((last7 - prev7) / prev7) * 100 : last7 > 0 ? null : 0;
  }
  return out;
}

// Tiêu chí Video Win + chấm RIÊNG từng video theo chỉ số của chính video đó (dùng ở danh sách video của mẫu và trang Tổng quan giao mẫu)
export type TrafficKpi = { rules: KpiRule[]; match: "all" | "any" };
export async function loadTrafficKpi(): Promise<TrafficKpi> {
  // Tiêu chí Video Win (trang Mục tiêu) là tiêu chí chấm từng video; chưa chỉnh thì mặc định của mục đó, không còn lấy KPI Traffic của mã
  return loadVideoWinRules();
}

export function gradeVideo(raw: { views: number; viewers: number; reactions: number; clicks: number }, kpi: TrafficKpi) {
  const m = buildMetrics({ ...raw, qty_net: 0, posts: 1, videos: 1 });
  const checks = kpi.rules.length ? checkRules(kpi.rules, m) : [];
  const fmt = (v: number | null, metric: KpiRule["metric"]) => (v === null ? "—" : KPI_METRICS[metric].unit === "%" ? `${v.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%` : Math.round(v).toLocaleString("vi-VN"));
  return {
    trafficPass: kpi.rules.length ? rulesPass(checks, kpi.match) : null,
    kpiProgress: checks.length ? Math.round(100 * (kpi.match === "all" ? Math.min(...checks.map((c) => c.progress)) : Math.max(...checks.map((c) => c.progress)))) : null,
    kpiLines: checks.map((c) => `${c.pass ? "✓" : "○"} ${KPI_METRICS[c.metric].label} ${fmt(c.actual, c.metric)} / ${c.op === "<=" ? "≤" : ""}${fmt(c.target, c.metric)}`),
  };
}

// Danh sách video / reel đã đăng gắn hashtag mã của mẫu (mới nhất trước) — mẫu thuộc quy trình chỉ tính từ ngày sưu tầm, giống getCardStats
export type ProductVideo = {
  id: string; channel_id: string; published_at: string; message: string | null; permalink_url: string | null; thumbnail_url: string | null;
  views: number; reactions: number; comments: number | null; shares: number | null;
  // Đánh giá traffic của RIÊNG video này theo KPI Test Traffic mặc định (null = chưa có KPI để chấm)
  trafficPass: boolean | null; kpiLines: string[]; kpiProgress: number | null;   // kpiProgress: 0–100, mức đạt KPI (tất cả chỉ tiêu → lấy chỉ tiêu thấp nhất)
};
export async function getProductVideos(p: CardInput): Promise<ProductVideo[]> {
  if (!p.code) return [];
  const skus = (await loadCodeLinks()).filter((l) => l.test_code === p.code!.toUpperCase()).map((l) => l.sku_code);   // mẫu Media đã gắn SPU: gộp cả video #SPU
  const code = p.code.toUpperCase();
  const { data, error } = await sb.social().from("posts")
    .select("id, channel_id, published_at, message, permalink_url, thumbnail_url, views, viewers, reactions, clicks, comments, shares, kind, product_codes")
    .overlaps("product_codes", [code, ...skus]).in("kind", ["video", "reel"]).order("published_at", { ascending: false }).limit(60);
  if (error) throw error;
  const kpi = await loadTrafficKpi();
  const from = trafficFrom(p);
  const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
  return (data ?? []).filter((x) => !from || day(x.published_at as string) >= from).map((x) => ({
    id: x.id as string, channel_id: x.channel_id as string, published_at: x.published_at as string, message: (x.message as string | null) ?? null,
    permalink_url: (x.permalink_url as string | null) ?? null, thumbnail_url: (x.thumbnail_url as string | null) ?? null,
    views: Number(x.views ?? 0), reactions: Number(x.reactions ?? 0), comments: x.comments === null ? null : Number(x.comments), shares: x.shares === null ? null : Number(x.shares),
    ...gradeVideo({ views: Number(x.views ?? 0), viewers: Number(x.viewers ?? 0), reactions: Number(x.reactions ?? 0), clicks: Number(x.clicks ?? 0) }, kpi),
  }));
}
