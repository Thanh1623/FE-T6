import "server-only";
import { unstable_cache } from "next/cache";
import { sb } from "@/lib/supabase/admin";
import { TAG } from "@/lib/cache-tags";
import { saleFlags } from "@/lib/spu-tracking";
import type { SpuRules } from "@/lib/spu-tracking";

// BẢNG 3 của QLHH: Tồn kho & Đẩy hàng theo team (migration 085). Dữ liệu gốc: mọi SPU đang tồn kho (không lấy từ danh sách đã bán) kèm video / lượt xem / SL bán từng team trong kỳ.
export * from "@/lib/team-push-types";
import { UNASSIGNED, type Verdict, type Cls, type Priority, type PushRow, type PushData, type PushRequest, type TeamCell } from "@/lib/team-push-types";

type RawRow = [string, string, number, number, number | null, number | null, [string, number, number, number][]];
const rpcCached = (from: string, to: string) => unstable_cache(async (): Promise<{ spus: RawRow[]; refreshed_at: string | null }> => {
  const { data, error } = await sb.sales().rpc("tr_push", { p_from: from, p_to: to });
  if (error) throw error;
  return data as { spus: RawRow[]; refreshed_at: string | null };
}, ["team-push", "v1", from, to], { tags: [TAG.spuData], revalidate: 21_600 })();

const verdictOf = (videos: number, sold: number): Verdict => (videos === 0 ? (sold > 0 ? "sold_no_video" : "idle") : sold >= videos ? "pushing" : "weak");

export async function loadPush(from: string, to: string, rules: SpuRules): Promise<PushData> {
  const raw = await rpcCached(from, to);
  // Team vận hành video: có ít nhất 1 video trong kỳ (loại team không đăng video như Cửa Hàng, Thương Mại Điện Tử, ADS khỏi cột "chưa đẩy")
  const active = new Set<string>();
  for (const r of raw.spus) for (const [t, v] of r[6]) if (t && v > 0 && t !== "ADS") active.add(t);
  const teams = [...active].sort((a, b) => a.localeCompare(b, "vi"));
  const rows: PushRow[] = raw.spus.map(([code, name, stock, incoming, age, sold30, tm]) => {
    const cells: TeamCell[] = tm.map(([t, v, w, s]) => ({ team: t || UNASSIGNED, videos: v, views: Number(w), sold: s, verdict: verdictOf(v, s) }));
    for (const t of teams) if (!cells.some((c) => c.team === t)) cells.push({ team: t, videos: 0, views: 0, sold: 0, verdict: "idle" });
    const real = cells.filter((c) => active.has(c.team));
    const pushing = real.filter((c) => c.videos > 0).map((c) => c.team);
    const idle = real.filter((c) => c.videos === 0).map((c) => c.team);
    const fl = saleFlags(stock, sold30, rules);
    const cls: Cls = fl.bad ? "bad" : fl.hot ? "hot" : fl.normal ? "normal" : "slow";
    const teamVideos = real.reduce((n, c) => n + c.videos, 0);   // phân nhóm đẩy hàng chỉ theo team vận hành video
    const videos = cells.reduce((n, c) => n + c.videos, 0), views = cells.reduce((n, c) => n + c.views, 0), sold = cells.reduce((n, c) => n + c.sold, 0);   // số liệu: toàn công ty
    // Nhóm hành động + ưu tiên
    let group: PushRow["group"], priority: Priority, why: string;
    if (cls === "bad") { group = "dead"; priority = stock >= 30 || (age ?? 0) >= 90 ? "high" : "mid"; why = `Tồn xấu: còn ${stock}, không bán được trong 30 ngày${age ? `, tồn ${age} ngày` : ""}`; }
    else if (teamVideos === 0) { group = "unpushed"; priority = stock >= 50 ? "high" : "mid"; why = cls === "slow" ? "Có tồn, bán chậm và chưa team nào đăng video" : "Có tồn nhưng chưa team nào đăng video trong kỳ"; }
    else if (cls === "slow") { group = "ineffective"; priority = "mid"; why = `Đã có ${teamVideos} video nhưng bán chậm: xem lại nội dung, giá, mức phù hợp`; }
    else { group = "healthy"; priority = "low"; why = cls === "hot" ? "Đang đẩy và bán tốt: theo dõi tốc độ tiêu thụ, tránh thiếu hàng" : "Đang đẩy, bán ổn"; }
    cells.sort((a, b) => b.videos - a.videos || b.sold - a.sold || a.team.localeCompare(b.team, "vi"));
    return { code, name, stock, incoming, age, sold30, cls, videos, views, sold, teamVideos, pushing, idle, teams: cells, group, priority, why };
  });
  const rank = { high: 0, mid: 1, low: 2 };
  rows.sort((a, b) => rank[a.priority] - rank[b.priority] || b.stock - a.stock || a.code.localeCompare(b.code));
  return { rows, teams, refreshedAt: raw.refreshed_at };
}

// Danh sách yêu cầu đẩy hàng (luôn đọc mới: có thao tác ghi) — team = chỉ yêu cầu của team đó
export async function loadPushRequests(team: string | null): Promise<PushRequest[]> {
  const { data, error } = await sb.sales().rpc("tr_push_requests", { p_team: team });
  if (error) throw error;
  return (data ?? []) as PushRequest[];
}
