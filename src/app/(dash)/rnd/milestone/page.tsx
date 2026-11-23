import Link from "next/link";
import { requireUser } from "@/lib/session";
import { fmtDate, parseFilters } from "@/lib/data";
import { rndDashboardCached } from "@/lib/rnd-dash-cache";
import { signThumbs } from "@/lib/rnd";
import { STAGES, STAGE_LABELS, type Stage } from "@/lib/pipeline-constants";

// Danh sách mẫu sau một con số của thẻ P0–P6 ở Dashboard R&D (cùng bộ số liệu, cùng kỳ + team đang lọc):
//   mặc định = theo kỳ lọc (P0 sưu tầm trong kỳ · P1 duyệt trong kỳ · P2–P6 trong số mẫu duyệt trong kỳ) · here=1 = mẫu đang nằm ở bước đó
const DATE_LABEL: Record<Stage, string> = {
  p0: "Ngày sưu tầm", p1: "Ngày duyệt", p2: "Ngày bắt đầu SX", p3: "Ngày nhận mẫu", p4: "Ngày source xong", p5: "Ngày lên Win", p6: "Ngày duyệt TMH",
};
// Cùng màu từng bước với thẻ P0–P6 ở Dashboard
const P_COLOR: Record<Stage, string> = { p0: "--series-1", p1: "--series-7", p2: "--series-5", p3: "--series-2", p4: "--series-4", p5: "--series-3", p6: "--series-6" };
const short = (s: Stage) => STAGE_LABELS[s].replace(/^P\d · /, "");
const DAY = 86_400_000;

