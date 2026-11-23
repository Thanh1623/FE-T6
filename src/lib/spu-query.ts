import "server-only";
import { sb } from "@/lib/supabase/admin";
import { heavyRpc } from "@/lib/db-gate";
import { loadSpuMeta, loadSpuRows, type SpuMeta } from "@/lib/spu-data";
import { getAccounts } from "@/lib/data";
import { getTeams } from "@/lib/pipeline";
import { loadChannelMarkets, marketForSql, type Market } from "@/lib/channel-market";
import { loadFirstDays } from "@/lib/video-win-data";
import { STATUS_FILTERS, actionOf, saleFlags, viewOf, type Flags, type Group, type SpuRow, type SpuRules, type SpuVid, type StatusFilter, type View, type WinFlags } from "@/lib/spu-tracking";

// TRUY VẤN DANH SÁCH SPU cho trang Theo dõi đẩy hàng — xem docs/KIEN-TRUC-TONG-HOP-SPU.md (đọc trước khi sửa).
// Hai đường cho CÙNG một kết quả:
//   • "sql"    : hàm sales.spu_query (migration 060) đọc bảng tổng hợp — nhanh, trang chỉ nhận 1 trang dòng + vài con số.
//   • "legacy" : tính trực tiếp từ loadSpuRows() (đường cũ, chậm nhưng luôn đúng) — là NGUỒN CHÂN LÝ để đối chiếu.
// Chọn đường bằng biến môi trường SPU_READ_MODE: "sql" | "legacy" (MẶC ĐỊNH "sql" từ khi đã đối chiếu khớp trên dữ liệu thật; đặt "legacy" để quay lại đường cũ). Đường "sql" lỗi (chưa chạy migration, bảng chưa làm mới lần nào…) thì tự rơi về "legacy".

export type SortKey = "stock" | "available" | "incoming" | "age" | "sold" | "videos" | "teams" | "views" | "views3";
export type SpuQuery = {
  today: string; days: number; endAge: number;
  teams: string[];                 // tên team đang lọc (rỗng = toàn công ty)
  wh: string; group: string;       // '' = không lọc
  words: string[];                 // từ khoá tìm kiếm đã bỏ dấu, chữ thường
  status: StatusFilter; sort: SortKey; dir: "asc" | "desc"; page: number; pageSize: number;
  market?: Market;                 // thị trường: "all" / bỏ trống = tất cả, "vn" = trong nước, "intl" = nước ngoài (migration 102; chỉ đường SQL hỗ trợ)
  rules: SpuRules;
  win: WinFlags;                   // tập mã đạt Win Traffic / Win Đơn hàng trong kỳ đang lọc (lib/spu-winflags.ts); Ngôi sao = đạt cả hai
};
export type Card = { all: number; video: number; vids: number };
export type CardKey = "active" | "instock" | "hot" | "normal" | "slow" | "bad";
export type SpuTotals = { stock: number; available: number; incoming: number; sold: number; videos: number; views: number; views3?: number; teams: number };
export type SpuQueryResult = {
  source: "sql" | "legacy"; refreshedAt: string | null;
  wh: string;                      // kho thực sự dùng (kho không có trong dữ liệu → rỗng)
  spus: number; meta: SpuMeta;     // tổng số SPU trong dữ liệu + nguồn số liệu (hiện ở dòng ghi chú đầu trang)
  warehouses: string[]; cards: Record<CardKey, Card>; statusCounts: Record<StatusFilter, number>;
  total: number; page: number; pages: number; totals: SpuTotals; rows: View[];
  marketApplied?: boolean;         // false = đã chọn thị trường nhưng hàm SQL chưa hỗ trợ (chưa chạy migration 102) → số hiện là của MỌI thị trường
};

const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);   // so sánh theo mã ký tự (giống collate "C" của SQL)

