// Biểu đồ cột nhỏ: SL bán thuần 30 ngày (cũ → mới). Mỗi cột có <title> để rê chuột xem số.
export default function Sparkline({ values, endDate, width = 120 }: { values: number[]; endDate: string; width?: number }) {
  const max = Math.max(1, ...values);
  const w = width, h = width < 100 ? 20 : 28, gap = 1, bw = (w - gap * (values.length - 1)) / values.length;
  const label = (i: number) => {
    const d = new Date(Date.parse(endDate) - (values.length - 1 - i) * 86_400_000);
    return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label="Số bán 30 ngày" className="flex-none">
      <line x1={0} x2={w} y1={h - 0.5} y2={h - 0.5} stroke="var(--axis)" strokeWidth={1} />
      {values.map((v, i) => {
        const bh = v > 0 ? Math.max(2, (Math.max(0, v) / max) * (h - 2)) : 0;
        return (
          <rect key={i} x={i * (bw + gap)} y={h - 1 - bh} width={bw} height={bh} rx={1} fill="var(--series-1)">
            <title>{`${label(i)}: ${v.toLocaleString("vi-VN")} cái`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
