import Sparkline from "@/components/rnd/Sparkline";
import type { CardStats } from "@/lib/rnd";

const n = (v: number) => Math.round(v).toLocaleString("vi-VN");
const pct = (v: number | null, d = 1) => (v === null ? "–" : `${v.toLocaleString("vi-VN", { maximumFractionDigits: d })}%`);
function Cell({ label, value, sub, compact, tone }: { label: string; value: string; sub?: string; compact?: boolean; tone?: string }) {
  return (
    <div className="min-w-0" title={compact && sub ? sub : undefined}>
      <div className={`${compact ? "text-2xs" : "text-2xs"} uppercase tracking-wide text-ink-muted`}>{label}</div>
      <div className={`tabular truncate font-bold ${compact ? "text-sm" : "text-base"} ${tone ?? ""}`}>{value}</div>
      {sub && !compact && <div className="truncate text-2xs text-ink-muted">{sub}</div>}
    </div>
  );
}

// Khối chỉ số tổng quát: Traffic · Bán hàng · Xu hướng (dùng trên thẻ và trang chi tiết)
// compact: thẻ nhỏ trong lưới 3–4 cột — ẩn dòng phụ (vẫn xem được khi rê chuột)
export default function RndStats({ s, today, compact }: { s: CardStats; today: string; compact?: boolean }) {
  // Bán > người xem: mã đã bán từ trước khi đăng bài test → chuyển đổi không còn ý nghĩa
  const convOdd = s.conversion !== null && s.conversion > 100;
  const trend = s.trendPct === null ? "mới có bán" : `${s.trendPct >= 0 ? "▲" : "▼"} ${pct(Math.abs(s.trendPct), 0)}${compact ? "" : " 7 ngày"}`;

  return (
    <div className="space-y-2">
      <div className={`grid grid-cols-3 rounded-lg bg-page ${compact ? "gap-x-2 gap-y-1.5 p-2" : "gap-x-3 gap-y-2 p-2.5"}`}>
        <Cell compact={compact} label="Lượt xem" tone="text-good" value={n(s.views)} sub={`${n(s.posts)} bài · ${n(s.videos)} video`} />
        <Cell compact={compact} label="Người xem" value={n(s.viewers)} sub={`${n(s.reactions)} cảm xúc`} />
        <Cell compact={compact} label="CTR" value={pct(s.ctr, 2)} sub={`${n(s.clicks)} lượt nhấp`} />
        <Cell compact={compact} label="SL bán" tone="text-bad" value={n(s.qtyNet)} sub="thuần, mọi kênh" />
        <Cell compact={compact} label="Chuyển đổi" tone={convOdd ? undefined : "text-good"} value={convOdd ? "–" : pct(s.conversion, 2)}
          sub={convOdd ? "bán từ trước khi test" : "SL bán ÷ người xem"} />
      </div>
      <div className="flex items-center justify-between gap-2 text-2xs text-ink-muted">
        <span>
          {s.since
            ? compact ? `${s.since.slice(8, 10)}/${s.since.slice(5, 7)} · ${n(s.days ?? 0)} ngày` : `Từ bài đầu ${s.since.slice(8, 10)}/${s.since.slice(5, 7)} · ${n(s.days ?? 0)} ngày`
            : "Chưa có bài"}
        </span>
        <span className="flex items-center gap-2" title="Số bán thuần 30 ngày gần nhất">
          <span className={s.trendPct !== null && s.trendPct < 0 ? "text-bad" : s.trendPct ? "text-good" : ""}>{trend}</span>
          <Sparkline values={s.daily} endDate={today} width={compact ? 72 : 120} />
        </span>
      </div>
    </div>
  );
}
