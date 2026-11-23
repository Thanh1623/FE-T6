"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { unwrap } from "@/lib/action-result";
import { linkSpuAction, unlinkSpuAction } from "./actions";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const dm = (d: string) => d.split("-").reverse().join("/");

// Liên kết mã SPU thương mại (Sapo) cho mẫu Media test: hiện các mã đã gắn + (Quản lý / R&D) form gắn thêm.
// Mã test giữ nguyên; trước ngày mở bán tính là giai đoạn test, từ ngày mở bán là giai đoạn thương mại.
export default function LinkSpu({ productId, links, canEdit }: { productId: string; links: { id: string; sku: string; launch: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sku, setSku] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const run = (fn: () => Promise<unknown>, after?: () => void) => start(async () => {
    setError(null);
    try { await fn(); after?.(); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Lỗi"); }
  });
  const save = () => run(async () => unwrap(await linkSpuAction(productId, sku, date, note)), () => { setOpen(false); setSku(""); setNote(""); });

  return (
    <div className={`space-y-1.5 ${busy ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {links.map((l) => (
          <span key={l.id} className="inline-flex items-center gap-1 rounded-md border border-good/40 bg-good/10 px-2 py-0.5 text-xs">
            <b className="font-mono tracking-wide text-good">{l.sku}</b>
            <span className="text-ink-2">mở bán {dm(l.launch)}</span>
            {canEdit && <button type="button" aria-label={`Bỏ liên kết ${l.sku}`} disabled={busy} onClick={() => run(async () => unwrap(await unlinkSpuAction(productId, l.id)))} className="ml-0.5 text-ink-muted hover:text-bad">✕</button>}
          </span>
        ))}
        {!links.length && !open && <span className="text-xs text-ink-muted">Chưa gắn mã SPU</span>}
        {canEdit && !open && <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-line px-2 py-0.5 text-xs font-medium text-accent hover:border-accent">＋ Gắn SPU</button>}
      </div>
      {canEdit && open && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-accent/40 bg-surface p-2">
          <label className="text-2xs text-ink-muted">Mã SPU thương mại
            <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="N0123" maxLength={30} autoFocus
              className="mt-0.5 block w-32 rounded-md border border-line bg-page px-2 py-1 font-mono text-sm uppercase outline-none focus:border-accent" />
          </label>
          <label className="text-2xs text-ink-muted">Ngày mở bán
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-0.5 block rounded-md border border-line bg-page px-2 py-1 text-sm outline-none focus:border-accent" />
          </label>
          <label className="min-w-32 flex-1 text-2xs text-ink-muted">Ghi chú
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="tuỳ chọn" className="mt-0.5 block w-full rounded-md border border-line bg-page px-2 py-1 text-sm outline-none focus:border-accent" />
          </label>
          <button type="button" disabled={busy || !sku.trim()} onClick={save} className="rounded-md bg-accent px-3 py-1 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">{busy ? "Đang gắn…" : "Gắn"}</button>
          <button type="button" onClick={() => { setOpen(false); setError(null); }} className="rounded-md px-2 py-1 text-sm text-ink-2 hover:bg-grid">Huỷ</button>
        </div>
      )}
      {error && <p className="text-xs font-medium text-bad">⛔ {error}</p>}
    </div>
  );
}
