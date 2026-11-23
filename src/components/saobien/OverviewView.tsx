import Link from "next/link";
import ParamSearch from "@/components/ParamSearch";
import ParamCombobox from "@/components/ParamCombobox";
import ResultBadge from "@/components/rnd/ResultBadge";
import Paged from "@/components/Paged";
import SampleMatrix from "@/components/saobien/SampleMatrix";
import { HANDOFF_STATUS, type HandoffStatus } from "@/lib/handoff-status";
import { buildChannelRows, buildTeamRows, type Overview, type Sample } from "@/lib/handoff-overview";
import { fmtInt } from "@/lib/data";

const STATUS_CLS: Record<HandoffStatus, string> = {
  pending: "bg-warn-bg text-warn-ink", received: "bg-accent/15 text-accent", developing: "bg-[#7c3aed]/15 text-[#7c3aed]",
  done: "bg-good/15 text-good", returned: "bg-bad/10 text-bad",
};
const PLATFORM: Record<string, { label: string; cls: string; icon: string }> = {
  facebook: { label: "Facebook", cls: "bg-[#1877f2] text-white", icon: "f" }, tiktok: { label: "TikTok", cls: "bg-black text-white ring-1 ring-white/30", icon: "♪" },
  instagram: { label: "Instagram", cls: "bg-[#e1306c] text-white", icon: "◎" }, youtube: { label: "YouTube", cls: "bg-[#ff0000] text-white", icon: "▶" },
};
const dm = (d: string) => new Date(d).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
const th = "whitespace-nowrap px-2.5 py-2 text-left text-2xs font-bold uppercase tracking-wide text-ink-muted";
const td = "px-2.5 py-2 align-middle";

// Ảnh bìa nhỏ của video (ảnh CDN, URL có hạn nên dùng <img> thường)
function Thumb({ url }: { url: string | null }) {
  // eslint-disable-next-line @next/next/no-img-element -- ảnh CDN, URL có hạn
  return url ? <img src={url} alt="" className="h-10 w-10 flex-none rounded object-cover" loading="lazy" /> : <span className="flex h-10 w-10 flex-none items-center justify-center rounded bg-grid">🎞️</span>;
}

function StatusChip({ s }: { s: HandoffStatus | "unassigned" }) {
  return s === "unassigned"
    ? <span className="rounded-md bg-grid px-2 py-0.5 text-2xs font-semibold text-ink-2">Chờ phân công</span>
    : <span className={`rounded-md px-2 py-0.5 text-2xs font-semibold ${STATUS_CLS[s]}`}>{HANDOFF_STATUS[s]}</span>;
}
function PlatformBadge({ platform }: { platform: string }) {
  const p = PLATFORM[platform];
  return p ? <span title={p.label} className={`inline-flex h-4 min-w-4 items-center justify-center rounded px-1 text-[10px] font-extrabold leading-none ${p.cls}`}>{p.icon}</span> : null;
}
function Tile({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface px-3.5 py-3">
      <div className="text-2xs font-bold uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={`mt-0.5 text-2xl font-extrabold tabular-nums ${tone ?? ""}`}>{value}</div>
      {sub && <div className="text-2xs text-ink-2">{sub}</div>}
    </div>
  );
}
function Section({ title, hint, children, right }: { title: string; hint?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-line pb-1.5">
        <div><h2 className="text-sm font-semibold">{title}</h2>{hint && <p className="text-xs text-ink-muted">{hint}</p>}</div>
        {right}
      </div>
      {children}
    </section>
  );
}
const Table = ({ children }: { children: React.ReactNode }) => (
  <div className="overflow-x-auto rounded-xl border border-line bg-surface"><table className="w-full min-w-max text-sm">{children}</table></div>
);

