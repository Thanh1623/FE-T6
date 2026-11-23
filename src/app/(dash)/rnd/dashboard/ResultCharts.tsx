import { fmtInt } from "@/lib/data";

// Biểu đồ gọn cho khối "Sản phẩm & kết quả test" (thuần SVG / CSS, không thư viện)
const pct = (v: number) => `${Math.round(v * 100)}%`;
const COLORS = { win: "var(--res-win)", wt: "var(--res-wt)", fail: "var(--res-fail)", testing: "var(--res-testing)" } as const;
const LABELS = { win: "WIN", wt: "WIN TRAFFIC", fail: "FAIL", testing: "Đang test" } as const;
export type Res = { win: number; wt: number; fail: number; testing: number };

// Vành khuyên: tỷ trọng kết quả test (tối đa 4 phần, mỗi phần có chữ + số — màu chỉ là mã hoá phụ)
export function ResultDonut({ res }: { res: Res }) {
  const keys = (Object.keys(LABELS) as (keyof Res)[]);
  const sum = keys.reduce((n, k) => n + res[k], 0);
  if (!sum) return <p className="text-xs text-ink-muted">Chưa có mẫu nào có kết quả test.</p>;
  let off = 0;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 42 42" className="h-32 w-32 flex-none -rotate-90" role="img" aria-label="Tỷ trọng kết quả test">
        {keys.map((k) => {
          const len = (res[k] / sum) * 100, el = (
            <circle key={k} cx="21" cy="21" r="15.915" fill="none" stroke={COLORS[k]} strokeWidth="7" strokeDasharray={`${Math.max(0, len - 0.6)} ${100 - Math.max(0, len - 0.6)}`} strokeDashoffset={-off}>
              <title>{`${LABELS[k]}: ${res[k]} mẫu (${pct(res[k] / sum)})`}</title>
            </circle>
          );
          off += len;
          return el;
        })}
        <text x="21" y="21" transform="rotate(90 21 21)" textAnchor="middle" dominantBaseline="central" className="fill-[var(--ink-1)] text-[7px] font-bold">{sum}</text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1 text-xs">
        {keys.map((k) => (
          <li key={k} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: COLORS[k] }} />
            <span className="flex-1">{LABELS[k]}</span>
            <b className="tabular-nums">{fmtInt(res[k])}</b><span className="w-9 text-right tabular-nums text-ink-muted">{pct(res[k] / sum)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Phễu P0 → P6: thanh = số mẫu đã qua bước; mũi tên = tỉ lệ chuyển từ bước trước
export function FunnelBars({ steps }: { steps: { label: string; count: number }[] }) {
  const max = Math.max(...steps.map((s) => s.count), 1);
  return (
    <ul className="space-y-1.5">
      {steps.map((s, i) => {
        const prev = i ? steps[i - 1].count : null;
        return (
          <li key={s.label} className="grid grid-cols-[88px_minmax(0,1fr)_92px] items-center gap-2 text-xs">
            <span className="truncate text-ink-2" title={s.label}>{s.label}</span>
            <span className="h-4 overflow-hidden rounded bg-grid"><span className="block h-full rounded bg-accent" style={{ width: `${Math.max(s.count ? 2 : 0, (s.count / max) * 100)}%`, opacity: 1 - i * 0.09 }} /></span>
            <span className="text-right tabular-nums"><b>{fmtInt(s.count)}</b>{prev !== null && prev > 0 && <span className="ml-1 text-ink-muted" title="Tỉ lệ chuyển từ bước trước">→ {pct(s.count / prev)}</span>}</span>
          </li>
        );
      })}
    </ul>
  );
}

// Cột chồng ngang: kết quả test theo từng nhóm (dòng SP / nhóm SP…). Tỉ lệ Win = (WIN + WIN TRAFFIC) ÷ mẫu đã có kết quả
export function StackedBars({ rows }: { rows: { name: string; res: Res }[] }) {
  const data = rows.map((r) => ({ ...r, n: r.res.win + r.res.wt + r.res.fail + r.res.testing })).filter((r) => r.n > 0).sort((a, b) => b.n - a.n).slice(0, 8);
  if (!data.length) return <p className="text-xs text-ink-muted">Chưa có mẫu nào có kết quả test.</p>;
  const max = Math.max(...data.map((r) => r.n));
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-3 text-2xs text-ink-2">
        {(Object.keys(LABELS) as (keyof Res)[]).map((k) => <span key={k} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: COLORS[k] }} />{LABELS[k]}</span>)}
      </div>
      <ul className="space-y-1.5">
        {data.map((r) => {
          const decided = r.res.win + r.res.wt + r.res.fail;
          return (
            <li key={r.name} className="grid grid-cols-[96px_minmax(0,1fr)_74px] items-center gap-2 text-xs">
              <span className="truncate text-ink-2" title={r.name}>{r.name}</span>
              <span className="flex h-4 overflow-hidden rounded bg-grid" style={{ width: `${(r.n / max) * 100}%`, minWidth: 8 }}>
                {(Object.keys(LABELS) as (keyof Res)[]).map((k) => r.res[k] > 0 && (
                  <span key={k} title={`${LABELS[k]}: ${r.res[k]}`} style={{ width: `${(r.res[k] / r.n) * 100}%`, background: COLORS[k] }} />
                ))}
              </span>
              <span className="text-right tabular-nums" title={`${r.res.win + r.res.wt} Win / ${decided} mẫu có kết quả`}>
                <b>{fmtInt(r.n)}</b> <span className="text-good">{decided ? pct((r.res.win + r.res.wt) / decided) : "—"}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-2xs text-ink-muted">Số cuối dòng: tổng mẫu · tỉ lệ Win (WIN + WIN TRAFFIC trên mẫu đã có kết quả).</p>
    </div>
  );
}
