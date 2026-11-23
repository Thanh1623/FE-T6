"use server";

import { redirect } from "next/navigation";
import { TAG, bust } from "@/lib/cache-tags";
import { sb, supabaseAdmin } from "@/lib/supabase/admin";

// Tự đăng ký: tạo tài khoản ở trạng thái CHỜ DUYỆT (is_active=false, vai trò thấp nhất). Người đăng ký chọn team của mình;
// Quản lý vào /users để mở khoá, chọn vai trò (và đổi team nếu cần). Chưa duyệt thì đăng nhập vẫn báo "locked" (login/actions.ts).
// CAPTCHA: có TURNSTILE_SECRET_KEY thì kiểm tra token của widget (chưa có → bỏ qua, giống trang đăng nhập).
async function captchaOk(token: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body: new URLSearchParams({ secret, response: token }),
    });
    return !!(await res.json()).success;
  } catch { return false; }
}

export async function register(form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const fullName = String(form.get("full_name") ?? "").trim().slice(0, 80);
  const password = String(form.get("password") ?? "");
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 120) redirect("/register?error=email");
  if (!fullName) redirect("/register?error=name");
  const teamId = String(form.get("team_id") ?? "");
  const { data: team } = /^[0-9a-f-]{36}$/i.test(teamId) ? await sb.core().from("teams").select("id").eq("id", teamId).eq("is_active", true).maybeSingle() : { data: null };
  if (!team) redirect("/register?error=team");   // chỉ nhận team đang hoạt động (không tin giá trị gửi lên)
  if (password.length < 8) redirect("/register?error=password");
  if (password !== String(form.get("confirm") ?? "")) redirect("/register?error=confirm");
  if (!(await captchaOk(String(form.get("cf-turnstile-response") ?? "")))) redirect("/register?error=captcha");

  const db = supabaseAdmin();
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error) {
    if (!error.message.toLowerCase().includes("already")) redirect("/register?error=fail");
    // Đăng ký lặp vẫn báo lỗi, nhưng nói rõ nếu lần trước đã thành công và đang chờ duyệt (tránh người dùng tưởng chưa đăng ký được)
    // "Chờ duyệt" = chưa từng được duyệt (approved_at, migration 037) — đăng nhập thử không làm mất trạng thái này; chưa chạy migration thì xét theo "chưa từng đăng nhập"
    const withCol = await sb.core().from("profiles").select("id, is_active, approved_at").eq("email", email).maybeSingle();
    const old = withCol.error ? (await sb.core().from("profiles").select("id, is_active").eq("email", email).maybeSingle()).data as { id: string; is_active: boolean; approved_at?: undefined } | null : withCol.data;
    if (old && !old.is_active) {
      const never = old.approved_at !== undefined ? !old.approved_at : !(await db.auth.admin.getUserById(old.id)).data.user?.last_sign_in_at;
      if (never) redirect("/register?error=pending");
    }
    redirect("/register?error=exists");
  }

  const { error: e2 } = await sb.core().from("profiles").insert({ id: data.user.id, email, full_name: fullName, role: "media", is_active: false, team_id: team.id });
  if (e2) {
    await db.auth.admin.deleteUser(data.user.id);   // không để tài khoản mồ côi
    redirect("/register?error=fail");
  }
  bust(TAG.profiles);
  redirect("/login?registered=1");
}
