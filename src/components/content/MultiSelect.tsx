"use client";

import { useEffect, useRef, useState } from "react";

export type Option = { value: string; label: string; hint?: string };

// Ô lọc chọn nhiều bằng tick. Rỗng = "Tất cả". Chỉ gửi khi bấm "Áp dụng" (tick nhiều mục không tải trang nhiều lần).
// emptyLabel: chữ hiện khi không chọn gì. fullIsAll=false: chọn hết vẫn gửi đủ danh sách (khi "chọn hết" ≠ "không lọc",
// vd chọn mọi Page của mình ≠ toàn hệ thống).
export default function MultiSelect({
  label, options, selected, onApply, emptyLabel = "Tất cả", fullIsAll = true, align = "auto", soft,
}: {
  label: string; options: Option[]; selected: string[]; onApply: (values: string[]) => void;
  emptyLabel?: string; fullIsAll?: boolean; align?: "auto" | "left" | "right";
  soft?: boolean;   // kiểu gọn không viền, cùng kiểu ParamSelect soft
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);
  const [prevSelected, setPrevSelected] = useState(selected);
  const box = useRef<HTMLDivElement>(null);
  const [alignRight, setAlignRight] = useState(align === "right");

  // Đồng bộ draft khi selected từ ngoài thay đổi
  if (prevSelected !== selected) {
    setPrevSelected(selected);
    setDraft(selected);
  }

  const toggleOpen = () => {
    if (!open) {
      setDraft(selected);
      if (align === "right") {
        setAlignRight(true);
      } else if (align === "left") {
        setAlignRight(false);
      } else if (box.current) {
        const rect = box.current.getBoundingClientRect();
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        setAlignRight(rect.left + 320 > viewportWidth);
      }
    }
    setOpen((o) => !o);
  };

  // Đóng khi bấm ra ngoài / phím Esc (bỏ thay đổi chưa áp dụng)
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  const toggle = (v: string) => setDraft((d) => (d.includes(v) ? d.filter((x) => x !== v) : [...d, v]));
  const summary = !selected.length ? emptyLabel
    : selected.length === options.length ? "Tất cả"
    : selected.length === 1 ? options.find((o) => o.value === selected[0])?.label ?? selected[0] : `${selected.length} mục`;

  return (
    <div ref={box} className="relative">
      <button type="button" aria-expanded={open}
        onClick={toggleOpen}
        className={soft
          ? `flex h-8 max-w-56 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs transition-colors ${selected.length ? "bg-accent/10 text-accent" : "bg-grid text-ink-1 hover:bg-line"}`
          : `flex h-[34px] max-w-64 items-center gap-1 rounded-lg border bg-surface px-2.5 text-sm hover:bg-grid ${selected.length ? "border-accent" : "border-line"}`}>
        <span className={soft ? "opacity-60" : "text-ink-muted"}>{label}</span>
        <span className="truncate font-medium">{summary}</span>
        <span className={soft ? "text-[10px] opacity-60" : "text-ink-muted"}>▾</span>
      </button>
      {open && (
        <div className={`absolute z-30 mt-1 w-72 sm:w-80 max-w-[calc(100vw-1rem)] rounded-lg border border-line bg-surface p-2 shadow-lg ${alignRight ? "right-0" : "left-0"}`}>
          <div className="mb-1 flex items-center justify-between px-2 text-xs">
            <button type="button" onClick={() => setDraft(options.map((o) => o.value))} className="text-accent hover:underline">Chọn tất cả</button>
            <button type="button" onClick={() => setDraft([])} className="text-ink-2 hover:underline">Bỏ chọn</button>
          </div>
          <ul className="max-h-72 overflow-y-auto">
            {options.map((o) => (
              <li key={o.value}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-grid" title={o.label}>
                  <input type="checkbox" checked={draft.includes(o.value)} onChange={() => toggle(o.value)} className="accent-[var(--accent)]" />
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="flex-none text-xs text-ink-muted">{o.hint}</span>}
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-line px-2 pt-2">
            <span className="text-xs text-ink-muted truncate" title={draft.length ? `Đã chọn ${draft.length}` : `Không chọn = ${emptyLabel.toLowerCase()}`}>
              {draft.length ? `Đã chọn ${draft.length}` : `Không chọn = ${emptyLabel.toLowerCase()}`}
            </span>
            <button type="button" onClick={() => { setOpen(false); onApply(fullIsAll && draft.length === options.length ? [] : draft); }}
              className="flex-none rounded-md bg-accent px-3 py-1 text-sm font-medium text-white hover:opacity-90">Áp dụng</button>
          </div>
        </div>
      )}
    </div>
  );
}
