import "server-only";
import { sb } from "@/lib/supabase/admin";
import { scopePageIds, type Filters } from "@/lib/data";
import type { CurrentUser } from "@/lib/session";

// Phạm vi Page theo team — luôn tính ở máy chủ (không tin tham số URL).
//   Quản lý: thấy mọi Page (limited = false)
//   R&D (đã gộp Sao Biển — mỗi người thuộc 1 team) và vai trò khác: chỉ thấy Page của team mình; chưa có team → không thấy Page nào
//   (phần R&D — traffic theo sản phẩm — vẫn toàn công ty, không đi qua phạm vi này)
export type TeamScope = { limited: boolean; teamId: string | null; teamName: string | null; channelIds: string[] };

export const isTeamLimited = (u: CurrentUser) => u.role !== "admin";

export async function getTeamScope(user: CurrentUser): Promise<TeamScope> {
  if (!isTeamLimited(user)) return { limited: false, teamId: user.team_id, teamName: null, channelIds: [] };
  if (!user.team_id) return { limited: true, teamId: null, teamName: null, channelIds: [] };
  const [{ data: ch }, { data: team }] = await Promise.all([
    sb.social().from("channels").select("id").eq("team_id", user.team_id).eq("is_active", true),
    sb.core().from("teams").select("name").eq("id", user.team_id).maybeSingle(),
  ]);
  return { limited: true, teamId: user.team_id, teamName: (team?.name as string) ?? null, channelIds: (ch ?? []).map((c) => c.id as string) };
}

// Danh sách Page được phép xem (giữ thứ tự gốc)
export const limitAccounts = <T extends { id: string }>(accounts: T[], scope: TeamScope) =>
  scope.limited ? accounts.filter((a) => scope.channelIds.includes(a.id)) : accounts;

// Page dùng để lọc số bán: người bị giới hạn KHÔNG BAO GIỜ được "toàn hệ thống" (null) — luôn là danh sách Page của team
export function scopedPageIds(f: Filters, accounts: { id: string }[], scope: TeamScope): string[] | null {
  const picked = scopePageIds(f, accounts.map((a) => a.id));
  if (!scope.limited) return picked;
  const mine = new Set(accounts.map((a) => a.id));
  return (picked ?? [...mine]).filter((id) => mine.has(id));
}
