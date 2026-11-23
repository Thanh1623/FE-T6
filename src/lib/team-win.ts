import "server-only";
import { unstable_cache } from "next/cache";
import { fetchAll, sb } from "@/lib/supabase/admin";
import { TAG } from "@/lib/cache-tags";
import { addDays, todayVN } from "@/lib/data";
import type { KpiRule } from "@/lib/kpi-constants";
import { buildMetrics, checkRules, decideAuto, rulesPass, type AutoResult } from "@/lib/eval/rules";
import { loadSpuRules } from "@/lib/spu-rules";
import { isTestCode } from "@/lib/tags";

// "WIN CỦA TEAM" (trong kỳ đang lọc; hai điều kiện Win Traffic như bộ máy đánh giá — xem dưới): chấm từng SPU bằng ĐÚNG bộ KPI Win và số ngày cửa sổ của bộ máy đánh giá R&D (Cài đặt → Quy tắc Win) nhưng CHỈ tính phần của một team:
//   • video: bài đăng của các kênh thuộc team (social.channels.team_id) ; số bán: đơn của nhân viên thuộc team (sales.tr_lines: bỏ kênh ADS, đơn RD*, đơn huỷ, dòng giá 0; chưa trừ hoàn)
//   • trượt cửa sổ N ngày (N = window_days) qua khoảng ngày đang lọc; mỗi cửa sổ cộng lượt xem / người xem / tương tác của bài team ĐĂNG trong cửa sổ và số bán của team trong cửa sổ
//   • có cửa sổ đạt KPI bán → WIN · không thì có cửa sổ đạt KPI traffic → WIN TRAFFIC · không cửa sổ nào đạt: video đầu của team cho SPU còn chưa đủ N ngày → ĐANG TEST, ngược lại FAIL
// Khác bộ máy R&D (lib/eval/engine.ts): bộ máy chỉ xét cửa sổ N ngày sau video đầu tiên của CẢ CÔNG TY và N ngày gần nhất tới hôm nay; đây là báo cáo theo kỳ nên xét mọi cửa sổ trong kỳ.
// Vì vậy kết quả team có thể khác (cao hoặc thấp hơn) kết quả công ty — đó là mục đích: biết SPU Win ở cấp công ty nhờ team nào.
export type TeamWinRow = { result: AutoResult; qty: number; views: number };

const DAY = 86_400_000;
const vnDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
const daysBetweenIso = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

type Post = { channel_id: string; published_at: string; kind: string; product_codes: string[]; views: number; viewers: number; reactions: number; clicks: number };
type Kpi = { goal_code: string; rules: KpiRule[]; match: "all" | "any"; min_views: number };

