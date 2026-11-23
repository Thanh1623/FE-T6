import "server-only";
import { sb } from "@/lib/supabase/admin";
import { inTeam, profileNames, type CurrentUser } from "@/lib/session";

import { HANDOFF_STATUS, type HandoffStatus } from "@/lib/handoff-status";
export { HANDOFF_STATUS, type HandoffStatus };

export type Handoff = {
  id: string; product_id: string; result: "win" | "win_traffic" | "win_sp" | null; status: HandoffStatus;   // result null = giao lên video từ P3, chưa Win
  snapshot: { suggested?: string | null; window?: [string, string]; metrics?: Record<string, number | null>; age?: string } ;
  source_url: string | null; rnd_note: string | null; saobien_note: string | null;
  team_id: string | null; deadline: string | null;   // team Sao Biển được giao + hạn lên video (migration 033); team_id null = chờ phân công
  teamName?: string | null;
  created_at: string; received_at: string | null; done_at: string | null;
  product?: { code: string; name: string; line: string | null; category: string | null; material: string | null; stone: string | null; image_paths: string[]; team_id: string | null; stage: string | null } | null;
  creator?: { full_name: string } | null; assignee?: { full_name: string } | null;
  events?: { id: number; action: string; note: string | null; created_at: string; actor: { full_name: string } | null }[];
};

const SELECT = `*, product:products(code, name, line, category, material, stone, image_paths, team_id, stage),
  events:handoff_events(id, action, note, created_at, actor_id)`;

type Raw = Omit<Handoff, "creator" | "assignee" | "events" | "teamName"> & {
  created_by: string | null; assignee_id: string | null;
  events: { id: number; action: string; note: string | null; created_at: string; actor_id: string | null }[];
};

// Gắn tên người (core.profiles) vào người tạo / người phụ trách / người thao tác
async function withNames(rows: Raw[]): Promise<Handoff[]> {
  const names = await profileNames(rows.flatMap((h) => [h.created_by, h.assignee_id, ...h.events.map((e) => e.actor_id)]));
  const n = (id: string | null) => (id && names.has(id) ? { full_name: names.get(id)! } : null);
  const { data: teams } = await sb.core().from("teams").select("id, name");
  const teamName = new Map((teams ?? []).map((t) => [t.id as string, t.name as string]));
  return rows.map((h) => ({
    ...h, creator: n(h.created_by), assignee: n(h.assignee_id), team_id: h.team_id ?? null, deadline: h.deadline ?? null,   // chưa chạy migration 033 → hai cột này không có
    teamName: h.team_id ? teamName.get(h.team_id) ?? null : null,
    events: h.events.map(({ actor_id, ...e }) => ({ ...e, actor: n(actor_id) })),
  }));
}

export async function listHandoffs() {
  const { data, error } = await sb.rnd().from("handoffs").select(SELECT).order("created_at", { ascending: false });
  if (error) throw error;
  return withNames(data as Raw[]);
}

// Lần chuyển giao gần nhất của 1 mẫu (kể cả đã trả lại)
export async function latestHandoff(productId: string) {
  const { data, error } = await sb.rnd().from("handoffs").select(SELECT)
    .eq("product_id", productId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? (await withNames([data as Raw]))[0] : null;
}

// ---------- Quyền phân công / làm việc ----------
// Phân công: Quản lý, hoặc người của team sở hữu mẫu (team R&D yêu cầu). Mẫu chưa gắn team → vai trò R&D nào cũng giao được.
export const canAssignHandoff = (u: CurrentUser, productTeamId: string | null) =>
  u.role === "admin" || (u.role === "rnd" && (!productTeamId || inTeam(u, productTeamId)));   // team chính hoặc team 2
// Làm việc trên phiếu (tiếp nhận / từ chối / đã lên video / hoàn thành): CHỈ người thuộc đúng team được giao.
// Quản lý không thuộc team nào nên không thao tác thay team (chỉ giao, giao lại, huỷ phiếu chưa tiếp nhận).
export const canWorkHandoff = (u: CurrentUser, teamId: string | null) =>
  u.role === "rnd" && inTeam(u, teamId);
// Thấy phiếu: Quản lý · team yêu cầu · team được giao; người chưa thuộc team nào (tài khoản cũ) thấy hết như trước
export const canSeeHandoff = (u: CurrentUser, h: { team_id: string | null; product?: { team_id: string | null } | null }) =>
  u.role === "admin" || !u.team_id || inTeam(u, h.team_id) || inTeam(u, h.product?.team_id ?? null);
