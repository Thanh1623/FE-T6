import { fmtCompact, fmtDateTime, fmtInt } from "@/lib/data";
import PostThumb from "@/components/PostThumb";
import type { ProductVideo } from "@/lib/rnd";

// Video đã lên của mẫu — lưới kiểu Reels của Facebook: ảnh dọc kín khung, số liệu (xem · cảm xúc · bình luận) nằm TRONG ảnh ở góc dưới;
// chân card: mã SPU · kênh, ngày, và tiến độ Video Win của RIÊNG video đó (không lặp tên sản phẩm vì cả lưới cùng 1 mẫu). Bấm để mở video.
const PLATFORM_BADGE: Record<string, { label: string; cls: string; icon: string }> = {
  facebook: { label: "Facebook", cls: "bg-[#1877f2] text-white", icon: "f" },
  tiktok: { label: "TikTok", cls: "bg-black text-white ring-1 ring-white/30", icon: "♪" },
  instagram: { label: "Instagram", cls: "bg-[#e1306c] text-white", icon: "◎" },
  youtube: { label: "YouTube", cls: "bg-[#ff0000] text-white", icon: "▶" },
};

// Biểu tượng nét mảnh (mắt · tim · bình luận)
const EYE = "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z";
const HEART = "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8Z";
const COMMENT = "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z";
const Ico = ({ d }: { d: string }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const Stat = ({ d, value, title }: { d: string; value: string; title: string }) => (
  <span className="flex items-center gap-1" title={title}><Ico d={d} />{value}</span>
);

export default function ProductVideos({ videos, channelOf, spuCode }: {
  videos: ProductVideo[]; channelOf: (id: string) => { name: string; platform: string | null }; spuCode: string | null;
}) {
  const passed = videos.filter((v) => v.trafficPass).length;
  const graded = videos.some((v) => v.trafficPass !== null);
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-grid text-xs">🎞️</span>Video đã lên
        <span className="text-xs font-normal text-ink-muted">{videos.length}</span>
        {graded && <span className="ml-1 rounded-md bg-good/10 px-2 py-0.5 text-2xs font-bold text-good" title="Số video đạt tiêu chí Video Win (đánh giá riêng từng video)">{passed}/{videos.length} Video Win</span>}
      </h2>
      {videos.length === 0 ? (
        <p className="text-sm text-ink-muted">Chưa có video nào gắn mã SPU của mẫu này — đăng video kèm hashtag mã SPU, hệ thống tự nhận ở lần đồng bộ tiếp theo.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {videos.map((v) => {
            const ch = channelOf(v.channel_id), pf = ch.platform ? PLATFORM_BADGE[ch.platform] : undefined;
            const kpi = v.kpiLines.join("\n");
            return (
              <li key={v.id} className="min-w-0">
                <a href={v.permalink_url ?? "#"} target="_blank" rel="noreferrer" title={v.message?.replace(/#[\p{L}\p{N}_]+/gu, "").trim() || "Mở video"}
                  className="group flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface transition hover:border-accent hover:shadow-sm">
                  <div className="relative aspect-[9/16] overflow-hidden bg-grid">
                    <PostThumb src={v.thumbnail_url} className="h-full w-full object-center transition group-hover:scale-[1.02]" />
                    {pf && <span title={`${pf.label} · ${ch.name}`} className={`absolute left-2 top-2 flex h-5 min-w-5 items-center justify-center rounded px-1 text-[11px] font-extrabold leading-none ${pf.cls}`}>{pf.icon}</span>}
                    {v.trafficPass === true && <span title={`Video Win\n${kpi}`} className="absolute right-2 top-2 rounded bg-good px-1.5 py-0.5 text-2xs font-extrabold tracking-wide text-white">WIN</span>}
                    {/* số liệu trong ảnh, đọc được trên mọi nền nhờ lớp tối dần */}
                    <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-2.5 pb-2 pt-8 text-[13px] font-bold tabular-nums text-white">
                      <Stat d={EYE} value={fmtCompact(v.views)} title={`${fmtInt(v.views)} lượt xem`} />
                      <Stat d={HEART} value={fmtCompact(v.reactions)} title={`${fmtInt(v.reactions)} cảm xúc`} />
                      <Stat d={COMMENT} value={v.comments === null ? "–" : fmtCompact(v.comments)} title={v.comments === null ? "Chưa có số bình luận" : `${fmtInt(v.comments)} bình luận`} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 px-2.5 py-2">
                    <div className="flex items-center gap-1.5 text-xs">
                      {spuCode && <span className="rounded bg-grid px-1.5 py-px font-mono text-2xs font-bold text-ink-1">{spuCode}</span>}
                      <span className="min-w-0 flex-1 truncate text-ink-2" title={ch.name}>{ch.name}</span>
                    </div>
                    <div className="text-2xs tabular-nums text-ink-muted">{fmtDateTime(v.published_at)}</div>
                    {v.trafficPass === false && v.kpiProgress !== null && (
                      <div title={`Chưa đạt tiêu chí Video Win\n${kpi}`} className="mt-0.5">
                        <div className="flex items-center justify-between text-2xs"><span className="text-ink-2">Chưa đạt Video Win</span><span className="tabular-nums text-ink-muted">{v.kpiProgress}%</span></div>
                        <div className="mt-0.5 h-1 overflow-hidden rounded-md bg-grid"><div className="h-full rounded-md bg-accent" style={{ width: `${Math.min(100, Math.max(2, v.kpiProgress))}%` }} /></div>
                      </div>
                    )}
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
