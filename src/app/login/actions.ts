"use server";

import { redirect } from "next/navigation";
import { supabaseAuth } from "@/lib/supabase/server";
import { sb } from "@/lib/supabase/admin";

export async function login(form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const auth = await supabaseAuth();
  // Mã CAPTCHA do widget Turnstile gắn vào form (không có widget → không gửi)
  const captchaToken = String(form.get("cf-turnstile-response") ?? "") || undefined;
  const { data, error } = await auth.auth.signInWithPassword({ email, password, options: { captchaToken } });
  if (error?.message.toLowerCase().includes("captcha")) redirect("/login?error=captcha");
  if (error?.status === 429 || error?.code === "over_request_rate_limit") redirect("/login?error=limit");
  // Dịch vụ đăng nhập của Supabase quá tải / quá thời gian (504 "context deadline exceeded", 5xx): KHÔNG phải sai mật khẩu — báo riêng để người dùng chỉ cần thử lại
  if (error && ((error.status ?? 0) >= 500 || error.code === "request_timeout" || error.code === "unexpected_failure" || /timeout|deadline|fetch failed|network/i.test(error.message))) redirect("/login?error=busy");
  if (error || !data.user) redirect("/login?error=1");

  // Tài khoản bị khoá hoặc chưa có hồ sơ vai trò → không cho vào
  // approved_at (migration 037): có → đã từng được duyệt (nay bị khoá) · null → vẫn đang chờ Quản lý duyệt. Chưa chạy migration → chỉ biết "chưa vào được"
  const first = await sb.core().from("profiles").select("is_active, approved_at").eq("id", data.user.id).maybeSingle();
  const profile = first.error?.code === "42703" ? (await sb.core().from("profiles").select("is_active").eq("id", data.user.id).maybeSingle()).data : first.data;
  if (!profile?.is_active) {
    await auth.auth.signOut();
    redirect(profile && "approved_at" in profile && !profile.approved_at ? "/login?error=pending" : "/login?error=locked");
  }
  redirect("/");
}

export async function logout() {
  await (await supabaseAuth()).auth.signOut();
  redirect("/login");
}
