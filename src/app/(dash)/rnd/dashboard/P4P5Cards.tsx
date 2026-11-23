import Paged from "@/components/Paged";
import Link from "next/link";
import { STAGE_LABELS } from "@/lib/pipeline-constants";
import { fmtInt } from "@/lib/data";
import type { rndDashboard } from "@/lib/rnd-dashboard";
import Info from "@/components/InfoTip";
import type { TeamVideoRow } from "@/lib/spu-win";

type D = Awaited<ReturnType<typeof rndDashboard>>;

const pct = (v: number | null, digits = 0) => (v === null ? "—" : `${(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: digits })}%`);

function Card({ title, hint, aside, children }: { title: string; hint?: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-line bg-surface p-4">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <span>{title}{hint && <Info text={hint} />}</span>
        {aside && <span className="ml-auto text-xs font-normal text-ink-2">{aside}</span>}
      </h2>
      {children}
    </section>
  );
}

// Ô số chính ở dải đầu: nhãn · số lớn · diễn giải ngắn (+ thanh tiến độ nếu là tỉ lệ)
function Stat({ label, value, sub, tone, bar }: { label: string; value: string; sub: string; tone: "accent" | "good"; bar?: number | null }) {
  const c = tone === "accent" ? { box: "bg-accent/10 ring-accent/25", text: "text-accent", fill: "bg-accent" } : { box: "bg-good/10 ring-good/25", text: "text-good", fill: "bg-good" };
  return (
    <div className={`min-w-0 rounded-lg px-4 py-3 ring-1 ring-inset ${c.box}`}>
      <div className={`truncate text-2xs font-bold uppercase tracking-wide ${c.text}`}>{label}</div>
      <div className={`mt-0.5 text-3xl font-extrabold leading-none tabular-nums ${c.text}`}>{value}</div>
      <div className="mt-1.5 truncate text-xs text-ink-2" title={sub}>{sub}</div>
      {bar !== undefined && bar !== null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-md bg-black/10"><div className={`h-full rounded-md ${c.fill}`} style={{ width: `${Math.round(Math.min(1, bar) * 100)}%` }} /></div>
      )}
    </div>
  );
}

