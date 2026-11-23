"use client";

import { useEffect, useRef, useState } from "react";
import { RANGE_OPTIONS, rangeLabel, resolveRange } from "@/lib/date-range";

// Bộ chọn khoảng thời gian: ô thả xuống các mốc nhanh (7/30/90 ngày, tháng này, tháng trước, 1 năm) + hai ô ngày cụ thể (Từ → Đến) + Áp dụng.
// Chọn mốc nhanh → hai ô ngày TỰ NHẢY theo mốc đó ngay lập tức và trang được lọc. Sửa tay ngày → ô thả xuống chuyển "Tuỳ chọn", bấm Áp dụng để lọc.
// Dùng chung cho mọi bộ lọc báo cáo; component cha ghi lựa chọn vào URL qua onPick.
const todayVN = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

// compact: kiểu gọn cho thanh công cụ một hàng — chỉ còn MỘT nút (không viền); hai ô ngày + Áp dụng nằm trong bảng thả xuống, dưới các mốc nhanh.
const dm = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "…");
export default function DateRangeSelect({ range, from, to, onPick, compact }: {
  range: string; from: string; to: string;
  onPick: (range: string, from?: string, to?: string) => void; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Giá trị đang chọn trên màn hình, chỉ dùng khi còn khớp với bộ lọc của trang (trang đổi bộ lọc → tự bỏ, dùng giá trị của trang)
  const base = `${range}|${from}|${to}`;
  const [local, setLocal] = useState<{ base: string; range: string; from: string; to: string } | null>(null);
  const cur = local && local.base === base ? local : { range, from, to };
  const dirty = cur.range === "custom" && (cur.from !== from || cur.to !== to || range !== "custom");
  const ref = useRef<HTMLDivElement>(null);

  const [alignRight, setAlignRight] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      setAlignRight(rect.left + 220 > viewportWidth);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  const pick = (r: string) => {
    setOpen(false);
    const d = resolveRange(r, todayVN());
    if (d) setLocal({ base, range: r, ...d });   // ô ngày nhảy ngay, không chờ trang tải lại
    onPick(r);
  };
  const edit = (f: string, t: string) => setLocal({ base, range: "custom", from: f, to: t });
  const apply = () => { if (cur.from && cur.to) { setOpen(false); onPick("custom", cur.from, cur.to); } };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div ref={ref} className="relative">
        <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}
          className={compact
            ? `flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs transition-colors ${cur.range === "custom" ? "bg-accent/10 text-accent" : "bg-grid text-ink-1 hover:bg-line"}`
            : `flex h-[34px] items-center gap-2 rounded-lg border bg-surface px-2.5 text-sm transition hover:bg-grid ${open ? "border-accent ring-2 ring-accent/15" : "border-line"}`}>
          {compact
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="opacity-70"><path d="M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM4 10h16M9 3v4M15 3v4" /></svg>
            : <span aria-hidden>📅</span>}
          <span className="font-medium">{compact && cur.range === "custom" ? `${dm(cur.from)} → ${dm(cur.to)}` : rangeLabel(cur.range)}</span>
          <span className={compact ? "text-[10px] opacity-60" : "text-xs text-ink-muted"} aria-hidden>▾</span>
        </button>
        {open && (
          <ul role="listbox" className={`absolute top-full z-40 mt-1 ${compact ? "w-64" : "w-48"} max-w-[calc(100vw-1rem)] space-y-0.5 rounded-xl border border-line bg-surface p-1.5 shadow-xl ${alignRight ? "right-0" : "left-0"}`}>
            {RANGE_OPTIONS.map((o) => (
              <li key={o.value}>
                <button type="button" role="option" aria-selected={cur.range === o.value} onClick={() => pick(o.value)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm hover:bg-grid ${cur.range === o.value ? "bg-grid font-medium text-accent" : ""}`}>
                  {o.label}{cur.range === o.value && <span aria-hidden>✓</span>}
                </button>
              </li>
            ))}
            {!compact && cur.range === "custom" && <li className="px-3 py-1.5 text-xs text-accent">Tuỳ chọn ✓ (chọn ngày bên cạnh)</li>}
            {compact && (
              <li className="mt-1 border-t border-line px-1.5 pb-1 pt-2">
                <div className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-ink-muted">Tuỳ chọn ngày{cur.range === "custom" ? " ✓" : ""}</div>
                <div className="flex items-center gap-1">
                  <input type="date" value={cur.from} max={cur.to} onChange={(e) => edit(e.target.value, cur.to)} aria-label="Từ ngày"
                    className="h-8 min-w-0 flex-1 rounded-md bg-grid px-1.5 text-xs tabular-nums text-ink-1 outline-none focus:ring-1 focus:ring-accent" />
                  <span className="text-ink-muted" aria-hidden>→</span>
                  <input type="date" value={cur.to} min={cur.from} onChange={(e) => edit(cur.from, e.target.value)} aria-label="Đến ngày"
                    className="h-8 min-w-0 flex-1 rounded-md bg-grid px-1.5 text-xs tabular-nums text-ink-1 outline-none focus:ring-1 focus:ring-accent" />
                </div>
                <button type="button" onClick={apply} disabled={!cur.from || !cur.to || !dirty}
                  className="mt-2 h-8 w-full rounded-md bg-accent text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-40">Áp dụng</button>
              </li>
            )}
          </ul>
        )}
      </div>

      {!compact && <div className={`flex h-[34px] items-center gap-1 rounded-lg border bg-surface px-1.5 text-sm transition ${dirty ? "border-accent ring-2 ring-accent/15" : cur.range === "custom" ? "border-accent/50" : "border-line"}`}>
        <input type="date" value={cur.from} max={cur.to} onChange={(e) => edit(e.target.value, cur.to)}
          className="h-6 rounded-md bg-transparent px-1.5 tabular-nums text-ink-1 outline-none hover:bg-grid focus:bg-grid" aria-label="Từ ngày" />
        <span className="font-semibold text-accent" aria-hidden>→</span>
        <input type="date" value={cur.to} min={cur.from} onChange={(e) => edit(cur.from, e.target.value)}
          className="h-6 rounded-md bg-transparent px-1.5 tabular-nums text-ink-1 outline-none hover:bg-grid focus:bg-grid" aria-label="Đến ngày" />
        <button type="button" onClick={apply} disabled={!cur.from || !cur.to}
          className={`h-6 rounded-md px-3 text-sm font-medium transition disabled:opacity-50 ${dirty ? "bg-accent text-white shadow-sm hover:opacity-90" : "bg-accent/10 text-accent hover:bg-accent/20"}`}>Áp dụng</button>
      </div>}
    </div>
  );
}
