import "server-only";
import { sb } from "@/lib/supabase/admin";
import { flagged } from "@/lib/rnd-options";
import { orderMakeCost, orderOtherCost } from "@/lib/order-cost";
import { getRndOptions, getTeams, inVnRange, type PipelineItem } from "@/lib/pipeline";

// Báo cáo chi phí test — mẫu mới trong quy trình R&D (kể cả mẫu chưa được cấp mã SPU): mẫu R&D sưu tầm và mẫu Media test đã được đưa vào R&D (không tính mẫu cũ trong kho).
// Kỳ = mẫu được DUYỆT (P1) trong kỳ — cùng quy tắc với thẻ P1–P6 của Dashboard (mẫu sưu tầm từ trước, duyệt trong kỳ vẫn tính cho kỳ này).
// Chi phí của mỗi mẫu = TOÀN BỘ đơn đặt mẫu (Chi phí SX × số lượng, trừ đơn huỷ, bất kể ngày đặt) + chi phí khác + Ads + quay mẫu (nhập tay).
export type CostRow = {
  id: string; code: string | null; name: string; team: string | null; source: "R&D" | "Media test";
  sample: number; other: number; ads: number; video: number; total: number; result: "win" | "fail" | "testing";
};
export type CostGroup = { name: string; samples: number; total: number; wins: number; fails: number; perWin: number | null; perFail: number | null };
export type TestCostReport = {
  totals: { total: number; samples: number; perSample: number | null; perWin: number | null; wasted: number; wastedPct: number | null; sample: number; other: number; ads: number; video: number };
  byTeam: CostGroup[]; bySource: CostGroup[]; rows: CostRow[];
  missingCost: { id: string; st_code: string | null; code: string | null; name: string }[];   // mẫu có đơn ĐÃ HOÀN THÀNH trong kỳ nhưng chưa nhập Chi phí SX (đang bị tính 0đ)
};

