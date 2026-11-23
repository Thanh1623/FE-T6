"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { keyOf, useInfoEdit } from "@/components/rnd/InfoEdit";

type Kind = "text" | "link" | "money" | "select" | "multi" | "textarea";
export type InlineOption = { value: string; label?: string };

// Ô thông tin của trang chi tiết mẫu: mặc định chỉ hiện giá trị (display); khi bấm "Cập nhật" (InfoEditProvider) thì thành ô nhập.
// Sửa chỉ ghi vào bản nháp — bấm "Lưu" ở thanh Cập nhật mới lưu tất cả ô đã đổi.
// Mọi ô cùng một kiểu: khung viền cao 32px canh thẳng hàng với nhãn; chọn nhiều (dòng SP, loại đá) gọn trong 1 ô, bấm mở danh sách tick.
export default function InlineField({ table = "collection", field, kind, value, options, placeholder, display }: {
  table?: "collection" | "design"; field: string; kind: Kind;
  value: string | null; options?: InlineOption[]; placeholder?: string; display?: ReactNode;
}) {
  const ctx = useInfoEdit();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Danh sách chọn nhiều: bấm ra ngoài hoặc Esc để đóng
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  if (!ctx || !ctx.canEdit || !ctx.editing) return <>{display ?? (value || <span className="text-ink-muted">Chưa có</span>)}</>;

  const original = value ?? "";
  const current = ctx.draftOf(keyOf(table, field)) ?? original;
  const set = (v: string) => ctx.setDraft(table, field, v, original);
  const changed = current !== original;
  const box = `h-8 w-full rounded-md border bg-page px-2.5 text-sm font-medium outline-none transition hover:border-ink-muted focus:border-accent ${changed ? "border-accent/60" : "border-line"}`;

  if (kind === "select") {
    return (
      <select value={current} onChange={(e) => set(e.target.value)} className={`${box} cursor-pointer`} aria-label={field}>
        <option value="">— Chưa chọn —</option>
        {options?.map((o) => <option key={o.value} value={o.value}>{o.label ?? o.value}</option>)}
        {current && !options?.some((o) => o.value === current) && <option value={current}>{current}</option>}
      </select>
    );
  }
  if (kind === "multi") {
    const picked = current.split(/\s*,\s*/).filter(Boolean);
    const toggle = (v: string) => set((picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v]).join(", "));
    return (
      <div ref={wrap} className="relative">
        <button type="button" title={picked.join(", ") || undefined} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="listbox"
          className={`${box} flex items-center justify-between gap-2 text-left`}>
          <span className="flex min-w-0 flex-wrap gap-1 overflow-hidden">
            {picked.length ? picked.map((x) => <span key={x} className="truncate rounded-md bg-accent/10 px-2 text-xs font-semibold leading-5 text-accent">{x}</span>)
              : <span className="font-normal text-ink-muted">Chọn…</span>}
          </span>
          <span className="flex-none text-2xs text-ink-muted" aria-hidden>▾</span>
        </button>
        {open && (
          <ul role="listbox" aria-multiselectable className="absolute left-0 top-full z-30 mt-1 max-h-60 w-full min-w-48 overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-lg">
            {options?.map((o) => (
              <li key={o.value}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-grid">
                  <input type="checkbox" checked={picked.includes(o.value)} onChange={() => toggle(o.value)} className="accent-[var(--accent)]" />
                  {o.label ?? o.value}
                </label>
              </li>
            ))}
            {!options?.length && <li className="px-2 py-1.5 text-xs text-ink-muted">Chưa có danh sách (thêm ở Cấu hình)</li>}
          </ul>
        )}
      </div>
    );
  }
  if (kind === "textarea") {
    return <textarea value={current} onChange={(e) => set(e.target.value)} rows={2} placeholder={placeholder ?? "Nhập ghi chú…"}
      className={`w-full resize-y rounded-md border bg-page px-2.5 py-1.5 text-sm outline-none transition hover:border-ink-muted focus:border-accent ${changed ? "border-accent/60" : "border-line"}`} />;
  }
  const link = kind === "link" && current && /^https?:\/\//i.test(current);
  return (
    <div className="flex items-center gap-1.5">
      <input value={current} onChange={(e) => set(e.target.value)} inputMode={kind === "money" ? "numeric" : undefined} placeholder={placeholder ?? (kind === "link" ? "Dán link…" : "Nhập…")}
        className={`${box} min-w-0 flex-1 ${kind === "money" ? "text-right tabular-nums" : ""}`} aria-label={field} />
      {link && <a href={current} target="_blank" rel="noreferrer" title="Mở link" className="flex h-8 w-8 flex-none items-center justify-center rounded-md border border-line text-accent hover:bg-grid">↗</a>}
    </div>
  );
}