async function load(team: string, teamId: string, codes: string[], from: string, to: string): Promise<Record<string, TeamWinRow>> {
  if (!codes.length) return {};
  const [{ data: chans }, { data: setting }, { data: kpis }, salesRes] = await Promise.all([
    sb.social().from("channels").select("id").eq("team_id", teamId),
    sb.core().from("settings").select("value").eq("key", "evaluation").maybeSingle(),
    sb.rnd().from("kpi_templates").select("goal_code, rules, match, min_views").eq("is_default", true).in("goal_code", ["sales", "traffic"]),
    sb.sales().rpc("tr_code_sales", { p_team: team, p_codes: codes }),
  ]);
  if (salesRes.error) throw salesRes.error;
  const salesKpi = (kpis as Kpi[] | null)?.find((k) => k.goal_code === "sales"), trafficKpi = (kpis as Kpi[] | null)?.find((k) => k.goal_code === "traffic");
  const channelIds = (chans ?? []).map((c) => c.id as string);
  if (!salesKpi || !trafficKpi || !channelIds.length) return {};
  const N = Math.max(1, Number((setting?.value as { window_days?: number } | null)?.window_days ?? 14));

  // Bài đăng của team có gắn một trong các mã (đọc theo lô kênh để không vượt giới hạn của bộ lọc)
  const posts: Post[] = [];
  for (let i = 0; i < channelIds.length; i += 100) {
    posts.push(...(await fetchAll<Post>((a, b) => sb.social().from("posts").select("channel_id, published_at, kind, product_codes, views, viewers, reactions, clicks")
      .in("channel_id", channelIds.slice(i, i + 100)).overlaps("product_codes", codes).order("published_at").order("id").range(a, b))));
  }
  const byCode = new Map<string, (Post & { d: string })[]>();
  for (const p of posts) for (const c of p.product_codes) if (codes.includes(c)) byCode.set(c, [...(byCode.get(c) ?? []), { ...p, d: vnDate(p.published_at) }]);
  const sales = new Map<string, Map<string, number>>();
  for (const [code, od, q] of salesRes.data as [string, string, number][]) { const m = sales.get(code) ?? new Map<string, number>(); m.set(od, q); sales.set(code, m); }

  // Hai điều kiện Win Traffic như bộ máy đánh giá (lib/eval/engine.ts): SP test (mã T, mẫu R&D P0–P5) theo KPI Traffic ở Cài đặt trong N ngày;
  // SP đang bán (còn lại) cần `sell.views` lượt xem trong `sell.days` ngày. Win bán hàng của hai nhóm như nhau (KPI bán, cửa sổ N ngày).
  const sell = (await loadSpuRules()).win.traffic;
  const { data: stRows } = await sb.rnd().from("products").select("code, stage").in("code", codes);
  const stageOf = new Map((stRows ?? []).map((r) => [r.code as string, (r.stage as string | null) ?? null]));
  const today = todayVN(), out: Record<string, TeamWinRow> = {};
  const span = daysBetweenIso(from, to);   // kỳ ngắn hơn cửa sổ: cửa sổ bị cắt ở cuối kỳ nên vẫn là một phần của kỳ
  for (const [code, ps] of byCode) {
    const st = stageOf.get(code), isTest = isTestCode(code) || (!!st && st !== "p6");
    const firstVideo = ps.map((p) => p.d).sort()[0], sm = sales.get(code) ?? new Map<string, number>();
    let salesWin = false, trafficWin = false, bestQty = 0, bestViews = 0;
    const metricsAt = (ws: string, len: number) => {
      const we = addDays(ws, len - 1) > to ? to : addDays(ws, len - 1);
      const inWin = ps.filter((p) => p.d >= ws && p.d <= we);
      let qty = 0;
      for (const [od, q] of sm) if (od >= ws && od <= we) qty += q;
      const t = inWin.reduce((n, p) => ({ views: n.views + Number(p.views), viewers: n.viewers + Number(p.viewers), reactions: n.reactions + Number(p.reactions), clicks: n.clicks + Number(p.clicks) }), { views: 0, viewers: 0, reactions: 0, clicks: 0 });
      return { t, qty, m: buildMetrics({ ...t, qty_net: qty, posts: inWin.length, videos: inWin.filter((p) => p.kind === "video" || p.kind === "reel").length }) };
    };
    const trafficLen = isTest ? N : sell.days;
    for (let k = 0; k <= span; k++) {
      const ws = addDays(from, k);
      const a = metricsAt(ws, N), b = trafficLen === N ? a : metricsAt(ws, trafficLen);
      if (rulesPass(checkRules(salesKpi.rules, a.m), salesKpi.match) && a.t.views >= salesKpi.min_views) salesWin = true;
      if (isTest ? rulesPass(checkRules(trafficKpi.rules, b.m), trafficKpi.match) : b.t.views >= sell.views) trafficWin = true;
      bestQty = Math.max(bestQty, a.qty); bestViews = Math.max(bestViews, b.t.views);
    }
    out[code] = { result: decideAuto(salesWin, trafficWin, daysBetweenIso(firstVideo, today) >= trafficLen), qty: bestQty, views: bestViews };
  }
  return out;
}

export const loadTeamWin = (team: string, teamId: string, codes: string[], from: string, to: string) =>
  unstable_cache(() => load(team, teamId, codes, from, to), ["team-win", "v2", team, teamId, from, to, [...codes].sort().join(",")], { tags: [TAG.spuData], revalidate: 21_600 })();
