import "server-only";
import { resolveRange } from "@/lib/date-range";
import { loadDailySales } from "@/lib/daily-sales";
import { unstable_cache } from "next/cache";
import { fetchAll, sb } from "@/lib/supabase/admin";
import { TAG } from "@/lib/cache-tags";

const DAY_MS = 86_400_000;

// ---------- Ngày & bộ lọc ----------

// Ngày hôm nay theo giờ VN, dạng YYYY-MM-DD
export function todayVN() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

export function addDays(date: string, n: number) {
  return new Date(Date.parse(date) + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
}

export const RANGE_PRESETS = [7, 30, 90, 365] as const;

export const CHANNELS = {
  facebook: "Facebook",
  tiktok_shop: "TikTok Shop",
  tiktok: "TikTok",
  shopee: "Shopee",
  web: "Web",
  cua_hang: "Cửa hàng",
  zalo: "Zalo",
  instagram: "Instagram",
  khac: "Khác",
  bao_hanh: "Bảo hành",
} as const;

export type Filters = {
  from: string;
  to: string;
  range: string;          // "7" | "30" | ... | "custom"
  scope: string;          // "all" | "mine" | "<page id>,<page id>…" (chọn nhiều)
  teams: string[];        // lọc theo team: chỉ tính các Page thuộc team đã chọn (rỗng = mọi team)
  channels: string[];     // rỗng = mặc định (mọi kênh trừ bảo hành)
};

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Mặc định kết thúc ở HÔM NAY: gồm cả bài đăng, video và mẫu R&D mới tạo trong ngày
export function parseFilters(sp: SP): Filters {
  let range = one(sp.range) ?? "30";
  let from: string, to: string;
  if (range === "custom" && isDate(one(sp.from)) && isDate(one(sp.to))) {
    from = one(sp.from)!; to = one(sp.to)!;
    if (from > to) [from, to] = [to, from];
  } else {
    // 7 / 30 / 90 / 365 ngày qua, Tháng này, Tháng trước; giá trị lạ → 30 ngày
    let r = resolveRange(range, todayVN());
    if (!r) { range = "30"; r = resolveRange("30", todayVN())!; }
    ({ from, to } = r);
  }
  const channels = (one(sp.channels) ?? "").split(",").filter((c) => c in CHANNELS);
  const teams = (one(sp.team) ?? "").split(",").filter(Boolean);
  return { from, to, range, scope: one(sp.scope) ?? "all", teams, channels };
}

// Page đang lọc: null = toàn hệ thống (không lọc theo Page)
// Chỉ giữ các Page thuộc team đang lọc (không chọn team → giữ nguyên)
export const limitByTeams = <T extends { team_id?: string | null }>(accounts: T[], f: Pick<Filters, "teams">) =>
  f.teams.length ? accounts.filter((a) => !!a.team_id && f.teams.includes(a.team_id)) : accounts;

// myPageIds: các Page đã được giới hạn (quyền + team). Đang lọc theo team thì KHÔNG BAO GIỜ là "toàn hệ thống":
// luôn là Page của team (giao với Page tick chọn); team không có Page nào → danh sách giả để không ra số liệu nào.
export function scopePageIds(f: Filters, myPageIds: string[]): string[] | null {
  if (f.teams.length) {
    const picked = !f.scope || f.scope === "all" || f.scope === "mine" ? myPageIds : f.scope.split(",").filter((id) => myPageIds.includes(id));
    return picked.length ? picked : ["__none__"];
  }
  if (!f.scope || f.scope === "all") return null;
  if (f.scope === "mine") return myPageIds;
  return f.scope.split(",").filter(Boolean);
}

// Kỳ liền trước cùng độ dài
export function previousPeriod(f: Filters) {
  const n = daysBetween(f.from, f.to);
  return { from: addDays(f.from, -n), to: addDays(f.from, -1) };
}

// ---------- Truy vấn ----------

export type AccountInfo = { id: string; name: string; platform: string; team_id: string | null; color: string };

// Màu đi theo kênh (thứ tự tạo cố định), không theo thứ hạng
// Cache dùng chung (xoá khi đồng bộ / sửa kênh — bust(TAG.channels))
export const getAccounts = unstable_cache(async (): Promise<AccountInfo[]> => {
  const { data, error } = await sb.social()
    .from("channels").select("id, name, platform, team_id").eq("is_active", true)
    .order("created_at").order("id");
  if (error) throw error;
  return data.map((a, i) => ({ ...a, color: `var(--series-${(i % 8) + 1})` }));
}, ["accounts"], { tags: [TAG.channels], revalidate: 3600 });

// Chỉ số kênh theo ngày = cột của social.channel_daily
export const OVERVIEW_METRICS = {
  views: "Lượt xem",
  viewers: "Người xem",
  new_follows: "Theo dõi mới",
  engagements: "Tương tác",
  video_views: "Lượt xem video",
} as const;
export type OverviewMetric = keyof typeof OVERVIEW_METRICS;

// Trả về dạng dài {account_id, metric, date, value} để trang Traffic gom nhóm linh hoạt
export async function getDailyMetrics(channelIds: string[], from: string, to: string) {
  type Wide = { channel_id: string; date: string } & Record<OverviewMetric, number>;
  const rows = await fetchAll<Wide>((a, b) =>
    sb.social().from("channel_daily")
      .select("channel_id, date, views, viewers, new_follows, engagements, video_views")
      .in("channel_id", channelIds).gte("date", from).lte("date", to)
      .order("date").order("channel_id").range(a, b));
  return rows.flatMap((r) => (Object.keys(OVERVIEW_METRICS) as OverviewMetric[]).map((m) =>
    ({ account_id: r.channel_id, metric: m, date: r.date, value: Number(r[m]) })));
}

export type ChannelRow = { channel: string; qty_net: number };

export async function getSalesByChannel(code: string, from: string, to: string) {
  // Cùng nguồn các báo cáo khác: file đơn hàng đã nhập (kênh suy từ cột "Nguồn") + số đồng bộ cho ngày ngoài khoảng file
  const rows = await loadDailySales({ codes: [code], from, to, keepWarranty: true });
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.channel, (by.get(r.channel) ?? 0) + r.qty_sold - r.qty_returned);
  return [...by].map(([channel, qty_net]) => ({ channel, qty_net })).sort((a, b) => b.qty_net - a.qty_net) as ChannelRow[];
}

