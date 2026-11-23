"use client";

import { startRouteProgress } from "@/components/RouteProgress";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

// Thanh lọc thời gian (giống bản mẫu): nút nhanh + Từ / đến + chọn team. Ghi vào URL theo quy ước của parseFilters (range=custom, from, to, team).
const DAY = 86_400_000;
const shift = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);

export default function RangeBar({ from, to, today, teams, teamId, note }: { from: string; to: string; today: string; teams: { id: string; name: string }[]; teamId: string; note: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const lastMonthEnd = shift(`${today.slice(0, 8)}01`, -1);
  const presets = [
    { label: "Hôm nay", from: today, to: today }, { label: "Hôm qua", from: shift(today, -1), to: shift(today, -1) },
    { label: "7 ngày", from: shift(today, -6), to: today }, { label: "14 ngày", from: shift(today, -13), to: today },
    { label: "Tháng này", from: `${today.slice(0, 8)}01`, to: today },
    { label: "Tháng trước", from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd },   // ngày 1 → ngày cuối của tháng trước
  ];
  function go(patch: Record<string, string>) {
    const q = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) { if (v) q.set(k, v); else q.delete(k); }
    const s = q.toString(), hash = window.location.hash;
    start(() => { startRouteProgress(); router.push(`${pathname}${s ? `?${s}` : ""}${hash}`); });
  }
  const range = (a: string, b: string) => go({ range: "custom", from: a, to: b });
  return (
    <div className="filter" role="group" aria-label="Bộ lọc thời gian" style={pending ? { opacity: 0.6 } : undefined}>
      <div className="seg" role="tablist" aria-label="Khoảng nhanh">
        {presets.map((p) => <button key={p.label} type="button" role="tab" aria-selected={p.from === from && p.to === to} onClick={() => range(p.from, p.to)}>{p.label}</button>)}
      </div>
      <div className="range">
        <label htmlFor="f-from">Từ</label><input id="f-from" type="date" value={from} max={to} onChange={(e) => e.target.value && range(e.target.value, to)} />
        <label htmlFor="f-to">đến</label><input id="f-to" type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && range(from, e.target.value)} />
      </div>
      {teams.length > 1 && (
        <div className="range"><label htmlFor="f-team">Team</label>
          <select id="f-team" value={teamId} onChange={(e) => go({ team: e.target.value })} style={{ font: "400 13px var(--font)", border: "1px solid var(--line)", borderRadius: 4, padding: "3px 8px", background: "#fff", color: "var(--ink)" }}>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></div>
      )}
      <div className="fnote">{note}</div>
    </div>
  );
}
