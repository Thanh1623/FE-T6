/** Worker không có cookie — stub đủ export để bundle sync. */

import { normalizeRole, ROLE_LABELS, roleLabel, type Role } from "../../../src/lib/roles";

export type { Role };
export { ROLE_LABELS, roleLabel, normalizeRole };

export type CurrentUser = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  team_id: string | null;
  is_team_lead: boolean;
  team2_id: string | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  return null;
}

export async function requireActionUser(_roles: Role[]): Promise<CurrentUser> {
  throw new Error("requireActionUser không khả dụng trên worker");
}

export function isRndEditor(_u: CurrentUser): boolean {
  return false;
}

export function canApprove(_u: CurrentUser): boolean {
  return false;
}

export function canSeeProfit(_u: CurrentUser): boolean {
  return false;
}

export function inTeam(_u: CurrentUser, _teamId: string): boolean {
  return false;
}

export async function profileNames(_ids: string[]): Promise<Record<string, string>> {
  return {};
}