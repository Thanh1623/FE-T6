"use client";

import { useEffect, useRef, useState } from "react";
import { fmtTr } from "@/lib/format";

// Biểu đồ SVG vẽ đúng bề rộng thật của khung (1 đơn vị = 1px) để chữ luôn cỡ 12px — cùng cách vẽ với bản mẫu.
function useWidth(min = 260) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(min, Math.floor(el.clientWidth))));
    ro.observe(el);
    setW(Math.max(min, Math.floor(el.clientWidth)));
    return () => ro.disconnect();
  }, [min]);
  return [ref, w] as const;
}
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const vn = (n: number, d = 1) => n.toLocaleString("vi-VN", { maximumFractionDigits: d });

// Số sản phẩm khách đặt mỗi ngày: vùng tô, đánh dấu ngày cao nhất / thấp nhất / cuối; rê chuột xem từng ngày
const WEEKDAY = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
export function DailyChart({ data }: { data: { d: string; q: number; o?: number; c?: number }[] }) {
  const [ref, W] = useWidth();
  const [tip, setTip] = useState<{ x: number; y: number; i: number } | null>(null);
  const H = 190, l = 26, r = 8, t = 14, b = 24, n = Math.max(data.length, 2);
  const max = Math.max(50, Math.ceil(Math.max(...data.map((x) => x.q), 1) / 10) * 10), step = (W - l - r) / (n - 1);
  const X = (i: number) => l + i * step, Y = (q: number) => t + (H - t - b) * (1 - q / max);
  const line = data.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.q).toFixed(1)}`).join(" ");
  const qs = data.map((x) => x.q), hi = qs.indexOf(Math.max(...qs)), lo = qs.indexOf(Math.min(...qs));
  const ticks = [0, 1, 2, 3, 4, 5].map((k) => Math.round((max / 5) * k));
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));
  return (
    <div ref={ref} className="chart" style={{ position: "relative" }}>
      {W > 0 && data.length > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Số sản phẩm khách đặt mỗi ngày" onMouseLeave={() => setTip(null)}>
          <defs><linearGradient id="trDaily" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2a78d6" stopOpacity=".28" /><stop offset="100%" stopColor="#2a78d6" stopOpacity="0" /></linearGradient></defs>
          {ticks.map((q) => <g key={q}><line className="gl" x1={l} x2={W - r} y1={Y(q)} y2={Y(q)} strokeDasharray={q ? "3 3" : "0"} /><text x={l - 6} y={Y(q) + 4} textAnchor="end">{q}</text></g>)}
          {data.length > 1 && <><path d={`${line} L${X(n - 1)} ${Y(0)} L${X(0)} ${Y(0)} Z`} fill="url(#trDaily)" /><path d={line} fill="none" stroke="#2a78d6" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" /></>}
          {data.map((p, i) => i % labelEvery === 0 && <text key={p.d} x={X(i)} y={H - 6} textAnchor="middle">{ddmm(p.d)}</text>)}
          {[hi, lo].filter((v, i, a) => a.indexOf(v) === i).map((i, k) => (
            <g key={i}><circle cx={X(i)} cy={Y(data[i].q)} r="3.5" fill="#fff" stroke="#2a78d6" strokeWidth="2" /><text x={X(i)} y={Y(data[i].q) + (k === 0 ? -8 : 16)} textAnchor="middle" className="val">{data[i].q}</text></g>))}
          <circle cx={X(data.length - 1)} cy={Y(data[data.length - 1].q)} r="4.5" fill="#2a78d6" stroke="#fff" strokeWidth="2" />
          {tip && <g pointerEvents="none"><line x1={X(tip.i)} x2={X(tip.i)} y1={t} y2={H - b} stroke="#2a78d6" strokeOpacity=".35" /><circle cx={X(tip.i)} cy={Y(data[tip.i].q)} r="4.5" fill="#fff" stroke="#2a78d6" strokeWidth="2" /></g>}
          {data.map((p, i) => <rect key={p.d} x={X(i) - step / 2} y={t} width={Math.max(step, 2)} height={H - t - b} fill="transparent" onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, i })} />)}
        </svg>
      )}
      {tip && data[tip.i] && (() => {
        const p = data[tip.i], avg = data.reduce((n, x) => n + x.q, 0) / data.length;
        return (
          <div className="tip" style={{ display: "block", left: Math.min(tip.x + 14, (typeof window === "undefined" ? 9999 : window.innerWidth) - 230), top: tip.y + 14 }}>
            <div className="t">{WEEKDAY[new Date(`${p.d}T00:00:00Z`).getUTCDay()]} {ddmm(p.d)}</div>
            <div className="r"><span>Sản phẩm đặt</span><b>{p.q.toLocaleString("vi-VN")}</b></div>
            {p.o !== undefined && <div className="r"><span>Đơn</span><b>{p.o.toLocaleString("vi-VN")}</b></div>}
            {!!p.c && <div className="r"><span>Đơn hủy</span><b>{p.c.toLocaleString("vi-VN")}</b></div>}
            <div className="r"><span>So với TB kỳ</span><b>{p.q >= avg ? "▲ +" : "▼ -"}{vn(Math.abs(p.q - avg))} ({vn(avg)})</b></div>
          </div>
        );
      })()}
    </div>
  );
}

export type CostBar = { name: string; q: number; orders?: number; rev: number; cost: number };
// Cột chồng 100%: dưới là vốn, trên là lợi nhuận gộp. Cột rộng; rê chuột xem doanh thu / vốn / lợi nhuận
export function CostStack({ rows }: { rows: CostBar[] }) {
  const [ref, W] = useWidth();
  const [tip, setTip] = useState<{ x: number; y: number; r: CostBar } | null>(null);
  const H = 240, l = 34, rr = 4, t = 8, bt = 28, ph = H - t - bt, pw = W - l - rr, gw = pw / Math.max(rows.length, 1), cw = Math.min(gw * 0.8, 260);
  const Y = (p: number) => t + ph * (1 - p / 100);
  return (
    <div ref={ref} className="chart" style={{ position: "relative" }}>
      {W > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Cột chồng vốn và lợi nhuận gộp theo chất liệu">
          {[0, 25, 50, 75, 100].map((g) => <g key={g}><line className="gl" x1={l} x2={W - rr} y1={Y(g)} y2={Y(g)} strokeDasharray={g ? "3 3" : "0"} /><text x={l - 6} y={Y(g) + 4} textAnchor="end">{g}%</text></g>)}
          {rows.map((c, i) => {
            const cx = l + gw * i + gw / 2, x = cx - cw / 2, v = c.rev ? (c.cost / c.rev) * 100 : null, cost = Math.min(v ?? 0, 100);
            return (
              <g key={c.name}>
                <text x={cx} y={H - 8} textAnchor="middle" style={{ fill: "var(--ink2)", fontWeight: i === rows.length - 1 ? 600 : 400 }}>{c.name}</text>
                {v === null ? <text x={cx} y={Y(50)} textAnchor="middle">–</text> : <>
                  <rect x={x} y={Y(cost)} width={cw} height={(ph * cost) / 100} fill="#2a78d6" />
                  <rect x={x} y={Y(100)} width={cw} height={(ph * (100 - cost)) / 100} fill="#cfe0f7" />
                  {(ph * cost) / 100 > 18 ? <text x={cx} y={Y(cost) + 15} textAnchor="middle" style={{ fill: "#fff", fontSize: 12 }}>{vn(v)}%</text> : <text x={cx} y={Y(cost) - 4} textAnchor="middle" className="val">{vn(v)}%</text>}
                  {(ph * (100 - cost)) / 100 > 18 && <text x={cx} y={Y(100) + 15} textAnchor="middle" style={{ fill: "var(--ink2)", fontSize: 12 }}>{vn(100 - v)}%</text>}
                </>}
                <rect x={l + gw * i} y={t} width={gw} height={ph + 20} fill={tip?.r === c ? "rgba(42,120,214,.07)" : "transparent"}
                  onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, r: c })} onMouseLeave={() => setTip(null)} />
              </g>
            );
          })}
        </svg>
      )}
      {tip && (
        <div className="tip" style={{ display: "block", left: Math.min(tip.x + 14, (typeof window === "undefined" ? 9999 : window.innerWidth) - 240), top: tip.y + 14 }}>
          <div className="t">{tip.r.name}</div>
          <div className="r"><span>Đơn</span><b>{tip.r.orders === undefined ? "–" : tip.r.orders.toLocaleString("vi-VN")}</b></div>
          <div className="r"><span>Sản phẩm</span><b>{tip.r.q.toLocaleString("vi-VN")}</b></div>
          <div className="r"><span>Doanh thu</span><b>{fmtTr(tip.r.rev)}</b></div>
          <div className="r"><span>Vốn</span><b>{fmtTr(tip.r.cost)} ({tip.r.rev ? vn((tip.r.cost / tip.r.rev) * 100) : "–"}%)</b></div>
          <div className="r"><span>Lợi nhuận gộp</span><b>{fmtTr(tip.r.rev - tip.r.cost)} ({tip.r.rev ? vn(((tip.r.rev - tip.r.cost) / tip.r.rev) * 100) : "–"}%)</b></div>
        </div>
      )}
    </div>
  );
}
