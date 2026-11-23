import Paged from "@/components/Paged";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { pipelineStats, type StatRow } from "@/lib/pipeline";
import { PRODUCT_GROUPS, type ProductGroup, type Stage } from "@/lib/pipeline-constants";
import InfoTip from "@/components/InfoTip";
import { todayVN } from "@/lib/data";

// Thống kê theo team → nhân viên (thay sheet "Thống kê" của Lark): 1 bảng, team có dòng tổng, nhân viên lồng bên dưới.
const MILESTONES: [Stage, string][] = [["p1", "Duyệt"], ["p2", "Sản xuất"], ["p3", "Hoàn thành mẫu"], ["p4", "Quay xong video"], ["p5", "Win"], ["p6", "Thương mại hoá"]];

function monthRange(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return [`${m}-01`, `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, "0")}`] as const;
}
const shiftMonth = (m: string, n: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const n = (v: number) => (v ? v.toLocaleString("vi-VN") : <span className="text-ink-muted">·</span>);

function Row({ r, team }: { r: StatRow; team?: boolean }) {
  const cell = `px-2 py-1.5 text-right tabular ${team ? "font-semibold" : ""}`;
  return (
    <tr className={`border-b border-line ${team ? "bg-page" : ""}`}>
      <td className={`px-2 py-1.5 ${team ? "font-semibold" : "pl-6 text-ink-2"}`}>{r.name}</td>
      <td className={cell}>{n(r.total)}</td>
      {MILESTONES.map(([s]) => <td key={s} className={cell}>{n(r.reached[s])}</td>)}
      <td className={`${cell} text-ink-2`}>{n(r.killed)}</td>
      <td className={`${cell} border-l border-line`}>{pct(r.reached.p0, r.total)}</td>
      <td className={cell}>{pct(r.reached.p4, r.reached.p0)}</td>
      <td className={cell}>{pct(r.reached.p5, r.reached.p4)}</td>
      <td className="border-l border-line px-2 py-1.5">
        <span className="flex flex-wrap gap-1">
          {(Object.keys(PRODUCT_GROUPS) as ProductGroup[]).filter((g) => r.groups[g]).map((g) => (
            <span key={g} className="rounded bg-grid px-1.5 text-2xs">{PRODUCT_GROUPS[g]} {r.groups[g]}</span>
          ))}
        </span>
      </td>
      <td className={cell}>{r.sampleDays === null ? <span className="text-ink-muted">·</span> : `${r.sampleDays.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}n`}</td>
    </tr>
  );
}

export default async function RndStatsPage({ searchParams }: PageProps<"/rnd/stats">) {
  await requireUser(["admin", "rnd"]);
  const { month } = await searchParams;
  const all = month === "all";
  const m = !all && typeof month === "string" && /^\d{4}-\d{2}$/.test(month) ? month : todayVN().slice(0, 7);
  const [from, to] = all ? ["2020-01-01", todayVN()] : monthRange(m);
  const stats = await pipelineStats(from, to);
  const chip = (on: boolean) => `rounded-md px-2 py-0.5 ${on ? "bg-surface font-medium shadow-sm" : "text-ink-2 hover:text-ink-1"}`;

  // Nhân viên lồng dưới team của họ
  const total: StatRow = stats.teams.reduce((t, r) => ({
    ...t, total: t.total + r.total, killed: t.killed + r.killed,
    reached: Object.fromEntries(Object.entries(t.reached).map(([k, v]) => [k, v + r.reached[k as Stage]])) as StatRow["reached"],
    groups: Object.fromEntries(Object.entries(t.groups).map(([k, v]) => [k, v + r.groups[k as ProductGroup]])) as StatRow["groups"],
  }), { key: "all", name: "Tổng", team: null, total: 0, killed: 0, sampleDays: null,
    reached: { p0: 0, p1: 0, p2: 0, p3: 0, p4: 0, p5: 0, p6: 0 }, groups: { gmv: 0, traffic: 0, profit: 0, return: 0 } });
  const th = "px-2 py-1.5 text-right font-medium";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex items-center gap-0.5 rounded-md bg-grid p-0.5">
          <Link href={`/rnd/stats?month=${shiftMonth(m, -1)}`} className={chip(false)}>‹</Link>
          <Link href={`/rnd/stats?month=${m}`} className={chip(!all)}>Tháng {m.slice(5)}/{m.slice(0, 4)}</Link>
          <Link href={`/rnd/stats?month=${shiftMonth(m, 1)}`} className={chip(false)}>›</Link>
          <Link href="/rnd/stats?month=all" className={chip(all)}>Tất cả</Link>
        </div>
        <span className="ml-auto text-ink-muted" title="Duyệt…Win = số mẫu ĐÃ ĐẠT mốc đó (mẫu ở mốc sau được tính cả vào mốc trước). TG ra mẫu = trung bình số ngày từ duyệt tới nhận mẫu.">
          Mẫu sưu tầm {all ? "từ trước tới nay" : `tháng ${m.slice(5)}/${m.slice(0, 4)}`} · số đã đạt từng mốc<InfoTip />
        </span>
      </div>

      {stats.total === 0 ? (
        <div className="rounded-lg border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-2">Chưa có mẫu sưu tầm nào trong kỳ này.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="border-b border-line bg-page text-xs text-ink-2">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Team / nhân viên</th>
                <th className={th}>Sưu tầm</th>
                {MILESTONES.map(([s, label]) => <th key={s} className={th}>{label}</th>)}
                <th className={th}>Dừng</th>
                <th className={`${th} border-l border-line`} title="Duyệt ÷ Sưu tầm">% duyệt</th>
                <th className={th} title="Lên video ÷ Duyệt">% lên video</th>
                <th className={th} title="Win ÷ Lên video">% Win</th>
                <th className="border-l border-line px-2 py-1.5 text-left font-medium">Nhóm SP</th>
                <th className={th} title="Trung bình số ngày từ duyệt tới nhận mẫu">TG ra mẫu</th>
              </tr>
            </thead>
            <tbody>
              {stats.teams.map((t) => (
                <TeamBlock key={t.key} team={t} people={stats.people.filter((p) => (p.team ?? "Chưa gắn team") === t.name)} />
              ))}
            </tbody>
            {stats.teams.length > 1 && (
              <tfoot className="border-t-2 border-line">
                <Row r={total} team />
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}

function TeamBlock({ team, people }: { team: StatRow; people: StatRow[] }) {
  return (
    <>
      <Row r={team} team />
      <Paged size={50} cols={14}>{people.map((p) => <Row key={p.key} r={p} />)}</Paged>
    </>
  );
}
