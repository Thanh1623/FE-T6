import type { TeamBreakdownRow } from "@/lib/spu-win";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const th = "whitespace-nowrap px-2.5 py-1.5 align-bottom font-medium";
const num = "px-2.5 py-1 text-right tabular-nums";

// Bảng thống kê video theo team: video theo loại SPU (trạng thái tồn kho · test · R&D). Bảng đẩy hàng: xem PushTable.tsx
export function TeamBreakdownTable({ rows }: { rows: TeamBreakdownRow[] }) {
  const sum = (k: keyof Omit<TeamBreakdownRow, "id" | "name">) => rows.reduce((n, r) => n + r[k], 0);
  // Team chưa có video nào trong kỳ gom thành 1 dòng ghi chú thay vì chiếm cả hàng toàn số 0
  const active = rows.filter((r) => r.total > 0), idle = rows.filter((r) => r.total === 0);
  return (
    <div className="max-w-4xl overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[460px] text-xs">
        <thead className="border-b border-line bg-page text-left text-xs text-ink-2">
          <tr>
            <th className={th}>Team</th>
            <th className={`${th} text-right`} title="Video có gắn mã SP trong kỳ">Tổng video</th>
            <th className={`${th} text-right`} title="Theo SL bán 30 ngày của SPU còn hàng (quy tắc ở trang KPI)">Video SPU tồn xấu</th>
            <th className={`${th} text-right`} title="Theo SL bán 30 ngày của SPU còn hàng (quy tắc ở trang KPI)">Video SPU bán chậm</th>
            <th className={`${th} text-right`} title="Theo SL bán 30 ngày của SPU còn hàng (quy tắc ở trang KPI)">Video SPU bán chạy</th>
            <th className={`${th} text-right`} title="Mã SPU test của Media (T10001…)">Video SPU test</th>
            <th className={`${th} text-right`} title="Mã SPU của mẫu đã vào quy trình R&D">Video SPU R&amp;D</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {active.map((r) => (
            <tr key={r.id} className="hover:bg-grid/40">
              <td className="px-2.5 py-1 font-medium">{r.name}</td>
              <td className={`${num} font-semibold`}>{fmt(r.total)}</td>
              <td className={`${num} ${r.bad ? "text-bad" : "text-ink-muted"}`}>{fmt(r.bad)}</td>
              <td className={`${num} ${r.slow ? "text-warn-ink" : "text-ink-muted"}`}>{fmt(r.slow)}</td>
              <td className={`${num} ${r.hot ? "text-good" : "text-ink-muted"}`}>{fmt(r.hot)}</td>
              <td className={num}>{fmt(r.test)}</td>
              <td className={num}>{fmt(r.rnd)}</td>
            </tr>
          ))}
          {active.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-ink-muted">Chưa có video gắn mã SP trong kỳ.</td></tr>}
        </tbody>
        {rows.length > 1 && (
          <tfoot className="border-t border-line bg-page font-semibold">
            <tr>
              <td className="px-2.5 py-1">Tổng</td>
              <td className={num}>{fmt(sum("total"))}</td><td className={num}>{fmt(sum("bad"))}</td><td className={num}>{fmt(sum("slow"))}</td>
              <td className={num}>{fmt(sum("hot"))}</td><td className={num}>{fmt(sum("test"))}</td><td className={num}>{fmt(sum("rnd"))}</td>
            </tr>
          </tfoot>
        )}
      </table>
      {idle.length > 0 && <p className="border-t border-line px-3 py-1.5 text-2xs text-ink-2" title={idle.map((r) => r.name).join(", ")}>{idle.length} team chưa có video trong kỳ: {idle.map((r) => r.name).join(", ")}</p>}
      <p className="border-t border-line px-3 py-1.5 text-2xs text-ink-muted">Tồn xấu / bán chậm / bán chạy theo SL bán 30 ngày của SPU còn hàng (quy tắc chỉnh ở trang KPI). Một video gắn nhiều mã được tính vào mỗi nhóm có mã đó.</p>
    </div>
  );
}
