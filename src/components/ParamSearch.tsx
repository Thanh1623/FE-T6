"use client";

import { startRouteProgress } from "@/components/RouteProgress";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

// Ô tìm kiếm ghi từ khoá vào tham số URL (mặc định `q`): gõ xong ~0,3 giây mới lọc, giữ nguyên các tham số khác, về lại đầu danh sách.
// query: chuỗi tham số URL hiện tại (máy chủ đưa xuống) để dùng chung với các bộ lọc khác.
export default function ParamSearch({ value, query, param = "q", placeholder = "Tìm…", className = "" }: {
  value: string; query: string; param?: string; placeholder?: string; className?: string;
}) {
  const router = useRouter(), pathname = usePathname();
  const [text, setText] = useState(value);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushed = useRef(value);   // giá trị mình vừa đẩy lên URL — URL trả về đúng giá trị này thì KHÔNG ghi đè ô đang gõ dở
  useEffect(() => { if (value !== lastPushed.current) { lastPushed.current = value; setText(value); } }, [value]);   // đồng bộ khi URL đổi từ nơi khác (vd bấm xoá bộ lọc)

  const push = (v: string) => {
    lastPushed.current = v.trim();
    const p = new URLSearchParams(query);
    if (v.trim()) p.set(param, v.trim()); else p.delete(param);
    p.delete("page");
    start(() => { startRouteProgress(); router.replace(`${pathname}${p.size ? `?${p}` : ""}`, { scroll: false }); });
  };
  const change = (v: string) => {
    setText(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => push(v), 300);
  };

  return (
    <div className={`relative ${className}`}>
      <span aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-ink-muted">🔍</span>
      <input type="search" value={text} onChange={(e) => change(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        onKeyDown={(e) => { if (e.key === "Enter") { if (timer.current) clearTimeout(timer.current); push(text); } if (e.key === "Escape") change(""); }}
        className="w-full rounded-lg border border-line bg-surface py-1.5 pl-8 pr-8 text-sm outline-none focus:border-accent [&::-webkit-search-cancel-button]:hidden" />
      {text && (
        <button type="button" onClick={() => { setText(""); if (timer.current) clearTimeout(timer.current); push(""); }} aria-label="Xoá tìm kiếm"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-xs text-ink-muted hover:bg-grid hover:text-ink-1">✕</button>
      )}
      {pending && <span className="absolute -bottom-3 right-1 text-2xs text-ink-muted">đang lọc…</span>}
    </div>
  );
}
