import type { Trend } from "@/lib/trend";

// Biểu đồ mini 14 ngày: đường = TỔNG lượt xem của bài tại từng ngày (số cộng dồn đã ghi); mũi tên + % = xu hướng lượt xem tăng thêm
// mỗi ngày (nửa sau so với nửa đầu). Màu chỉ là mã hoá phụ — luôn có mũi tên và chữ.
export default function TrendSpark({ trend }: { trend: Trend | undefined }) {
  if (!trend || trend.direction === "none" || trend.totals.length < 2) {
    return <div className="text-2xs text-ink-muted" title="Cần ít nhất 2 ngày đồng bộ để vẽ xu hướng">Xu hướng 14 ngày: chưa đủ dữ liệu</div>;
  }
  const { totals, days, direction, changePct } = trend;
  const gainOf = new Map(days.map((d) => [d.date, d.gain]));
  const W = 96, H = 24, pad = 2;
  const lo = Math.min(...totals.map((t) => t.views)), hi = Math.max(...totals.map((t) => t.views));
  const span = Math.max(1, hi - lo);
  const pts = totals.map((t, i) => [pad + (i / (totals.length - 1)) * (W - 2 * pad), H - pad - ((t.views - lo) / span) * (H - 2 * pad)] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const color = direction === "up" ? "var(--good)" : direction === "down" ? "var(--bad)" : "var(--ink-muted)";
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "■";
  const label = direction === "up" ? "Đang tăng" : direction === "down" ? "Đang giảm" : "Ổn định";
  const nf = (n: number) => n.toLocaleString("vi-VN");
  const tip = totals.map((t) => `${t.date.slice(8, 10)}/${t.date.slice(5, 7)}: ${nf(t.views)}${gainOf.has(t.date) ? ` (+${nf(gainOf.get(t.date)!)})` : ""}`).join("\n");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <div className="flex items-center gap-2" title={`Tổng lượt xem theo ngày (và mức tăng trong ngày)\n${tip}`}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Tổng lượt xem ${totals.length} ngày gần nhất: ${label}`}>
        <polyline points={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
        <circle cx={lx} cy={ly} r={2.4} fill={color} />
      </svg>
      <span className="text-2xs font-medium" style={{ color }}>
        {arrow} {label}{changePct !== null ? ` ${changePct > 0 ? "+" : ""}${Math.round(changePct)}%` : ""}
      </span>
    </div>
  );
}
