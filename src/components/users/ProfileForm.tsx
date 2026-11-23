"use client";

import { useState, useTransition } from "react";
import { unwrap } from "@/lib/action-result";
import { signOutEverywhere, updateOwnProfile } from "@/app/(dash)/account/actions";

const input = "w-full rounded-lg border border-line bg-page px-3 py-2 text-sm outline-none focus:border-accent";

// Họ tên tự sửa được; các dòng còn lại chỉ đọc (Quản lý đổi vai trò / team / email ở trang Người dùng)
export function ProfileForm({ fullName, rows }: { fullName: string; rows: { label: string; value: string }[] }) {
  const [name, setName] = useState(fullName);
  const [saved, setSaved] = useState(fullName);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const save = () => start(async () => {
    setMsg(null);
    try { const n = unwrap(await updateOwnProfile(name)); setName(n); setSaved(n); setMsg({ ok: true, text: "Đã lưu" }); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Lỗi" }); }
  });
  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="text-ink-2">Họ và tên</span>
        <input value={name} onChange={(e) => { setName(e.target.value); setMsg(null); }} maxLength={80} className={`${input} mt-1`} />
      </label>
      <dl className="grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-ink-2">{r.label}</dt><dd className="min-w-0 break-words">{r.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || name.trim() === saved || name.trim().length < 2} onClick={save}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">{busy ? "Đang lưu…" : "Lưu thay đổi"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-good" : "text-bad"}`}>{msg.ok ? "✓" : "⛔"} {msg.text}</span>}
      </div>
    </div>
  );
}

export function SignOutAll() {
  const [confirm, setConfirm] = useState(false);
  const [busy, start] = useTransition();
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-2">Dùng khi bạn đăng nhập trên máy lạ hoặc nghi ngờ bị lộ tài khoản. Bạn sẽ phải đăng nhập lại trên mọi thiết bị.</p>
      {!confirm ? (
        <button type="button" onClick={() => setConfirm(true)} className="rounded-lg border border-bad/50 px-4 py-2 text-sm font-medium text-bad hover:bg-bad/10">Đăng xuất khỏi mọi thiết bị</button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={() => start(async () => { await signOutEverywhere(); })} className="rounded-lg bg-bad px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">{busy ? "Đang đăng xuất…" : "Xác nhận đăng xuất"}</button>
          <button type="button" disabled={busy} onClick={() => setConfirm(false)} className="rounded-lg px-4 py-2 text-sm text-ink-2 hover:bg-grid">Huỷ</button>
        </div>
      )}
    </div>
  );
}
