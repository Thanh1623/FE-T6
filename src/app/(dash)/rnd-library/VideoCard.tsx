import ResultBadge from "@/components/rnd/ResultBadge";
import PostThumb from "@/components/PostThumb";
import { isWinResult, type WinResult } from "@/lib/eval/rules";
import TrendSpark from "@/components/TrendSpark";
import { fmtDateTime, fmtInt, type PostRow } from "@/lib/data";
import type { CardProduct, RndChannel } from "@/lib/rnd-video";
import type { postTrends } from "@/lib/post-trends";
import LinkProduct, { UnlinkCode, UnlinkProduct } from "./LinkProduct";

const money = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;
const dm = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });

// Thẻ video gọn, ảnh bìa dọc tràn thẻ: trên ảnh có kênh · huy hiệu Win · lượt xem · ngày đăng (nền mờ chuyển màu ở đáy ảnh cho dễ đọc);
// bên dưới là nội dung 2 dòng, 1 dòng cảm xúc · bình luận · xu hướng, và sản phẩm gắn (mã · tên · Lấy source) mỗi sản phẩm 1 dòng.
// Sản phẩm lấy từ mã SPU trong video (bắt buộc gắn khi đăng), không gắn tay tại đây.
// Cỡ thẻ: s = rất gọn (nhiều cột nhất) · m = vừa · l = lớn (thêm biểu đồ xu hướng 14 ngày)
export type CardSize = "s" | "m" | "l";
export const CARD_SIZES: Record<CardSize, { label: string; grid: string; cover: string }> = {
  s: { label: "Nhỏ (xem nhiều hàng)", grid: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8", cover: "aspect-[9/14]" },
  m: { label: "Vừa", grid: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6", cover: "aspect-[3/4]" },
  l: { label: "Lớn", grid: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4", cover: "aspect-[4/5]" },
};

type Trend = Awaited<ReturnType<typeof postTrends>> extends Map<string, infer T> ? T : never;

// Biểu tượng nét mảnh đồng bộ (thay emoji ♥ 💬 lệch cỡ / lệch màu)
const Ico = ({ d, size = 12 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const HEART = "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8Z";
const COMMENT = "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z";
const PLAY = "M6 4l14 8-14 8Z";
const DOWNLOAD = "M12 3v12m0 0 4-4m-4 4-4-4M4 21h16";

// Xu hướng gọn: viên thuốc có mũi tên + % (màu chỉ là mã hoá phụ). Chưa đủ dữ liệu → không hiện
function TrendChip({ trend }: { trend: Trend | undefined }) {
  if (!trend || trend.direction === "none") return null;
  const up = trend.direction === "up", down = trend.direction === "down";
  const label = up ? "Đang tăng" : down ? "Đang giảm" : "Ổn định";
  return (
    <span className={`flex-none rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${up ? "bg-good/12 text-good" : down ? "bg-bad/12 text-bad" : "bg-grid text-ink-muted"}`}
      title={`Xu hướng lượt xem 14 ngày: ${label}`}>
      {up ? "▲" : down ? "▼" : "■"}{trend.changePct !== null ? ` ${trend.changePct > 0 ? "+" : ""}${Math.round(trend.changePct)}%` : ""}
    </span>
  );
}

export default function VideoCard({ p, ch, trend, items, size = "m", canLink = false }: {
  p: PostRow; ch?: RndChannel; trend: Trend | undefined; items: CardProduct[]; size?: CardSize; canLink?: boolean;
}) {
  const small = size === "s";
  // Huy hiệu Win nổi ở góc trên bên phải ảnh bìa (ưu tiên WIN > WIN TRAFFIC > WIN SP); không lặp lại ở dòng sản phẩm bên dưới
  const wins = items.map((c) => c.result).filter(isWinResult);
  const topWin: WinResult | undefined = (["win", "win_traffic", "win_sp"] as const).find((r) => wins.includes(r));
  const text = p.message?.replace(/#[\p{L}\p{N}_]+/gu, "").trim() || "(không có nội dung)";
  const pill = "rounded-md bg-black/60 backdrop-blur-sm text-white";
  return (
    <div className="group/card flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg">
      <a href={p.permalink_url ?? "#"} target="_blank" rel="noreferrer" className={`relative block ${CARD_SIZES[size].cover} overflow-hidden bg-grid`} title={`Mở video · ${fmtDateTime(p.published_at)}`}>
        <PostThumb src={p.thumbnail_url} className="absolute inset-0 h-full w-full transition duration-500 group-hover/card:scale-[1.04]" />
        {/* Nền mờ chuyển màu trên / dưới ảnh để chữ nổi lên rõ trên mọi ảnh */}
        <span className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/60 to-transparent" aria-hidden />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/75 to-transparent" aria-hidden />
        {/* Trên: kênh (trái) · huy hiệu Win (phải) */}
        <span className={`absolute left-2 top-2 flex max-w-[64%] items-center gap-1.5 px-2 py-0.5 text-[10px] font-semibold ${pill}`} title={ch?.name}>
          <span className="inline-block h-1.5 w-1.5 flex-none rounded-full ring-1 ring-white/50" style={{ background: ch?.color }} />
          <span className="truncate">{ch?.name ?? "—"}</span>
        </span>
        {topWin && <span className="absolute right-2 top-2 drop-shadow-md"><ResultBadge result={topWin} size="xs" /></span>}
        {/* Dưới: lượt xem (trái, nổi bật) · ngày đăng (phải) */}
        <span className={`absolute bottom-2 left-2 flex items-center gap-1 font-extrabold tabular-nums text-white drop-shadow ${small ? "text-sm" : "text-base"}`} title="Lượt xem">
          <Ico d={PLAY} size={small ? 12 : 14} />{p.views === null ? "–" : fmtInt(p.views)}
        </span>
        <span className={`absolute bottom-2 right-2 px-2 py-0.5 text-[10px] font-bold tabular-nums ${pill}`}>{dm(p.published_at)}</span>
      </a>

      <div className={`flex flex-1 flex-col ${small ? "gap-1.5 p-2" : "gap-2 p-3"}`}>
        <p className={`line-clamp-2 min-h-[2lh] font-semibold leading-snug text-ink-1 ${small ? "text-[11px]" : "text-[13px]"}`} title={text}>{text}</p>

        {/* Cảm xúc · bình luận (trái) · xu hướng (phải) */}
        <div className="flex items-center gap-3 text-xs tabular-nums text-ink-2">
          <span className="flex items-center gap-1" title="Cảm xúc"><Ico d={HEART} />{p.reactions === null ? "–" : fmtInt(p.reactions)}</span>
          <span className="flex items-center gap-1" title="Bình luận"><Ico d={COMMENT} />{p.comments === null ? "–" : fmtInt(p.comments)}</span>
          <span className="ml-auto"><TrendChip trend={trend} /></span>
        </div>
        {size === "l" && <TrendSpark trend={trend} />}

        {/* Sản phẩm trong video: mỗi sản phẩm 1 dòng — mã · tên · Lấy source */}
        <div className="mt-auto space-y-1.5 border-t border-line pt-2">
          {items.map((c) => (
            <div key={c.key} className="flex items-center gap-1.5 text-xs">
              <span className="flex-none rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">{c.label}</span>
              <span className="min-w-0 flex-1 truncate text-ink-2" title={`${c.name ?? "Chưa có tên"}${c.price ? ` · Giá bán ${money(c.price)}${c.priceKind === "du_kien" ? " (dự kiến)" : c.priceKind === "thuc_te" ? " (TB thực tế 90 ngày)" : ""}` : ""}`}>
                {c.name ?? "Chưa có tên"}
              </span>
              {c.result && !isWinResult(c.result) && <ResultBadge result={c.result} size="xs" />}
              {c.productId && c.sourceUrl ? (
                <a href={`/api/rnd/source?product=${c.productId}`} target="_blank" rel="noreferrer"
                  className="flex flex-none items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-semibold leading-none text-white hover:opacity-90"
                  title={c.taken ? `Mở kho source · ${c.taken} lần các team đã lấy` : "Mở kho source (ghi nhận team đã lấy)"}>
                  <Ico d={DOWNLOAD} size={11} />{c.taken ? <span className="tabular-nums">{c.taken}</span> : null}<span className={small ? "sr-only" : ""}>Source</span>
                </a>
              ) : <span className="flex-none rounded-md border border-dashed border-line px-1.5 py-0.5 text-[11px] text-ink-muted" title="R&D chưa nhập link kho source cho sản phẩm này">Chưa có source</span>}
              {canLink && c.manualCode && <UnlinkCode postId={p.id} code={c.label} />}
              {canLink && c.manual && c.productId && <UnlinkProduct postId={p.id} productId={c.productId} />}
            </div>
          ))}
          {/* Video đã đăng nhưng hashtag chưa nhận diện được mã: R&D / Quản lý gắn tay mã SPU (lưu ở social.post_codes, không bị xoá khi đồng bộ) */}
          {items.length === 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-dashed border-warn-ink/40 bg-warn-bg/50 px-2 py-1 text-[11px] text-warn-ink" title="Video chưa có hashtag mã SPU nhận diện được">
              <span className="min-w-0 flex-1 truncate"><span aria-hidden>⚠</span> Chưa nhận diện mã SP</span>
              {canLink && <LinkProduct postId={p.id} inline />}
            </div>
          )}
          {items.length > 0 && canLink && <div className="flex justify-end"><LinkProduct postId={p.id} label="＋ Gắn thêm mã" inline /></div>}
        </div>
      </div>
    </div>
  );
}
