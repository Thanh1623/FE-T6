"use client";

import { useState } from "react";
import { KPI_METRICS, KPI_OPS, type KpiMetric, type KpiOp, type KpiRule } from "@/lib/kpi-constants";

const input = "rounded-lg border border-line bg-page px-2 py-1.5 text-sm outline-none focus:border-accent";

// Soạn danh sách điều kiện KPI; gửi lên server qua 2 ô ẩn "rules" (JSON) và "match"
export default function RulesEditor({ rules, match, onChange, groups }: {
  rules: KpiRule[]; match: "all" | "any"; groups?: ("traffic" | "sales")[];   // groups: chỉ cho chọn chỉ số thuộc nhóm này (vd Video Win chỉ dùng traffic)
  onChange?: (rules: KpiRule[], match: "all" | "any") => void;
}) {
  // Uncontrolled khi không có onChange; controlled khi form cha cần đổi theo mẫu KPI được chọn
  const [own, setOwn] = useState({ rules, match });
  const cur = onChange ? { rules, match } : own;
  const set = (r: KpiRule[], m: "all" | "any") => (onChange ? onChange(r, m) : setOwn({ rules: r, match: m }));
  const update = (i: number, patch: Partial<KpiRule>) => set(cur.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)), cur.match);

  return (
    <div className="space-y-2">
      <input type="hidden" name="rules" value={JSON.stringify(cur.rules)} />
      <input type="hidden" name="match" value={cur.match} />
      {cur.rules.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <select value={r.metric} onChange={(e) => update(i, { metric: e.target.value as KpiMetric })} className={`${input} min-w-44`}>
            {Object.entries(KPI_METRICS).filter(([, m]) => !groups || groups.includes(m.group)).map(([k, m]) => (
              <option key={k} value={k}>{m.group === "sales" ? "💰 " : "👁 "}{m.label}</option>
            ))}
          </select>
          <select value={r.op} onChange={(e) => update(i, { op: e.target.value as KpiOp })} className={input}>
            {Object.entries(KPI_OPS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input type="number" min={0} step="any" value={Number.isFinite(r.value) ? r.value : ""} required
            onChange={(e) => update(i, { value: e.target.value === "" ? NaN : Number(e.target.value) })}
            className={`${input} w-32`} />
          <span className="text-sm text-ink-muted">{KPI_METRICS[r.metric].unit}</span>
          <button type="button" title="Xoá điều kiện" onClick={() => set(cur.rules.filter((_, j) => j !== i), cur.match)}
            className="rounded px-2 text-ink-muted hover:text-bad">✕</button>
          <span className="w-full text-xs text-ink-muted sm:w-auto">{KPI_METRICS[r.metric].hint}</span>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" onClick={() => set([...cur.rules, { metric: "views", op: ">=", value: 1000 }], cur.match)}
          className="text-accent hover:underline">＋ Thêm điều kiện</button>
        {cur.rules.length > 1 && (
          <label className="flex items-center gap-1.5 text-ink-2">
            Đạt khi
            <select value={cur.match} onChange={(e) => set(cur.rules, e.target.value as "all" | "any")} className={input}>
              <option value="all">đạt TẤT CẢ điều kiện</option>
              <option value="any">đạt ÍT NHẤT 1 điều kiện</option>
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
