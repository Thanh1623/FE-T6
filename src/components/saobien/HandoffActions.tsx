"use client";

import { useState, useTransition } from "react";
import { unwrap } from "@/lib/action-result";
import { assignHandoff, createVideoRequest, moveHandoff } from "@/app/(dash)/sample-push/actions";

type Status = "pending" | "received" | "developing" | "done" | "returned";
type Team = { id: string; name: string };
const NEXT: Partial<Record<Status, [Status, string][]>> = {
  pending: [["received", "✋ Tiếp nhận"]],
  received: [["developing", "🎬 Đã lên video"], ["done", "✓ Hoàn thành"]],
  developing: [["done", "✓ Hoàn thành"]],
};

// Ý nghĩa từng nút (hiện khi rê chuột + dòng gợi ý dưới nút)
const MEANING: Record<string, string> = {
  received: "Team nhận việc này — ghi nhận người phụ trách và ngày nhận; team giao không huỷ được nữa",
  developing: "Báo team đã lên video cho mẫu này — các video gắn mã mẫu ở Page của team hiện trong tab “Đã lên video”",
  done: "Báo đã lên video xong theo yêu cầu",
};
const HINT: Partial<Record<Status, string>> = {
  pending: "Tiếp nhận: team nhận việc lên video cho mẫu. Từ chối: không nhận (chưa đủ nguồn lực, thiếu source…) — phải ghi lý do, team giao sẽ giao lại cho team khác.",
  received: "Vẫn từ chối được khi chưa xong, kèm lý do.",
  developing: "Vẫn từ chối được khi chưa xong, kèm lý do.",
};

const field = "w-full rounded-md border border-line bg-page px-2.5 py-1.5 text-sm outline-none focus:border-accent";

// Chọn team nhận: tick từng team hoặc "Tất cả team" (mọi team trong danh sách) — mỗi team được 1 phiếu riêng
function TeamPicks({ teams, value, onChange }: { teams: Team[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const all = teams.length > 0 && teams.every((t) => value.includes(t.id));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const summary = value.length === 0 ? "— Chọn team nhận —" : all ? `Tất cả team (${teams.length})` : value.length <= 2 ? teams.filter((t) => value.includes(t.id)).map((t) => t.name).join(", ") : `${value.length} team`;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className={`${field} flex items-center justify-between gap-2 text-left ${value.length ? "" : "text-ink-muted"}`}>
        <span className="truncate">{summary}</span><span className="text-xs text-ink-muted">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-lg">
          <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm font-semibold hover:bg-grid">
            <input type="checkbox" checked={all} onChange={() => onChange(all ? [] : teams.map((t) => t.id))} /> Tất cả team
          </label>
          <div className="my-1 border-t border-line" />
          {teams.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-grid">
              <input type="checkbox" checked={value.includes(t.id)} onChange={() => toggle(t.id)} /> {t.name}
            </label>
          ))}
          {!teams.length && <div className="px-2 py-1.5 text-xs text-ink-muted">Không có team phù hợp</div>}
          <button type="button" onClick={() => setOpen(false)} className="mt-1 w-full rounded-md bg-grid py-1 text-xs">Xong</button>
        </div>
      )}
    </div>
  );
}

