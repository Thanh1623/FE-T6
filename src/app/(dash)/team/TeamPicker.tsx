"use client";

import { useEffect, useRef, useState } from "react";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();

// Chọn team có ô tìm kiếm (gõ không dấu cũng được). Gửi id team qua input name="team_id".
export default function TeamPicker({ teams, name = "team_id", className = "" }: { teams: { id: string; name: string }[]; name?: string; className?: string }) {
  const [id, setId] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const shown = teams.filter((t) => norm(t.name).includes(norm(q)));
  const picked = teams.find((t) => t.id === id);

  return (
    <div ref={box} className={`relative ${className}`}>
      {/* input ẩn (vẫn kiểm tra "bắt buộc chọn") + giá trị gửi lên */}
      <input name={name} value={id} onChange={() => {}} required tabIndex={-1} aria-hidden className="pointer-events-none absolute inset-0 opacity-0" />
      <input value={open ? q : picked?.name ?? ""} placeholder="🔍 Chọn / tìm team…" autoComplete="off"
        onFocus={() => { setQ(""); setOpen(true); }} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        className="w-full min-w-40 rounded-md border border-line bg-page px-2 py-1 text-xs outline-none focus:border-accent" />
      {open && (
        <ul className="absolute left-0 top-full z-30 mt-1 max-h-52 w-full min-w-40 overflow-auto rounded-lg border border-line bg-surface py-1 text-xs shadow-lg">
          {shown.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => { setId(t.id); setOpen(false); }}
                className={`block w-full px-3 py-1.5 text-left hover:bg-grid ${t.id === id ? "font-semibold text-accent" : ""}`}>{t.name}</button>
            </li>
          ))}
          {!shown.length && <li className="px-3 py-1.5 text-ink-muted">Không có team phù hợp</li>}
        </ul>
      )}
    </div>
  );
}
