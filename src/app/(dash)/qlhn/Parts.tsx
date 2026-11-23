import type { ReactNode } from "react";
import { fmtInt } from "@/lib/format";
import type { PoCoverage } from "@/lib/team-report";

// Phần dùng chung của trang QLHN, không cần JS ở trình duyệt. Lớp CSS (.qlhn …) lấy từ qlhn.css (bản sao CSS của bản mẫu).
export const nf = (n: number) => fmtInt(n);
export const pct = (a: number, b: number, d = 1) => (b ? `${((a / b) * 100).toLocaleString("vi-VN", { maximumFractionDigits: d })}%` : "–");
export const dm = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "–");
export const dmy = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "–");
export const shortName = (n: string) => n.replace(/\s*-?\s*KD\d$/i, "").replace(/Nguyễn Thị Quỳnh Hoa/i, "Quỳnh Hoa").replace(/Giáp Thị Ngọc Anh/, "Ngọc Anh").replace(/Nguyễn Thu Hương/, "Thu Hương");

export const Pill = ({ tone, children }: { tone: "bad" | "warn" | "ok" | "mute" | "info"; children: ReactNode }) => (
  <span className={`pill p-${tone}`}>{children}</span>
);

// Vòng tròn có số ở giữa (viewBox cố định 150, co theo khung)
export function Donut({ items, center, unit }: { items: { name: string; value: number; color: string }[]; center: string; unit: string }) {
  const R = 56, C = 2 * Math.PI * R, tot = items.reduce((n, i) => n + i.value, 0);
  let off = 0;
  return (
    <div className="donutbox">
      <svg viewBox="0 0 150 150" role="img" aria-label={items.map((i) => `${i.name} ${i.value}`).join(", ")}>
        <circle cx="75" cy="75" r={R} fill="none" stroke="#e1e0d9" strokeWidth="16" />
        {tot > 0 && items.filter((i) => i.value > 0).map((i) => {
          const len = (C * i.value) / tot, el = (
            <circle key={i.name} cx="75" cy="75" r={R} fill="none" stroke={i.color} strokeWidth="16" strokeDasharray={`${Math.max(len - 3, 1)} ${C}`} strokeDashoffset={-off} transform="rotate(-90 75 75)"><title>{`${i.name}: ${i.value}`}</title></circle>);
          off += len; return el;
        })}
        <text x="75" y="79" textAnchor="middle" style={{ fontSize: 22, fontWeight: 700, fill: "var(--ink)" }}>{center}</text>
        <text x="75" y="95" textAnchor="middle" style={{ fontSize: 12, fill: "var(--mute)" }}>{unit}</text>
      </svg>
    </div>
  );
}

export const Hb = ({ label, value, max, text, color }: { label: string; value: number; max: number; text: string; color: string }) => (
  <div className="hb"><span title={label}>{label}</span><span className="tr"><i style={{ width: `${max ? Math.max((value / max) * 100, value ? 2 : 0) : 0}%`, background: color }} /></span><b>{text}</b></div>
);

export const SpuCell = ({ code, name, tip }: { code: string; name: string; tip?: string }) => (
  <td title={`${name}${tip ? ` · ${tip}` : ""}`}><b className="code">{code}</b> <span className="nm">{name}</span></td>
);

// Mua hàng đã order? — pill + chữ ngắn (PO của mọi team ở Qlydonhang)
export function BuyCell({ cov }: { cov?: PoCoverage }) {
  if (!cov) return <td className="buy"><Pill tone="bad">Chưa có PO</Pill></td>;
  return <td className="buy"><Pill tone={cov.overdue ? "warn" : "ok"}>{cov.overdue ? "PO quá hạn" : "Đã order"}</Pill> <span className="hint">chưa về {nf(cov.pending)}{cov.nextEta ? ` · ${dm(cov.nextEta)}` : ""}</span></td>;
}

// Biểu đồ xu hướng nhỏ (đường + vùng mờ + chấm cuối) như thẻ thống kê của Sapo. null = ngày không có số (bỏ khỏi đường, giữ đúng vị trí ngày)
export function Spark({ values, color, label }: { values: (number | null)[]; color: string; label: string }) {
  const W = 76, H = 26, p = 3, pts = values.map((v, i) => [i, v] as const).filter((x): x is readonly [number, number] => x[1] !== null);
  if (pts.length < 2) return null;
  const lo = Math.min(...pts.map((x) => x[1])), hi = Math.max(...pts.map((x) => x[1])), n = Math.max(values.length - 1, 1);
  const X = (i: number) => p + (i / n) * (W - 2 * p), Y = (v: number) => (hi === lo ? H / 2 : H - p - ((v - lo) / (hi - lo)) * (H - 2 * p));
  const line = pts.map(([i, v], k) => `${k ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" "), [li, lv] = pts[pts.length - 1];
  return (
    <svg className="spk" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label}>
      <path d={`${line} L${X(li).toFixed(1)},${H} L${X(pts[0][0]).toFixed(1)},${H} Z`} fill={color} opacity=".12" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={X(li)} cy={Y(lv)} r="2.5" fill={color} />
    </svg>
  );
}

// Tăng / giảm so với kỳ trước: "▲ +12 (+5%)". goodUp = tăng là tốt (xanh), ngược lại tăng là xấu (đỏ); bằng nhau hoặc chưa có kỳ trước thì xám
export function Delta({ cur, prev, goodUp, title, d = 0 }: { cur: number | null; prev: number | null; goodUp: boolean; title: string; d?: number }) {
  const col = { good: "var(--ok)", bad: "#d03b3b", flat: "var(--mute)" };   // màu ghi thẳng để không phụ thuộc thứ tự nạp CSS
  if (cur === null || prev === null || prev === 0) return <span className="dl flat" style={{ color: col.flat }} title={title}>–</span>;
  const diff = cur - prev, pc = (diff / prev) * 100, f = (x: number) => Math.abs(x).toLocaleString("vi-VN", { maximumFractionDigits: d });
  if (Math.abs(diff) < 10 ** -(d + 1)) return <span className="dl flat" style={{ color: col.flat }} title={title}>– 0%</span>;
  const up = diff > 0, good = up === goodUp;
  return <span className={`dl ${good ? "good" : "bad"}`} style={{ color: good ? col.good : col.bad }} title={title}>{up ? "▲" : "▼"} {up ? "+" : "-"}{f(diff)} ({up ? "+" : "-"}{Math.abs(Math.round(pc))}%)</span>;
}
