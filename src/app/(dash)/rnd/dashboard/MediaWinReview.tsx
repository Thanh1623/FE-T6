"use client";

import Paged from "@/components/Paged";
import { WIN_NAME, WIN_VAR, type WinResult } from "@/lib/eval/rules";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewMediaWin } from "../media-flow-actions";
import { unwrap } from "@/lib/action-result";

export type WinCandidate = {
  productId: string; code: string; name: string; result: WinResult; views: number; qty: number;
  firstDate: string; page: string | null; teamId: string | null;
};

type Entry = "win" | "3d";
const ENTRIES: { id: Entry; title: string; sub: string }[] = [
  { id: "win", title: "Vào P4 · bảng Win", sub: "Đã có hàng và nguồn nhập — dùng lại video và số liệu đã test." },
  { id: "3d", title: "Làm lại từ P1", sub: "Cần sản xuất hoặc chỉnh mẫu trước — đi qua P1 → P3." },
];

// Lưới cột dùng chung cho dòng tiêu đề cột và từng dòng mẫu (từ md trở lên): huy hiệu · mẫu · lượt xem · đã bán · video đầu · Page · nút. Màn hình hẹp: các ô tự xuống dòng.
// Cột nút có chiều rộng CỐ ĐỊNH (mỗi dòng là một lưới riêng; cột auto sẽ rộng khác nhau giữa các dòng và làm lệch cột số)
const COLS = "md:grid-cols-[6.25rem_minmax(0,1fr)_4.75rem_3.25rem_5.5rem_minmax(0,10rem)_13.5rem]";
const COLS_VIEW = "md:grid-cols-[6.25rem_minmax(0,1fr)_4.75rem_3.25rem_5.5rem_minmax(0,10rem)]";   // không có quyền duyệt → không có cột nút

