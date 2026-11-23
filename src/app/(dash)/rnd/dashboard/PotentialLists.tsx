import Link from "next/link";
import ResultBadge from "@/components/rnd/ResultBadge";
import { fmtDate, fmtInt } from "@/lib/data";
import type { Evaluation, VideoRank } from "@/lib/eval/data";
import { productPotential, videoPotential, videoThresholds } from "@/lib/eval/potential";
import { isWinResult } from "@/lib/eval/rules";
import AlertTabs from "./AlertTabs";
import { buildMetrics, checkRules, rulesPass } from "@/lib/eval/rules";
import type { KpiRule } from "@/lib/kpi-constants";

type VideoWin = { rules: KpiRule[]; match: "all" | "any" };
const isRnd = (e: Evaluation) => !!e.product?.stage;
const link = (e: Evaluation) => (e.product_id ? `/rnd/${e.product_id}` : "/rnd");

// Mức đạt tiêu chí Video Win của 1 video (0–1): tất cả điều kiện → lấy điều kiện thấp nhất; chỉ cần một → lấy cao nhất.
// Chỉ có lượt xem / người xem / CTR của video nên cảm xúc và lượt nhấp quy theo CTR.
function winProgress(v: VideoRank, kpi: VideoWin) {
  const clicks = v.ctr === null ? 0 : (v.ctr / 100) * v.views;
  const m = buildMetrics({ views: v.views, viewers: v.viewers, reactions: 0, clicks, qty_net: 0, posts: 1, videos: 1 });
  const checks = checkRules(kpi.rules, m);
  const progress = checks.length ? (kpi.match === "all" ? Math.min(...checks.map((c) => c.progress)) : Math.max(...checks.map((c) => c.progress))) : 0;
  return { pass: rulesPass(checks, kpi.match), progress };
}