// ===== Đường cũ: tính trực tiếp từ SpuRow[] (logic gốc của trang, chuyển nguyên sang đây) =====
export function queryLegacy(allRows: SpuRow[], q: SpuQuery): Omit<SpuQueryResult, "source" | "refreshedAt" | "meta"> {
  const { days, endAge, group, words, teams, rules: R, win } = q;
  const warehouses = [...new Set(allRows.flatMap((r) => Object.keys(r.stockBy)))].sort();
  const wh = warehouses.includes(q.wh) ? q.wh : "";
  const search = (r: SpuRow) => `${r.code} ${r.name}`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
  const inFilter = (r: SpuRow) => (!group || r.group === group) && (!wh || (r.stockBy[wh] ?? 0) > 0) && (!words.length || words.every((w) => search(r).includes(w)));
  const base: View[] = allRows.filter(inFilter).map((r) => viewOf(r, { wh: wh || null, days, endAge, rules: R, win })).filter((v) => v.flags.active);
  // Danh sách SPU và phân loại theo tồn / SL bán 30 ngày luôn toàn công ty (companyClass); lọc team chỉ đổi SL bán, số video, lượt xem của team — không lọc bớt danh sách (khớp sales.spu_query, migration 082)
  const scope: View[] = teams.length
    ? allRows.filter(inFilter).map((r) => viewOf(r, { wh: wh || null, days, endAge, rules: R, teams, win, companyClass: true })).filter((v) => v.flags.active)
    : base;
  const hasTeamVideo = (v: View) => !teams.length || v.row.vids.some((x) => x.age >= endAge && x.age < endAge + days && !!x.team && teams.includes(x.team));
  const vidsOf = (v: View) => v.row.vids.filter((x) => x.age >= endAge && x.age < endAge + days && (!teams.length || (!!x.team && teams.includes(x.team)))).length;
  // Team đã đăng video TRONG kỳ lọc (và thuộc team đang lọc) — không phải mọi team từng đăng mã này
  const periodTeams = (v: View) => [...new Set(v.row.vids.filter((x) => x.age >= endAge && x.age < endAge + days && !!x.team && (!teams.length || teams.includes(x.team))).map((x) => x.team as string))];
  const count = (f: (v: View) => boolean): Card => {
    const withVideo = base.filter((v) => f(v) && v.flags.hasVideo && hasTeamVideo(v));
    return { all: base.filter(f).length, video: withVideo.length, vids: withVideo.reduce((n, v) => n + vidsOf(v), 0) };
  };
  const cards = { active: count(() => true), instock: count((v) => v.flags.inStock), hot: count((v) => v.flags.hot), normal: count((v) => v.flags.normal), slow: count((v) => v.flags.slow), bad: count((v) => v.flags.bad) };
  const statusCounts = Object.fromEntries(STATUS_FILTERS.map((s) => [s.id, scope.filter((v) => s.test(v.flags)).length])) as Record<StatusFilter, number>;

  const test = STATUS_FILTERS.find((s) => s.id === q.status)!.test;
  const dirMul = q.dir === "asc" ? 1 : -1;
  const val = (v: View) => (q.sort === "stock" ? v.stock : q.sort === "available" ? v.available : q.sort === "incoming" ? v.row.incoming : q.sort === "age" ? v.row.ageDays : q.sort === "sold" ? v.sold : q.sort === "videos" ? v.videos : q.sort === "teams" ? (v.videos > 0 ? periodTeams(v).length : 0) : q.sort === "views3" ? (v.views3 ?? null) : v.views);
  const filtered = scope.filter((v) => test(v.flags)).sort((a, b) => {
    const x = val(a), y = val(b);
    if (x === null && y === null) return cmpStr(a.row.code, b.row.code);
    if (x === null) return 1;            // chưa có dữ liệu luôn xuống cuối, kể cả khi sắp xếp tăng dần
    if (y === null) return -1;
    return (x - y) * dirMul || cmpStr(a.row.code, b.row.code);
  });
  const pages = Math.max(1, Math.ceil(filtered.length / q.pageSize));
  const page = Math.min(q.page, pages);
  const sum = (f: (v: View) => number | null | undefined) => filtered.reduce((n, v) => n + (f(v) ?? 0), 0);
  const totals: SpuTotals = {
    stock: sum((v) => v.stock), available: sum((v) => v.available), incoming: sum((v) => v.row.incoming), sold: sum((v) => v.sold), videos: sum((v) => v.videos), views: sum((v) => v.views),
    teams: new Set(filtered.flatMap(periodTeams)).size,
  };
  return { wh, spus: allRows.length, warehouses, cards, statusCounts, total: filtered.length, page, pages, totals, rows: filtered.slice((page - 1) * q.pageSize, page * q.pageSize).map((v) => ({ ...v, row: { ...v.row, teams: periodTeams(v) } })) };
}

