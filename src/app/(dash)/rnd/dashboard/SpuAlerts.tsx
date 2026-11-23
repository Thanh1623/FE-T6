import Link from "next/link";
import { fmtCompact, fmtInt } from "@/lib/data";
import type { KpiRule } from "@/lib/kpi-constants";
import { ACTION_LABEL, type View } from "@/lib/spu-tracking";
import type { SpuVideo } from "@/lib/spu-videos";
import { videoWinOf } from "@/lib/video-win";
import { loadFirstDays } from "@/lib/video-win-data";
import { loadVideoDetails } from "@/lib/spu-data";
import AlertTabs from "./AlertTabs";

type VideoWin = { rules: KpiRule[]; match: "all" | "any" };
type Item = { key: string; lead: React.ReactNode; title: React.ReactNode; sub: React.ReactNode; right: React.ReactNode };
const LIMIT = 10;
const isWin = (x: SpuVideo, kpi: VideoWin) => videoWinOf(x.first3d ?? { views: x.views }, kpi);   // chấm riêng từng video, theo số N ngày đầu kể từ ngày đăng (nếu có)

// Danh sách gọn 2 cột (thay bảng rộng: tên SP kéo dài, số liệu dạt hẳn sang phải): mỗi mục 2 dòng — mã / tên · số liệu nhỏ; nhãn hoặc số nổi bật bên phải
function List({ items, empty, more }: { items: Item[]; empty: string; more?: React.ReactNode }) {
  if (!items.length) return <p className="py-3 text-xs text-ink-muted">{empty}</p>;
  return (
    <div>
      <ul className="grid gap-x-4 lg:grid-cols-2">
        {items.map((it) => (
          <li key={it.key} className="flex items-center gap-2.5 border-b border-line py-1.5 last:border-0 hover:bg-grid/40">
            <span className="w-[4.5rem] flex-none">{it.lead}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] leading-tight">{it.title}</span>
              <span className="mt-0.5 block truncate text-2xs text-ink-muted tabular-nums">{it.sub}</span>
            </span>
            <span className="flex-none text-right tabular-nums">{it.right}</span>
          </li>
        ))}
      </ul>
      {more && <div className="pt-2">{more}</div>}
    </div>
  );
}

