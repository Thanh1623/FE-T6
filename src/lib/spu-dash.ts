import "server-only";
import { unstable_cache } from "next/cache";
import { heavyRpc } from "@/lib/db-gate";
import { sb } from "@/lib/supabase/admin";
import { TAG } from "@/lib/cache-tags";
import { getAccounts } from "@/lib/data";
import { loadSpuRows } from "@/lib/spu-data";
import { spuReadMode, viewFromSql, type SqlRow } from "@/lib/spu-query";
import { viewOf, type SpuRow, type SpuRules, type View, type WinFlags } from "@/lib/spu-tracking";
import { spuVideos, type SpuVideo } from "@/lib/spu-videos";
import type { StockStatus } from "@/lib/spu-win";

// SỐ LIỆU SPU CHO DASHBOARD "Báo cáo đẩy tồn" — xem docs/KIEN-TRUC-TONG-HOP-SPU.md (đọc trước khi sửa).
// Như lib/spu-query.ts: hai đường cho CÙNG kết quả — "sql" (hàm sales.spu_dash, migration 061) và "legacy" (tính trực tiếp từ loadSpuRows(), nguồn chân lý để đối chiếu).

export type DashParams = {
  today: string; days: number; endAge: number;
  teams: string[];                 // tên team đang lọc
  pageIds: string[] | null;        // Page đang lọc (null = toàn hệ thống)
  rules: SpuRules; limit: number;  // limit = số video hiển thị ở cảnh báo "Video tiềm năng"
  win: WinFlags;                   // tập mã đang Win Traffic / Win Đơn hàng (CUỐN CHIẾU, lib/spu-winflags.ts → loadRollingWin); Ngôi sao = đạt cả hai
};
export const DASH_GROUPS = [["SPU Active", "var(--ink-1)"], ["SPU còn hàng", "var(--good)"], ["SPU bán chậm", "var(--warn-ink)"], ["SPU tồn xấu", "var(--bad)"], ["SPU bán chạy", "var(--star)"]] as const;
export type DashSpu = {
  source: "sql" | "legacy";
  s0: { active: number; hot: number; normal: number; slow: number; bad: number; noStockSold: number };   // thẻ S0 (toàn công ty)
  s1: { total: number };                                                                                // S1 = SPU Active có video trong kỳ (theo team / Page đang lọc)
  winNow: { wt: number; win: number; star: number };                                                    // S2–S4 = SPU Active ĐANG Win Traffic / Win Đơn hàng / Ngôi sao (cuốn chiếu, không phụ thuộc kỳ lọc)
  s1Codes: Set<string>;                                                                                 // mã của S1
  videoCats: { name: string; posted: number }[];                                                        // video theo dòng sản phẩm
  videoGroups: { label: string; tone: string; spu: number; withVideo: number; posted: number }[];       // video theo trạng thái tồn kho
  stockStatus: Map<string, StockStatus>;                                                                // SPU → bad / slow / hot (theo bộ lọc team)
  activeCodes: Set<string>;                                                                             // SPU Active toàn công ty
  alertViews: View[];                                                                                   // SPU cho các tab cảnh báo (toàn công ty trong kỳ; có lọc team thì chỉ SPU team đã đăng video)
  vids: { total: number; items: { x: SpuVideo; code: string }[] };                                      // video tiềm năng: tổng số + top theo lượt xem
};

// ===== Đường cũ =====
export function dashLegacy(rows: SpuRow[], q: DashParams): Omit<DashSpu, "source"> {
  const { days, endAge, teams, rules: R, win } = q;
  const period = rows.map((r) => viewOf(r, { wh: null, days, endAge, rules: R, teams, pageIds: q.pageIds ?? undefined, win }));
  const company = rows.map((r) => viewOf(r, { wh: null, days, endAge, rules: R, win }));
  const stockStatus = new Map<string, StockStatus>();
  for (const v of period) { if (v.flags.bad) stockStatus.set(v.row.code, "bad"); else if (v.flags.slow) stockStatus.set(v.row.code, "slow"); else if (v.flags.hot) stockStatus.set(v.row.code, "hot"); }
  const videoCats = [...period.reduce((m, v) => m.set(v.row.group, (m.get(v.row.group) ?? 0) + v.videos), new Map<string, number>())]
    .map(([name, posted]) => ({ name, posted })).filter((c) => c.posted > 0).sort((a, b) => b.posted - a.posted || (a.name < b.name ? -1 : 1));
  const picks: ((v: View) => boolean)[] = [(v) => v.flags.active, (v) => v.flags.inStock, (v) => v.flags.slow, (v) => v.flags.bad, (v) => v.flags.hot];
  const videoGroups = DASH_GROUPS.map(([label, tone], i) => {
    const inGroup = new Set(company.filter(picks[i]).map((v) => v.row.code));
    const vs = period.filter((v) => inGroup.has(v.row.code));
    return { label, tone, spu: inGroup.size, withVideo: vs.filter((v) => v.videos > 0).length, posted: vs.reduce((n, v) => n + v.videos, 0) };
  });
  const act = company.filter((v) => v.flags.active);
  const s0 = { active: act.length, hot: act.filter((v) => v.flags.hot).length, normal: act.filter((v) => v.flags.normal).length, slow: act.filter((v) => v.flags.slow).length, bad: act.filter((v) => v.flags.bad).length, noStockSold: act.filter((v) => !v.flags.inStock).length };
  // S1: SPU Active có video trong kỳ (video theo team / Page đang lọc). S2–S4: SPU Active ĐANG Win (cờ cuốn chiếu, không theo kỳ)
  const s1Codes = new Set(period.filter((v, i) => company[i].flags.active && v.videos > 0).map((v) => v.row.code));
  const s1 = { total: s1Codes.size };
  const winNow = { wt: act.filter((v) => v.flags.winTraffic).length, win: act.filter((v) => v.flags.win).length, star: act.filter((v) => v.flags.star).length };
  const alertViews = company.filter((v) => !teams.length || v.row.teams.some((n) => teams.includes(n)));
  const vids = alertViews.filter((v) => v.flags.inStock && v.videos > 0)
    .flatMap((v) => spuVideos(v.row, { days, endAge }, q.today).map((x) => ({ x, code: v.row.code }))).sort((a, b) => b.x.views - a.x.views);
  return { s0, s1, winNow, s1Codes, videoCats, videoGroups, stockStatus, activeCodes: new Set(act.map((v) => v.row.code)), alertViews, vids: { total: vids.length, items: vids.slice(0, q.limit) } };
}