// ===== Đường nhanh: hàm SQL sales.spu_query =====
export type SqlRow = {
  code: string; name: string; grp: string; variants?: number; image?: string | null; incoming: number; age_days: number | null; age_approx: boolean;
  sold30: number | null; sl30: number | null; video_teams: string[]; stock: number; available?: number | null; sold: number | null; videos: number; views: number | null; views3?: number | null;   // views3: có từ migration 101
  star: boolean; win: boolean; wt: boolean;
};
type SqlResult = {
  warehouses: string[]; cards: Record<CardKey, Card>; status_counts: Record<StatusFilter, number>; total: number; page: number; pages: number;
  totals: { stock: number; available: number; incoming: number; sold: number; videos: number; views: number; views3?: number; teams: number }; refreshed_at: string | null; rows: SqlRow[];
  wh: string; spus: number; market?: string;   // market: thị trường hàm SQL đã áp dụng (có từ migration 102)
  meta: { sales_source: SpuMeta["salesSource"] | null; sales_lines: number | null; sales_qty: number | null; sales_from: string | null; sales_to: string | null; skus: number | null; team_qty: number | null } | null;
};

export function rpcParams(q: SpuQuery) {
  return {
    today: q.today, days: q.days, end_age: q.endAge, teams: q.teams, wh: q.wh, grp: q.group, words: q.words,
    slow_below: q.rules.sales.slowBelow, normal_below: q.rules.sales.normalBelow,
    status: q.status, sort: q.sort, dir: q.dir, page: q.page, page_size: q.pageSize,
    wt: [...q.win.wt], ord: [...q.win.order], market: marketForSql(q.market),
  };
}

// Dựng View từ một dòng SQL. Phần "gợi ý hành động" dùng CHUNG actionOf với đường cũ. row.vids / row.sales để trống (ngăn video nạp riêng theo từng SPU).
export function viewFromSql(r: SqlRow, q: Pick<SpuQuery, "days" | "rules">): View {
  const sf = saleFlags(r.stock, r.sl30, q.rules);
  const flags: Flags = { active: sf.active, inStock: sf.inStock, hot: sf.hot, normal: sf.normal, other: sf.other, slow: sf.slow, bad: sf.bad, star: r.star, win: r.win, winTraffic: r.wt, hasVideo: r.videos > 0 };
  const row: SpuRow = {
    code: r.code, name: r.name, group: r.grp as Group, variants: r.variants ?? 1, image: r.image ?? null, stockBy: {}, availBy: null, incoming: r.incoming,
    ageDays: r.age_days, ageApprox: r.age_approx, sold30: r.sold30, sales: [], soldBy: {}, vids: [], footage: null, teams: r.video_teams,
  };
  const action = actionOf({ stock: r.stock, inStock: sf.inStock, sl30: r.sl30, sold: r.sold, videos: r.videos, ageDays: r.age_days, footage: null, days: q.days, flags: { star: r.star, win: r.win, winTraffic: r.wt, bad: sf.bad, slow: sf.slow } }, q.rules);
  return { row, stock: r.stock, available: r.available ?? null, sold: r.sold, videos: r.videos, views: r.views, views3: r.views3 ?? null, flags, action };
}

export async function querySql(q: SpuQuery): Promise<Omit<SpuQueryResult, "source"> | null> {
  const { data, error } = await heavyRpc(() => sb.sales().rpc("spu_query", { p: rpcParams(q) }));   // quá thời gian → thử lại 1 lần thay vì rơi ngay sang đường tính trực tiếp (rất nặng)
  if (error || !data) { if (error) console.error("spu_query lỗi:", error.message); return null; }
  const d = data as SqlResult;
  if (q.status === "outstock" && d.status_counts?.outstock === undefined) return null;   // hàm SQL chưa có bộ lọc này (chưa chạy migration 095) → đường tính trực tiếp
  if (!d.refreshed_at && d.total === 0 && d.warehouses.length === 0) return null;   // bảng tổng hợp chưa được làm mới lần nào → dùng đường cũ
  return {
    refreshedAt: d.refreshed_at, wh: d.wh, spus: d.spus,
    meta: { salesSource: d.meta?.sales_source ?? "none", salesLines: d.meta?.sales_lines ?? 0, salesQty: d.meta?.sales_qty ?? 0, salesFrom: d.meta?.sales_from ?? null, salesTo: d.meta?.sales_to ?? null, skus: d.meta?.skus ?? 0, teamQty: d.meta?.team_qty ?? 0 },
    warehouses: d.warehouses, cards: d.cards, statusCounts: d.status_counts, total: d.total, page: d.page, pages: d.pages,
    totals: d.totals, rows: d.rows.map((r) => viewFromSql(r, q)),
    marketApplied: !marketForSql(q.market) || d.market === marketForSql(q.market),
  };
}