// Mẫu Media tự test (không qua R&D) đạt WIN → team quyết định đưa vào quy trình R&D hay bỏ qua
export default function MediaWinReview({ rows, teams, canReview }: {
  rows: WinCandidate[]; teams: { id: string; name: string }[]; canReview: boolean;
}) {
  const router = useRouter();
  const cols = canReview ? COLS : COLS_VIEW;
  const [open, setOpen] = useState<string | null>(null);
  const [entry, setEntry] = useState<Entry>("win");
  const [team, setTeam] = useState("");
  const [note, setNote] = useState("");
  const [hasStock, setHasStock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const act = (id: string, decision: "accept" | "dismiss") => start(async () => {
    setError(null);
    try { unwrap(await reviewMediaWin(id, decision, entry, team || null, note, hasStock)); setOpen(null); setNote(""); setHasStock(false); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Lỗi"); }
  });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !pending) setOpen(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);
  const openFor = (r: WinCandidate) => { setOpen(r.productId); setTeam(r.teamId ?? ""); setEntry("win"); setHasStock(false); setError(null); };

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-line px-4 py-2" style={{ borderTop: "3px solid var(--res-win)" }}>
        <h2 className="text-sm font-semibold">Media test WIN — chờ team xem xét</h2>
        <span className="rounded-md px-1.5 py-0.5 text-2xs font-semibold text-white" style={{ background: "var(--res-win)" }}>{rows.length}</span>
        <p className="min-w-0 flex-1 basis-72 truncate text-xs text-ink-2" title="Mẫu Media tự tìm đã đạt WIN, chưa tính vào luồng R&D. Chọn đưa vào quy trình (từ đó mới tính vào luồng R&D) hoặc bỏ qua (mẫu ở lại luồng Media).">
          Mẫu Media tự tìm đã đạt WIN, chưa tính vào luồng R&amp;D — chọn <b>đưa vào quy trình</b> hoặc <b>bỏ qua</b>.
        </p>
      </header>
      <div className={`hidden items-center gap-x-3 border-b border-line bg-grid/50 px-4 py-1 text-2xs text-ink-muted md:grid ${cols}`} aria-hidden>
        <span>Kết quả</span><span>Mẫu</span><span className="text-right">Lượt xem</span><span className="text-right">Đã bán</span><span className="text-right">Video đầu</span><span>Page</span>{canReview && <span />}
      </div>

      <ul className="divide-y divide-line">
        <Paged as="item" size={15}>{rows.map((r) => {
          const isOpen = open === r.productId;
          return (
            <li key={r.productId} className="px-4 py-1.5 hover:bg-grid/40">
              <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 md:grid ${cols}`}>
                <span className="flex-none whitespace-nowrap rounded px-1.5 py-0.5 text-center text-[10px] font-semibold leading-4 text-white" style={{ background: `var(${WIN_VAR[r.result]})` }}>
                  {WIN_NAME[r.result]}
                </span>
                <Link href={`/rnd/${r.productId}`} className="min-w-0 flex-1 truncate text-sm hover:underline md:flex-none" title={`#${r.code} ${r.name}`}><b>#{r.code}</b> <span className="text-ink-2">{r.name}</span></Link>
                <span className="tabular text-right text-sm font-semibold">{r.views.toLocaleString("vi-VN")}<span className="font-normal text-ink-muted md:hidden"> xem</span></span>
                <span className="tabular text-right text-sm">{r.qty.toLocaleString("vi-VN")}<span className="text-ink-muted md:hidden"> bán</span></span>
                <span className="tabular text-right text-xs text-ink-2" title="Ngày đăng video đầu tiên">{new Date(r.firstDate).toLocaleDateString("vi-VN")}</span>
                <span className="min-w-0 max-w-full truncate text-xs text-ink-2" title={r.page ?? undefined}>{r.page ?? "—"}</span>
                {canReview && (
                  <div className="flex flex-none justify-end gap-1 text-xs">
                    <button onClick={() => openFor(r)} className="whitespace-nowrap rounded-md bg-accent px-2.5 py-1 font-medium text-white hover:opacity-90">Đưa vào quy trình</button>
                    <button disabled={pending} onClick={() => { if (confirm(`Bỏ qua #${r.code}? Mẫu chỉ ở luồng Media.`)) act(r.productId, "dismiss"); }}
                      className="rounded-md border border-line px-2.5 py-1 text-ink-2 hover:bg-grid">Bỏ qua</button>
                  </div>
                )}
              </div>

              {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !pending) setOpen(null); }}>
                <div role="dialog" aria-modal="true" aria-label={`Đưa #${r.code} vào quy trình R&D`} className="max-h-full w-full max-w-2xl space-y-3 overflow-y-auto rounded-lg border border-line bg-surface p-5 shadow-xl">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold">Đưa vào quy trình R&amp;D</h3>
                      <p className="truncate text-xs text-ink-2"><b>#{r.code}</b> {r.name} · {WIN_NAME[r.result]} · {r.views.toLocaleString("vi-VN")} xem</p>
                    </div>
                    <button type="button" disabled={pending} onClick={() => setOpen(null)} aria-label="Đóng" className="rounded px-2 text-ink-muted hover:bg-grid">✕</button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Điểm vào quy trình R&D">
                    {ENTRIES.map((o) => (
                      <label key={o.id} className={`flex cursor-pointer gap-2 rounded-md border bg-page p-3 ${entry === o.id ? "border-accent ring-1 ring-accent" : "border-line hover:border-ink-muted"}`}>
                        <input type="radio" name={`entry-${r.productId}`} checked={entry === o.id} onChange={() => setEntry(o.id)} className="mt-0.5 accent-[var(--accent)]" />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{o.title}</span>
                          <span className="block text-xs text-ink-2">{o.sub}</span>
                          {o.id === "win" && entry === "win" && (
                            <span className="mt-2 flex items-center gap-1.5 text-xs font-medium">
                              <input type="checkbox" id={`stock-${r.productId}`} checked={hasStock} onChange={(e) => setHasStock(e.target.checked)} className="accent-[var(--accent)]" />
                              <label htmlFor={`stock-${r.productId}`} className="cursor-pointer">Đã có hàng + nguồn nhập</label>
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team phụ trách" className="rounded-md border border-line bg-page px-2 py-1.5">
                      <option value="">Team của bạn</option>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (tuỳ chọn)" className="min-w-40 flex-1 rounded-md border border-line bg-page px-2 py-1.5" />
                    <button onClick={() => setOpen(null)} className="rounded-md px-3 py-1.5 text-ink-2 hover:bg-grid">Huỷ</button>
                    <button disabled={pending || (entry === "win" && !hasStock)} onClick={() => act(r.productId, "accept")}
                      className="rounded-md bg-accent px-4 py-1.5 font-medium text-white hover:opacity-90 disabled:opacity-60">{pending ? "Đang xử lý…" : "Xác nhận"}</button>
                  </div>
                  {entry === "win" && !hasStock && <p className="text-2xs text-ink-muted">Tick “Đã có hàng + nguồn nhập” để vào thẳng P4; chưa có hàng thì chọn làm lại từ P1.</p>}
                  {error && <p className="text-xs text-bad">⛔ {error}</p>}
                </div>
                </div>
              )}
            </li>
          );
        })}</Paged>
      </ul>
      {!canReview && <p className="border-t border-line px-4 py-2 text-2xs text-ink-muted">Quản lý / R&amp;D / trưởng team quyết định.</p>}
      {!open && error && <p className="border-t border-line px-4 py-2 text-xs text-bad">⛔ {error}</p>}
    </section>
  );
}
