"use client";

import { useRef, useState } from "react";

// Hai biểu đồ cơ cấu video đã lên (số thật, tính từ lib/spu-data):
//  ① biểu đồ tròn: video đã lên theo dòng SP (phân loại sản phẩm)
//  ② biểu đồ cột: theo trạng thái tồn kho — mỗi nhóm 2 cột: số SPU và số video đã lên
// Rê chuột vào biểu đồ: phần được trỏ sáng lên và hiện khung số liệu theo con trỏ.
const fmtInt = (n: number) => Math.round(n).toLocaleString("vi-VN");   // cục bộ: "@/lib/data" kéo mã chỉ chạy ở máy chủ vào trình duyệt

type Tip = { x: number; y: number; w: number; title: string; lines: string[] } | null;   // w = bề rộng khung biểu đồ lúc rê (để khung số liệu không tràn mép phải)

// Khung biểu đồ có khung số liệu bám theo con trỏ
function useTip() {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip>(null);
  const show = (e: React.MouseEvent, title: string, lines: string[]) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setTip({ x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, title, lines });
  };
  const view = tip && (
    <div className="pointer-events-none absolute z-20 min-w-32 rounded-md bg-ink-1 px-2.5 py-1.5 text-xs text-surface shadow-lg"
      style={{ left: Math.max(0, Math.min(tip.x + 12, tip.w - 170)), top: Math.max(0, tip.y - 8) }}>
      <div className="font-semibold">{tip.title}</div>
      {tip.lines.map((l) => <div key={l} className="opacity-90">{l}</div>)}
    </div>
  );
  return { box, show, hide: () => setTip(null), view };
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-line bg-surface p-3">
      <h2 className="mb-0.5 flex flex-wrap items-center gap-2 font-semibold">{title}</h2>
      {hint && <p className="mb-2 text-xs text-ink-muted">{hint}</p>}
      <div className="flex flex-1 items-center">{children}</div>
    </section>
  );
}

// ① Vành khuyên: tỷ trọng video đã đăng theo dòng SP. Rê chuột: phần dày lên, giữa vòng và khung số liệu hiện tên · số video · %
function CategoryDonut({ rows }: { rows: { name: string; posted: number }[] }) {
  const [hot, setHot] = useState<number | null>(null);
  const { box, show, hide, view } = useTip();
  const sum = rows.reduce((n, r) => n + r.posted, 0);
  if (!sum) return <p className="text-xs text-ink-muted">Chưa có video đã lên.</p>;
  const lens = rows.map((r) => (r.posted / sum) * 100);
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((t, v) => t + v, 0));
  const pct = (i: number) => `${Math.round((rows[i].posted / sum) * 100)}%`;
  const on = (e: React.MouseEvent, i: number) => { setHot(i); show(e, rows[i].name, [`${fmtInt(rows[i].posted)} video đã lên`, `${pct(i)} tổng số video`]); };
  const off = () => { setHot(null); hide(); };
  return (
    <div ref={box} className="relative mx-auto flex w-full flex-wrap items-center justify-center gap-x-6 gap-y-3">
      <svg viewBox="0 0 42 42" className="h-36 w-36 flex-none -rotate-90" role="img" aria-label="Cơ cấu video đã lên theo dòng SP">
        {rows.map((r, i) => (
          <circle key={r.name} cx="21" cy="21" r="15.915" fill="none" stroke={`var(--series-${i + 1})`} strokeWidth={hot === i ? 8.6 : 7}
            strokeDasharray={`${Math.max(0, lens[i] - 0.5)} ${100 - Math.max(0, lens[i] - 0.5)}`} strokeDashoffset={-starts[i]}
            opacity={hot === null || hot === i ? 1 : 0.35} className="cursor-pointer transition-all duration-150"
            onMouseEnter={(e) => on(e, i)} onMouseMove={(e) => on(e, i)} onMouseLeave={off} />
        ))}
        <text x="21" y="19" transform="rotate(90 21 21)" textAnchor="middle" dominantBaseline="central" className="pointer-events-none fill-[var(--ink-1)] text-[6.5px] font-bold">
          {fmtInt(hot === null ? sum : rows[hot].posted)}
        </text>
        <text x="21" y="25.5" transform="rotate(90 21 21)" textAnchor="middle" dominantBaseline="central" className="pointer-events-none fill-[var(--ink-muted)] text-[2.6px]">
          {hot === null ? "video đã lên" : `${rows[hot].name} · ${pct(hot)}`}
        </text>
      </svg>
      <ul className="w-full max-w-[250px] space-y-0.5 text-[13px]">
        {rows.map((r, i) => (
          <li key={r.name} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(null)}
            className={`flex cursor-default items-center gap-2 rounded px-1.5 py-0.5 transition-colors ${hot === i ? "bg-grid" : ""} ${hot !== null && hot !== i ? "opacity-50" : ""}`}>
            <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: `var(--series-${i + 1})` }} />
            <span className="flex-1 truncate">{r.name}</span>
            <b className="tabular-nums">{fmtInt(r.posted)}</b>
            <span className="w-9 text-right text-2xs tabular-nums text-ink-muted">{pct(i)}</span>
          </li>
        ))}
      </ul>
      {view}
    </div>
  );
}

// ② Theo trạng thái tồn kho: cột CHỒNG số SPU (đã lên video + chưa lên video = tổng SPU của nhóm); số VIDEO đã lên ghi thành số dưới chân từng nhóm (khác đơn vị nên không vẽ chung trục)
const WITH = "var(--series-3)", WITHOUT = "color-mix(in srgb, var(--series-3) 22%, var(--surface))";
const W = 440, padL = 30, padR = 6;
function niceTop(max: number) { const step = Math.pow(10, Math.floor(Math.log10(Math.max(max, 1)))); return Math.ceil(Math.max(max, 1) / step) * step; }

