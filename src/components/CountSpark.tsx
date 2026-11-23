// Biểu đồ mini xu hướng của một số đếm theo ngày: đường + mũi tên + chênh lệch so với điểm đầu. `goodWhen`: tăng là tốt (xanh) hay giảm là tốt (tồn xấu).
// Màu chỉ là mã hoá phụ — luôn có mũi tên và chữ.
export default function CountSpark({ points, goodWhen = "up" }: { points: { day: string; v: number }[]; goodWhen?: "up" | "down" | "neutral" }) {
  if (points.length < 2) return <div className="text-right text-2xs leading-tight text-ink-muted" title="Số SPU được chụp mỗi ngày khi mở trang; cần ít nhất 2 ngày để vẽ xu hướng">Xu hướng: chưa đủ dữ liệu</div>;
  const first = points[0].v, last = points[points.length - 1].v, diff = last - first;
  const W = 72, H = 22, pad = 2;
  const lo = Math.min(...points.map((p) => p.v)), hi = Math.max(...points.map((p) => p.v)), span = Math.max(1, hi - lo);
  const xy = points.map((p, i) => [pad + (i / (points.length - 1)) * (W - 2 * pad), H - pad - ((p.v - lo) / span) * (H - 2 * pad)] as const);
  const dir = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  const color = dir === "flat" || goodWhen === "neutral" ? "var(--ink-muted)" : dir === goodWhen ? "var(--good)" : "var(--bad)";
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "■";
  const pct = first > 0 ? Math.round((diff / first) * 100) : null;
  const nf = (n: number) => n.toLocaleString("vi-VN");
  const tip = points.map((p) => `${p.day.slice(8, 10)}/${p.day.slice(5, 7)}: ${nf(p.v)}`).join("\n");
  const [lx, ly] = xy[xy.length - 1];
  return (
    <div className="flex shrink-0 flex-col items-end gap-0.5" title={`Số SPU theo ngày (${points.length} ngày gần nhất)\n${tip}`}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Xu hướng ${points.length} ngày: ${dir === "up" ? "tăng" : dir === "down" ? "giảm" : "ổn định"} ${diff > 0 ? "+" : ""}${diff}`}>
        <polyline points={xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
        <circle cx={lx} cy={ly} r={2.2} fill={color} />
      </svg>
      <span className="whitespace-nowrap text-2xs font-medium tabular-nums" style={{ color }}>{arrow} {diff > 0 ? "+" : ""}{nf(diff)}{pct !== null ? ` (${pct > 0 ? "+" : ""}${pct}%)` : ""}</span>
    </div>
  );
}
