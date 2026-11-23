"use client";

import { useState, useTransition } from "react";
import { saveTeam } from "@/app/(dash)/users/actions";
import { ROLE_LABELS, type Role } from "@/lib/roles";

type User = { id: string; email: string; full_name: string; role: Role; is_active: boolean; team_id: string | null; is_team_lead: boolean };
type Team = { id: string; name: string; is_active: boolean };

const input = "rounded-lg border border-line bg-page px-3 py-2 text-sm outline-none focus:border-accent";

// Quản lý team: danh sách team + thành viên, thêm / đổi tên / ngừng team (tách khỏi trang Người dùng)
export default function TeamAdmin({ users, teams }: { users: User[]; teams: Team[] }) {
  const [newTeam, setNewTeam] = useState("");
  const [openTeam, setOpenTeam] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => {
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Lỗi"); }
  });
  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">⛔ {error}</p>}
      <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Team</h2>
        <p className="text-xs text-ink-muted">Bấm vào team để xem thành viên. Gán người dùng vào team ở trang Người dùng.</p>
        <ul className="grid items-start gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <TeamCard key={t.id} team={t} people={users.filter((u) => u.team_id === t.id)} names={teams.map((x) => x.name)}
              busy={busy} open={openTeam === t.id} onToggle={() => setOpenTeam(openTeam === t.id ? null : t.id)}
              onSave={(name, active) => run(() => saveTeam(t.id, name, active))} />
          ))}
        </ul>
        {!teams.length && <p className="text-sm text-ink-muted">Chưa có team nào.</p>}
        <div className="flex gap-2">
          <input value={newTeam} onChange={(e) => setNewTeam(e.target.value)} placeholder="Tên team mới" className={`${input} w-56`} />
          <button disabled={busy || !newTeam.trim()} onClick={() => run(async () => { await saveTeam(null, newTeam); setNewTeam(""); })}
            className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-grid disabled:opacity-60">＋ Thêm team</button>
        </div>
      </section>
    </div>
  );
}