function StockBars({ groups }: { groups: StockGroup[] }) {
  const [hot, setHot] = useState<number | null>(null);
  const { box, show, hide, view } = useTip();
  const plotW = W - padL - padR, slot = plotW / groups.length, bw = Math.min(40, slot / 2);
  const on = (e: React.MouseEvent, i: number) => {
    const g = groups[i];
    setHot(i);
    show(e, g.label, [`${fmtInt(g.spu)} SPU`, `${fmtInt(g.withVideo)} đã lên video${g.spu ? ` (${Math.round((g.withVideo / g.spu) * 100)}%)` : ""}`, `${fmtInt(g.spu - g.withVideo)} chưa lên video`, `${fmtInt(g.posted)} video đã lên`, g.withVideo ? `${(g.posted / g.withVideo).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} video / SPU có video` : "—"]);
  };
  // Khung vẽ chung: trục + lưới + vùng bắt chuột phủ cả nhóm
  const plot = (H: number, padT: number, padB: number, max: number, labels: boolean, bars: (cx: number, g: StockGroup, y: (v: number) => number, base: number) => React.ReactNode, aria: string) => {
    const top = niceTop(max), plotH = H - padT - padB;
    const y = (v: number) => padT + plotH - (v / top) * plotH, base = padT + plotH;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={aria} onMouseLeave={() => { setHot(null); hide(); }}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(top * t)).map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth="1" />
            <text x={padL - 6} y={y(t)} textAnchor="end" dominantBaseline="central" className="fill-[var(--ink-muted)] text-[9px]">{fmtInt(t)}</text>
          </g>
        ))}
        {groups.map((g, i) => {
          const cx = padL + slot * i + slot / 2;
          return (
            <g key={g.label} opacity={hot !== null && hot !== i ? 0.4 : 1} className="transition-opacity duration-150">
              {hot === i && <rect x={cx - slot / 2 + 4} y={padT - 12} width={slot - 8} height={plotH + 12} className="fill-[var(--grid)]" opacity="0.7" />}
              {bars(cx, g, y, base)}
              {labels && <text x={cx} y={H - padB + 15} textAnchor="middle" className="text-[10px] font-medium" fill={g.tone}>{g.label}</text>}
              {labels && <text x={cx} y={H - padB + 29} textAnchor="middle" className="text-[10px]"><tspan fill={WITH} className="font-bold">{fmtInt(g.withVideo)}</tspan><tspan className="fill-[var(--ink-muted)]"> SPU có video</tspan></text>}
              {labels && <text x={cx} y={H - padB + 42} textAnchor="middle" className="text-[10px]"><tspan className="fill-[var(--ink-1)] font-bold">{fmtInt(g.posted)}</tspan><tspan className="fill-[var(--ink-muted)]"> video</tspan></text>}
              <rect x={cx - slot / 2} y={padT - 14} width={slot} height={plotH + padB + 14} fill="transparent" className="cursor-pointer"
                onMouseEnter={(e) => on(e, i)} onMouseMove={(e) => on(e, i)} />
            </g>
          );
        })}
      </svg>
    );
  };
  const rect = (x: number, yTop: number, h: number, fill: string, round = true) =>
    h > 0 ? <path d={round ? `M${x},${yTop + h}V${yTop + Math.min(2, h)}Q${x},${yTop} ${x + Math.min(2, h)},${yTop}H${x + bw - Math.min(2, h)}Q${x + bw},${yTop} ${x + bw},${yTop + Math.min(2, h)}V${yTop + h}Z` : `M${x},${yTop}H${x + bw}V${yTop + h}H${x}Z`} fill={fill} /> : null;
  return (
    <div ref={box} className="relative mx-auto w-full max-w-[560px]">
      <div className="mb-1 text-2xs font-semibold text-ink-2">Số SPU theo trạng thái tồn kho</div>
      <div className="mb-1 flex flex-wrap items-center gap-4 text-2xs text-ink-2">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: WITH }} />Đã lên video</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: WITHOUT }} />Chưa lên video</span>
      </div>
      {plot(214, 16, 58, Math.max(...groups.map((g) => g.spu), 1), true, (cx, g, y, base) => {
        const hWith = base - y(g.withVideo), hAll = base - y(g.spu);
        return (
          <>
            {rect(cx - bw / 2, y(g.spu), hAll - hWith, WITHOUT, hWith === 0)}
            {rect(cx - bw / 2, y(g.withVideo), hWith, WITH, hWith === hAll)}
            <text x={cx} y={y(g.spu) - 5} textAnchor="middle" className="fill-[var(--ink-1)] text-[9px] font-bold">{fmtInt(g.spu)}</text>
                      </>
        );
      }, "Số SPU theo trạng thái tồn kho, chia đã lên video và chưa lên video")}
      {view}
    </div>
  );
}

export type StockGroup = { label: string; spu: number; withVideo: number; posted: number; tone: string };
export type CategoryRow = { name: string; posted: number };

// cats = video đã đăng theo dòng sản phẩm · groups = SPU và video theo trạng thái tồn kho — tính ở máy chủ từ dữ liệu thật (lib/spu-data) trong kỳ đang lọc
export default function VideoByCategory({ cats, groups }: { cats: CategoryRow[]; groups: StockGroup[] }) {
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <Card title="Cơ cấu video đã lên theo dòng SP" hint="Tỷ trọng số video đã đăng của từng dòng sản phẩm."><CategoryDonut rows={cats} /></Card>
      <Card title="Cơ cấu video đã lên theo trạng thái tồn kho"><StockBars groups={groups} /></Card>
    </div>
  );
}
