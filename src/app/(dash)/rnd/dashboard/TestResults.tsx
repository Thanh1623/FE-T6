import Link from "next/link";
import FilterBar from "@/components/FilterBar";
import { sb } from "@/lib/supabase/admin";
import ResultBadge from "@/components/rnd/ResultBadge";
import ResultTrendChart from "@/components/rnd/ResultTrendChart";
import { TREND_SERIES } from "@/lib/rnd-result-series";
import { getAccounts, daysBetween, fmtDate, todayVN, fmtInt, limitByTeams, parseFilters } from "@/lib/data";
import { isRndEditor, type CurrentUser } from "@/lib/session";
import { getTeams } from "@/lib/pipeline";
import MediaWinReview, { type WinCandidate } from "./MediaWinReview";
import { emptyTally, listEvaluations, rates, tally, weekOf, type Evaluation } from "@/lib/eval/data";
import { isWinResult, type WinResult } from "@/lib/eval/rules";
import { isSystemTestCode } from "@/lib/tags";
import InfoTip from "@/components/InfoTip";
import { productPotential, videoPotential, videoThresholds } from "@/lib/eval/potential";

// Luồng: mã thuộc mẫu đã vào quy trình R&D (có stage) → R&D; còn lại → Media tự test
const isRnd = (e: Evaluation) => !!e.product?.stage;
// Thẻ số liệu cùng kiểu thẻ P / S của luồng R&D (FlowCard): bo nhỏ, nhãn · số lớn · diễn giải căn giữa; color = màu kết quả cho số
// Ô số liệu nhỏ (khối Video test): nhãn nhỏ phía trên, số vừa phải, diễn giải một dòng
function Mini({ label, value, hint, tip }: { label: string; value: string; hint?: string; tip?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-[color-mix(in_srgb,var(--accent)_16%,var(--surface))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] px-2.5 py-1.5" title={tip}>
      <div className="truncate text-2xs text-ink-muted" title={label}>{label}</div>
      <div className="text-base font-bold leading-6 tabular-nums">{value}</div>
      {hint && <div className="truncate text-2xs text-ink-muted">{hint}</div>}
    </div>
  );
}
function Kpi({ label, value, hint, color, tip }: { label: string; value: string; hint?: string; color?: string; tip?: string }) {
  return (
    <div className={`flex min-w-0 flex-col items-center rounded-md border px-3 py-2 text-center ${color === "--res-win" ? "border-[color-mix(in_srgb,var(--res-win)_20%,var(--surface))] bg-[color-mix(in_srgb,var(--res-win)_8%,var(--surface))]" : color === "--res-fail" ? "border-[color-mix(in_srgb,var(--bad)_18%,var(--surface))] bg-[color-mix(in_srgb,var(--bad)_8%,var(--surface))]" : "border-[color-mix(in_srgb,var(--accent)_16%,var(--surface))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"}`} title={tip}>
      <div className="max-w-full truncate text-xs text-ink-2" title={label}>{label}</div>
      <div className="mt-1 text-2xl font-extrabold leading-none tabular-nums" style={color ? { color: `var(${color})` } : undefined}>{value}</div>
      {hint && <div className="mt-1 max-w-full truncate text-2xs text-ink-muted">{hint}</div>}
    </div>
  );
}
const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v)}%`);

// Luồng Media (chung của team): CHỈ mã SPU test (T10001, T20003… — tạo ở /rnd/test-codes), gồm mẫu Media tự test và mẫu test đã được đưa vào R&D,
// tự đánh giá theo KPI mặc định Sales / Traffic. Mẫu Media tự test đạt WIN → báo team xem xét (không tự tính vào luồng R&D).
export default async function TestResults({ sp, user, lead, banner }: { sp: Record<string, string | string[] | undefined>; user: CurrentUser; lead?: React.ReactNode; banner?: React.ReactNode }) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  // Bộ lọc dùng chung với luồng R&D (FilterBar): khoảng ngày · team · Page; ghi vào URL
  const f = parseFilters(sp);
  const age = one(sp.age) === "all" ? "all" : "new";
  const keep = Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const href = (patch: Record<string, string>) => `/rnd/dashboard?${new URLSearchParams({ ...keep, view: "test", age, ...patch })}`;

  const [allEvals, accounts, teams, { data: people }] = await Promise.all([listEvaluations({ testOnly: true }), getAccounts(), getTeams(true), sb.core().from("profiles").select("id, team_id")]);
  // Lọc theo team (chọn nhiều). Team của mã = team của mẫu, chưa có thì team của người tạo mã
  const teamIds = f.teams.filter((id) => teams.some((t) => t.id === id));
  const teamByUser = new Map((people ?? []).map((p) => [p.id as string, (p.team_id as string | null) ?? null]));
  const teamOf = (e: Evaluation) => e.product?.team_id ?? teamByUser.get((e.product as { created_by?: string | null } | null)?.created_by ?? "") ?? null;
  // Page đang chọn (nếu có): chỉ mã có video đăng trên các Page đó
  const pageScope = f.scope === "all" || f.scope === "mine" ? null : f.scope.split(",");
  const everything = allEvals.filter((e) => isSystemTestCode(e.code, (e.product as { created_by?: string | null } | null)?.created_by) && (!teamIds.length || teamIds.includes(teamOf(e) ?? "")) && (!pageScope || e.videos.some((v) => pageScope.includes(v.channel_id))));   // luồng Media chỉ lấy mã SPU test
  const filterAccounts = limitByTeams(accounts.filter((a) => a.platform === "facebook" || a.platform === "instagram" || a.platform === "tiktok"), f);
  const pageName0 = new Map(accounts.map((a) => [a.id, a.name]));
  // Hàng chờ: mẫu Media tự test (mới) đạt WIN, team chưa quyết định — không phụ thuộc kỳ lọc
  const candidates: WinCandidate[] = everything
    // Chỉ mã TEST của Media (bắt đầu bằng T: T10001, T20003…); mẫu cũ / mã thường không đưa vào quy trình R&D được
    .filter((e) => isWinResult(e.result) && e.age === "new" && e.product_id && !isRnd(e) && !e.product?.media_review)
    .map((e) => ({
      productId: e.product_id!, code: e.code, name: e.product?.name ?? `Mẫu ${e.code}`, result: e.result as WinResult,
      views: Number(e.metrics.views ?? 0), qty: Number(e.metrics.qty_net ?? 0), firstDate: e.first_post_date,
      page: pageName0.get([...e.videos].sort((a, b) => a.date.localeCompare(b.date))[0]?.channel_id ?? "") ?? null, teamId: e.product?.team_id ?? null,
    }));
  const all = everything;
  // Kỳ = theo ngày video đầu tiên của mẫu
  const inPeriod = all.filter((e) => e.first_post_date >= f.from && e.first_post_date <= f.to);
  const list = age === "new" ? inPeriod.filter((e) => e.age === "new") : inPeriod;
  const oldCount = inPeriod.filter((e) => e.age === "old").length;
  const t = tally(list), r = rates(t);

  // Xu hướng theo NGÀY (mẫu bắt đầu test = ngày video đầu tiên của mã); kỳ lọc dài quá 92 ngày thì gộp theo tuần cho các cột không quá mảnh
  const byDay = daysBetween(f.from, f.to) <= 92;
  const buckets = new Map<string, ReturnType<typeof emptyTally>>();
  for (const e of list) {
    const w = byDay ? e.first_post_date : weekOf(e.first_post_date);
    const cur = buckets.get(w) ?? emptyTally();
    cur.total++; cur[e.result]++;
    buckets.set(w, cur);
  }
  if (byDay) for (let d = f.from; d <= f.to && d <= todayVN(); d = new Date(Date.parse(d) + 86_400_000).toISOString().slice(0, 10)) if (!buckets.has(d)) buckets.set(d, emptyTally());   // ngày không có mẫu vẫn hiện (cột trống) cho trục thời gian liên tục
  const trend = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, v]) => ({ week, ...v }));

  // SPU test theo team: số mã, số video, kết quả
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const teamAgg = new Map<string, ReturnType<typeof emptyTally> & { name: string; videos: number; views: number }>();
  for (const e of list) {
    const id = teamOf(e), name = id ? teamName.get(id) ?? "(team đã ngừng)" : "(chưa gán team)";
    const cur = teamAgg.get(name) ?? { ...emptyTally(), name, videos: 0, views: 0 };
    cur.total++; cur.videos += e.videos.length; cur.views += e.videos.reduce((n, v) => n + v.views, 0); cur[e.result]++;
    teamAgg.set(name, cur);
  }
  const teamRows = [...teamAgg.values()].sort((a, b) => b.videos - a.videos);

  // Số liệu video của các mẫu trong kỳ: số video, lượt xem, người xem, CTR trung bình, số bán
  const vids = list.flatMap((e) => e.videos);
  const vStat = {
    count: vids.length, views: vids.reduce((n, v) => n + v.views, 0), viewers: vids.reduce((n, v) => n + v.viewers, 0),
    qty: list.reduce((n, e) => n + Number(e.metrics.qty_net ?? 0), 0),
    ctr: (() => { const c = vids.filter((v) => v.ctr !== null); return c.length ? c.reduce((n, v) => n + (v.ctr as number), 0) / c.length : null; })(),
    top: vids.reduce<(typeof vids)[number] | null>((m, v) => (!m || v.views > m.views ? v : m), null),
  };
  const soonWin = list.filter((e) => e.result === "testing" && e.forecast && e.forecast.predicted !== "fail")
    .sort((a, b) => (a.forecast!.days_left - b.forecast!.days_left));
  const trafficNoSales = list.filter((e) => e.traffic_status === "pass" && ["weak", "partial"].includes(e.sales_status));
  // Sản phẩm & video tiềm năng (xem lib/eval/potential.ts)
  const potentials = list.flatMap((e) => { const p = productPotential(e); return p ? [{ e, p }] : []; })
    .sort((a, b) => (a.p.level === b.p.level ? (a.e.forecast?.days_left ?? 99) - (b.e.forecast?.days_left ?? 99) : a.p.level === "high" ? -1 : 1));
  const allVideos = list.filter((e) => e.result !== "fail").flatMap((e) => e.videos.map((v) => ({ ...v, e })));
  const vt = videoThresholds(allVideos);
  const potentialVideos = allVideos.map((v) => ({ v, why: videoPotential(v, vt) })).filter((x) => x.why)
    .sort((a, b) => b.v.views - a.v.views);
  const awaiting = list.filter((e) => !e.confirmed && e.result !== "testing");
  const recentWins = list.filter((e) => isWinResult(e.result))
    .sort((a, b) => b.window_end.localeCompare(a.window_end)).slice(0, 8);

  const name = (e: Evaluation) => <>{e.product?.name ?? `Mẫu ${e.code}`} <span className={`ml-1 rounded px-1 text-2xs ${isRnd(e) ? "bg-accent text-white" : "bg-grid text-ink-2"}`}>{isRnd(e) ? `R&D${e.product?.st_code ? ` ${e.product.st_code}` : ""}` : "Media"}</span></>;
  const link = (e: Evaluation) => (e.product_id ? `/rnd/${e.product_id}` : "/rnd");
  const chip = (active: boolean) => `rounded px-2.5 py-0.5 text-xs font-semibold ${active ? "bg-surface text-ink-1 shadow-sm" : "text-ink-2 hover:text-ink-1"}`;

  return (
    <div className="space-y-4">
      {/* Kiểu trang QLHN: tab chế độ xem; một thẻ lọc gọn (mẫu mới/cũ · khoảng ngày · team · Page) */}
      {lead}
      {banner}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-line bg-surface px-2.5 py-2 text-xs shadow-sm [&_.h-\[34px\]]:h-8 [&_.h-\[34px\]]:rounded-md [&_.text-sm]:text-xs!">
        <div className="flex gap-0.5 rounded-md bg-grid p-0.5" title="Mẫu cũ = đã bán từ trước khi đăng video đầu">
          <Link href={href({ age: "new" })} className={chip(age === "new")}>Chỉ mẫu mới</Link>
          <Link href={href({ age: "all" })} className={chip(age === "all")}>Tất cả{oldCount ? ` (+${oldCount} cũ)` : ""}</Link>
        </div>
        <FilterBar filters={f} teams={teams.map((t) => ({ id: t.id, name: t.name }))} accounts={filterAccounts} />
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label={age === "new" ? "Mẫu test mới" : "Mẫu test"} value={fmtInt(t.total)} hint={`${fmtInt(r.done)} đã xong`} tip={`${fmtInt(r.done)} đã kết luận · ${fmtInt(t.testing)} đang test`} />
        <Kpi label="Tỉ lệ WIN" value={pct(r.anyWin)} tip="(WIN + WIN TRAFFIC) ÷ mẫu đã kết luận" />
        <Kpi label="WIN" color="--res-win" value={fmtInt(t.win)} hint={pct(r.win)} tip="Đạt KPI bán hàng" />
        <Kpi label="WIN TRAFFIC" color="--res-wt" value={fmtInt(t.win_traffic)} hint={pct(r.win_traffic)} tip="Đạt KPI traffic" />
        <Kpi label="FAIL" color="--res-fail" value={fmtInt(t.fail)} hint={pct(r.fail)} tip="Hết hạn không đạt" />
        <Kpi label="Đang test" value={fmtInt(t.testing)} hint={`${fmtInt(soonWin.length)} sắp đạt · ${fmtInt(awaiting.length)} chờ xác nhận`} tip={`${fmtInt(soonWin.length)} dự kiến đạt · ${fmtInt(awaiting.length)} chờ R&D xác nhận`} />
      </div>

      {t.total === 0 ? (
        <div className="rounded-lg border border-dashed border-line bg-surface p-8 text-center text-ink-2">
          Chưa có mẫu {age === "new" ? "mới " : ""}nào trong kỳ này. Media chỉ cần đăng video kèm hashtag mã SPU (VD <code>#N0123</code>) —
          hệ thống tự nhận và đánh giá ở lần đồng bộ tiếp theo.
          {age === "new" && oldCount > 0 && <> Có {oldCount} mẫu cũ — chọn &quot;Tất cả&quot; để xem.</>}
        </div>
      ) : (
        <>
          {/* Tổng quan gọn: xu hướng tuần + tỉ lệ kết quả theo nhóm; số lượt xem / số bán theo kết quả; SPU test theo team */}
          <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
            <section className="rounded-lg border border-line bg-surface p-3">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Mẫu bắt đầu test theo {byDay ? "ngày" : "tuần"}</h2>
                <div className="flex gap-2.5 text-2xs text-ink-2">
                  {TREND_SERIES.map(([k, n, color]) => <span key={k} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: color }} />{n}</span>)}
                </div>
              </div>
              <ResultTrendChart data={trend} unit={byDay ? "day" : "week"} />
            </section>
            <section className="rounded-lg border border-line bg-surface p-3">
              <h2 className="mb-2 text-sm font-semibold">Video test</h2>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                <Mini label="Video" value={fmtInt(vStat.count)} hint={`${(vStat.count / t.total).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} / mẫu`} tip="Số video đăng của các mẫu trong kỳ" />
                <Mini label="Lượt xem" value={fmtInt(vStat.views)} hint={vStat.count ? `${fmtInt(Math.round(vStat.views / vStat.count))} / video` : undefined} tip="Tổng lượt xem các video test" />
                <Mini label="Người xem" value={fmtInt(vStat.viewers)} tip="Tổng người xem (viewers) các video test" />
                <Mini label="CTR trung bình" value={vStat.ctr === null ? "–" : `${vStat.ctr.toFixed(2)}%`} tip="Trung bình CTR của các video có số CTR" />
                <Mini label="Đã bán" value={fmtInt(vStat.qty)} hint={`${(vStat.qty / t.total).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} / mẫu`} tip="Số sản phẩm bán thuần của các mẫu trong cửa sổ test" />
                <Mini label="Xem nhiều nhất" value={vStat.top ? fmtInt(vStat.top.views) : "–"} hint={vStat.top ? fmtDate(vStat.top.date) : undefined} tip="Lượt xem của video cao nhất" />
              </div>
            </section>
          </div>

          {/* SPU test theo team: mỗi team một ô nhỏ — tên, số SPU · số video, và chấm màu chỉ hiện kết quả có số (WIN · WIN TRAFFIC · FAIL · đang test) */}
          <section className="rounded-lg border border-line bg-surface p-3">
            <h2 className="mb-2 text-sm font-semibold">SPU test theo team <InfoTip text="Số mã SPU test, số video đã lên và kết quả của từng team trong kỳ đang lọc. Team của mã = team của mẫu, chưa có thì team người tạo mã." /></h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {teamRows.map((g) => (
                <li key={g.name} className="rounded-md border border-[color-mix(in_srgb,var(--accent)_16%,var(--surface))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] px-2.5 py-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium" title={g.name}>{g.name}</span>
                    <span className="tabular flex-none text-2xs text-ink-muted">{fmtInt(g.total)} SPU · {fmtInt(g.videos)} video · {fmtInt(g.views)} xem</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular">
                    {([["WIN", g.win + g.win_sp, "--res-win"], ["W.TRAFFIC", g.win_traffic, "--res-wt"], ["FAIL", g.fail, "--res-fail"], ["Test", g.testing, "--res-testing"]] as const)
                      .filter(([, n]) => n > 0)
                      .map(([l, n, col]) => <span key={l} className="flex items-center gap-1" title={`${l}: ${n}`}><span className="h-2 w-2 rounded-sm" style={{ background: `var(${col})` }} /><b>{fmtInt(n)}</b><span className="text-ink-muted">{l}</span></span>)}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-line bg-surface p-3">
              <h2 className="mb-1 font-semibold">⭐ Sản phẩm tiềm năng</h2>
              <p className="mb-2 text-xs text-ink-muted">Chưa WIN đủ nhưng đang đi đúng hướng: dự báo đạt, hoặc gần đạt KPI còn lại — nên đẩy thêm video</p>
              <ul className="space-y-2 text-sm">
                {potentials.slice(0, 10).map(({ e, p }) => (
                  <li key={e.code} className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <Link href={link(e)} className="block truncate hover:underline"><b>#{e.code}</b> {name(e)}</Link>
                      <span className="text-xs text-ink-muted">{p.reasons.join(" · ")}</span>
                    </span>
                    <span className="flex flex-none items-center gap-1.5 text-xs">
                      <span className={`rounded-md px-1.5 py-0.5 font-medium ${p.level === "high" ? "bg-warn-bg text-warn-ink" : "bg-grid text-ink-2"}`}>{p.level === "high" ? "⭐ Cao" : "Vừa"}</span>
                      <ResultBadge result={e.result} size="xs" />
                    </span>
                  </li>
                ))}
                {!potentials.length && <li className="text-ink-muted">Chưa có mẫu tiềm năng.</li>}
              </ul>
            </section>
            <section className="rounded-lg border border-line bg-surface p-3">
              <h2 className="mb-1 font-semibold">🎬 Video tiềm năng</h2>
              <p className="mb-2 text-xs text-ink-muted">
                Lượt xem ≥ {fmtInt(vt.views)} (top 25% video đang test) hoặc CTR cao — cân nhắc đăng lại / dựng thêm theo cùng kiểu
              </p>
              <ul className="space-y-2 text-sm">
                {potentialVideos.slice(0, 10).map(({ v, why }) => (
                  <li key={v.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      {v.url
                        ? <a href={v.url} target="_blank" rel="noreferrer" className="block truncate hover:underline">▶ <b>#{v.e.code}</b> {fmtDate(v.date)}</a>
                        : <span className="block truncate">▶ <b>#{v.e.code}</b> {fmtDate(v.date)}</span>}
                      <span className="text-xs text-ink-muted">{why}{v.ctr !== null ? ` · CTR ${v.ctr.toFixed(2)}%` : ""}</span>
                    </span>
                    <span className="tabular flex-none text-xs text-ink-muted">{fmtInt(v.views)} xem</span>
                  </li>
                ))}
                {!potentialVideos.length && <li className="text-ink-muted">Chưa có video nổi bật.</li>}
              </ul>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-lg border border-line bg-surface p-3">
              <h2 className="mb-1 font-semibold">⏳ Đang test — dự kiến đạt</h2>
              <p className="mb-2 text-xs text-ink-muted">Ngoại suy theo nhịp hiện tại tới hết cửa sổ test</p>
              <ul className="space-y-2 text-sm">
                {soonWin.slice(0, 8).map((e) => (
                  <li key={e.code} className="flex items-center justify-between gap-2">
                    <Link href={link(e)} className="min-w-0 truncate hover:underline"><b>#{e.code}</b> {name(e)}</Link>
                    <span className="flex flex-none items-center gap-1.5 text-xs text-ink-muted">
                      còn {e.forecast!.days_left} ngày <ResultBadge result={e.forecast!.predicted} size="xs" />
                    </span>
                  </li>
                ))}
                {!soonWin.length && <li className="text-ink-muted">Chưa có mẫu nào dự kiến đạt.</li>}
              </ul>
            </section>
            <section className="rounded-lg border border-line bg-surface p-3">
              <h2 className="mb-1 font-semibold">👀 Traffic cao nhưng chưa bán</h2>
              <p className="mb-2 text-xs text-ink-muted">Đạt KPI traffic, KPI bán hàng còn yếu — xem lại giá/cách chốt đơn</p>
              <ul className="space-y-2 text-sm">
                {trafficNoSales.slice(0, 8).map((e) => (
                  <li key={e.code} className="flex items-center justify-between gap-2">
                    <Link href={link(e)} className="min-w-0 truncate hover:underline"><b>#{e.code}</b> {name(e)}</Link>
                    <span className="tabular flex-none text-xs text-ink-muted">{fmtInt(Number(e.metrics.views))} xem · {fmtInt(Number(e.metrics.qty_net))} bán</span>
                  </li>
                ))}
                {!trafficNoSales.length && <li className="text-ink-muted">Không có.</li>}
              </ul>
            </section>
            <section className="rounded-lg border border-line bg-surface p-3">
              <h2 className="mb-1 font-semibold">🏆 WIN gần đây</h2>
              <p className="mb-2 text-xs text-ink-muted">Ứng viên đẩy mẫu ĐVKD — mở mẫu để xác nhận &amp; chuyển</p>
              <ul className="space-y-2 text-sm">
                {recentWins.map((e) => (
                  <li key={e.code} className="flex items-center justify-between gap-2">
                    <Link href={link(e)} className="min-w-0 truncate hover:underline"><b>#{e.code}</b> {name(e)}</Link>
                    <span className="flex flex-none items-center gap-1 text-xs text-ink-muted">
                      {e.confirmed ? "đã xác nhận" : "chờ xác nhận"} <ResultBadge result={e.result} size="xs" />
                    </span>
                  </li>
                ))}
                {!recentWins.length && <li className="text-ink-muted">Chưa có mẫu WIN.</li>}
              </ul>
            </section>
          </div>
        </>
      )}

      <section className="rounded-lg border border-dashed border-line bg-surface p-4 text-sm text-ink-2">
        <b>🤖 Nhận định AI</b> — chưa bật. Khi nạp Claude API và thêm <code>ANTHROPIC_API_KEY</code>, mục này sẽ tự viết phân tích
        mỗi ngày: vì sao mẫu win/fail, line nào đang tốt, nên đẩy mẫu nào.
      </section>

      {/* Mẫu Media tự test đã WIN — chờ team xem xét: đặt cuối trang để các số liệu chính hiện trước */}
      {candidates.length > 0 && <MediaWinReview rows={candidates} teams={teams} canReview={isRndEditor(user) || user.is_team_lead} />}
    </div>
  );
}
