"use client";

import { startRouteProgress } from "@/components/RouteProgress";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

// Ô chọn 1 giá trị dạng thả xuống, ghi lựa chọn vào tham số URL (giống kiểu các ô lọc khác: nhãn mờ + giá trị đậm + ▾).
// query: chuỗi tham số URL hiện tại (máy chủ đưa xuống) để giữ nguyên các bộ lọc khác; đổi lựa chọn → về trang 1.
// soft: kiểu gọn không viền (nền xám nhẹ, cao 32px, chữ nhỏ; đang lọc → nền + chữ xanh) — dùng trong thanh công cụ một hàng
export default function ParamSelect({ label, param, value, defaultValue, options, query, soft }: {
  label: string; param: string; value: string; defaultValue: string;
  options: { value: string; label: string }[]; query: string; soft?: boolean;
}) {
  const router = useRouter(), pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  function pick(v: string) {
    setOpen(false);
    if (v === value) return;
    const p = new URLSearchParams(query);
    if (v === defaultValue) p.delete(param); else p.set(param, v);
    p.delete("page");
    start(() => { startRouteProgress(); router.push(`${pathname}${p.size ? `?${p}` : ""}`); });
  }

  const [alignRight, setAlignRight] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (box.current) {
      const rect = box.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      setAlignRight(rect.left + 220 > viewportWidth);
    }
  }, [open]);

  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <div ref={box} className={`relative ${pending ? "opacity-60" : ""}`}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={soft
          ? `flex h-8 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs transition-colors ${value !== defaultValue ? "bg-accent/10 text-accent" : "bg-grid text-ink-1 hover:bg-line"}`
          : `flex items-center gap-1 rounded-lg border bg-surface px-2.5 py-1.5 text-sm hover:bg-grid ${value !== defaultValue ? "border-accent" : "border-line"}`}>
        <span className={soft ? "opacity-60" : "text-ink-muted"}>{label}</span>
        <span className="font-medium">{current}</span>
        <span className={soft ? "text-[10px] opacity-60" : "text-xs text-ink-muted"} aria-hidden>▾</span>
      </button>
      {open && (
        <ul role="listbox" className={`absolute top-full z-40 mt-1 min-w-44 max-w-[calc(100vw-1rem)] space-y-0.5 rounded-xl border border-line bg-surface p-1.5 shadow-xl ${alignRight ? "right-0" : "left-0"}`}>
          {options.map((o) => (
            <li key={o.value}>
              <button type="button" role="option" aria-selected={o.value === value} onClick={() => pick(o.value)}
                className={`flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-md px-3 py-1.5 text-left text-sm hover:bg-grid ${o.value === value ? "bg-grid font-medium text-accent" : ""}`}>
                {o.label}{o.value === value && <span aria-hidden>✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
