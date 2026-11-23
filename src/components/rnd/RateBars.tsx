// Tỉ lệ kết quả theo nhóm (line / loại / chất liệu / Trang): mỗi nhóm MỘT dòng — tên · thanh 100% WIN · WIN TRAFFIC · FAIL · số mẫu đã kết luận và % win.
// Chi tiết (số mẫu từng phần, đang test) nằm ở tooltip. Có chữ % trên đoạn đủ rộng → không phụ thuộc màu.
type Row = { label: string; win: number; win_traffic: number; win_sp: number; fail: number; testing: number };

export default function RateBars({ rows, empty }: { rows: Row[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-ink-muted">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const done = r.win + r.win_traffic + r.win_sp + r.fail;
        const seg = (n: number) => (done ? (n / done) * 100 : 0);
        const parts = [
          ["WIN", r.win + r.win_sp, "var(--res-win)"], ["WIN TRAFFIC", r.win_traffic, "var(--res-wt)"], ["FAIL", r.fail, "var(--res-fail)"],
        ] as const;
        const tip = `${r.label}: ${done} đã kết luận${r.testing ? ` · ${r.testing} đang test` : ""}\n${parts.map(([n, v]) => `${n} ${v}`).join(" · ")}`;
        return (
          <li key={r.label} className="flex items-center gap-2 text-xs" title={tip}>
            <span className="w-24 flex-none truncate text-ink-2">{r.label}</span>
            <div className="flex h-3.5 min-w-0 flex-1 gap-[2px] overflow-hidden rounded bg-grid">
              {parts.filter(([, n]) => n > 0).map(([name, n, color]) => (
                <div key={name} style={{ width: `${seg(n)}%`, background: color }} className="flex items-center justify-center text-[10px] font-medium text-white">
                  {seg(n) >= 22 && `${Math.round(seg(n))}%`}
                </div>
              ))}
            </div>
            <span className="tabular w-16 flex-none text-right text-ink-muted">{done ? <><b className="text-ink-1">{Math.round(seg(r.win + r.win_sp + r.win_traffic))}%</b> · {done}</> : r.testing ? `${r.testing} test` : "–"}</span>
          </li>
        );
      })}
    </ul>
  );
}