// Bố cục: (1) dải 4 số chính P4 → P5 · (2) trái: phủ kênh R&D theo Page + mẫu chưa lên kênh · phải: điều kiện Win (Win so với chưa Win)
export default function P4P5Cards({ winRate, wins, tested, teams, p4cover }: {
  winRate: number | null; wins: number; tested: number; teams: TeamVideoRow[]; p4cover: D["p4cover"];
}) {
  const cover = p4cover.total ? p4cover.anyChannel / p4cover.total : null;
  const channels = [...p4cover.channels].sort((a, b) => b.videos - a.videos || b.posted - a.posted || a.name.localeCompare(b.name, "vi"));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="P4 · Phủ kênh R&D" value={pct(cover)} tone="accent" bar={cover}
          sub={p4cover.hasChannels ? `${fmtInt(p4cover.anyChannel)} / ${fmtInt(p4cover.total)} mẫu đã lên ≥ 1 kênh` : "Chưa có Page R&D nào"} />
        <Stat label="Video đã lên · Page R&D" value={fmtInt(p4cover.videos)} tone="accent" sub="Video / reel gắn mã SPU, ở các Page R&D" />
        <Stat label="Video Win · Page R&D" value={fmtInt(p4cover.winVideos)} tone="good" sub="Video của mẫu đã tới P5" />
        <Stat label="P5 · Tỉ lệ Win / P4" value={pct(winRate)} tone="good" bar={winRate}
          sub={`${fmtInt(wins)} Win / ${fmtInt(tested)} mẫu vào P4`} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title="Phủ kênh R&D theo Page" hint="Tính cho mẫu từ P3 trở đi (chưa dừng). Đã lên = có bài / video gắn mã SPU ở Page R&D. Win = video thuộc mẫu đã tới P5.">
          {!p4cover.hasChannels ? (
            <p className="text-xs text-ink-muted">Chưa có Page nào được đánh dấu là Page R&amp;D — vào “Quản lý team” và bấm “Đặt làm Page R&amp;D”.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="grid grid-cols-[minmax(0,1fr)_96px_52px_52px_44px] items-center gap-2 border-b border-line pb-1 text-2xs font-semibold uppercase tracking-wide text-ink-muted">
                  <span>Page</span><span>Phủ mẫu</span><span className="text-right">Mẫu</span><span className="text-right">Video</span><span className="text-right">Win</span>
                </div>
                <ul className="divide-y divide-line">
                  {channels.map((c) => (
                    <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_96px_52px_52px_44px] items-center gap-2 py-1.5 text-xs">
                      <span className="truncate" title={c.name}>{c.name}</span>
                      <span className="h-1.5 overflow-hidden rounded-md bg-grid"><span className="block h-full rounded-md bg-accent" style={{ width: `${p4cover.total ? Math.round((c.posted / p4cover.total) * 100) : 0}%` }} /></span>
                      <span className="text-right tabular-nums text-ink-2">{c.posted}/{p4cover.total}</span>
                      <span className={`text-right tabular-nums ${c.videos ? "font-semibold text-accent" : "text-ink-muted"}`}>{fmtInt(c.videos)}</span>
                      <span className={`text-right tabular-nums ${c.winVideos ? "font-semibold text-good" : "text-ink-muted"}`}>{fmtInt(c.winVideos)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="mb-1 flex items-center gap-2 text-2xs font-bold uppercase tracking-wide text-ink-muted">
                  Mẫu chưa lên kênh R&amp;D
                  <span className={`rounded-md px-1.5 tabular-nums ${p4cover.missing.length ? "bg-warn-bg text-warn-ink" : "bg-grid text-ink-muted"}`}>{p4cover.missing.length}</span>
                </div>
                {p4cover.missing.length ? (
                  <ul className="space-y-0.5 text-xs">
                    <Paged as="item" size={6}>{p4cover.missing.map((x) => (
                      <li key={x.id}>
                        <Link href={`/rnd/${x.id}`} className="flex items-center justify-between gap-2 rounded px-1.5 py-1 hover:bg-grid">
                          <span className="min-w-0 truncate"><b>{x.st_code}</b> · {x.name}
                            <span className="block text-2xs text-ink-muted">{STAGE_LABELS[x.stage as keyof typeof STAGE_LABELS]} · {x.noCode ? "chưa gắn SPU" : "chưa có bài gắn mã ở Page R&D"}</span></span>
                          <span className={`flex-none rounded-md px-2 py-0.5 text-2xs font-semibold tabular-nums ${x.days > 7 ? "bg-bad/10 text-bad" : "bg-grid text-ink-2"}`}>{x.days} ngày</span>
                        </Link>
                      </li>
                    ))}</Paged>
                  </ul>
                ) : <p className="text-xs text-good">✓ Mọi mẫu từ P3 đều đã lên kênh R&amp;D.</p>}
              </div>
            </div>
          )}
        </Card>

        <Card title="Video & tỉ lệ Win theo team" hint="Team đăng video: số video (video / reel gắn mã SPU), số SPU có video, lượt xem. SPU Win = đạt Win Traffic (S2: ≥ 100.000 view và ≥ 300 bình luận trong 3 ngày từ bài đầu của SPU, chỉ tính bài của team). Tỉ lệ Win = SPU Win ÷ SPU có video.">
          {teams.length === 0 ? <p className="text-xs text-ink-muted">Chưa có team nào đăng video gắn mã trong kỳ này.</p> : (
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="border-b border-line text-2xs font-semibold uppercase tracking-wide text-ink-muted">
                  <th className="py-1.5 text-left font-semibold">Team</th><th className="py-1.5 text-right font-semibold">Video</th><th className="py-1.5 text-right font-semibold">SPU</th>
                  <th className="py-1.5 text-right font-semibold">Lượt xem</th><th className="py-1.5 text-right font-semibold text-good">Win</th><th className="py-1.5 pl-3 text-left font-semibold">Tỉ lệ Win</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {teams.map((t) => (
                  <tr key={t.id}>
                    <td className="py-1.5 pr-2 font-medium">{t.name}</td>
                    <td className="py-1.5 text-right font-semibold text-accent">{fmtInt(t.videos)}</td>
                    <td className="py-1.5 text-right text-ink-2">{fmtInt(t.codes)}</td>
                    <td className="py-1.5 text-right text-ink-2">{fmtInt(t.views)}</td>
                    <td className="py-1.5 text-right font-bold text-good">{fmtInt(t.winCodes)}</td>
                    <td className="py-1.5 pl-3">
                      {t.winRate === null ? <span className="text-ink-muted">—</span> : (
                        <span className="flex items-center gap-1.5">
                          <span className="h-1.5 w-14 overflow-hidden rounded-md bg-grid"><span className="block h-full rounded-md bg-good" style={{ width: `${Math.round(t.winRate * 100)}%` }} /></span>
                          <span className="w-9 text-right font-semibold">{pct(t.winRate, 0)}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