// Sắp xếp bảng bằng tham số URL: ts = bảng Theo team, cs = bảng Theo kênh; dạng "<cột>.asc" / "<cột>.desc". Bấm tiêu đề cột: mặc định → đảo chiều → bỏ.
type SortState = { key: string; dir: 1 | -1 } | null;
const parseSort = (v: string | null | undefined): SortState => { const [k, d] = (v ?? "").split("."); return k ? { key: k, dir: d === "asc" ? 1 : -1 } : null; };
function sortLinkHref(baseQuery: string, param: string, key: string, cur: SortState, textFirst: boolean) {
  const p = new URLSearchParams(baseQuery);
  const first = textFirst ? "asc" : "desc", second = textFirst ? "desc" : "asc";
  if (!cur || cur.key !== key) p.set(param, `${key}.${first}`);
  else if ((cur.dir === 1 ? "asc" : "desc") === first) p.set(param, `${key}.${second}`);
  else p.delete(param);
  const q = p.toString();
  return q ? `?${q}` : "?";
}
function SortTh({ label, k, param, cur, baseQuery, className, textFirst = false }: { label: string; k: string; param: string; cur: SortState; baseQuery: string; className: string; textFirst?: boolean }) {
  const on = cur?.key === k;
  return (
    <th className={className} aria-sort={on ? (cur!.dir === 1 ? "ascending" : "descending") : "none"}>
      <Link href={sortLinkHref(baseQuery, param, k, cur, textFirst)} scroll={false} title="Bấm để sắp xếp" className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink-1 ${on ? "text-accent" : ""}`}>
        {label}<span aria-hidden className={`text-[9px] ${on ? "" : "opacity-30"}`}>{on ? (cur!.dir === 1 ? "▲" : "▼") : "↕"}</span>
      </Link>
    </th>
  );
}
function sortBy<T>(rows: T[], sort: SortState, valueOf: (r: T, key: string) => number | string): T[] {
  if (!sort) return rows;
  return [...rows].sort((a, b) => {
    const x = valueOf(a, sort.key), y = valueOf(b, sort.key);
    return (typeof x === "string" || typeof y === "string" ? String(x).localeCompare(String(y), "vi") : x - y) * sort.dir;
  });
}

// Bỏ dấu + chữ thường để gõ "nhan doi" cũng ra "Nhẫn đôi"
const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

export default function OverviewView({ data, product, channelFilter, baseQuery, q = "", teamSort: teamSortRaw = null, channelSort: channelSortRaw = null }: { data: Overview; product: string | null; channelFilter: "all" | "posted" | "none"; baseQuery: string; q?: string; teamSort?: string | null; channelSort?: string | null }) {
  const { totals } = data;
  const words = norm(q).split(/\s+/).filter(Boolean);
  const match = (...fields: (string | null | undefined)[]) => { if (!words.length) return true; const hay = norm(fields.filter(Boolean).join(" ")); return words.every((w) => hay.includes(w)); };
  // Tìm theo mẫu (mã SPU, tên, team yêu cầu), team được giao, kênh của team được giao.
  //   • Tập mẫu `samples` = các mẫu khớp. Bảng "Theo team" / "Theo kênh" được TÍNH LẠI chỉ trên các mẫu đó (không để trống khi chỉ gõ mã mẫu).
  //   • Gõ tên team / tên kênh thì các bảng đó chỉ giữ đúng team / kênh khớp.
  const teamName = (id: string | null | undefined) => data.teams.find((t) => t.id === id)?.name;
  const channelsOfTeam = (id: string | null | undefined) => data.channels.filter((c) => c.teamId === id).map((c) => c.name);
  const teamHit = new Set(words.length ? data.teams.filter((t) => match(t.name)).map((t) => t.id) : []);
  const channelHit = new Set(words.length ? data.channels.filter((c) => match(c.name)).map((c) => c.id) : []);
  const samples = data.samples.filter((s) => match(s.code, s.name, s.ownTeam?.name, ...s.assignments.map((a) => teamName(a.team?.id)), ...s.assignments.flatMap((a) => channelsOfTeam(a.team?.id))));
  const teamSort = parseSort(teamSortRaw), channelSort = parseSort(channelSortRaw);
  const teamRows0 = buildTeamRows(samples, data.teams, data.channels).filter((r) => !teamHit.size || teamHit.has(r.team.id));
  const teamRows = sortBy(teamRows0, teamSort, (r, k) => ({ name: r.team.name, samples: r.samples, pending: r.byStatus.pending, received: r.byStatus.received, developing: r.byStatus.developing, done: r.byStatus.done,
    returned: r.byStatus.returned, channels: r.channelsPosted, videos: r.videos, win: r.winVideos, views: r.views, sold: r.sold } as Record<string, number | string>)[k] ?? 0);
  const channelRows = buildChannelRows(samples, teamRows0, data.teams, data.channels).filter((c) => (!teamHit.size && !channelHit.size) || channelHit.has(c.channel.id) || (c.channel.teamId !== null && teamHit.has(c.channel.teamId)));
  const sel: Sample | undefined = samples.find((s) => s.productId === product) ?? samples[0];
  const matrixTeams = teamRows0.map((r) => r.team);   // cột team của bảng mẫu × team giữ thứ tự gốc (không đổi theo cách sắp xếp bảng Theo team)
  const chRows = sortBy(channelRows.filter((c) => (channelFilter === "posted" ? c.videos > 0 : channelFilter === "none" ? c.videos === 0 : true)), channelSort,
    (c, k) => ({ name: c.channel.name, team: c.teamName ?? "", status: c.videos > 0 ? 1 : 0, samples: c.samples, videos: c.videos, win: c.winVideos, views: c.views, sold: c.sold } as Record<string, number | string>)[k] ?? 0);
  const chipHref = (v: string) => { const p = new URLSearchParams(baseQuery); if (v === "all") p.delete("ch"); else p.set("ch", v); const q = p.toString(); return q ? `?${q}` : "?"; };

  return (
    <div className="space-y-6">
      {/* Tìm kiếm: mẫu (mã, tên, team), team, kênh */}
      <div className="flex flex-wrap items-center gap-3">
        <ParamSearch value={q} query={baseQuery} placeholder="Tìm mẫu, mã SPU, team, kênh…" className="w-full max-w-md" />
        {q.trim() && <span className="text-xs text-ink-2">Kết quả cho “{q.trim()}”: <b>{samples.length}</b> mẫu · <b>{teamRows.length}</b> team · <b>{channelRows.length}</b> kênh</span>}
      </div>

      {/* ① Số chính */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Mẫu đã giao" value={fmtInt(totals.samples)} sub={`${fmtInt(totals.assignments)} phiếu đã giao cho team`} />
        <Tile label="Team được giao" value={fmtInt(totals.teams)} sub={`${fmtInt(totals.teamsPosted)} team đã lên video`} />
        <Tile label="Kênh đã lên video" value={`${fmtInt(totals.channelsPosted)}/${fmtInt(totals.channelsTotal)}`} sub={`${fmtInt(totals.channelsTotal - totals.channelsPosted)} kênh chưa lên`} tone="text-accent" />
        <Tile label="Video đã lên" value={fmtInt(totals.videos)} sub="của các team được giao" />
        <Tile label="Video Win" value={fmtInt(totals.winVideos)} sub={totals.videos ? `${Math.round((totals.winVideos / totals.videos) * 100)}% đạt KPI traffic` : "—"} tone="text-good" />
        <Tile label="SL bán của các team" value={fmtInt(totals.sold)} sub="thuần, từ ngày giao mẫu" tone="text-good" />
      </div>

      {/* ② Mẫu × team — bảng có tìm kiếm ở tiêu đề, cuộn, phân trang 20 mẫu / trang */}
      <SampleMatrix samples={samples} teams={matrixTeams} selectedId={sel?.productId ?? null} baseQuery={baseQuery} emptyText="Chưa có mẫu nào được giao." />

      {/* ③ Theo team */}
      <Section title="Theo team" hint="Team nào đang nhận bao nhiêu mẫu, đã lên video chưa và bán được bao nhiêu (xếp theo SL bán).">
        <Table>
          <thead className="border-b border-line bg-page/60">
            <tr>
              <SortTh label="Team" k="name" param="ts" cur={teamSort} baseQuery={baseQuery} className={th} textFirst />
              <SortTh label="Mẫu" k="samples" param="ts" cur={teamSort} baseQuery={baseQuery} className={`${th} text-right`} />
              {(["pending", "received", "developing", "done", "returned"] as HandoffStatus[]).map((st) => <SortTh key={st} label={HANDOFF_STATUS[st]} k={st} param="ts" cur={teamSort} baseQuery={baseQuery} className={`${th} text-right`} />)}
              <SortTh label="Kênh đã lên" k="channels" param="ts" cur={teamSort} baseQuery={baseQuery} className={th} />
              <SortTh label="Video" k="videos" param="ts" cur={teamSort} baseQuery={baseQuery} className={`${th} text-right`} />
              <SortTh label="Win" k="win" param="ts" cur={teamSort} baseQuery={baseQuery} className={`${th} text-right`} />
              <SortTh label="Lượt xem" k="views" param="ts" cur={teamSort} baseQuery={baseQuery} className={`${th} text-right`} />
              <SortTh label="SL bán" k="sold" param="ts" cur={teamSort} baseQuery={baseQuery} className={`${th} text-right`} />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <Paged as="row" cols={12} size={20} resetKey={`${q}|${teamSortRaw ?? ""}`}>{teamRows.map((r) => (
              <tr key={r.team.id} className="hover:bg-grid/40">
                <td className={`${td} font-semibold`}>{r.team.name}</td>
                <td className={`${td} text-right tabular-nums`}>{r.samples}</td>
                {(["pending", "received", "developing", "done", "returned"] as HandoffStatus[]).map((s) => (
                  <td key={s} className={`${td} text-right tabular-nums`}>{r.byStatus[s] ? <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_CLS[s]}`}>{r.byStatus[s]}</span> : <span className="text-ink-muted">·</span>}</td>
                ))}
                <td className={td}>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-16 overflow-hidden rounded-md bg-grid"><span className="block h-full rounded-md bg-accent" style={{ width: `${r.channels ? Math.round((r.channelsPosted / r.channels) * 100) : 0}%` }} /></span>
                    <span className="text-xs tabular-nums text-ink-2">{r.channelsPosted}/{r.channels}</span>
                  </div>
                </td>
                <td className={`${td} text-right tabular-nums`}>{r.videos || <span className="text-ink-muted">·</span>}</td>
                <td className={`${td} text-right font-bold tabular-nums text-good`}>{r.winVideos || <span className="font-normal text-ink-muted">·</span>}</td>
                <td className={`${td} text-right tabular-nums`}>{r.views ? fmtInt(r.views) : <span className="text-ink-muted">·</span>}</td>
                <td className={`${td} text-right font-bold tabular-nums`}>{fmtInt(r.sold)}</td>
              </tr>
            ))}</Paged>
            {teamRows.length === 0 && <tr><td colSpan={12} className="p-6 text-center text-ink-muted">{q.trim() ? (samples.length ? "Các mẫu khớp chưa được giao cho team nào." : "Không có team nào khớp từ khoá.") : "Chưa có team nào được giao."}</td></tr>}
          </tbody>
        </Table>
      </Section>

      {/* ④ Theo kênh */}
      <Section title="Theo kênh" hint="Kênh của các team được giao: kênh nào đã lên video, kênh nào chưa."
        right={
          <div className="flex gap-1 rounded-lg border border-line bg-surface p-1 text-xs">
            {([["all", `Tất cả (${channelRows.length})`], ["posted", `Đã lên (${channelRows.filter((c) => c.videos > 0).length})`], ["none", `Chưa lên (${channelRows.filter((c) => c.videos === 0).length})`]] as const).map(([k, l]) => (
              <Link key={k} href={chipHref(k)} className={`rounded-md px-2.5 py-1 ${channelFilter === k ? "bg-accent font-medium text-white" : "text-ink-2 hover:bg-grid"}`}>{l}</Link>
            ))}
          </div>
        }>
        <Table>
          <thead className="border-b border-line bg-page/60">
            <tr>
              <SortTh label="Kênh" k="name" param="cs" cur={channelSort} baseQuery={baseQuery} className={th} textFirst />
              <SortTh label="Team" k="team" param="cs" cur={channelSort} baseQuery={baseQuery} className={th} textFirst />
              <SortTh label="Trạng thái" k="status" param="cs" cur={channelSort} baseQuery={baseQuery} className={th} />
              <SortTh label="Mẫu đã lên" k="samples" param="cs" cur={channelSort} baseQuery={baseQuery} className={`${th} text-right`} />
              <SortTh label="Video" k="videos" param="cs" cur={channelSort} baseQuery={baseQuery} className={`${th} text-right`} />
              <SortTh label="Win" k="win" param="cs" cur={channelSort} baseQuery={baseQuery} className={`${th} text-right`} />
              <SortTh label="Lượt xem" k="views" param="cs" cur={channelSort} baseQuery={baseQuery} className={`${th} text-right`} />
              <SortTh label="SL bán" k="sold" param="cs" cur={channelSort} baseQuery={baseQuery} className={`${th} text-right`} />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <Paged as="row" cols={8} size={20} resetKey={`${q}|${channelFilter}|${channelSortRaw ?? ""}`}>{chRows.map((c) => (
              <tr key={c.channel.id} className="hover:bg-grid/40">
                <td className={td}><span className="inline-flex items-center gap-1.5"><PlatformBadge platform={c.channel.platform} /><span className="max-w-[260px] truncate font-medium" title={c.channel.name}>{c.channel.name}</span></span></td>
                <td className={td}>{c.teamName ?? "—"}</td>
                <td className={td}>{c.videos > 0 ? <span className="rounded-md bg-good/15 px-2 py-0.5 text-2xs font-semibold text-good">✓ Đã lên video</span> : <span className="rounded-md bg-bad/10 px-2 py-0.5 text-2xs font-semibold text-bad">✗ Chưa lên video</span>}</td>
                <td className={`${td} text-right tabular-nums`}>{c.samples || <span className="text-ink-muted">·</span>}</td>
                <td className={`${td} text-right tabular-nums`}>{c.videos || <span className="text-ink-muted">·</span>}</td>
                <td className={`${td} text-right font-bold tabular-nums text-good`}>{c.winVideos || <span className="font-normal text-ink-muted">·</span>}</td>
                <td className={`${td} text-right tabular-nums`}>{c.views ? fmtInt(c.views) : <span className="text-ink-muted">·</span>}</td>
                <td className={`${td} text-right font-bold tabular-nums`}>{c.sold ? fmtInt(c.sold) : <span className="font-normal text-ink-muted">·</span>}</td>
              </tr>
            ))}</Paged>
            {chRows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-ink-muted">{q.trim() ? (samples.length ? "Các mẫu khớp chưa được giao cho team nào nên chưa có kênh." : "Không có kênh nào khớp từ khoá.") : "Không có kênh nào."}</td></tr>}
          </tbody>
        </Table>
      </Section>

      {/* ⑤ Chi tiết 1 mẫu */}
      <div id="detail" />
      {sel && (
        <Section title={`Chi tiết mẫu #${sel.code} · ${sel.name}`} hint="Mẫu này đã giao cho những team nào, team nào đã lên video, kênh nào đã / chưa lên, video nào Win, mỗi team bán được bao nhiêu."
          right={
            <ParamCombobox label="Mẫu" param="product" value={sel.productId} query={baseQuery} hash="#detail" placeholder="Gõ mã SPU / tên mẫu…"
              options={samples.map((s) => ({ value: s.productId, label: `#${s.code} · ${s.name}` }))} />
          }>
          <div className="space-y-3">
            {sel.assignments.map((a) => (
              <article key={a.handoffId} className="space-y-3 rounded-xl border border-line bg-surface p-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <div className="text-base font-semibold">{a.team?.name ?? "Chưa phân công"}</div>
                  <StatusChip s={a.team ? a.status : "unassigned"} />
                  <span className="text-xs text-ink-2">Giao {dm(a.createdAt)}{a.deadline ? ` · hạn ${dm(a.deadline)}` : ""}{a.receivedAt ? ` · nhận ${dm(a.receivedAt)}` : ""}</span>
                  <span className="ml-auto flex flex-wrap gap-3 text-xs text-ink-2">
                    <span>Video <b className="text-ink-1">{a.videos.length}</b></span>
                    <span>Win <b className="text-good">{a.winCount}</b></span>
                    <span>Lượt xem <b className="text-ink-1">{fmtInt(a.views)}</b></span>
                    <span>SL bán <b className="text-ink-1">{fmtInt(a.sold)}</b></span>
                  </span>
                </div>
                {(a.note || a.teamNote) && (
                  <div className="space-y-0.5 text-xs text-ink-2">
                    {a.note && <div>💬 Yêu cầu: {a.note}</div>}
                    {a.teamNote && <div>📝 Team trả lời: {a.teamNote}</div>}
                  </div>
                )}
                {a.team && (
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="rounded-lg bg-good/5 p-2">
                      <div className="mb-1 text-2xs font-bold uppercase tracking-wide text-good">Kênh đã lên video ({a.posted.length})</div>
                      <div className="flex flex-wrap gap-1">{a.posted.length ? a.posted.map((c) => <span key={c.id} className="inline-flex items-center gap-1 rounded-md bg-good/15 px-2 py-0.5 text-xs font-medium text-good"><PlatformBadge platform={c.platform} />✓ {c.name}</span>) : <span className="text-xs text-ink-muted">Chưa có kênh nào</span>}</div>
                    </div>
                    <div className="rounded-lg bg-bad/5 p-2">
                      <div className="mb-1 text-2xs font-bold uppercase tracking-wide text-bad">Kênh chưa lên video ({a.notPosted.length})</div>
                      <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">{a.notPosted.length ? a.notPosted.map((c) => <span key={c.id} className="inline-flex items-center gap-1 rounded-md bg-bad/10 px-2 py-0.5 text-xs font-medium text-bad"><PlatformBadge platform={c.platform} />✗ {c.name}</span>) : <span className="text-xs text-good">Tất cả kênh của team đã lên</span>}</div>
                    </div>
                  </div>
                )}
                {a.videos.length > 0 && (
                  <Table>
                    <thead className="border-b border-line bg-page/60"><tr><th className={th}>Video</th><th className={th}>Kênh</th><th className={th}>Đăng</th><th className={`${th} text-right`}>Lượt xem</th><th className={th}>Đánh giá riêng video</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      <Paged as="row" cols={5} size={8} resetKey={a.handoffId}>{a.videos.map((v) => {
                        const ch = [...a.posted, ...a.notPosted].find((c) => c.id === v.channelId);
                        return (
                          <tr key={v.id} className="hover:bg-grid/40">
                            <td className={td}>
                              <a href={v.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-accent">
                                <Thumb url={v.thumb} />
                                <span className="line-clamp-1 max-w-[260px] text-xs">{v.message?.replace(/#[\p{L}\p{N}_]+/gu, "").trim() || "(không có nội dung)"}</span>
                              </a>
                            </td>
                            <td className={td}><span className="inline-flex items-center gap-1 text-xs">{ch && <PlatformBadge platform={ch.platform} />}{ch?.name ?? v.channelId}</span></td>
                            <td className={`${td} whitespace-nowrap text-xs text-ink-2`}>{dm(v.publishedAt)}</td>
                            <td className={`${td} text-right font-semibold tabular-nums`}>{fmtInt(v.views)}</td>
                            <td className={td} title={v.kpiLines.join("\n")}>
                              {v.win === true ? <ResultBadge result="win_traffic" size="xs" /> : v.win === false ? <span className="text-xs text-ink-2">Chưa đạt KPI{v.progress !== null ? ` · ${v.progress}%` : ""}</span> : <span className="text-xs text-ink-muted">—</span>}
                            </td>
                          </tr>
                        );
                      })}</Paged>
                    </tbody>
                  </Table>
                )}
              </article>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
