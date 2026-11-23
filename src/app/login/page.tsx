import Link from "next/link";
import Script from "next/script";
import PasswordInput from "@/components/PasswordInput";
import SubmitButton from "@/components/SubmitButton";
import { login } from "./actions";

// CAPTCHA Cloudflare Turnstile — chỉ bật khi có NEXT_PUBLIC_TURNSTILE_SITE_KEY (chưa có → đăng nhập như cũ).
// Widget tự thêm ô ẩn "cf-turnstile-response" vào form; server gửi mã đó cho Supabase kiểm tra.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, registered } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form action={login} className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-sm">
        {registered && (
          <div role="status" className="mb-4 rounded-lg bg-good/10 px-3 py-2 text-sm text-good">
            ✓ <b>Đăng ký thành công.</b> Tài khoản đang chờ Quản lý duyệt — sau khi được duyệt bạn đăng nhập tại đây.
          </div>
        )}
        <h1 className="font-semibold">R&amp;D · Nghiên cứu và phát triển sản phẩm</h1>
        <p className="mt-1 text-sm text-ink-2">Đăng nhập bằng tài khoản đã được Quản lý duyệt.</p>
        <input type="email" name="email" required autoFocus placeholder="Email" autoComplete="email"
          className="mt-4 w-full rounded-lg border border-line bg-page px-3 py-2 outline-none focus:border-accent" />
        <PasswordInput name="password" required placeholder="Mật khẩu" autoComplete="current-password"
          className="mt-2 w-full rounded-lg border border-line bg-page px-3 py-2 outline-none focus:border-accent" />
        {SITE_KEY && (
          <>
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
            <div className="cf-turnstile mt-3" data-sitekey={SITE_KEY} data-theme="auto" data-language="vi" />
          </>
        )}
                {error && (
          <p className="mt-2 text-sm text-bad">
            {error === "pending" ? "Tài khoản đang chờ Quản lý duyệt — sau khi được duyệt bạn đăng nhập lại."
              : error === "locked" ? "Tài khoản đã bị khoá hoặc chưa có hồ sơ — liên hệ Quản lý."
              : error === "captcha" ? "Chưa xác minh CAPTCHA hoặc đã hết hạn — chờ ô xác minh hiện dấu ✓ rồi đăng nhập lại."
              : error === "limit" ? "Đăng nhập quá nhiều lần — thử lại sau vài phút."
              : error === "busy" ? "Hệ thống đăng nhập đang bận (quá thời gian chờ) — mật khẩu của bạn không sai. Chờ vài giây, đợi ô xác minh hiện ✓ rồi bấm Đăng nhập lại."
              : "Sai email hoặc mật khẩu."}
          </p>
        )}
        <SubmitButton className="mt-4 w-full rounded-lg bg-accent px-3 py-2 font-medium text-white hover:opacity-90">Đăng nhập</SubmitButton>
        <p className="mt-3 text-center text-sm text-ink-2">Chưa có tài khoản? <Link href="/register" className="text-accent hover:underline">Đăng ký</Link></p>
      </form>
    </main>
  );
}
