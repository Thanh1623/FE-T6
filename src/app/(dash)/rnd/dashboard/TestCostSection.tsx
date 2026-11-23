import Paged from "@/components/Paged";
import Link from "next/link";
import type { CostGroup, TestCostReport } from "@/lib/test-costs";

const vnd = (v: number | null) => (v === null ? "—" : `${Math.round(v).toLocaleString("vi-VN")}đ`);
const int = (v: number) => Math.round(v).toLocaleString("vi-VN");
const th = "whitespace-nowrap px-3 py-2 font-medium";
const num = "px-3 py-2 text-right tabular-nums";
const RESULT = { win: ["Win", "bg-good/10 text-good"], fail: ["FAIL / dừng", "bg-bad/10 text-bad"], testing: ["Đang test", "bg-grid text-ink-2"] } as const;
const PARTS = [["sample", "Làm mẫu", "var(--series-1)"], ["other", "Chi phí khác", "var(--series-2)"], ["ads", "Ads", "var(--series-4)"], ["video", "Quay mẫu", "var(--series-3)"]] as const;

const Card = ({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) => (
  <div className={`flex min-w-0 flex-col items-center rounded-md border px-3 py-3 text-center ${bad ? "border-[color-mix(in_srgb,var(--bad)_18%,var(--surface))] bg-[color-mix(in_srgb,var(--bad)_8%,var(--surface))]" : "border-[color-mix(in_srgb,var(--accent)_16%,var(--surface))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"}`}>
    <div className="max-w-full truncate text-xs text-ink-2">{label}</div>
    <div className="mt-2 text-xl font-extrabold leading-none tabular-nums">{value}</div>
    {sub && <div className="mt-2 max-w-full text-xs text-ink-2">{sub}</div>}
  </div>
);

function GroupTable({ title, rows }: { title: string; rows: CostGroup[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="border-b border-line bg-page text-left text-xs text-ink-2">
          <tr><th className={th}>{title}</th><th className={`${th} text-right`}>Số mẫu</th><th className={`${th} text-right`}>Tổng chi phí</th><th className={`${th} text-right`}>Win</th><th className={`${th} text-right`}>Chi phí / Win</th><th className={`${th} text-right`}>FAIL / dừng</th><th className={`${th} text-right`}>Chi phí / FAIL</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.name} className="hover:bg-grid/40">
              <td className="px-3 py-2 font-medium">{r.name}</td><td className={num}>{int(r.samples)}</td><td className={`${num} font-semibold`}>{vnd(r.total)}</td>
              <td className={`${num} ${r.wins ? "text-good" : "text-ink-muted"}`}>{int(r.wins)}</td><td className={num}>{vnd(r.perWin)}</td>
              <td className={`${num} ${r.fails ? "text-bad" : "text-ink-muted"}`}>{int(r.fails)}</td><td className={num}>{vnd(r.perFail)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-ink-muted">Chưa có mẫu trong kỳ.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// Báo cáo chi phí test (mẫu mới trong quy trình R&D: mẫu R&D + mẫu Media test đã vào R&D). Chỉ người được xem giá vốn / chi phí.
// compact = chỉ 4 thẻ tổng (dùng ở Tổng quan); đầy đủ (cơ cấu, theo team / nguồn, từng mẫu) ở dashboard Luồng R&D
export default function TestCostSection({ report: r, compact = false }: { report: TestCostReport; compact?: boolean }) {
  const t = r.totals;
  return (
    <div className="space-y-2">
      {r.missingCost?.length ? (
        <p className="rounded-md bg-warn-bg px-3 py-2 text-xs text-warn-ink">
          ⚠ {r.missingCost.length} mẫu có đơn đã <b>Hoàn thành mẫu</b> nhưng chưa nhập Chi phí SX (đang tính 0đ, làm thấp chi phí / mẫu):{" "}
          {r.missingCost.map((m, i) => <span key={m.id}>{i ? ", " : ""}<Link href={`/rnd/${m.id}`} className="font-semibold underline">{m.st_code ?? m.code ?? m.name}</Link></span>)}
          {" "}— nhập ở bảng Đặt hàng.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Card label="Tổng chi phí test" value={vnd(t.total)} sub={`${int(t.samples)} mẫu duyệt trong kỳ đã phát sinh chi phí`} />
        <Card label="Chi phí / mẫu" value={vnd(t.perSample)} />
        <Card label="Chi phí / mẫu Win" value={vnd(t.perWin)} sub={t.perWin === null ? "chưa có mẫu Win" : undefined} />
        <Card bad label="Chi phí mẫu FAIL / dừng" value={vnd(t.wasted)} sub={t.wastedPct === null ? undefined : `${t.wastedPct.toFixed(1)}% tổng chi phí`} />
      </div>
      {!compact && <>
      <section className="rounded-lg border border-line bg-surface p-3">
        <h3 className="mb-2 text-sm font-semibold">Cơ cấu chi phí</h3>
        {t.total > 0 ? (
          <>
            <div className="flex h-3 overflow-hidden rounded-sm bg-grid" role="img" aria-label="Cơ cấu chi phí test">
              {PARTS.map(([k, label, color]) => t[k] > 0 && <div key={k} style={{ width: `${(t[k] / t.total) * 100}%`, background: color }} title={`${label}: ${vnd(t[k])}`} />)}
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
              {PARTS.map(([k, label, color]) => (
                <li key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: color }} />{label} <b className="tabular-nums">{vnd(t[k])}</b>
                  <span className="text-ink-muted">{((t[k] / t.total) * 100).toFixed(0)}%</span></li>
              ))}
            </ul>
          </>
        ) : <p className="text-xs text-ink-muted">Chưa có chi phí trong kỳ.</p>}
      </section>

      <div className="grid gap-2 xl:grid-cols-2">
        <GroupTable title="Team" rows={r.byTeam} />
        <GroupTable title="Nguồn mẫu" rows={r.bySource} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-line bg-page text-left text-xs text-ink-2">
            <tr><th className={th}>SPU</th><th className={th}>Tên SP</th><th className={th}>Team</th><th className={th}>Nguồn</th>
              <th className={`${th} text-right`}>Làm mẫu</th><th className={`${th} text-right`}>Chi phí khác</th><th className={`${th} text-right`}>Ads</th><th className={`${th} text-right`}>Quay mẫu</th><th className={`${th} text-right`}>Tổng</th><th className={th}>Kết quả</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            <Paged size={20} cols={10} resetKey={String(r.rows.length)}>
              {r.rows.map((x) => (
                <tr key={x.id} className="hover:bg-grid/40">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[15px] font-semibold">{x.code ?? <span className="font-sans font-normal text-ink-muted">—</span>}</td>
                  <td className="max-w-[260px] truncate px-3 py-2" title={x.name}><Link href={`/rnd/${x.id}`} className="hover:underline">{x.name}</Link></td>
                  <td className="px-3 py-2">{x.team ?? "—"}</td><td className="px-3 py-2 text-ink-2">{x.source}</td>
                  <td className={num}>{vnd(x.sample || null)}</td><td className={num}>{vnd(x.other || null)}</td><td className={num}>{vnd(x.ads || null)}</td><td className={num}>{vnd(x.video || null)}</td>
                  <td className={`${num} font-semibold`}>{vnd(x.total)}</td>
                  <td className="px-3 py-2"><span className={`rounded-md px-2 py-0.5 text-2xs font-semibold ${RESULT[x.result][1]}`}>{RESULT[x.result][0]}</span></td>
                </tr>
              ))}
            </Paged>
            {r.rows.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-ink-muted">Chưa có mẫu được duyệt trong kỳ có phát sinh chi phí.</td></tr>}
          </tbody>
          {r.rows.length > 0 && (
            <tfoot className="border-t border-line bg-page font-semibold">
              <tr><td className="px-3 py-2" colSpan={4}>Tổng</td><td className={num}>{vnd(t.sample)}</td><td className={num}>{vnd(t.other)}</td><td className={num}>{vnd(t.ads)}</td><td className={num}>{vnd(t.video)}</td><td className={num}>{vnd(t.total)}</td><td /></tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-2xs text-ink-muted">Chỉ tính mẫu mới trong quy trình R&D (mẫu R&D và mẫu Media test đã được đưa vào R&D), kể cả mẫu chưa được cấp mã SPU. Kỳ tính theo mẫu được DUYỆT (P1) trong kỳ, cùng quy tắc với thẻ P1–P6; chi phí gồm mọi đơn đặt mẫu của mẫu đó (trừ đơn huỷ). Làm mẫu = Chi phí SX × số lượng; chi phí khác tính theo đơn; Ads và chi phí quay mẫu nhập tay.</p>
      </>}
    </div>
  );
}