// Hai danh sách đề xuất dùng ở Tổng quan (gộp hai luồng) và Luồng R&D:
//   • Sản phẩm tiềm năng / đề xuất SP Win: chưa Win đủ nhưng dự báo đạt hoặc gần đạt KPI còn lại
//   • Video: mode "top" = top 25% lượt xem / CTR cao; mode "win" = đạt hoặc gần đạt (≥ 70%) tiêu chí Video Win ở trang Mục tiêu
export default function PotentialLists({ list, productTitle, productHint, videoTitle, videoMode, videoWin, showSource, extra, layout = "grid", limit = 8, spWin = false }: {
  spWin?: boolean;   // true: ô thứ hai là "SP Win" (thống kê các SP đã đạt KPI bán hàng) thay cho đề xuất video — dùng ở Dashboard luồng R&D
  layout?: "grid" | "tabs"; extra?: boolean; list: Evaluation[]; productTitle: string; productHint: string; videoTitle: string; videoMode: "top" | "win"; videoWin?: VideoWin; showSource?: boolean; limit?: number;
}) {
  const potentials = list.flatMap((e) => { const p = productPotential(e); return p ? [{ e, p }] : []; })
    .sort((a, b) => (a.p.level === b.p.level ? (a.e.forecast?.days_left ?? 99) - (b.e.forecast?.days_left ?? 99) : a.p.level === "high" ? -1 : 1));
  const allVideos = list.filter((e) => e.result !== "fail").flatMap((e) => e.videos.map((v) => ({ ...v, e })));
  let videoRows: { v: (typeof allVideos)[number]; why: string }[];
  let videoHint: string;
  if (videoMode === "win" && videoWin) {
    videoRows = allVideos.map((v) => ({ v, w: winProgress(v, videoWin) })).filter((x) => x.w.pass || x.w.progress >= 0.7)
      .sort((a, b) => Number(b.w.pass) - Number(a.w.pass) || b.w.progress - a.w.progress || b.v.views - a.v.views)
      .map((x) => ({ v: x.v, why: x.w.pass ? "Đạt tiêu chí Video Win" : `Gần đạt Video Win · ${Math.round(x.w.progress * 100)}%` }));
    videoHint = "Video đạt hoặc gần đạt (từ 70%) tiêu chí Video Win ở trang Mục tiêu: nên đăng lại hoặc dựng thêm theo cùng kiểu";
  } else {
    const vt = videoThresholds(allVideos);
    videoRows = allVideos.map((v) => ({ v, why: videoPotential(v, vt) })).filter((x): x is { v: (typeof allVideos)[number]; why: string } => !!x.why).sort((a, b) => b.v.views - a.v.views);
    videoHint = `Lượt xem ≥ ${fmtInt(vt.views)} (top 25% video đang test) hoặc CTR cao: cân nhắc đăng lại / dựng thêm theo cùng kiểu`;
  }
  // Hàng 2 (khi extra): mẫu đang test dự kiến đạt · traffic cao nhưng chưa bán · WIN gần đây
  const soonWin = list.filter((e) => e.result === "testing" && e.forecast && e.forecast.predicted !== "fail").sort((a, b) => a.forecast!.days_left - b.forecast!.days_left);
  const trafficNoSales = list.filter((e) => e.traffic_status === "pass" && ["weak", "partial"].includes(e.sales_status));
  const recentWins = list.filter((e) => isWinResult(e.result)).sort((a, b) => b.window_end.localeCompare(a.window_end)).slice(0, limit);
  const src = (e: Evaluation) => (showSource ? <span className={`ml-1 rounded px-1 text-2xs ${isRnd(e) ? "bg-accent text-white" : "bg-grid text-ink-2"}`}>{isRnd(e) ? "R&D" : "Media"}</span> : null);
  const productList = (
    <ul className="space-y-2 text-sm">
      {potentials.slice(0, limit).map(({ e, p }) => (
        <li key={e.code} className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <Link href={link(e)} className="block truncate hover:underline"><b>#{e.code}</b> {e.product?.name ?? `Mẫu ${e.code}`}{src(e)}</Link>
            <span className="text-xs text-ink-muted">{p.reasons.join(" · ")}</span>
          </span>
          <span className="flex flex-none items-center gap-1.5 text-xs">
            <span className={`rounded-md px-1.5 py-0.5 font-medium ${p.level === "high" ? "bg-warn-bg text-warn-ink" : "bg-grid text-ink-2"}`}>{p.level === "high" ? "⭐ Cao" : "Vừa"}</span>
            <ResultBadge result={e.result} size="xs" />
          </span>
        </li>
      ))}
      {!potentials.length && <li className="text-ink-muted">Chưa có mẫu nào.</li>}
    </ul>
  );
  const videoList = (
    <ul className="space-y-2 text-sm">
      {videoRows.slice(0, limit).map(({ v, why }) => (
        <li key={`${v.e.code}-${v.id}`} className="flex items-center justify-between gap-2">
          <span className="min-w-0">
            {v.url
              ? <a href={v.url} target="_blank" rel="noreferrer" className="block truncate hover:underline">▶ <b>#{v.e.code}</b> {fmtDate(v.date)}{src(v.e)}</a>
              : <span className="block truncate">▶ <b>#{v.e.code}</b> {fmtDate(v.date)}{src(v.e)}</span>}
            <span className="text-xs text-ink-muted">{why}{v.ctr !== null ? ` · CTR ${v.ctr.toFixed(2)}%` : ""}</span>
          </span>
          <span className="tabular flex-none text-xs text-ink-muted">{fmtInt(v.views)} xem</span>
        </li>
      ))}
      {!videoRows.length && <li className="text-ink-muted">Chưa có video nào.</li>}
    </ul>
  );
  const nm = (e: Evaluation) => <Link href={link(e)} className="min-w-0 truncate hover:underline"><b>#{e.code}</b> {e.product?.name ?? `Mẫu ${e.code}`}{src(e)}</Link>;
  const soonList = (
    <ul className="space-y-2 text-sm">
      {soonWin.slice(0, limit).map((e) => (
        <li key={e.code} className="flex items-center justify-between gap-2">{nm(e)}
          <span className="flex flex-none items-center gap-1.5 text-xs text-ink-muted">còn {e.forecast!.days_left} ngày <ResultBadge result={e.forecast!.predicted} size="xs" /></span>
        </li>
      ))}
      {!soonWin.length && <li className="text-ink-muted">Chưa có mẫu nào dự kiến đạt.</li>}
    </ul>
  );
  const noSalesList = (
    <ul className="space-y-2 text-sm">
      {trafficNoSales.slice(0, limit).map((e) => (
        <li key={e.code} className="flex items-center justify-between gap-2">{nm(e)}
          <span className="tabular flex-none text-xs text-ink-muted">{fmtInt(Number(e.metrics.views))} xem · {fmtInt(Number(e.metrics.qty_net))} bán</span>
        </li>
      ))}
      {!trafficNoSales.length && <li className="text-ink-muted">Không có.</li>}
    </ul>
  );
  const winList = (
    <ul className="space-y-2 text-sm">
      {recentWins.map((e) => (
        <li key={e.code} className="flex items-center justify-between gap-2">{nm(e)}
          <span className="flex flex-none items-center gap-1 text-xs text-ink-muted">{e.confirmed ? "đã xác nhận" : "chờ xác nhận"} <ResultBadge result={e.result} size="xs" /></span>
        </li>
      ))}
      {!recentWins.length && <li className="text-ink-muted">Chưa có mẫu WIN.</li>}
    </ul>
  );
  // SP Win của danh sách (luồng R&D): đạt KPI bán hàng — mới Win gần nhất trước, kèm lượt xem và số bán
  const spWins = list.filter((e) => e.result === "win" || e.result === "win_sp").sort((a, b) => b.window_end.localeCompare(a.window_end));
  const spWinQty = spWins.reduce((n, e) => n + Number(e.metrics.qty_net ?? 0), 0);
  const spWinList = (
    <ul className="space-y-2 text-sm">
      {spWins.slice(0, limit).map((e) => (
        <li key={e.code} className="flex items-center justify-between gap-2">{nm(e)}
          <span className="flex flex-none items-center gap-2 text-xs text-ink-muted">
            <span className="tabular">{fmtInt(Number(e.metrics.views ?? 0))} xem · <b className="text-ink-1">{fmtInt(Number(e.metrics.qty_net ?? 0))}</b> bán</span>
            <span className={e.confirmed ? "text-good" : "text-warn-ink"}>{e.confirmed ? "đã xác nhận" : "chờ xác nhận"}</span>
          </span>
        </li>
      ))}
      {!spWins.length && <li className="text-ink-muted">Chưa có SP Win trong luồng R&D.</li>}
      {spWins.length > limit && <li className="text-xs text-ink-muted">+ {spWins.length - limit} SP Win khác</li>}
    </ul>
  );
  const SPWIN_HINT = `${spWins.length} SP Win trong luồng R&D (đạt KPI bán hàng) · ${spWins.filter((e) => e.confirmed).length} đã xác nhận · tổng ${fmtInt(spWinQty)} sản phẩm đã bán trong cửa sổ test`;
  const SOON_HINT = "Ngoại suy theo nhịp hiện tại tới hết cửa sổ test", NOSALES_HINT = "Đạt KPI traffic, KPI bán hàng còn yếu — xem lại giá / cách chốt đơn", WIN_HINT = "Ứng viên đẩy mẫu ĐVKD — mở mẫu để xác nhận và chuyển";

  if (layout === "tabs") {
    return (
      <AlertTabs tabs={[
        { key: "product", label: "Sản phẩm tiềm năng", count: Math.min(potentials.length, limit), hint: productHint, content: productList },
        { key: "video", label: "Video tiềm năng", count: Math.min(videoRows.length, limit), hint: videoHint, content: videoList },
        { key: "soon", label: "Đang test, dự kiến đạt", count: Math.min(soonWin.length, limit), hint: SOON_HINT, content: soonList },
        { key: "nosales", label: "Traffic cao chưa bán", count: Math.min(trafficNoSales.length, limit), hint: NOSALES_HINT, content: noSalesList },
        { key: "win", label: "WIN gần đây", count: recentWins.length, hint: WIN_HINT, content: winList },
      ]} />
    );
  }
  const box = "rounded-lg border border-line bg-surface p-3";
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <section className={box}><h2 className="mb-1 font-semibold">⭐ {productTitle}</h2><p className="mb-2 text-xs text-ink-muted">{productHint}</p>{productList}</section>
        {spWin
          ? <section className={box}><h2 className="mb-1 font-semibold">🏆 SP Win</h2><p className="mb-2 text-xs text-ink-muted">{SPWIN_HINT}</p>{spWinList}</section>
          : <section className={box}><h2 className="mb-1 font-semibold">🎬 {videoTitle}</h2><p className="mb-2 text-xs text-ink-muted">{videoHint}</p>{videoList}</section>}
      </div>
      {extra && (
        <div className="grid gap-3 lg:grid-cols-3">
          <section className={box}><h2 className="mb-1 font-semibold">⏳ Đang test — dự kiến đạt</h2><p className="mb-2 text-xs text-ink-muted">{SOON_HINT}</p>{soonList}</section>
          <section className={box}><h2 className="mb-1 font-semibold">👀 Traffic cao nhưng chưa bán</h2><p className="mb-2 text-xs text-ink-muted">{NOSALES_HINT}</p>{noSalesList}</section>
          <section className={box}><h2 className="mb-1 font-semibold">🏆 WIN gần đây</h2><p className="mb-2 text-xs text-ink-muted">{WIN_HINT}</p>{winList}</section>
        </div>
      )}
    </div>
  );
}
