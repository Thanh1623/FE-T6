"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TREND_SERIES } from "@/lib/rnd-result-series";

// Số mẫu bắt đầu test theo ngày / tuần, chồng theo kết quả. Lưới ngang nhạt + trục tung số nguyên; tooltip chỉ liệt kê kết quả có mẫu.
// Thứ tự chồng + màu: lib/rnd-result-series.ts.
type Row = { week: string; win: number; win_traffic: number; win_sp: number; fail: number; testing: number };

const fmtDay = (w: string) => `${w.slice(8, 10)}/${w.slice(5, 7)}`;

function Tip({ active, payload, label, unit }: { active?: boolean; payload?: { dataKey?: string; name?: string; value?: number; color?: string }[]; label?: string; unit: "day" | "week" }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => Number(p.value) > 0);
  const total = rows.reduce((n, p) => n + Number(p.value), 0);
  return (
    <div className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs shadow-md">
      <div className="mb-0.5 font-semibold">{unit === "day" ? "Ngày" : "Tuần từ"} {fmtDay(String(label))}</div>
      {rows.length === 0 ? <div className="text-ink-muted">Không có mẫu</div> : <>
        {[...rows].reverse().map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />{p.name}</span>
            <b className="tabular-nums">{p.value}</b>
          </div>
        ))}
        {rows.length > 1 && <div className="mt-0.5 flex justify-between gap-4 border-t border-line pt-0.5 text-ink-muted"><span>Tổng</span><b className="tabular-nums text-ink-1">{total}</b></div>}
      </>}
    </div>
  );
}

export default function ResultTrendChart({ data, unit = "week" }: { unit?: "day" | "week"; data: Row[] }) {
  const max = Math.max(1, ...data.map((d) => d.win + d.win_traffic + d.testing + d.fail));
  const top = Math.max(3, max);   // trục tối thiểu 0–3 để cột 1 mẫu không "cao hết khung"
  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--grid)" strokeDasharray="3 4" />
          <XAxis dataKey="week" tickFormatter={fmtDay} minTickGap={18} interval="preserveStartEnd" stroke="var(--grid)" tick={{ fill: "var(--ink-muted)", fontSize: 11 }} tickLine={false} tickMargin={6} />
          <YAxis allowDecimals={false} domain={[0, top]} tickCount={Math.min(top, 4) + 1} axisLine={false} tickLine={false} width={34} tick={{ fill: "var(--ink-muted)", fontSize: 11 }} />
          <Tooltip cursor={{ fill: "var(--grid)", opacity: 0.45 }} content={<Tip unit={unit} />} />
          {TREND_SERIES.map(([key, name, color], i) => (
            // Khe 2px màu nền giữa các đoạn chồng; bo góc chỉ ở đoạn trên cùng
            <Bar key={key} dataKey={key} name={name} stackId="r" fill={color} stroke="var(--surface)" strokeWidth={2} maxBarSize={22}
              radius={i === TREND_SERIES.length - 1 ? [3, 3, 0, 0] : 0} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