export const spuReadMode = () => (process.env.SPU_READ_MODE === "legacy" ? "legacy" : "sql");

export async function querySpu(q: SpuQuery): Promise<SpuQueryResult> {
  if (spuReadMode() === "sql") {
    const r = await querySql(q);
    if (r) return { ...r, source: "sql" };
  }
  const [rows, meta] = await Promise.all([loadSpuRows(), loadSpuMeta()]);
  return { ...queryLegacy(rows, q), meta, source: "legacy", refreshedAt: null };
}

// ===== Ngăn video của một SPU =====
// Đường SQL không mang danh sách video (chỉ số theo ngày × kênh) → nạp video của ĐÚNG SPU đang mở trực tiếp từ bài đăng (1 truy vấn nhỏ).
// Giữ cùng quy tắc với lib/spu-data: chỉ video / reel của kênh đang bật, tuổi tính theo ngày giờ VN, team theo kênh.
export async function loadSpuVids(code: string, today: string, marketSel: Market = "all"): Promise<SpuVid[]> {
  const market = marketForSql(marketSel);
  const [accounts, teams, markets, { data }] = await Promise.all([
    getAccounts(), getTeams(), market ? loadChannelMarkets() : Promise.resolve({} as Record<string, "vn" | "intl">),
    sb.social().from("posts").select("id, channel_id, published_at, views").in("kind", ["video", "reel"]).contains("product_codes", [code])
      .gte("published_at", `${new Date(Date.parse(today) - 400 * 86_400_000).toISOString().slice(0, 10)}T00:00:00+07:00`).order("published_at", { ascending: false }).limit(5000),
  ]);
  const chan = new Map(accounts.map((a) => [a.id, a])), teamName = new Map(teams.map((t) => [t.id, t.name]));
  const vnDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
  const PLATFORM: Record<string, "FB" | "IG" | "TT"> = { facebook: "FB", instagram: "IG", tiktok: "TT" };
  const out: SpuVid[] = [];
  for (const p of data ?? []) {
    const ch = chan.get(p.channel_id as string);
    if (!ch) continue;
    if (market && (markets[p.channel_id as string] ?? "vn") !== market) continue;   // lọc thị trường: ngăn video khớp với số trên bảng
    out.push({
      id: String(p.id), channelId: p.channel_id as string, age: Math.max(0, Math.round((Date.parse(today) - Date.parse(vnDay(p.published_at as string))) / 86_400_000)),
      views: Number(p.views ?? 0), platform: PLATFORM[ch.platform] ?? "FB", channel: ch.name, team: ch.team_id ? teamName.get(ch.team_id) ?? null : null,
    });
  }
  return out;
}

// View của SPU đang mở ngăn video: ưu tiên dòng đã có trong trang hiện tại; không có thì truy vấn riêng theo mã. Đường SQL thì gắn thêm danh sách video.
export async function resolveOpenView(code: string, q: SpuQuery, res: SpuQueryResult): Promise<View | null> {
  let v = res.rows.find((x) => x.row.code === code) ?? null;
  if (!v) {
    const one = await querySpu({ ...q, words: [code.toLowerCase()], status: "all", page: 1, pageSize: 20 });
    v = one.rows.find((x) => x.row.code === code) ?? null;
  }
  if (!v) return null;
  if (res.source === "sql") v = { ...v, row: { ...v.row, vids: await loadSpuVids(code, q.today, q.market ?? "all") } };
  // Video Win theo N ngày đầu kể từ ngày đăng của từng video (lib/video-win-data)
  const first = await loadFirstDays(v.row.vids.map((x) => x.id ?? ""), q.rules.win.traffic.days);
  return { ...v, row: { ...v.row, vids: v.row.vids.map((x) => ({ ...x, first3d: x.id ? first.get(x.id) : undefined })) } };
}