export async function testCostReport(f: { from: string; to: string; teams: string[] }): Promise<TestCostReport> {
  let q = sb.rnd().from("products").select("*").not("stage", "is", null);
  if (f.teams.length) q = q.in("team_id", f.teams);
  const { data, error } = await q;
  if (error) throw error;
  const all = ((data ?? []) as (PipelineItem & { video_cost?: number | null })[]);   // gồm cả mẫu CHƯA được cấp mã SPU: tiền đặt mẫu đã chi thật nên vẫn tính (bảng hiện tên mẫu, cột SPU để "—")
  const ids = all.map((p) => p.id);
  const [{ data: orders }, { data: evs }, options, teams, { data: p1ev }] = await Promise.all([
    ids.length ? sb.rnd().from("sample_orders").select("product_id, cost, cost_other, qty, status, ordered_at").in("product_id", ids) : { data: [] },
    ids.length ? sb.rnd().from("evaluations").select("code, result").in("code", all.map((p) => p.code).filter(Boolean) as string[]) : { data: [] },
    getRndOptions(), getTeams(),
    // Ngày duyệt: approved_at; mẫu cũ thiếu thì lấy lần đầu lên P1 trong nhật ký
    ids.length ? sb.rnd().from("product_events").select("product_id, changes, created_at").eq("action", "stage_changed").in("product_id", ids) : { data: [] },
  ]);
  const p1At = new Map<string, string>();
  for (const e of p1ev ?? []) {
    const st = (e.changes as { stage?: [string, string] } | null)?.stage;
    if (st?.[1] === "p1" && (!p1At.has(e.product_id as string) || (e.created_at as string) < p1At.get(e.product_id as string)!)) p1At.set(e.product_id as string, e.created_at as string);
  }
  const approvedIn = (p: PipelineItem) => { const d = p.approved_at ?? p1At.get(p.id); return !!d && p.stage !== "p0" && inVnRange(d, f.from, f.to); };
  const cancelled = flagged(options.order_status, "cancel"), doneSt = flagged(options.order_status, "done");
  const noCost = new Set<string>();
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const res = new Map((evs ?? []).map((e) => [e.code as string, e.result as string]));
  const cost = new Map<string, { sample: number; other: number }>();
  // Mọi đơn (bỏ đơn huỷ) của mẫu; mẫu vào báo cáo theo NGÀY DUYỆT (xem đầu tệp). Chi phí SX = đơn giá × số lượng (lib/order-cost).
  for (const o of orders ?? []) {
    if (cancelled.includes(o.status as string)) continue;
    if ((doneSt.includes(o.status as string) || o.status === "Hoàn thành") && !(Number(o.cost) > 0)) noCost.add(o.product_id as string);
    const c = cost.get(o.product_id as string) ?? { sample: 0, other: 0 };
    c.sample += orderMakeCost(o); c.other += orderOtherCost(o);
    cost.set(o.product_id as string, c);
  }
  // Mẫu vào báo cáo: có đơn đặt trong kỳ; mẫu KHÔNG có đơn nào nhưng có chi phí Ads / quay nhập tay thì xét theo ngày vào luồng R&D (không có ngày đặt để xét)
  // Mẫu vào báo cáo: được duyệt trong kỳ VÀ đã phát sinh chi phí (có đơn đặt mẫu, hoặc có Ads / quay mẫu nhập tay)
  const items = all.filter((p) => approvedIn(p) && (cost.has(p.id) || Number(p.ads_cost ?? 0) > 0 || Number(p.video_cost ?? 0) > 0));

  const rows: CostRow[] = items.map((p) => {
    const c = cost.get(p.id) ?? { sample: 0, other: 0 }, r = p.code ? res.get(p.code) : undefined;
    const result: CostRow["result"] = ["win", "win_traffic", "win_sp"].includes(r ?? "") ? "win" : r === "fail" || p.killed_at ? "fail" : "testing";
    const ads = Number(p.ads_cost ?? 0), video = Number(p.video_cost ?? 0);
    return { id: p.id, code: p.code, name: p.name, team: p.team_id ? teamName.get(p.team_id) ?? null : null, source: (p.entry_source === "media" ? "Media test" : "R&D") as CostRow["source"],
      sample: c.sample, other: c.other, ads, video, total: c.sample + c.other + ads + video, result };
  }).sort((a, b) => b.total - a.total);

  const group = (name: string, rs: CostRow[]): CostGroup => {
    const total = rs.reduce((n, r) => n + r.total, 0), wins = rs.filter((r) => r.result === "win").length, fails = rs.filter((r) => r.result === "fail").length;
    const failCost = rs.filter((r) => r.result === "fail").reduce((n, r) => n + r.total, 0);
    return { name, samples: rs.length, total, wins, fails, perWin: wins ? total / wins : null, perFail: fails ? failCost / fails : null };
  };
  const by = (key: (r: CostRow) => string) => {
    const m = new Map<string, CostRow[]>();
    for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
    return [...m].map(([k, rs]) => group(k, rs)).sort((a, b) => b.total - a.total);
  };
  const sum = (k: "sample" | "other" | "ads" | "video") => rows.reduce((n, r) => n + r[k], 0);
  const total = rows.reduce((n, r) => n + r.total, 0), wins = rows.filter((r) => r.result === "win").length;
  const wasted = rows.filter((r) => r.result === "fail").reduce((n, r) => n + r.total, 0);
  return {
    totals: { total, samples: rows.length, perSample: rows.length ? total / rows.length : null, perWin: wins ? total / wins : null, wasted, wastedPct: total ? (wasted / total) * 100 : null,
      sample: sum("sample"), other: sum("other"), ads: sum("ads"), video: sum("video") },
    byTeam: by((r) => r.team ?? "Chưa gắn team"), bySource: by((r) => r.source), rows,
    missingCost: items.filter((p) => noCost.has(p.id)).map((p) => ({ id: p.id, st_code: p.st_code ?? null, code: p.code, name: p.name })),
  };
}