// ===== Đường nhanh: hàm SQL sales.spu_dash =====
type SqlDash = {
  s0: { active: number; hot: number; normal: number; slow: number; bad: number; no_stock_sold: number };
  s1: { total: number }; win: { wt: number; win: number; star: number }; s1_codes: string[];
  cats: { name: string; posted: number }[]; groups: { label: string; spu: number; with_video: number; posted: number }[];
  stock_status: { bad: string[]; slow: string[]; hot: string[] }; active_codes: string[];
  alerts: { vids_total: number; top_videos: { id: string; channel_id: string; published_at: string; views: number; code: string }[]; rows: SqlRow[] };
  refreshed_at: string | null;
};

export const dashRpcParams = (q: DashParams) => ({
  today: q.today, days: q.days, end_age: q.endAge, teams: q.teams, channels: q.pageIds, slow_below: q.rules.sales.slowBelow, normal_below: q.rules.sales.normalBelow, alert_limit: q.limit,
  wt: [...q.win.wt], ord: [...q.win.order],
});

export async function dashFromSql(d: SqlDash, q: DashParams): Promise<Omit<DashSpu, "source">> {
  const accounts = await getAccounts();
  const chan = new Map(accounts.map((a) => [a.id, a]));
  const vnDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
  const PLATFORM: Record<string, "FB" | "IG" | "TT"> = { facebook: "FB", instagram: "IG", tiktok: "TT" };
  const items = d.alerts.top_videos.map((t) => {
    const ch = chan.get(t.channel_id);
    return { code: t.code, x: { id: t.id, title: "(không có nội dung)", platform: ch ? PLATFORM[ch.platform] ?? "FB" : "FB", channel: ch?.name ?? "—", team: null, date: vnDay(t.published_at), views: Number(t.views), url: null, thumb: null } satisfies SpuVideo };
  });
  const stockStatus = new Map<string, StockStatus>();
  for (const k of ["hot", "slow", "bad"] as const) for (const c of d.stock_status[k]) stockStatus.set(c, k);
  const tones = new Map<string, string>(DASH_GROUPS);
  return {
    s0: { active: d.s0.active, hot: d.s0.hot, normal: d.s0.normal, slow: d.s0.slow, bad: d.s0.bad, noStockSold: d.s0.no_stock_sold },
    s1: d.s1, winNow: d.win, s1Codes: new Set(d.s1_codes),
    videoCats: d.cats, videoGroups: d.groups.map((g) => ({ label: g.label, tone: tones.get(g.label) ?? "var(--ink-1)", spu: g.spu, withVideo: g.with_video, posted: g.posted })),
    stockStatus, activeCodes: new Set(d.active_codes),
    alertViews: d.alerts.rows.map((r) => viewFromSql(r, { days: q.days, rules: q.rules })),
    vids: { total: Number(d.alerts.vids_total), items },
  };
}

// Kết quả hàm SQL lưu đệm 5 phút theo bộ tham số (xoá khi đồng bộ / nhập file / làm mới bảng tổng hợp: TAG.spuData) — mở lại Dashboard không phải chờ tính lại
const dashRpc = unstable_cache(async (p: unknown) => {
  const { data, error } = await heavyRpc(() => sb.sales().rpc("spu_dash", { p }));
  if (error) throw new Error(error.message);
  return data as unknown;
}, ["spu-dash-rpc", "v1"], { tags: [TAG.spuData], revalidate: 21_600 });

// Làm nóng đệm của hàm SQL spu_dash (cùng khoá với loadDashSpu: cùng tham số) — CHỈ đường SQL, lỗi thì bỏ qua; KHÔNG BAO GIỜ rơi sang đường tính trực tiếp (rất nặng) khi chỉ để làm nóng
export async function warmDashSpu(q: DashParams): Promise<void> {
  try { await dashRpc(dashRpcParams(q)); } catch { /* không làm hỏng lần làm mới */ }
}

export async function loadDashSpu(q: DashParams): Promise<DashSpu> {
  if (spuReadMode() === "sql") {
    let data: unknown = null, error: { message: string } | null = null;
    try { data = await dashRpc(dashRpcParams(q)); } catch (e) { error = { message: e instanceof Error ? e.message : String(e) }; }
    if (!error && data && (data as SqlDash).s0 && (data as SqlDash).refreshed_at) return { ...(await dashFromSql(data as SqlDash, q)), source: "sql" };
    if (error) console.error("spu_dash lỗi:", error.message);
  }
  return { ...dashLegacy(await loadSpuRows(), q), source: "legacy" };
}