// Thẻ team: bấm để xem thành viên; đổi tên / ngừng / kích hoạt cần xác nhận 2 lần (khung xác nhận + hộp thoại)
function TeamCard({ team: t, people, names, busy, open, onToggle, onSave }: {
  team: Team; people: User[]; names: string[]; busy: boolean; open: boolean;
  onToggle: () => void; onSave: (name: string, active: boolean) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(t.name);
  const [ask, setAsk] = useState<null | { kind: "rename"; to: string } | { kind: "toggle" }>(null);
  const [err, setErr] = useState<string | null>(null);
  const active = people.filter((u) => u.is_active);
  const leads = active.filter((u) => u.is_team_lead).map((u) => u.full_name);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const askRename = () => {
    const to = name.trim();
    setErr(null);
    if (!to) { setErr("Tên team không được trống"); return; }
    if (to === t.name) { setRenaming(false); return; }
    if (names.some((n) => n.toLowerCase() === to.toLowerCase())) { setErr(`Đã có team “${to}”`); return; }
    setAsk({ kind: "rename", to });
  };
  // Bước 2: hộp thoại xác nhận lần cuối
  const confirmFinal = () => {
    if (!ask) return;
    if (ask.kind === "rename") {
      if (!confirm(`Xác nhận lần 2: đổi tên team “${t.name}” thành “${ask.to}”?`)) return;
      onSave(ask.to, t.is_active);
      setRenaming(false);
    } else {
      if (!confirm(`Xác nhận lần 2: ${t.is_active ? "NGỪNG" : "KÍCH HOẠT"} team “${t.name}”?`)) return;
      onSave(t.name, !t.is_active);
    }
    setAsk(null);
  };

  return (
    <li className={`rounded-lg border text-sm ${open ? "border-accent" : "border-line"} ${t.is_active ? "" : "bg-grid/50"}`}>
      <div role="button" tabIndex={0} onClick={onToggle} onKeyDown={(e) => { if (e.key === "Enter") onToggle(); }}
        className="cursor-pointer p-3" aria-expanded={open}>
        <div className="flex items-center justify-between gap-2">
          {renaming ? (
            <input autoFocus value={name} onClick={stop} onChange={(e) => { setName(e.target.value); setAsk(null); }}
              onKeyDown={(e) => { stop(e); if (e.key === "Enter") askRename(); if (e.key === "Escape") { setRenaming(false); setName(t.name); setAsk(null); } }}
              className="min-w-0 flex-1 rounded-md border border-accent bg-page px-2 py-0.5 font-semibold outline-none" />
          ) : (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="text-xs text-ink-muted">{open ? "▾" : "▸"}</span>
              <b className="truncate">{t.name}</b>
              {!t.is_active && <span className="rounded-md bg-grid px-1.5 text-2xs text-ink-2">Đã ngừng</span>}
            </span>
          )}
          <span className="flex flex-none gap-2 text-xs" onClick={stop}>
            {renaming ? (
              <>
                <button disabled={busy} onClick={askRename} className="font-medium text-accent hover:underline">Lưu</button>
                <button onClick={() => { setRenaming(false); setName(t.name); setAsk(null); setErr(null); }} className="text-ink-2 hover:underline">Huỷ</button>
              </>
            ) : (
              <>
                <button disabled={busy} className="text-accent hover:underline" onClick={() => { setName(t.name); setRenaming(true); setAsk(null); }}>Đổi tên</button>
                <button disabled={busy} className={t.is_active ? "text-bad hover:underline" : "text-good hover:underline"}
                  onClick={() => setAsk({ kind: "toggle" })}>{t.is_active ? "Ngừng" : "Kích hoạt"}</button>
              </>
            )}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-ink-2">{active.length} người{leads.length ? ` · trưởng team: ${leads.join(", ")}` : " · chưa có trưởng team"}</div>
        {err && <div className="mt-1 text-xs text-bad">⛔ {err}</div>}

        {/* Bước 1: khung xác nhận trên thẻ */}
        {ask && (
          <div onClick={stop} className="mt-2 rounded-md bg-warn-bg p-2 text-xs text-warn-ink">
            {ask.kind === "rename"
              ? <>Đổi tên “<b>{t.name}</b>” → “<b>{ask.to}</b>”. Tên mới hiện ở mọi mẫu, Page và người dùng thuộc team.</>
              : t.is_active
                ? <>Ngừng team “<b>{t.name}</b>”: không chọn được team này cho người dùng / mẫu mới. {active.length} thành viên và dữ liệu cũ vẫn giữ nguyên.</>
                : <>Kích hoạt lại team “<b>{t.name}</b>”: chọn được lại cho người dùng / mẫu mới.</>}
            <div className="mt-1.5 flex gap-2">
              <button disabled={busy} onClick={confirmFinal}
                className={`rounded-md px-2 py-0.5 font-medium text-white ${ask.kind === "toggle" && t.is_active ? "bg-bad" : "bg-accent"}`}>Xác nhận</button>
              <button onClick={() => setAsk(null)} className="rounded-md px-2 py-0.5 hover:bg-surface">Huỷ</button>
            </div>
          </div>
        )}
      </div>

      {open && (
        <ul className="border-t border-line px-3 py-2">
          {people.length ? [...people].sort((a, b) => Number(b.is_team_lead) - Number(a.is_team_lead) || Number(b.is_active) - Number(a.is_active) || a.full_name.localeCompare(b.full_name, "vi"))
            .map((u) => (
              <li key={u.id} className={`flex items-center justify-between gap-2 py-1 ${u.is_active ? "" : "opacity-50"}`}>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{u.full_name}
                    {u.is_team_lead && <span className="ml-1.5 rounded-md bg-accent px-1.5 text-2xs font-medium text-white">Trưởng team</span>}
                  </span>
                  <span className="block truncate text-2xs text-ink-muted">{u.email}</span>
                </span>
                <span className="flex-none text-right text-2xs text-ink-2">{ROLE_LABELS[u.role]}{u.is_active ? "" : " · đã khoá"}</span>
              </li>
            ))
            : <li className="py-1 text-xs text-ink-muted">Chưa có thành viên — gán team cho người dùng ở trang Người dùng.</li>}
        </ul>
      )}
    </li>
  );
}