// Việc của team được giao: tiếp nhận → lên video → hoàn thành, hoặc từ chối (bắt buộc ghi lý do, nhập ngay tại chỗ)
export default function HandoffActions({ id, status, canAct }: { id: string; status: Status; canAct: boolean }) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const run = (fn: () => Promise<unknown>, after?: () => void) => start(async () => {
    setError(null);
    try { unwrap(await fn()); after?.(); } catch (e) { setError(e instanceof Error ? e.message : "Lỗi"); }
  });
  if (!canAct || status === "done" || status === "returned") return null;

  return (
    <div className={`space-y-2 ${busy ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        {(NEXT[status] ?? []).map(([to, label]) => (
          <button key={to} disabled={busy} title={MEANING[to]} onClick={() => run(() => moveHandoff(id, to))}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">{label}</button>
        ))}
        <button disabled={busy} onClick={() => setRefusing((v) => !v)} title="Không nhận / không làm tiếp — bắt buộc ghi lý do"
          className={`rounded-md border px-3 py-1.5 text-xs font-medium ${refusing ? "border-bad bg-bad/10 text-bad" : "border-line text-bad hover:bg-bad/10"}`}>✕ Từ chối</button>
      </div>
      {refusing && (
        <div className="space-y-1.5 rounded-md border border-bad/40 bg-bad/5 p-2">
          <textarea autoFocus rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do từ chối (bắt buộc)…" className={field} />
          <div className="flex justify-end gap-2 text-xs">
            <button type="button" onClick={() => { setRefusing(false); setReason(""); }} className="rounded-md px-2.5 py-1 text-ink-2 hover:bg-grid">Huỷ</button>
            <button type="button" disabled={busy || !reason.trim()} onClick={() => run(() => moveHandoff(id, "returned", reason), () => { setRefusing(false); setReason(""); })}
              className="rounded-md bg-bad px-3 py-1 font-medium text-white disabled:opacity-60">Xác nhận từ chối</button>
          </div>
        </div>
      )}
      {HINT[status] && <p className="text-2xs text-ink-muted">{HINT[status]}</p>}
      {error && <p className="text-xs text-bad">⛔ {error}</p>}
    </div>
  );
}

// Giao / giao lại một phiếu cho team khác: chọn team, hạn, yêu cầu
export function AssignForm({ id, teams, again }: { id: string; teams: Team[]; again?: boolean }) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<string[]>([]);
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className={`space-y-2 rounded-md border border-line bg-page p-2.5 ${busy ? "opacity-60" : ""}`}>
      <div className="text-xs font-semibold">{again ? "Giao lại cho team khác" : "Giao cho team"}</div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <TeamPicks teams={teams} value={team} onChange={setTeam} />
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={`${field} w-36`} aria-label="Hạn lên video" title="Hạn lên video" />
      </div>
      <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Yêu cầu cho team nhận (số video, kênh, concept…)" className={field} />
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 text-xs font-medium text-bad">{error && `⛔ ${error}`}</span>
        <button type="button" disabled={busy || !team.length} onClick={() => start(async () => {
          setError(null);
          try { unwrap(await assignHandoff(id, team, deadline || null, note)); setTeam([]); setDeadline(""); setNote(""); } catch (e) { setError(e instanceof Error ? e.message : "Lỗi"); }
        })} className="flex-none rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60">{again ? "Gửi lại yêu cầu" : team.length > 1 ? `Gửi yêu cầu (${team.length} team)` : "Gửi yêu cầu"}</button>
      </div>
    </div>
  );
}

// Tạo yêu cầu mới: chọn mẫu (từ P3 trở đi) + team nhận + hạn + yêu cầu
export function NewRequestForm({ products, teams }: { products: { id: string; label: string; teamId: string | null }[]; teams: Team[] }) {
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState("");
  const [team, setTeam] = useState<string[]>([]);
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  const ownTeam = products.find((p) => p.id === product)?.teamId ?? null;   // giao cho team KHÁC team yêu cầu
  const options = teams.filter((t) => t.id !== ownTeam);

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">＋ Giao mẫu lên video</button>;
  }
  return (
    <section className={`space-y-3 rounded-xl border border-accent/40 bg-surface p-4 ${busy ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Giao mẫu cho team khác lên video</h2>
        <button type="button" onClick={() => setOpen(false)} className="rounded px-2 text-ink-muted hover:bg-grid" aria-label="Đóng">✕</button>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="space-y-1 text-xs font-medium text-ink-2">Mẫu (từ P3 trở đi)
          <select value={product} onChange={(e) => { setProduct(e.target.value); setTeam([]); }} className={field}>
            <option value="">— Chọn mẫu —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <div className="space-y-1 text-xs font-medium text-ink-2">Team nhận việc (chọn nhiều hoặc tất cả)
          {product ? <TeamPicks teams={options} value={team} onChange={setTeam} /> : <div className={`${field} text-ink-muted`}>Chọn mẫu trước</div>}
        </div>
        <label className="space-y-1 text-xs font-medium text-ink-2">Hạn lên video
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={field} />
        </label>
        <label className="space-y-1 text-xs font-medium text-ink-2 md:col-span-2">Yêu cầu cho team nhận
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Số video, kênh đăng, concept, lưu ý…" className={field} />
        </label>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 text-xs font-medium text-bad">{error && `⛔ ${error}`}</span>
        <button type="button" disabled={busy || !product || !team.length} onClick={() => start(async () => {
          setError(null);
          try { unwrap(await createVideoRequest(product, team, deadline || null, note)); setProduct(""); setTeam([]); setDeadline(""); setNote(""); setOpen(false); }
          catch (e) { setError(e instanceof Error ? e.message : "Lỗi"); }
        })} className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">{team.length > 1 ? `Gửi yêu cầu (${team.length} team)` : "Gửi yêu cầu"}</button>
      </div>
    </section>
  );
}
