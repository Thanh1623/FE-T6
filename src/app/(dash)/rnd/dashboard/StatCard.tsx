// Thẻ số có biểu tượng tròn bên trái (khối "Sản phẩm & kết quả test"): màu theo kết quả, chữ số lớn, dòng phụ nhỏ
const PATHS = {
  trophy: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></>,
  bars: <path d="M5 20V11M12 20V5M19 20v-7" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  pause: <><circle cx="12" cy="12" r="9" /><path d="M10 9v6M14 9v6" /></>,
} as const;

export default function StatCard({ icon, label, value, tone, sub }: { icon: keyof typeof PATHS; label: string; value: string; tone: string; sub?: string }) {
  return (
    <div className={`flex min-w-0 items-center gap-3 rounded-xl border px-4 py-3 shadow-sm ${tone === "--res-win" ? "border-[color-mix(in_srgb,var(--res-win)_20%,var(--surface))] bg-[color-mix(in_srgb,var(--res-win)_8%,var(--surface))]" : tone === "--res-fail" ? "border-[color-mix(in_srgb,var(--bad)_18%,var(--surface))] bg-[color-mix(in_srgb,var(--bad)_8%,var(--surface))]" : "border-[color-mix(in_srgb,var(--accent)_16%,var(--surface))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"}`}>
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, var(${tone}) 16%, transparent)`, color: `var(${tone})` }} aria-hidden>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{PATHS[icon]}</svg>
      </span>
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold uppercase tracking-wide text-ink-2">{label}</div>
        <div className="text-2xl font-semibold leading-tight tabular" style={{ color: `var(${tone})` }}>{value}</div>
        {sub && <div className="truncate text-2xs text-ink-muted" title={sub}>{sub}</div>}
      </div>
    </div>
  );
}
