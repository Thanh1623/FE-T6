"use client";

import { startRouteProgress } from "@/components/RouteProgress";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";

// Ô chọn dạng TÌM KIẾM: gõ để lọc danh sách (không cần dấu), ↑ ↓ + Enter hoặc bấm để chọn; lựa chọn ghi vào tham số URL.
// query: chuỗi tham số URL hiện tại (máy chủ đưa xuống) để giữ nguyên các tham số khác.
const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

export default function ParamCombobox({ label, param, value, options, query, placeholder = "Gõ để tìm…", hash = "" }: {
  label: string; param: string; value: string; options: { value: string; label: string }[]; query: string; placeholder?: string; hash?: string;
}) {
  const router = useRouter(), pathname = usePathname();
  const current = options.find((o) => o.value === value);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  const shown = useMemo(() => {
    const words = norm(text).split(/\s+/).filter(Boolean);
    return words.length ? options.filter((o) => words.every((w) => norm(o.label).includes(w))) : options;
  }, [text, options]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); setText(""); } };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, open]);

  function pick(v: string) {
    setOpen(false); setText("");
    if (v === value) return;
    const p = new URLSearchParams(query);
    p.set(param, v);
    start(() => { startRouteProgress(); router.push(`${pathname}?${p}${hash}`, { scroll: false }); });
  }
  const hasParam = new URLSearchParams(query).has(param);   // đang chọn 1 mẫu cụ thể (có thể bỏ lọc)
  function clear() {
    setText(""); setOpen(false);
    if (!hasParam) return;
    const p = new URLSearchParams(query);
    p.delete(param);
    start(() => { startRouteProgress(); router.push(`${pathname}${p.size ? `?${p}` : ""}${hash}`, { scroll: false }); });
  }
  const openList = () => { setOpen(true); setActive(Math.max(0, shown.findIndex((o) => o.value === value))); };

  return (
    <div ref={box} className="relative w-80 max-w-full">
      <div className={`flex items-center gap-2 rounded-lg border bg-surface px-2.5 py-1.5 text-sm ${open ? "border-accent" : "border-line"} ${pending ? "opacity-60" : ""}`}>
        <span aria-hidden className="text-sm text-ink-muted">🔍</span>
        <span className="flex-none text-ink-muted">{label}</span>
        <input ref={input} value={open ? text : current?.label ?? ""} placeholder={open ? placeholder : current?.label ?? placeholder}
          onFocus={() => { openList(); }} onChange={(e) => { setText(e.target.value); setActive(0); if (!open) setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); if (!open) openList(); else setActive((i) => Math.min(shown.length - 1, i + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
            else if (e.key === "Enter") { e.preventDefault(); if (open && shown[active]) pick(shown[active].value); }
            else if (e.key === "Escape") { setOpen(false); setText(""); input.current?.blur(); }
          }}
          aria-label={label} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          className="min-w-0 flex-1 bg-transparent font-semibold text-ink-1 outline-none placeholder:font-semibold placeholder:text-ink-1" />
        {/* ✕ luôn hiện: xoá chữ đang gõ / bỏ mẫu đang chọn (mờ khi chưa có gì để bỏ) */}
        <button type="button" aria-label="Bỏ lọc" title={text || hasParam ? "Bỏ lọc (về mẫu đầu tiên)" : "Chưa có bộ lọc"} disabled={!text && !hasParam} onClick={clear}
          className="rounded px-1 text-xs text-ink-muted enabled:hover:bg-grid enabled:hover:text-ink-1 disabled:opacity-30">✕</button>
        <button type="button" tabIndex={-1} aria-label="Mở danh sách" onClick={() => { if (open) { setOpen(false); setText(""); } else { openList(); input.current?.focus(); } }} className="text-xs text-ink-muted">▾</button>
      </div>
      {open && (
        <ul ref={list} id={listId} role="listbox" className="absolute right-0 z-30 mt-1 max-h-64 w-full min-w-[18rem] overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-lg">
          {shown.map((o, i) => (
            <li key={o.value} data-i={i}>
              <button type="button" role="option" aria-selected={o.value === value} onMouseEnter={() => setActive(i)} onClick={() => pick(o.value)}
                className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm ${i === active ? "bg-grid" : ""} ${o.value === value ? "font-semibold text-accent" : ""}`}>
                <span className="truncate">{o.label}</span>{o.value === value && <span className="text-xs">✓</span>}
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="px-2 py-3 text-center text-xs text-ink-muted">Không có mẫu nào khớp “{text}”</li>}
        </ul>
      )}
    </div>
  );
}
