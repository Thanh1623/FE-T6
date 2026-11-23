import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { TAG } from "@/lib/cache-tags";
import { redirect } from "next/navigation";
import { sb } from "@/lib/supabase/admin";
import { supabaseAuth } from "@/lib/supabase/server";

export type { Role } from "@/lib/roles";
import { normalizeRole, type Role } from "@/lib/roles";
export { ROLE_LABELS, roleLabel } from "@/lib/roles";

export type CurrentUser = {
  id: string; email: string; full_name: string; role: Role;
  team_id: string | null; is_team_lead: boolean;
  team2_id: string | null;   // team thứ 2 (migration 100) — vd trưởng team kinh doanh kiêm duyệt mẫu R&D (team PT Sản Phẩm)
};

// Hồ sơ người dùng lưu tạm tối đa 60 giây (dùng chung mọi máy chủ) — bớt 1 lượt hỏi cơ sở dữ liệu (~0,2–0,3 giây) ở MỖI trang.
// Khoá tài khoản / đổi vai trò / đổi team đều gọi bust(TAG.profiles) (users/actions) nên có hiệu lực ngay, không phải chờ hết hạn.
const profileOf = (uid: string) => unstable_cache(async () => {
  const { data } = await sb.core().from("profiles").select("*").eq("id", uid).maybeSingle();
  return data;
}, ["profile", uid], { tags: [TAG.profiles], revalidate: 60 })();

// Người dùng hiện tại (1 lần/request). null nếu chưa đăng nhập hoặc tài khoản bị khoá.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // getClaims: kiểm chữ ký JWT (ES256) ngay tại máy chủ bằng khoá công khai đã cache — không gọi lên Supabase Auth
  // như getUser (bớt 1 lượt mạng mỗi trang). Khoá / vô hiệu tài khoản vẫn có hiệu lực ngay nhờ kiểm is_active bên dưới.
  const { data } = await (await supabaseAuth()).auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) return null;
  const profile = await profileOf(uid);
  if (!profile?.is_active) return null;
  return {
    id: profile.id, email: profile.email, full_name: profile.full_name, role: normalizeRole(profile.role),
    // Trước migration 015 chưa có 2 cột này
    team_id: profile.team_id ?? null, is_team_lead: !!profile.is_team_lead,
    team2_id: profile.team2_id ?? null,
  };
});

// Trang: chưa đăng nhập → /login; sai vai trò → về trang chủ
export async function requireUser(roles?: Role[]) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/");
  return user;
}

// Server action: ném lỗi thay vì redirect
export async function requireActionUser(roles?: Role[]) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Chưa đăng nhập");
  if (roles && !roles.includes(user.role)) throw new Error("Bạn không có quyền thực hiện thao tác này");
  return user;
}

// Giá vốn / lợi nhuận là dữ liệu nhạy cảm: chỉ Quản lý
export const canSeeProfit = (u: CurrentUser) => u.role === "admin";

// Duyệt mẫu sưu tầm (→ P0) và duyệt Win (P5): Quản lý, hoặc trưởng team của mẫu (team chính HOẶC team 2 của người đó).
// Mẫu chưa gắn team (vd mã tự động từ hashtag): Quản lý hoặc trưởng team bất kỳ.
export const inTeam = (u: Pick<CurrentUser, "team_id" | "team2_id">, teamId: string | null) => !!teamId && (teamId === u.team_id || teamId === u.team2_id);
export const canApprove = (u: CurrentUser, productTeamId: string | null) =>
  u.role === "admin" || (u.is_team_lead && (!productTeamId || inTeam(u, productTeamId)));

// Nhập/sửa mẫu, đặt xưởng, giao việc 3D/media, duyệt 3D/source
export const isRndEditor = (u: CurrentUser) => u.role === "admin" || u.role === "rnd";

// Tên người theo id (core.profiles). Dùng thay cho nối bảng xuyên schema (rnd → core).
export async function profileNames(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  if (!unique.length) return new Map<string, string>();
  const { data } = await sb.core().from("profiles").select("id, full_name").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id as string, p.full_name as string]));
}