export default async function MilestonePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const f = parseFilters(sp);
  const stage = (typeof sp.stage === "string" && (STAGES as readonly string[]).includes(sp.stage) ? sp.stage : "p0") as Stage;
  const here = sp.here === "1";
  const asList = sp.view === "list";   // mặc định dạng THẺ có ảnh lớn; view=list = danh sách gọn
  const d = await rndDashboardCached(user, { from: f.from, to: f.to, teams: f.teams });
  const list = d.stageLists[stage][here ? "here" : "reached"];
  const thumbs = await signThumbs(list.map((p) => p.image).filter((x): x is string => !!x));

  const keep = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const k of ["range", "from", "to", "team"]) { const v = sp[k]; if (typeof v === "string" && v) p.set(k, v); }
    p.set("stage", stage); if (here) p.set("here", "1"); if (asList) p.set("view", "list");
    for (const [k, v] of Object.entries(patch)) { if (v === null) p.delete(k); else p.set(k, v); }
    return `?${p}`;
  };
  const back = (() => { const p = new URLSearchParams(keep({ stage: null, here: null }).slice(1)); p.set("view", "rnd"); return `/rnd/dashboard?${p}`; })();
  const today = Date.now();
  const ago = (iso: string | null) => {
    if (!iso) return null;
    const n = Math.max(0, Math.floor((today - Date.parse(iso)) / DAY));
    return n === 0 ? "hôm nay" : n === 1 ? "hôm qua" : `${n} ngày trước`;
  };
  const desc = here ? "Mẫu hiện đang nằm ở bước này (toàn hệ thống, chưa dừng)"
    : stage === "p0" ? "Mẫu sưu tầm trong kỳ"
    : stage === "p1" ? "Mẫu được duyệt trong kỳ (kể cả mẫu sưu tầm từ trước)"
    : "Trong số mẫu được duyệt trong kỳ, các mẫu đã tới mốc này (tính tới hiện tại, kể cả mẫu sau đó bị dừng)";
  const killed = list.filter((p) => p.killed).length;

  return (
    <div className="space-y-3">
      {/* Đầu trang: mốc đang xem + số mẫu + kỳ, bên phải là cách xem */}
      <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <div className="h-1" style={{ background: `var(${P_COLOR[stage]})` }} />
        {/* Một hàng: ‹ Dashboard · Pn Tên mốc · N mẫu · kỳ (giải thích đầy đủ trong ⓘ) — bên phải: kiểu hiển thị + cách xem */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={back} className="text-xs text-ink-muted hover:text-accent" title="Về Dashboard R&D">‹ Dashboard</Link>
            <span className="text-ink-muted" aria-hidden>/</span>
            <span className="rounded px-1.5 text-2xs font-bold leading-5 text-white" style={{ background: `var(${P_COLOR[stage]})` }}>{stage.toUpperCase()}</span>
            <h1 className="font-semibold">{short(stage)}</h1>
            <span className="text-sm text-ink-muted">· {list.length} mẫu{killed ? ` (${killed} đã dừng)` : ""}</span>
            {!here && <span className="text-xs text-ink-2">· {fmtDate(f.from)} – {fmtDate(f.to)}</span>}
            <span className="cursor-help text-xs text-ink-muted" title={desc}>ⓘ</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <div className="flex gap-0.5 rounded-md bg-grid p-0.5" role="tablist" aria-label="Kiểu hiển thị">
              <Link href={keep({ view: null })} aria-selected={!asList} title="Thẻ có ảnh" className={`rounded px-2 py-0.5 ${!asList ? "bg-surface font-medium text-ink-1 shadow-sm" : "text-ink-2 hover:text-ink-1"}`}>▦ Thẻ</Link>
              <Link href={keep({ view: "list" })} aria-selected={asList} title="Danh sách gọn" className={`rounded px-2 py-0.5 ${asList ? "bg-surface font-medium text-ink-1 shadow-sm" : "text-ink-2 hover:text-ink-1"}`}>☰ Danh sách</Link>
            </div>
            <div className="flex gap-0.5 rounded-md bg-grid p-0.5" role="tablist" aria-label="Cách xem">
              <Link href={keep({ here: null })} role="tab" aria-selected={!here} className={`rounded px-2 py-0.5 ${!here ? "bg-surface font-medium text-ink-1 shadow-sm" : "text-ink-2 hover:text-ink-1"}`}>Theo kỳ lọc</Link>
              <Link href={keep({ here: "1" })} role="tab" aria-selected={here} className={`rounded px-2 py-0.5 ${here ? "bg-surface font-medium text-ink-1 shadow-sm" : "text-ink-2 hover:text-ink-1"}`}>Đang ở bước này</Link>
            </div>
          </div>
        </div>

        {/* Dải mốc P0 → P6: bấm để đổi mốc */}
        <nav className="flex overflow-x-auto border-t border-line bg-page/50 px-2 py-1.5" aria-label="Chọn mốc">
          {STAGES.map((s, i) => {
            const on = s === stage, n = d.stageLists[s][here ? "here" : "reached"].length;
            return (
              <div key={s} className="flex items-center">
                {i > 0 && <span className="px-1 text-ink-muted" aria-hidden>›</span>}
                <Link href={keep({ stage: s })} aria-current={on ? "page" : undefined}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs transition-colors ${on ? "bg-surface font-semibold shadow-sm ring-1 ring-line" : "text-ink-2 hover:bg-surface"}`}>
                  <span className="rounded px-1 text-2xs font-bold text-white" style={{ background: `var(${P_COLOR[s]})`, opacity: on || n ? 1 : 0.45 }}>{s.toUpperCase()}</span>
                  {short(s)}
                  <span className={`tabular-nums ${on ? "text-ink-1" : "text-ink-muted"}`}>{n}</span>
                </Link>
              </div>
            );
          })}
        </nav>
      </section>

      {/* Danh sách mẫu */}
      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-ink-muted">Không có mẫu nào ở mốc này trong kỳ.</div>
      ) : !asList ? (
        // Dạng thẻ: ảnh lớn, mã + tên, ngày đạt mốc, mốc hiện tại (viền màu theo mốc hiện tại)
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {list.map((p) => {
            const cur = p.stage as Stage;
            return (
              <Link key={p.id} href={`/rnd/${p.id}`}
                className={`group flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${p.killed ? "opacity-60" : ""}`}>
                <div className="relative aspect-square bg-grid">
                  {p.image && thumbs[p.image]
                    // eslint-disable-next-line @next/next/no-img-element -- link ký tạm thời của kho ảnh
                    ? <img src={thumbs[p.image]} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
                    : <span className="flex h-full w-full items-center justify-center text-4xl text-ink-muted">💍</span>}
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-2 py-0.5 text-2xs font-semibold text-white backdrop-blur-sm">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: `var(${P_COLOR[cur] ?? "--ink-muted"})` }} />{STAGE_LABELS[cur] ?? p.stage}
                  </span>
                  {p.killed && <span className="absolute right-2 top-2 rounded-md bg-bad px-2 py-0.5 text-2xs font-semibold text-white">Đã dừng</span>}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-2.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="rounded bg-grid px-1.5 py-px text-2xs font-semibold text-ink-1">{p.st_code ?? "—"}</span>
                    {p.code && <span className="rounded border border-accent/30 px-1.5 py-px font-mono text-2xs text-accent">{p.code}</span>}
                  </div>
                  <div className="line-clamp-2 text-sm font-medium leading-snug" title={p.name}>{p.name}</div>
                  <div className="mt-auto flex items-center justify-between gap-1 pt-1 text-2xs text-ink-muted">
                    <span className="truncate">{p.team ?? "Chưa gắn team"}</span>
                    <span className="whitespace-nowrap tabular-nums" title={`${here ? "Ở bước này từ" : DATE_LABEL[stage]}: ${p.date ? fmtDate(p.date) : "—"}`}>{p.date ? `${fmtDate(p.date).slice(0, 5)} · ${ago(p.date)}` : "—"}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
          <li className="hidden grid-cols-[56px_minmax(0,1fr)_140px_170px_190px] items-center gap-4 bg-page px-4 py-2 text-xs font-medium text-ink-2 md:grid">
            <span />
            <span>Mẫu</span>
            <span>Team</span>
            <span>{here ? "Ở bước này từ" : DATE_LABEL[stage]}</span>
            <span>Mốc hiện tại</span>
          </li>
          {list.map((p) => {
            const cur = p.stage as Stage;
            return (
              <li key={p.id} className={p.killed ? "opacity-60" : ""}>
                <Link href={`/rnd/${p.id}`} className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-x-4 gap-y-1 px-4 py-2.5 hover:bg-grid/40 md:grid-cols-[56px_minmax(0,1fr)_140px_170px_190px]">
                  <span className="row-span-3 block h-14 w-14 overflow-hidden rounded-lg border border-line bg-grid md:row-span-1">
                    {p.image && thumbs[p.image]
                      // eslint-disable-next-line @next/next/no-img-element -- link ký tạm thời của kho ảnh
                      ? <img src={thumbs[p.image]} alt="" loading="lazy" className="h-full w-full object-cover" />
                      : <span className="flex h-full w-full items-center justify-center text-lg text-ink-muted">💍</span>}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-grid px-1.5 py-px text-xs font-semibold text-ink-1">{p.st_code ?? "—"}</span>
                      {p.code && <span className="rounded border border-accent/30 px-1.5 py-px font-mono text-xs text-accent">{p.code}</span>}
                      {p.killed && <span className="rounded bg-bad/10 px-1.5 py-px text-2xs font-semibold text-bad">Đã dừng</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-medium" title={p.name}>{p.name}</span>
                  </span>
                  <span className="text-sm text-ink-2 max-md:col-start-2 max-md:text-xs">{p.team ?? "Chưa gắn team"}</span>
                  <span className="text-sm tabular-nums max-md:col-start-2 max-md:text-xs">
                    {p.date ? <>{fmtDate(p.date)} <span className="text-xs text-ink-muted">· {ago(p.date)}</span></> : <span className="text-ink-muted">—</span>}
                  </span>
                  <span className="max-md:col-start-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-0.5 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ background: `var(${P_COLOR[cur] ?? "--ink-muted"})` }} />
                      {STAGE_LABELS[cur] ?? p.stage}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
