import { KPI_METRICS, KPI_OPS, type KpiRule } from "@/lib/kpi-constants";

// Danh sách điều kiện KPI dạng bảng gọn: tên chỉ số bên trái, ngưỡng (số lớn) bên phải; "và / hoặc" nối các dòng. chips: điều kiện phụ (ngày, lượt xem tối thiểu).
export default function RuleList({ rules, match, chips = [] }: { rules: KpiRule[]; match: "all" | "any"; chips?: string[] }) {
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {rules.map((r, i) => {
          const m = KPI_METRICS[r.metric];
          return (
            <li key={i} className="flex items-center justify-between gap-3 px-3.5 py-2.5" title={m.hint}>
              <span className="flex items-center gap-2 text-sm text-ink-2">
                {i > 0 && <span className="rounded bg-grid px-1.5 py-px text-2xs font-semibold uppercase tracking-wide text-ink-muted">{match === "all" ? "và" : "hoặc"}</span>}
                {m.label}
              </span>
              <span className="whitespace-nowrap text-base font-semibold tabular-nums">{KPI_OPS[r.op]} {r.value.toLocaleString("vi-VN")}{m.unit}</span>
            </li>
          );
        })}
      </ul>
      {chips.length > 0 && <div className="flex flex-wrap gap-1.5">{chips.map((c) => <span key={c} className="rounded-md bg-grid px-2.5 py-0.5 text-xs text-ink-2">{c}</span>)}</div>}
    </div>
  );
}
