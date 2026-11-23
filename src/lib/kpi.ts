import "server-only";
import { sb } from "@/lib/supabase/admin";
import { profileNames } from "@/lib/session";
import type { KpiRule, SalesScope, TestResult } from "@/lib/kpi-constants";

export type Goal = { code: string; name: string; description: string | null; win_result: "win" | "win_traffic"; sort_order: number; is_active: boolean };

export type Template = {
  id: string; name: string; goal_code: string; line: string | null; campaign: string | null;
  rules: KpiRule[]; match: "all" | "any"; min_days: number; min_views: number; duration_days: number;
  is_default: boolean; is_active: boolean; updated_at: string;
};

export type Session = {
  id: string; product_id: string; goal_code: string; template_id: string | null; campaign: string | null;
  start_date: string; end_date: string; sales_scope: SalesScope; page_ids: string[]; channels: string[];
  rules: KpiRule[]; match: "all" | "any"; min_days: number; min_views: number;
  status: "running" | "ended"; ended_at: string | null; note: string | null; created_at: string;
  creator?: { full_name: string } | null;
  result: TestResult | null;      // kết luận R&D gắn với phiên (rnd.decisions.session_id), mới nhất
};

export async function listGoals(includeInactive = false) {
  let q = sb.rnd().from("goals").select("*").order("sort_order").order("code");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data as Goal[];
}

export async function listTemplates(includeInactive = false) {
  let q = sb.rnd().from("kpi_templates")
    .select("id, name, goal_code, line, campaign, rules, match, min_days, min_views, duration_days, is_default, is_active, updated_at")
    .order("goal_code").order("is_default", { ascending: false }).order("name");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return data as Template[];
}

export { suggestTemplate } from "@/lib/kpi-constants";

type SessionRaw = Omit<Session, "result"> & { decisions: { result: TestResult; decided_at: string }[] };
const withResult = (s: SessionRaw): Session => {
  const { decisions, ...rest } = s;
  const latest = [...(decisions ?? [])].sort((a, b) => b.decided_at.localeCompare(a.decided_at))[0];
  return { ...rest, result: latest?.result ?? null };
};

export async function listSessions(productId: string) {
  const { data, error } = await sb.rnd().from("test_sessions")
    .select("*, decisions(result, decided_at)")
    .eq("product_id", productId).order("start_date", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data as (SessionRaw & { created_by: string | null })[];
  const names = await profileNames(rows.map((r) => r.created_by));
  return rows.map((r) => ({ ...withResult(r), creator: r.created_by && names.has(r.created_by) ? { full_name: names.get(r.created_by)! } : null }));
}

// Phiên gần nhất của mỗi mẫu (đang chạy hoặc đã kết thúc) — cho thẻ danh sách
export async function latestSessions(productIds: string[]) {
  if (!productIds.length) return {} as Record<string, Session>;
  const { data, error } = await sb.rnd().from("test_sessions").select("*, decisions(result, decided_at)")
    .in("product_id", productIds).order("created_at", { ascending: false });
  if (error) throw error;
  const out: Record<string, Session> = {};
  for (const s of (data as SessionRaw[]).map(withResult)) out[s.product_id] ??= s;
  return out;
}
