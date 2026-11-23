import type { RndTraffic, TrafficRow } from "@/lib/rnd-channel-traffic";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const th = "whitespace-nowrap px-3 py-2 align-bottom font-medium";
const num = "px-3 py-1.5 text-right tabular-nums";
const PLATFORM: Record<string, { name: string; short: string; color: string }> = {
  facebook: { name: "Facebook", short: "FB", color: "#1877f2" },
  instagram: { name: "Instagram", short: "IG", color: "#d6249f" },
  tiktok: { name: "TikTok", short: "TT", color: "#111827" },
  youtube: { name: "YouTube", short: "YT", color: "#e02424" },
};
const plat = (p: string) => PLATFORM[p] ?? { name: p, short: p.slice(0, 2).toUpperCase(), color: "var(--ink-2)" };

const METRICS: { key: keyof TrafficRow; label: string }[] = [
  { key: "posts", label: "Bài đăng" }, { key: "views", label: "Lượt xem" }, { key: "comments", label: "Bình luận" },
  { key: "reactions", label: "Cảm xúc" }, { key: "shares", label: "Chia sẻ" },
];

function Cells({ r, bold, total }: { r: TrafficRow; bold?: boolean; total: number }) {
  const b = bold ? "font-semibold" : "";
  const dim = (n: number) => (n ? "" : "text-ink-muted");
  const share = total ? r.views / total : 0;
  return (
    <>
      <td className={`${num} ${b} ${dim(r.posts)}`}>{fmt(r.posts)}</td>
      <td className={`${num} ${b} ${dim(r.views)}`}>{fmt(r.views)}</td>
      <td className="w-40 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-grid"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(share * 100)}%` }} /></div>
          <span className={`w-9 text-right tabular-nums text-2xs ${share ? "text-ink-2" : "text-ink-muted"}`}>{Math.round(share * 100)}%</span>
        </div>
      </td>
      <td className={`${num} ${b} ${dim(r.comments)}`}>{fmt(r.comments)}</td>
      <td className={`${num} ${b} ${dim(r.reactions)}`}>{fmt(r.reactions)}</td>
      <td className={`${num} ${b} ${dim(r.shares)}`}>{fmt(r.shares)}</td>
      <td className={`${num} ${b} ${dim(r.posts)}`}>{r.posts ? fmt(r.views / r.posts) : "—"}</td>
    </>
  );
}

// Traffic của các kênh R&D: thẻ tổng (kèm phần của từng nền tảng) luôn hiện; bảng theo nền tảng → kênh ẩn sau nút "Xem chi tiết".
export default function RndTrafficTable({ data }: { data: RndTraffic }) {
  if (!data.channelCount) {
    return <p className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-muted">Chưa có kênh nào được đánh dấu Page R&amp;D (đặt ở trang Team).</p>;
  }
  const t = data.total;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {METRICS.map(({ key, label }) => (
          <div key={key} className="rounded-lg border border-line bg-surface px-3 py-2 shadow-sm">
            <div className="text-xs text-ink-2">{label}</div>
            <div className="text-xl font-semibold tabular">{fmt(t[key])}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-ink-2">
              {data.platforms.map((p) => (
                <span key={p.platform} className="inline-flex items-center gap-1" title={plat(p.platform).name}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: plat(p.platform).color }} />
                  {plat(p.platform).short} <span className="tabular-nums font-medium text-ink-1">{fmt(p[key])}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <details className="group">
        <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1 text-sm font-medium text-accent hover:bg-grid [&::-webkit-details-marker]:hidden">
          <span className="transition group-open:rotate-90" aria-hidden>▸</span>
          <span className="group-open:hidden">Xem chi tiết theo kênh</span><span className="hidden group-open:inline">Ẩn chi tiết</span>
        </summary>
        <div className="mt-2 overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="border-b border-line bg-page text-left text-xs text-ink-2">
              <tr>
                <th className={th}>Nền tảng / kênh</th>
                <th className={`${th} text-right`} title="Số bài đăng trong kỳ (gồm cả bài không gắn mã SPU)">Bài đăng</th>
                <th className={`${th} text-right`}>Lượt xem</th>
                <th className={th} title="Phần lượt xem của dòng này trong tổng lượt xem các kênh R&D">Tỷ trọng xem</th>
                <th className={`${th} text-right`}>Bình luận</th>
                <th className={`${th} text-right`}>Cảm xúc</th>
                <th className={`${th} text-right`}>Chia sẻ</th>
                <th className={`${th} text-right`} title="Lượt xem ÷ số bài đăng">Xem TB / bài</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.platforms.map((p) => [
                <tr key={p.platform} className="bg-page/60">
                  <td className="px-3 py-1.5 font-semibold">
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: plat(p.platform).color }} />
                    {plat(p.platform).name} <span className="font-normal text-ink-muted">· {p.channels.length} kênh</span>
                  </td>
                  <Cells r={p} bold total={t.views} />
                </tr>,
                ...p.channels.map((c) => (
                  <tr key={c.id} className="hover:bg-grid/40">
                    <td className="py-1.5 pl-8 pr-3">{c.name}</td>
                    <Cells r={c} total={t.views} />
                  </tr>
                )),
              ])}
            </tbody>
            <tfoot className="border-t border-line bg-page">
              <tr>
                <td className="px-3 py-2 font-semibold">Tổng {data.channelCount} kênh</td>
                <Cells r={t} bold total={t.views} />
              </tr>
            </tfoot>
          </table>
        </div>
      </details>
    </div>
  );
}
