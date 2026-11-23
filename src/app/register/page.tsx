import Link from "next/link";
import Script from "next/script";
import PasswordInput from "@/components/PasswordInput";
import SubmitButton from "@/components/SubmitButton";
import { getTeams } from "@/lib/pipeline";
import { register } from "./actions";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const ERRORS: Record<string, string> = {
  email: "Email không hợp lệ.", name: "Vui lòng nhập họ tên.", team: "Vui lòng chọn team.", password: "Mật khẩu tối thiểu 8 ký tự.", confirm: "Hai mật khẩu không khớp.",
  captcha: "Chưa xác minh CAPTCHA hoặc đã hết hạn — chờ ô xác minh hiện dấu ✓ rồi gửi lại.",
  pending: "Email này ĐÃ đăng ký thành công trước đó và đang chờ Quản lý duyệt — bạn không cần đăng ký lại. Sau khi được duyệt, hãy đăng nhập.",
  exists: "Email này đã có tài khoản — hãy đăng nhập (hoặc liên hệ Quản lý nếu bị khoá).", fail: "Không đăng ký được — thử lại sau.",
};
const input = "mt-2 w-full rounded-lg border border-line bg-page px-3 py-2 outline-none focus:border-accent";

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const { error: raw } = await searchParams;
  const error = Array.isArray(raw) ? raw[0] : raw;
  const teams = await getTeams(true);
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form action={register} className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-sm">
        <h1 className="font-semibold">Đăng ký tài khoản</h1>
        <p className="mt-1 text-sm text-ink-2">Sau khi đăng ký, Quản lý sẽ duyệt và cấp quyền trước khi bạn đăng nhập được.</p>
        <input name="full_name" required autoFocus placeholder="Họ và tên" autoComplete="name" maxLength={80} className={`${input} mt-4`} />
        <select name="team_id" required defaultValue="" aria-label="Team" className={`${input} text-ink-1`}>
          <option value="" disabled>Chọn team của bạn</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input type="email" name="email" required placeholder="Email" autoComplete="email" className={input} />
        <PasswordInput name="password" required minLength={8} placeholder="Mật khẩu (tối thiểu 8 ký tự)" autoComplete="new-password" className={input} />
        <PasswordInput name="confirm" required minLength={8} placeholder="Nhập lại mật khẩu" autoComplete="new-password" className={input} />
        {SITE_KEY && (
          <>
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
            <div className="cf-turnstile mt-3" data-sitekey={SITE_KEY} data-theme="auto" data-language="vi" />
          </>
        )}
        {error && <p className="mt-2 text-sm text-bad">{ERRORS[error] ?? ERRORS.fail}</p>}
        <SubmitButton className="mt-4 w-full rounded-lg bg-accent px-3 py-2 font-medium text-white hover:opacity-90">Đăng ký</SubmitButton>
        <p className="mt-3 text-center text-sm text-ink-2">Đã có tài khoản? <Link href="/login" className="text-accent hover:underline">Đăng nhập</Link></p>
      </form>
    </main>
  );
}