export type PostRow = {
  id: string; channel_id: string; published_at: string; kind: string; message: string | null; hashtags: string[];
  product_codes: string[]; unknown_codes: string[]; content_line: string | null; concept: "old" | "new" | null; staff_code: string | null;
  permalink_url: string | null; thumbnail_url: string | null;
  views: number; viewers: number; reactions: number; comments: number | null; shares: number | null; clicks: number; video_views: number;
};

export async function getPosts(channelIds: string[], from: string, to: string) {
  // published_at là timestamptz; lọc theo ngày giờ VN (+07)
  return fetchAll<PostRow>((a, b) =>
    sb.social().from("posts")
      .select("id, channel_id, published_at, kind, message, hashtags, product_codes, unknown_codes, content_line, concept, staff_code, permalink_url, thumbnail_url, views, viewers, reactions, comments, shares, clicks, video_views")
      .in("channel_id", channelIds)
      .gte("published_at", `${from}T00:00:00+07:00`).lte("published_at", `${to}T23:59:59+07:00`)
      .order("published_at", { ascending: false }).range(a, b));
}

// Bài đăng theo TRANG (sắp xếp + cắt trang ngay ở DB): với hàng trăm kênh không kéo cả chục nghìn bài về máy chủ / trình duyệt
// sku: "with" = bài đã gắn mã SP · "without" = chưa gắn mã · "unknown" = có hashtag dạng mã nhưng chưa khai báo / không có trong danh mục · "all" = tất cả
// kind: "video" = chỉ video / reel · "all" = mọi loại bài
export type PostSku = "all" | "with" | "without" | "unknown";
export async function getPostsPage(channelIds: string[], from: string, to: string, sort: string, page: number, size: number, sku: PostSku = "all", kind: "all" | "video" = "all", codes?: string[], minViews?: number | { rules: { metric: string; op: string; value: number }[]; match: "all" | "any" }, search?: string) {
  const first = (page - 1) * size;
  let q = sb.social().from("posts")
    .select("id, channel_id, published_at, kind, message, hashtags, product_codes, unknown_codes, content_line, concept, staff_code, permalink_url, thumbnail_url, views, viewers, reactions, comments, shares, clicks, video_views", { count: "exact" })
    .in("channel_id", channelIds)
    .gte("published_at", `${from}T00:00:00+07:00`).lte("published_at", `${to}T23:59:59+07:00`);
  if (sku === "with") q = q.neq("product_codes", "{}");
  else if (sku === "without") q = q.eq("product_codes", "{}");
  else if (sku === "unknown") q = q.neq("unknown_codes", "{}");
  if (kind === "video") q = q.in("kind", ["video", "reel"]);
  if (codes) {   // chỉ bài gắn ít nhất 1 trong các mã này (lọc theo kết quả đánh giá / có source)
    if (!codes.length) return { posts: [] as PostRow[], total: 0 };
    q = q.overlaps("product_codes", codes);
  }
  // Lọc theo lượt xem (cùng bộ lọc với ngăn video ở trang Theo dõi SPU): số = lượt xem tối thiểu; đối tượng = tiêu chí Video Win
  // (chỉ các chỉ số lưu sẵn ở DB: lượt xem, người xem, cảm xúc, lượt nhấp, phép ≥; chỉ số tính ra như CTR bỏ qua)
  // Tìm kiếm: nội dung bài (gồm cả hashtag), mã SP gõ đúng dạng mã, hoặc TÊN sản phẩm trong danh mục (tên → các mã → bài gắn mã đó)
  const term = (search ?? "").replace(/[,()"'\\%*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (term) {
    const conds = [`message.ilike.*${term}*`];
    if (/^#?[A-Za-z]{1,4}\d{3,}$/.test(term)) conds.push(`product_codes.cs.{${term.replace(/^#/, "").toUpperCase()}}`);
    if (term.length >= 2) {
      const [{ data: named }, { data: namedOwn }] = await Promise.all([
        sb.sales().from("catalog").select("code").ilike("name", `%${term}%`).limit(60),
        sb.sales().from("spu_images").select("code").ilike("name", `%${term}%`).limit(60),   // tên từ file Sapo (migration 054)
      ]);
      const codes = [...new Set([...(named ?? []), ...(namedOwn ?? [])].map((r) => String(r.code).toUpperCase().split("-")[0]))];
      if (codes.length) conds.push(`product_codes.ov.{${codes.join(",")}}`);
    }
    q = q.or(conds.join(","));
  }
  if (typeof minViews === "number") q = q.gte("views", minViews);
  else if (minViews) {
    const cols: Record<string, string> = { views: "views", viewers: "viewers", reactions: "reactions", clicks: "clicks" };
    const conds = minViews.rules.filter((r) => r.op === ">=" && r.metric in cols);
    if (minViews.match === "any" && conds.length) q = q.or(conds.map((r) => `${cols[r.metric]}.gte.${r.value}`).join(","));
    else for (const r of conds) q = q.gte(cols[r.metric], r.value);
  }
  const { data, count, error } = await q
    .order(sort, { ascending: false, nullsFirst: false }).order("published_at", { ascending: false }).order("id")
    .range(first, first + size - 1);
  if (error) throw error;
  return { posts: (data ?? []) as PostRow[], total: count ?? 0 };
}
// Trang Bài đăng mở cho mọi người + mặc định mọi Page: mỗi lượt mở đếm chính xác + sắp xếp toàn bộ bài trong kỳ ở database.
// Lưu đệm 6 giờ (số traffic đồng bộ ~1 lần/ngày) DÙNG CHUNG theo đúng bộ lọc / trang (đổi trang, mở lại, nhiều người cùng mở không đụng database); đồng bộ xong thì xoá (TAG.sync).
export const getPostsPageCached = unstable_cache(getPostsPage, ["posts-page", "v1"], { tags: [TAG.sync], revalidate: 21_600 });

export type ProductInfo = {
  product_code: string;
  name: string;
  image_url: string | null;
  ageInfo?: {
    age?: "new" | "old" | null;
    age_reason?: string | null;
    stage?: string | null;
    origin?: string | null;
  } | null;
};

const catalogCache = new Map<string, ProductInfo>();

// Tên + ảnh của các mã mẫu (sales.catalog, đồng bộ từ kho Qlydonhang)
export async function getProductInfo(codes: string[]): Promise<Record<string, ProductInfo>> {
  const unique = [...new Set(codes.map((c) => c.toUpperCase()))];
  if (!unique.length) return {};
  const out: Record<string, ProductInfo> = {};
  const missing: string[] = [];
  for (const c of unique) {
    const cached = catalogCache.get(c);
    if (cached) out[c] = cached;
    else missing.push(c);
  }
  if (missing.length) {
    const chunks: string[][] = [];
    for (let i = 0; i < missing.length; i += 200) chunks.push(missing.slice(i, i + 200));
    const [results, own] = await Promise.all([
      Promise.all(chunks.map((c) => sb.sales().from("catalog").select("code, name, image_url").in("code", c))),
      Promise.all(chunks.map(async (c) => {   // ảnh + tên nhập từ file Excel (migration 049 / 054); chưa có cột tên → chỉ đọc ảnh; chưa có bảng → bỏ qua
        const r = await sb.sales().from("spu_images").select("code, image_url, name").in("code", c);
        return r.error ? sb.sales().from("spu_images").select("code, image_url").in("code", c) : r;
      })),
    ]);
    const ownImg = new Map<string, { image_url: string | null; name: string | null }>();
    for (const { data } of own) for (const r of data ?? []) ownImg.set(String(r.code).toUpperCase(), { image_url: (r.image_url as string | null) ?? null, name: ((r as { name?: string | null }).name ?? null) });
    for (const { data, error } of results) {
      if (error) { console.error("getProductInfo:", error.message); continue; }
      for (const p of data) {
        const o = ownImg.get(String(p.code).toUpperCase());
        const item = { product_code: p.code, name: o?.name || p.name, image_url: o?.image_url ?? p.image_url };
        catalogCache.set(p.code, item);
        out[p.code] = item;
      }
    }
  }
  return out;
}

export type SyncLog = { job: string; channel_id: string | null; status: string; message: string | null; finished_at: string | null };

// Lần chạy gần nhất của mỗi (việc, kênh)
// Cache dùng chung (xoá sau mỗi lần ghi nhật ký đồng bộ — bust(TAG.sync))
export const getLatestSyncLogs = unstable_cache(async () => {
  const { data, error } = await sb.core()
    .from("sync_runs").select("job, channel_id, status, message, finished_at")
    .order("started_at", { ascending: false }).limit(200);
  if (error) throw error;
  const seen = new Map<string, SyncLog>();
  for (const l of data as SyncLog[]) {
    const key = `${l.job}|${l.channel_id ?? ""}`;
    if (!seen.has(key)) seen.set(key, l);
  }
  return [...seen.values()];
}, ["sync-logs"], { tags: [TAG.sync], revalidate: 600 });

// ---------- Định dạng ----------

export { fmtCompact, fmtInt } from "@/lib/format";   // định nghĩa ở lib/format.ts (dùng được ở client)
export const fmtMoney = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
export const fmtDate = (d: string | Date) =>
  new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" })
    .format(typeof d === "string" ? new Date(d.length === 10 ? `${d}T12:00:00+07:00` : d) : d);
export const fmtDateTime = (d: string | Date) =>
  new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(new Date(d));

// Tiền gọn cho ô KPI: 1,25 tỷ / 313 tr
export function fmtMoneyShort(n: number) {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`;
  if (a >= 1e6) return `${(n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  return fmtMoney(n);
}
