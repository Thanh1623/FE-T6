"use server";

import { attempt } from "@/lib/action-result";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/session";
import { TAG, bust } from "@/lib/cache-tags";
import { ROLES, type Role } from "@/lib/roles";
import { sb, supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseAuth } from "@/lib/supabase/server";

const tempPassword = () => randomBytes(9).toString("base64url");

export type UserFormState = { error?: string; created?: { email: string; password: string } };

export async function createUser(_: UserFormState, form: FormData): Promise<UserFormState> {
  await requireActionUser(["admin"]);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const fullName = String(form.get("full_name") ?? "").trim();
  const role = String(form.get("role") ?? "") as Role;
  const teamId = String(form.get("team_id") ?? "") || null;
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Email không hợp lệ" };
  if (!fullName) return { error: "Thiếu họ tên" };
  if (!ROLES.includes(role)) return { error: "Vai trò không hợp lệ" };

  const password = tempPassword();
  const db = supabaseAdmin();
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return { error: error.message.includes("already") ? "Email này đã có tài khoản" : error.message };

  const row = { id: data.user.id, email, full_name: fullName, role, ...(teamId ? { team_id: teamId } : {}) };
  // Tài khoản do Quản lý tạo = đã duyệt (approved_at, migration 037); chưa chạy migration → thử lại không có cột đó
  let { error: e2 } = await sb.core().from("profiles").insert({ ...row, approved_at: new Date().toISOString() });
  if (e2?.code === "PGRST204" || e2?.code === "42703") ({ error: e2 } = await sb.core().from("profiles").insert(row));
  if (e2) {
    await db.auth.admin.deleteUser(data.user.id); // không để tài khoản mồ côi
    return { error: e2.message };
  }
  bust(TAG.profiles, TAG.teams);
  revalidatePath("/users");
  revalidatePath("/team");
  return { created: { email, password } };
}

export async function updateUser(id: string, patch: { full_name?: string; role?: Role; is_active?: boolean; team_id?: string | null; is_team_lead?: boolean; team2_id?: string | null }) {
  const me = await requireActionUser(["admin"]);
  if (id === me.id && (patch.is_active === false || (patch.role && patch.role !== "admin"))) {
    throw new Error("Không thể tự khoá hoặc tự bỏ quyền Quản lý của chính mình");
  }
  if (patch.full_name !== undefined) {
    const fn = patch.full_name.trim();
    if (!fn) throw new Error("Họ tên không được để trống");
    patch.full_name = fn;
  }
  if (patch.role && !ROLES.includes(patch.role)) throw new Error("Vai trò không hợp lệ");
  if (patch.team2_id !== undefined && patch.team2_id && patch.team2_id === patch.team_id) patch.team2_id = null;   // team 2 trùng team chính → bỏ
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  // Mở khoá / duyệt (is_active = true) → ghi approved_at; chưa chạy migration 037 → thử lại không có cột đó
  let { error } = await sb.core().from("profiles").update({ ...patch, ...(patch.is_active === true ? { approved_at: now } : {}), updated_at: now }).eq("id", id);
  if (error && patch.is_active === true && (error.code === "PGRST204" || error.code === "42703")) ({ error } = await sb.core().from("profiles").update({ ...patch, updated_at: now }).eq("id", id));
  if (error && "team2_id" in patch && /team2_id/.test(error.message)) throw new Error("Chưa chạy migration 100 (Team 2) trong Supabase");
  if (error) throw new Error(error.message);
  if (patch.full_name) {
    await db.auth.admin.updateUserById(id, { user_metadata: { full_name: patch.full_name } }).catch(() => {});
  }
  // Khoá → đăng xuất mọi phiên đang mở
  if (patch.is_active === false) await db.auth.admin.signOut(id).catch(() => {});
  bust(TAG.profiles, TAG.teams);
  revalidatePath("/users");
  revalidatePath("/team");
}

// Từ chối đăng ký: xoá hẳn tài khoản CHỜ DUYỆT (đang khoá + chưa từng đăng nhập) — không xoá được tài khoản đã dùng
export async function rejectUser(id: string) {
  await requireActionUser(["admin"]);
  const db = supabaseAdmin();
  let { data: p } = await sb.core().from("profiles").select("is_active, approved_at").eq("id", id).maybeSingle();
  if (!p) ({ data: p } = (await sb.core().from("profiles").select("is_active").eq("id", id).maybeSingle()) as never);   // chưa chạy migration 037: không có cột approved_at
  const { data: u } = await db.auth.admin.getUserById(id);
  // Chờ duyệt = chưa từng được duyệt (đăng nhập thử không làm mất tư cách chờ duyệt); chưa chạy migration 037 → xét theo "chưa từng đăng nhập"
  const approvedBefore = p && "approved_at" in p ? !!p.approved_at : !!u.user?.last_sign_in_at;
  if (!p || p.is_active || approvedBefore) throw new Error("Chỉ từ chối được tài khoản đang chờ duyệt");
  const { error } = await db.auth.admin.deleteUser(id);   // hồ sơ xoá theo (cascade)
  if (error) throw new Error(error.message);
  bust(TAG.profiles, TAG.teams);
  revalidatePath("/users");
  revalidatePath("/team");
}

// Trả { ok, data } / { error } (xem lib/action-result) — Next giấu lỗi ném ra từ server action nên nút "Cấp lại mật khẩu" từng im lặng khi lỗi
export async function resetPassword(id: string) {
  return attempt(async () => {
    await requireActionUser(["admin"]);
    const password = tempPassword();
    const { error } = await supabaseAdmin().auth.admin.updateUserById(id, { password });
    if (error) throw new Error(error.message);
    return password;
  });
}

export type PwState = { error?: string; ok?: boolean };

// Mỗi người tự đổi mật khẩu của mình
export async function changeOwnPassword(_: PwState, form: FormData): Promise<PwState> {
  await requireActionUser();
  const pw = String(form.get("password") ?? "");
  if (pw.length < 8) return { error: "Mật khẩu tối thiểu 8 ký tự" };
  if (pw !== String(form.get("confirm") ?? "")) return { error: "Hai mật khẩu không khớp" };
  const { error } = await (await supabaseAuth()).auth.updateUser({ password: pw });
  return error ? { error: error.message } : { ok: true };
}

// ---------- Team (dùng chung cho R&D và phân Page sau này) ----------

export async function saveTeam(id: string | null, name: string, isActive = true) {
  await requireActionUser(["admin"]);
  const n = name.trim();
  if (!n) throw new Error("Thiếu tên team");
  const { error } = id
    ? await sb.core().from("teams").update({ name: n, is_active: isActive }).eq("id", id)
    : await sb.core().from("teams").insert({ name: n });
  if (error) throw new Error(error.code === "23505" ? `Team "${n}" đã có` : error.message);
  bust(TAG.profiles, TAG.teams);
  revalidatePath("/users");
  revalidatePath("/team");
}
