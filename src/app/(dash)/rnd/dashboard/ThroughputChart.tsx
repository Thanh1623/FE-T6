"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Số mẫu đạt từng mốc mỗi tuần (tuần bắt đầu thứ Hai). Mỗi mốc 1 đường; rê chuột để xem số từng tuần.
type Row = Record<string, number | string>;
const SHOW = ["created", "approved", "received", "video", "win"];
const COLORS: Record<string, string> = {
  created: "var(--series-1)", approved: "var(--series-2)", received: "var(--series-4)", video: "var(--series-5)", win: "var(--res-win)",
};

export default function ThroughputChart({ data, events }: { data: Row[]; events: { key: string; label: string }[] }) {
  const shown = events.filter((e) => SHOW.includes(e.key));
  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="label" stroke="var(--axis)" tick={{ fill: "var(--ink-muted)", fontSize: 12 }} tickLine={false} />
          <YAxis allowDecimals={false} stroke="var(--axis)" tick={{ fill: "var(--ink-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--ink-1)" }}
            labelFormatter={(l) => `Tuần từ ${l}`} />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--ink-2)" }} />
          {shown.map((e) => (
            <Line key={e.key} type="monotone" dataKey={e.key} name={e.label} stroke={COLORS[e.key]} strokeWidth={e.key === "created" || e.key === "received" ? 2.4 : 1.6}
              dot={{ r: 2.5 }} activeDot={{ r: 4 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