const PLAT: Record<string, string> = { FB: "bg-[#1877f2]", IG: "bg-[#c13584]", TT: "bg-black ring-1 ring-white/30" };
const Tag = ({ text, cls }: { text: string; cls: string }) => <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-2xs font-bold ${cls}`}>{text}</span>;

// Cảnh báo của dashboard Toàn công ty — tính từ chính dữ liệu trang "Theo dõi SPU" (tồn kho × video × bán): mỗi cảnh báo là một nhóm SPU
// theo gợi ý hành động, và danh sách video là video đã đăng của các SPU đó. Bấm mã / tên để mở ngăn video của SPU ở trang Theo dõi SPU.
// views: SPU Active toàn công ty trong kỳ (có lọc team thì chỉ SPU team đã đăng video) · vids: tổng số video tiềm năng + top theo lượt xem — tính ở lib/spu-dash.ts
export default async function SpuAlerts({ videoWin, views, vids }: {
  videoWin: VideoWin; views: View[]; vids: { total: number; items: { x: SpuVideo; code: string }[] };
}) {
  const byViews = (a: View, b: View) => (b.views ?? 0) - (a.views ?? 0);
  const pick = (f: (v: View) => boolean) => views.filter(f).sort(byViews);
  const potential = pick((v) => v.flags.inStock && (v.flags.star || v.flags.win || v.flags.winTraffic));
  const produce = pick((v) => v.action === "produce");
  const convert = pick((v) => v.action === "convert");
  const bad = pick((v) => v.action === "bad");
  const needVideo = pick((v) => v.action === "shoot" || v.action === "video").sort((a, b) => b.stock - a.stock);

  // Chỉ 8 video hiển thị mới cần nội dung / link (nạp riêng, nhẹ) — danh sách đầy đủ chỉ cần ngày, kênh, lượt xem
  const topVids = vids.items.slice(0, LIMIT);
  const vidDetail = await loadVideoDetails(topVids.map(({ x }) => x.id));
  const first3d = await loadFirstDays(topVids.map(({ x }) => x.id), 3);   // Video Win theo N ngày đầu kể từ ngày đăng
  const shownVids = topVids.map(({ x, code }) => { const d = vidDetail.get(x.id); return { x: { ...(d ? { ...x, title: d.title || x.title, url: d.url, thumb: d.thumb } : x), first3d: first3d.get(x.id) }, code }; });

  const href = (code: string) => `/spu?spu=${code}`;
  const more = (n: number) => (n > LIMIT ? <Link href="/spu" className="text-xs font-medium text-accent hover:underline">Xem tất cả {fmtInt(n)} ở Theo dõi SPU →</Link> : undefined);
  const code = (c: string) => <Link href={href(c)} className="font-mono text-sm font-bold hover:underline">{c}</Link>;
  const nameOf = (v: View) => <Link href={href(v.row.code)} className="hover:underline" title={v.row.name}>{v.row.name}</Link>;
  // Dòng phụ: xem · bán · tồn (chỉ số có giá trị)
  const sub = (v: View) => [v.views !== null && `${fmtCompact(v.views)} xem`, v.sold !== null && `${fmtInt(v.sold)} bán`, `tồn ${fmtInt(v.stock)}`].filter(Boolean).join(" · ");
  const spuList = (rows: View[], right: (v: View) => React.ReactNode, empty: string) => (
    <List empty={empty} more={more(rows.length)}
      items={rows.slice(0, LIMIT).map((v) => ({ key: v.row.code, lead: code(v.row.code), title: nameOf(v), sub: sub(v), right: right(v) }))} />
  );
  const status = (v: View) => (v.flags.star ? <Tag text="Ngôi sao" cls="bg-warn-bg text-warn-ink" /> : v.flags.win ? <Tag text="SP Win" cls="bg-good/15 text-good" /> : <Tag text="Win Traffic" cls="bg-accent/15 text-accent" />);
  const action = (v: View, cls: string) => (v.action ? <Tag text={ACTION_LABEL[v.action].label} cls={cls} /> : null);

  return (
    <AlertTabs tabs={[
      { key: "potential", label: "SPU tiềm năng", count: potential.length, hint: "SPU còn hàng đã đạt SP Ngôi sao, SP Win hoặc Win Traffic: nên đẩy thêm video để giữ đà",
        content: spuList(potential, status, "Chưa có SPU nào đạt.") },
      { key: "video", label: "Video tiềm năng", count: vids.total, hint: "Video nhiều lượt xem nhất trong kỳ của các SPU còn hàng: cân nhắc đăng lại hoặc dựng thêm theo cùng kiểu",
        content: (
          <List empty="Chưa có video nào trong kỳ." more={more(vids.total)}
            items={shownVids.map(({ x, code: c }, i) => ({
              key: `${c}-${i}`,
              lead: code(c),
              title: <span className="flex items-center gap-1.5"><span className={`flex-none rounded px-1 text-2xs font-bold text-white ${PLAT[x.platform]}`}>{x.platform}</span>
                <Link href={href(c)} className="truncate hover:underline" title={x.title}>{x.title}</Link>{isWin(x, videoWin) && <Tag text="WIN" cls="bg-good/15 text-good" />}</span>,
              sub: `${x.channel} · ${x.date.split("-").reverse().slice(0, 2).join("/")}`,
              right: <b className="text-sm text-accent">{fmtCompact(x.views)}</b>,
            }))} />
        ) },
      { key: "convert", label: "Traffic cao chưa bán", count: convert.length, hint: ACTION_LABEL.convert.hint,
        content: spuList(convert, (v) => action(v, "bg-warn-bg text-warn-ink"), "Không có.") },
      { key: "produce", label: "Cần đẩy sản xuất", count: produce.length, hint: ACTION_LABEL.produce.hint,
        content: spuList(produce, (v) => action(v, "bg-good/15 text-good"), "Không có SPU nào sắp hết hàng mà bán tốt.") },
      { key: "bad", label: "Tồn xấu cần đẩy", count: bad.length, hint: ACTION_LABEL.bad.hint,
        content: spuList(bad, (v) => <span className="text-xs font-semibold text-bad">{v.row.ageApprox ? "≥ " : ""}{v.row.ageDays} ngày</span>, "Không có SPU tồn xấu.") },
      { key: "need", label: "Cần lên video", count: needVideo.length, hint: "Còn nhiều hàng hoặc tồn lâu mà ít hoặc chưa có video: cần quay source hoặc lên video",
        content: (
          <List empty="Không có." more={more(needVideo.length)}
            items={needVideo.slice(0, LIMIT).map((v) => ({
              key: v.row.code, lead: code(v.row.code), title: nameOf(v),
              sub: `${fmtInt(v.videos)} video · ${v.row.footage ? `${fmtInt(v.row.footage)} clip` : "chưa có source"} · tồn ${fmtInt(v.stock)}`,
              right: action(v, "bg-grid text-ink-2"),
            }))} />
        ) },
    ]} />
  );
}
