"use client";

import { useActionState } from "react";
import PasswordInput from "@/components/PasswordInput";
import { changeOwnPassword, type PwState } from "@/app/(dash)/users/actions";

const input = "w-full rounded-lg border border-line bg-page px-3 py-2 text-sm outline-none focus:border-accent";

export default function ChangePassword() {
  const [state, action, pending] = useActionState<PwState, FormData>(changeOwnPassword, {});
  return (
    <form action={action} className="space-y-2">
      <PasswordInput name="password" required minLength={8} placeholder="Mật khẩu mới (tối thiểu 8 ký tự)" autoComplete="new-password" className={input} />
      <PasswordInput name="confirm" required placeholder="Nhập lại mật khẩu mới" autoComplete="new-password" className={input} />
      {state.error && <p className="text-sm text-bad">⛔ {state.error}</p>}
      {state.ok && <p className="text-sm text-good">✓ Đã đổi mật khẩu</p>}
      <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
        {pending ? "Đang lưu…" : "Đổi mật khẩu"}
      </button>
    </form>
  );
}
