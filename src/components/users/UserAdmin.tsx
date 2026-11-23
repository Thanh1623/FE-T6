"use client";

import { useActionState, useState, useTransition } from "react";
import { createUser, rejectUser, resetPassword, updateUser, type UserFormState } from "@/app/(dash)/users/actions";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import Paged from "@/components/Paged";
import { unwrap } from "@/lib/action-result";

type User = {
  id: string; email: string; full_name: string; role: Role; is_active: boolean; last_sign_in_at: string | null;
  approved_at?: string | null;   // migration 037: null = chưa được duyệt lần nào; undefined = chưa chạy migration
  team_id: string | null; is_team_lead: boolean; created_at?: string; team2_id?: string | null;
};
type Team = { id: string; name: string; is_active: boolean };

const input = "rounded-lg border border-line bg-page px-3 py-2 text-sm outline-none focus:border-accent";

function ResetResult({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { void navigator.clipboard?.writeText(password).then(() => setCopied(true), () => {}); };
  return (
    <div className="space-y-2 text-sm">
      <div className="font-semibold">Đã cấp lại mật khẩu cho {email}</div>
      <div className="flex items-center gap-2">
        <code className="select-all rounded bg-warn-bg px-2.5 py-1 font-mono text-base text-warn-ink">{password}</code>
        <button type="button" onClick={copy} className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-grid">{copied ? "✓ Đã chép" : "Sao chép"}</button>
        <button type="button" onClick={onClose} className="ml-auto text-xs text-ink-2 underline">Đóng</button>
      </div>
      <div className="text-xs text-ink-2">Chỉ hiện 1 lần. Gửi cho người dùng và nhắc họ đổi mật khẩu sau khi đăng nhập.</div>
    </div>
  );
}

function TempPassword({ email, password }: { email: string; password: string }) {
  return (
    <div className="rounded-lg bg-warn-bg px-4 py-3 text-sm text-warn-ink">
      Mật khẩu tạm cho <b>{email}</b>: <code className="select-all rounded bg-surface px-2 py-0.5 text-ink-1">{password}</code>
      <div className="mt-1 text-xs">Chỉ hiện 1 lần — gửi cho người dùng và nhắc họ đổi mật khẩu sau khi đăng nhập.</div>
    </div>
  );
}

export default function UserAdmin({ users, teams, meId }: { users: User[]; teams: Team[]; meId: string }) {
  const [state, formAction, pending] = useActionState<UserFormState, FormData>(createUser, {});
  const [reset, setReset] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  // Thay đổi Họ tên / Vai trò / Team / Trưởng team chỉ lưu khi bấm "Lưu" (tránh lưu nhầm khi lỡ chọn)
  type Edit = { full_name?: string; role?: Role; team_id?: string | null; is_team_lead?: boolean; team2_id?: string | null };
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const setEdit = (id: string, patch: Edit) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
  const clearEdit = (id: string) => setEdits((e) => { const n = { ...e }; delete n[id]; return n; });
  // Giá trị đang hiển thị = giá trị đã chỉnh (nếu có) hoặc giá trị đã lưu; bỏ team thì tự bỏ trưởng team
  const eff = (u: User) => {
    const e = edits[u.id] ?? {};
    const team_id = "team_id" in e ? e.team_id ?? null : u.team_id;
    return {
      full_name: e.full_name !== undefined ? e.full_name : u.full_name,
      role: e.role ?? u.role,
      team_id,
      is_team_lead: team_id ? e.is_team_lead ?? u.is_team_lead : false,
      team2_id: "team2_id" in e ? e.team2_id ?? null : u.team2_id ?? null,
    };
  };
  // Chỉ gửi các trường thật sự khác giá trị đã lưu
  const diff = (u: User) => {
    const v = eff(u), p: { full_name?: string; role?: Role; team_id?: string | null; is_team_lead?: boolean; team2_id?: string | null } = {};
    if (v.full_name !== u.full_name && v.full_name.trim()) p.full_name = v.full_name.trim();
    if (v.role !== u.role) p.role = v.role;
    if (v.team_id !== u.team_id) p.team_id = v.team_id;
    if (v.is_team_lead !== u.is_team_lead) p.is_team_lead = v.is_team_lead;
    if (v.team2_id !== (u.team2_id ?? null)) p.team2_id = v.team2_id;
    return p;
  };

  const run = (fn: () => Promise<unknown>) => start(async () => {
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Lỗi"); }
  });
  const activeTeams = teams.filter((t) => t.is_active);

  // Tìm kiếm + bộ lọc (chỉ lọc hiển thị; "chờ duyệt" = đăng ký mới: chưa được Quản lý duyệt lần nào)
  const [q, setQ] = useState("");
  const [fRole, setFRole] = useState("");
  const [fTeam, setFTeam] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [approve, setApprove] = useState<Record<string, { role: Role; team_id: string }>>({});
  // Chờ duyệt = chưa từng được duyệt (approved_at null) — đăng nhập thử không làm tài khoản rơi sang "Đã khoá". Chưa chạy migration 037 → dùng cách cũ
  const isPending = (u: User) => !u.is_active && (u.approved_at === undefined ? !u.last_sign_in_at : !u.approved_at);
  const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
  const needle = norm(q.trim());
  const shown = users.filter((u) =>
    (!needle || norm(u.full_name).includes(needle) || norm(u.email).includes(needle))
    && (!fRole || u.role === fRole)
    && (!fTeam || (fTeam === "none" ? !u.team_id : u.team_id === fTeam))
    && (!fStatus || (fStatus === "pending" ? isPending(u) : fStatus === "active" ? u.is_active : !u.is_active && !isPending(u))));
  const filtering = !!(needle || fRole || fTeam || fStatus);
  const pendingCount = users.filter(isPending).length;

  return (
    <div className="space-y-4">
      <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface p-4">
        <input name="full_name" required placeholder="Họ tên" className={`${input} w-48`} />
        <input name="email" type="email" required placeholder="Email" className={`${input} w-64`} />
        <select name="role" defaultValue="rnd" className={input}>
          {Object.entries(ROLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {teams.length > 0 && (
          <select name="team_id" defaultValue="" className={input}>
            <option value="">— Team —</option>
            {activeTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
          {pending ? "Đang tạo…" : "＋ Tạo tài khoản"}
        </button>
        {state.error && <p className="w-full text-sm text-bad">⛔ {state.error}</p>}
      </form>

      {state.created && <TempPassword {...state.created} />}
      {/* Cố định ở góc màn hình: bảng người dùng dài, kết quả hiện ở đầu trang sẽ nằm ngoài tầm nhìn khi bấm ở hàng phía dưới */}
      {(reset || error) && (
        <div role="status" className="fixed inset-x-4 bottom-4 z-50 ml-auto max-w-md space-y-2 rounded-xl border border-line bg-surface p-3 shadow-lg">
          {reset && <ResetResult {...reset} onClose={() => setReset(null)} />}
          {error && <p className="text-sm text-bad">⛔ {error} <button type="button" className="ml-2 text-xs text-ink-2 underline" onClick={() => setError(null)}>Đóng</button></p>}
        </div>
      )}

      {pendingCount > 0 && (
        <section className="space-y-2 rounded-xl border border-warn-ink/30 bg-warn-bg p-4">
          <h2 className="font-semibold text-warn-ink">🔔 Chờ duyệt ({pendingCount})</h2>
          <p className="text-xs text-warn-ink">Tài khoản tự đăng ký — email chưa được xác minh, hãy đối chiếu với người đăng ký. Team do người đăng ký tự chọn (đổi được nếu cần); chọn vai trò rồi bấm Duyệt; Từ chối sẽ xoá tài khoản.</p>
          <ul className="space-y-2">
            {users.filter(isPending).map((u) => {
              const v = approve[u.id] ?? { role: "media" as Role, team_id: u.team_id ?? "" };
              return (
                <li key={u.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface p-2 text-sm">
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="truncate font-medium">{u.full_name}</div>
                    <div className="truncate text-xs text-ink-muted">{u.email}{u.created_at && ` · đăng ký ${new Date(u.created_at).toLocaleString("vi-VN")}`}</div>
                  </div>
                  <select value={v.role} disabled={busy} onChange={(e) => setApprove((a) => ({ ...a, [u.id]: { ...v, role: e.target.value as Role } }))} className={`${input} py-1`}>
                    {Object.entries(ROLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                  {teams.length > 0 && (
                    <select value={v.team_id} disabled={busy} onChange={(e) => setApprove((a) => ({ ...a, [u.id]: { ...v, team_id: e.target.value } }))} className={`${input} py-1`}>
                      <option value="">— Team —</option>
                      {activeTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  )}
                  <button disabled={busy} className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
                    onClick={() => run(() => updateUser(u.id, { role: v.role, team_id: v.team_id || null, is_active: true }))}>✓ Duyệt</button>
                  <button disabled={busy} className="rounded-md border border-line px-3 py-1 text-xs text-bad hover:bg-grid disabled:opacity-60"
                    onClick={() => { if (confirm(`Từ chối và xoá tài khoản đăng ký của ${u.full_name} (${u.email})?`)) run(() => rejectUser(u.id)); }}>✕ Từ chối</button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Tìm theo tên hoặc email…" className={`${input} w-72`} />
        <select value={fRole} onChange={(e) => setFRole(e.target.value)} className={input} aria-label="Lọc vai trò">
          <option value="">Mọi vai trò</option>
          {Object.entries(ROLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {teams.length > 0 && (
          <select value={fTeam} onChange={(e) => setFTeam(e.target.value)} className={input} aria-label="Lọc team">
            <option value="">Mọi team</option>
            <option value="none">Chưa có team</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_active ? "" : " (ngừng)"}</option>)}
          </select>
        )}
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={input} aria-label="Lọc trạng thái">
          <option value="">Mọi trạng thái</option>
          <option value="active">Hoạt động</option>
          <option value="pending">Chờ duyệt{pendingCount ? ` (${pendingCount})` : ""}</option>
          <option value="locked">Đã khoá</option>
        </select>
        {filtering && (
          <button onClick={() => { setQ(""); setFRole(""); setFTeam(""); setFStatus(""); }} className="text-sm text-accent hover:underline">Xoá bộ lọc</button>
        )}
        <span className="ml-auto text-xs text-ink-muted">{filtering ? `${shown.length} / ${users.length}` : users.length} người dùng</span>
      </div>

      <div className={`overflow-x-auto rounded-xl border border-line bg-surface ${busy ? "opacity-60" : ""}`}>
        <table className="w-full text-sm">
          <thead className="text-left text-ink-2">
            <tr className="border-b border-line">
              <th className="px-4 py-3 font-medium">Người dùng</th>
              <th className="px-4 py-3 font-medium">Vai trò</th>
              {teams.length > 0 && <th className="px-4 py-3 font-medium">Team</th>}
              <th className="px-4 py-3 font-medium">Đăng nhập gần nhất</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            <Paged resetKey={`${needle}|${fRole}|${fTeam}|${fStatus}`} size={20} cols={teams.length > 0 ? 6 : 5}>{shown.map((u) => (
              <tr key={u.id} className={`border-b border-line last:border-0 ${u.is_active ? "" : "opacity-50"} ${Object.keys(diff(u)).length ? "bg-[color-mix(in_srgb,var(--accent)_7%,transparent)]" : ""}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <input
                      value={eff(u).full_name}
                      disabled={busy}
                      onChange={(e) => setEdit(u.id, { full_name: e.target.value })}
                      className={`-ml-1.5 w-44 rounded border px-1.5 py-0.5 font-medium outline-none transition focus:border-accent ${
                        eff(u).full_name !== u.full_name ? "border-accent bg-page" : "border-transparent bg-transparent hover:border-line"
                      }`}
                      placeholder="Họ tên"
                      title="Bấm để sửa họ tên"
                    />
                    {u.id === meId && <span className="text-xs text-ink-muted shrink-0">(bạn)</span>}
                  </div>
                  <div className="text-xs text-ink-muted">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  <select value={eff(u).role} disabled={u.id === meId || busy}
                    onChange={(e) => setEdit(u.id, { role: e.target.value as Role })}
                    className={`${input} py-1 ${eff(u).role !== u.role ? "border-accent" : ""}`}>
                    {Object.entries(ROLE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </td>
                {teams.length > 0 && (
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <select value={eff(u).team_id ?? ""} disabled={busy}
                        onChange={(e) => setEdit(u.id, { team_id: e.target.value || null, ...(e.target.value ? {} : { is_team_lead: false }) })}
                        className={`${input} py-1 ${eff(u).team_id !== u.team_id ? "border-accent" : ""}`}>
                        <option value="">—</option>
                        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_active ? "" : " (ngừng)"}</option>)}
                      </select>
                      <select value={eff(u).team2_id ?? ""} disabled={busy || !eff(u).team_id} title="Team 2 (không bắt buộc): người này thuộc thêm một team nữa — vd trưởng team kinh doanh kiêm duyệt mẫu R&D (PT Sản Phẩm). Trưởng team áp dụng cho cả hai team."
                        onChange={(e) => setEdit(u.id, { team2_id: e.target.value || null })}
                        className={`${input} py-1 ${(eff(u).team2_id ?? null) !== (u.team2_id ?? null) ? "border-accent" : ""}`}>
                        <option value="">+ Team 2</option>
                        {teams.filter((t) => t.id !== eff(u).team_id).map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_active ? "" : " (ngừng)"}</option>)}
                      </select>
                      <label className="flex items-center gap-1 whitespace-nowrap text-xs" title="Trưởng team: duyệt mẫu sưu tầm và duyệt Win của team (cả team chính và team 2)">
                        <input type="checkbox" checked={eff(u).is_team_lead} disabled={busy || !eff(u).team_id}
                          onChange={(e) => setEdit(u.id, { is_team_lead: e.target.checked })} />
                        Trưởng team
                      </label>
                    </div>
                  </td>
                )}
                <td className="px-4 py-3 text-ink-2">
                  {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("vi-VN") : "Chưa đăng nhập"}
                </td>
                <td className="px-4 py-3">{u.is_active ? "Hoạt động" : isPending(u) ? <span className="rounded-md bg-warn-bg px-2 py-0.5 text-xs text-warn-ink">Chờ duyệt</span> : "Đã khoá"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {Object.keys(diff(u)).length > 0 && (
                    <span className="mr-3 inline-flex gap-1.5 align-middle">
                      <button disabled={busy} className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
                        onClick={() => run(async () => { await updateUser(u.id, diff(u)); clearEdit(u.id); })}>
                        {busy ? "Đang lưu…" : "Lưu"}
                      </button>
                      <button disabled={busy} className="rounded-md border border-line px-3 py-1 text-xs text-ink-2 hover:bg-grid" onClick={() => clearEdit(u.id)}>Huỷ</button>
                    </span>
                  )}
                  <button disabled={busy} className="mr-3 text-accent hover:underline"
                    onClick={() => run(async () => setReset({ email: u.email, password: unwrap(await resetPassword(u.id)) }))}>
                    Cấp lại mật khẩu
                  </button>
                  {u.id !== meId && (
                    <button disabled={busy} className={u.is_active ? "text-bad hover:underline" : "text-good hover:underline"}
                      onClick={() => run(() => updateUser(u.id, { is_active: !u.is_active }))}>
                      {u.is_active ? "Khoá" : "Mở khoá"}
                    </button>
                  )}
                </td>
              </tr>
            ))}</Paged>
          </tbody>
        </table>
      </div>
    </div>
  );
}
