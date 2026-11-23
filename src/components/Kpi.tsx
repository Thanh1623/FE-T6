// Ô chỉ số: số lớn + % so kỳ trước (mũi tên + chữ, không chỉ dựa vào màu)
export default function Kpi({ label, value, current, previous, hint }: {
  label: string; value: string; current?: number; previous?: number; hint?: string;
}) {
  let delta: React.ReactNode = null;
  if (current !== undefined && previous !== undefined) {
    if (previous > 0) {
      const pct = ((current - previous) / previous) * 100;
      const up = pct >= 0;
      delta = (
        <span className={up ? "text-good" : "text-bad"}>
          {up ? "▲" : "▼"} {Math.abs(pct).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%
        </span>
      );
    } else if (current > 0) delta = <span className="text-ink-muted">mới</span>;
  }
  return (
    <div className="@container min-w-0 rounded-xl border border-line bg-surface p-4">
      <div className="break-words text-sm text-ink-2">{label}</div>
      {/* Cỡ số co theo bề rộng ô (container query): màn hình nhỏ / ô hẹp thì số nhỏ lại thay vì tràn ra ngoài */}
      <div className="mt-1 whitespace-nowrap font-semibold tabular leading-tight text-[clamp(0.95rem,10cqw,1.5rem)]" title={value}>{value}</div>
      <div className="mt-1 text-xs text-ink-muted">
        {delta}{delta && " so với kỳ trước"}{hint && <div>{hint}</div>}
      </div>
    </div>
  );
}
