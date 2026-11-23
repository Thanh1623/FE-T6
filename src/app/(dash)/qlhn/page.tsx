import { Fragment } from "react";
import { redirect } from "next/navigation";
import "./qlhn.css";
import { canSeeProfit, requireUser } from "@/lib/session";
import { addDays, daysBetween, parseFilters, todayVN } from "@/lib/data";
import { fmtTr } from "@/lib/format";
import { getTeams } from "@/lib/pipeline";
import { loadSpuRules } from "@/lib/spu-rules";
import { loadTeamWin } from "@/lib/team-win";
import { saleFlags } from "@/lib/spu-tracking";
import {
  MigrationMissing, loadCompanyClass, loadCost, loadRevMix, loadCurrent, loadExtra, loadMedia, loadMix, loadOrderList, loadOrders, loadPo, loadSpu, loadSpuList, loadTeamOrders, loadTest, loadTop, previousRange,
  type CostMat, type PoLine, type WinRow,
} from "@/lib/team-report";
import Tabs from "./Tabs";
import RangeBar from "./RangeBar";
import GoLink from "./GoLink";
import PagerRows from "./PagerRows";
import SpuImg from "./SpuImg";
import CostCard, { type CostSide } from "./CostCard";
import AgeCard from "./AgeCard";
import PushBoard from "./PushBoard";
import { loadPush, loadPushRequests } from "@/lib/team-push";
import { DailyChart } from "./Charts";
import { OrderListTable, SpuStatTable, WinTable, type SpuClass, type SpuStatRow } from "./Lists";
import { Delta, Hb, Pill, Spark, SpuCell, dm, nf, pct } from "./Parts";

// QLHN — báo cáo theo team (CHỈ Quản lý). Thứ tự dashboard theo việc của người quản lý hàng hóa:
//   kết quả bán hàng (theo bộ lọc ngày) → việc cần xử lý hôm nay → sức khỏe hàng và Media → bán chạy và hàng về → trạng thái đơn, cơ cấu, giá vốn.
// Mỗi chỉ số chỉ xuất hiện MỘT lần; bấm vào chỉ số thì tới đúng bảng ở tab chi tiết. Số liệu: supabase/migrations/067–071 + lib/team-report.ts. Mô tả: docs/QLHN.md.
export const dynamic = "force-dynamic";

const MAT = ["Bạc", "Vàng", "Phụ kiện, bảo hành"];
const hhmm = (iso: string | null) => (iso ? new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso)) : "–");
const tone = (cover: number | null) => (cover === null || cover < 4 ? "bad" : cover <= 14 ? "warn" : "ok") as "bad" | "warn" | "ok";
const shortSpu = (n: string) => n.replace(/\s*-\s*Viễn Chí Bảo\s*$/i, "").trim();

function Urgent({ n, label, sub, go, tone: t, to }: { n: React.ReactNode; label: string; sub: string; go: string; tone: "bad" | "warn"; to: string }) {
  return <GoLink to={to} className={`ucard ${t}`}><b>{n}</b><span className="t">{label}</span><span className="s">{sub}</span><span className="go">{go}</span></GoLink>;
}

// Hàng về / sắp về: gộp theo SPU trong từng nhóm (quá hạn · về hôm nay · sắp về 7 ngày)
type InRow = { code: string; qty: number; eta: string; late: number; po: string };
function groupIncoming(lines: PoLine[], pick: (l: PoLine) => boolean, today: string): InRow[] {
  const by = new Map<string, PoLine[]>();
  for (const l of lines.filter(pick)) by.set(l.code, [...(by.get(l.code) ?? []), l]);
  return [...by.entries()].map(([code, ls]) => {
    const eta = ls.map((l) => l.eta as string).sort()[0], sups = [...new Set(ls.map((l) => l.sup).filter(Boolean))];
    return { code, qty: ls.reduce((n, l) => n + l.left, 0), eta, late: eta < today ? daysBetween(eta, today) - 1 : 0,
      po: ls.length === 1 ? `${ls[0].po} · ${ls[0].sup}` : `${new Set(ls.map((l) => l.po)).size} PO · ${sups.join(", ")}` };
  });
}

export default async function QlhnPage({ searchParams }: PageProps<"/qlhn">) {
  // Quản lý xem mọi team; Trưởng nhóm (có team) chỉ xem team của mình. Giá vốn / lợi nhuận luôn chỉ Quản lý (canSeeProfit).
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  if (!isAdmin && !(user.is_team_lead && user.team_id)) redirect("/");
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  // Mặc định "Tháng này" (từ ngày 1 tới hôm nay) như bản mẫu; chỉ khi URL có range thì theo range
  const f = parseFilters(typeof sp.range === "string" ? sp : { ...sp, range: "this_month" });
  const teams = (await getTeams(true)).filter((t) => isAdmin || t.id === user.team_id);
  const team = teams.find((t) => t.id === f.teams[0]) ?? teams.find((t) => t.name === "Hồng Ngọc") ?? teams[0];
  if (!team) return <div className="qlhn"><p>Chưa có team nào đang hoạt động.</p></div>;

  const showCost = canSeeProfit(user), excl = one("loai") === "1";
  const days = daysBetween(f.from, f.to), prev = previousRange(f.from, f.to), today = todayVN();
  const pm = prev;   // thẻ cơ cấu SPU so với KỲ TRƯỚC (liền trước, cùng số ngày) như các thẻ khác
  const exclHref = (() => {
    const q = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    if (excl) q.delete("loai"); else q.set("loai", "1");
    return `/qlhn?${q.toString()}`;
  })();

  // Qlydonhang (PO, lệnh order) đọc song song với phần còn lại; lỗi kết nối chỉ làm mất phần này, không hỏng cả trang
  const qldhP = Promise.all([loadTeamOrders(team.name), loadPo()]).then(([orders, po]) => ({ orders, cov: po.cov, lines: po.lines })).catch(() => null);
  let d;
  try {
    const rulesP = loadSpuRules();
    const [orders, prevOrders, current, mix, spu, test, extra, media, top, lines, spuRows, rules, company, cost, rev, prevMix, prevRev] = await Promise.all([
      loadOrders(team.name, f.from, f.to), loadOrders(team.name, prev.from, prev.to), loadCurrent(team.name, f.from),
      loadMix(team.name, f.from, f.to), loadSpu(team.name, f.from, f.to), loadTest(team.name), loadExtra(team.name),
      loadMedia(team.name, f.from, f.to), loadTop(team.name, f.from, f.to), loadOrderList(team.name, f.from, f.to), loadSpuList(team.name, f.from, f.to),
      rulesP, rulesP.then((r) => loadCompanyClass(r.sales.slowBelow, r.sales.normalBelow)),
      showCost ? Promise.all([loadCost(team.name, f.from, f.to, "delivery", excl), loadCost(team.name, f.from, f.to, "order", excl)]) : Promise.resolve(null),
      // Doanh thu theo nhóm SPU cũ / mới / chế tác (migration 078): chỉ Quản lý; chưa chạy 078 thì tab Doanh thu của thẻ cơ cấu ẩn đi
      showCost ? loadRevMix(team.name, f.from, f.to, "order").catch(() => null) : Promise.resolve(null),
      loadMix(team.name, pm.from, pm.to).catch(() => null), showCost ? loadRevMix(team.name, pm.from, pm.to, "order").catch(() => null) : Promise.resolve(null),
    ]);
    if (spuRows.length && spuRows[0].length < 7) throw new MigrationMissing("Hàm tr_spu_list còn bản cũ. Chỉ cần chạy lại file 071_team_report_lists.sql (một file này) trong Supabase SQL Editor rồi tải lại trang; không chạy lại 067.");
    d = { orders, prevOrders, current, mix, spu, test, extra, media, top, lines, spuRows, rules, company, cost, rev, prevMix, prevRev };
  } catch (e) {
    if (e instanceof MigrationMissing) return <div className="qlhn"><p>{e.message}{/tr_spu_list/.test(e.message) ? "" : <> Chạy tay các file còn thiếu trong <code>supabase/migrations</code> (067 đến 074; file nào đã chạy rồi thì bỏ qua) trong Supabase SQL Editor theo thứ tự, sau đó tải lại trang.</>}</p></div>;
    throw e;
  }
  const qldh = await qldhP;

  const { orders: o, prevOrders: po, current: cur, mix, spu, test, extra, media, top, lines, spuRows, rules, company, cost, rev, prevMix, prevRev } = d;
  // Bảng 3 (migration 085): tồn kho và đẩy hàng theo team + yêu cầu đẩy hàng. Chưa chạy 085 thì chỉ mất bảng này, không hỏng trang
  const [pushData, pushReqs] = await Promise.all([
    loadPush(f.from, f.to, rules!).catch(() => null),
    loadPushRequests(isAdmin ? null : team.name).catch(() => null),
  ]);
  const lbl = f.from === f.to ? `ngày ${dm(f.from)}` : `${dm(f.from)} đến ${dm(f.to)}`;
  const pend = o.qty - o.delivered_qty, pendOrders = o.orders - o.delivered_orders;
  const avg = o.qty / days, avgPrev = po.qty / days, delta = avgPrev > 0 ? ((avg - avgPrev) / avgPrev) * 100 : null;
  const chetacOver14 = cur.chetac.reduce((n, c) => n + c.over14, 0), chetacOrders = cur.chetac.reduce((n, c) => n + c.orders, 0);
  const chetacReady = cur.chetac.reduce((n, c) => n + c.ready, 0), chetacDone = cur.chetac.reduce((n, c) => n + c.done, 0);
  const mixTotal = mix.age.reduce((n, a) => n + a.q, 0), grpMax = Math.max(1, ...mix.grp.map((g) => g.q));
  const sideOf = (idx: 0 | 1): CostSide => {
    const rows = (cost?.[idx].mat ?? []) as CostMat[];
    const m = [0, 1, 2].map((i) => rows.find((r) => r.mat === i) ?? { mat: i, q: 0, rev: 0, revc: 0, cost: 0 });
    return { rows: m.map((x) => ({ name: MAT[x.mat], q: x.q, orders: x.orders, rev: x.revc, cost: x.cost })), t: { ...m.reduce((t, x) => ({ q: t.q + x.q, rev: t.rev + x.revc, cost: t.cost + x.cost }), { q: 0, rev: 0, cost: 0 }), orders: cost?.[idx].orders } };
  };
  const topShort = cur.short[0];
  const noVideoNew = media.new_no_video;
  const asOf = f.to === today ? `${dm(f.to)} tính đến ${hhmm(extra.orders_at)}` : "";
  const note = delta === null ? "Không có kỳ trước trong dữ liệu" : `So với kỳ trước ${dm(prev.from)}${prev.from === prev.to ? "" : ` đến ${dm(prev.to)}`}`;
  const weekday = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const initials = team.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

  const newPct = media.new_total ? Math.round((media.new_video / media.new_total) * 100) : 0, newNeed = Math.max(0, Math.ceil(media.new_total * 0.9) - media.new_video);
  // "Win của team": chấm lại bằng KPI Win chỉ với video và đơn của team trong kỳ (lib/team-win.ts, migration 076). Lỗi / chưa chạy 076 thì dùng kết quả công ty
  const teamWin = await loadTeamWin(team.name, team.id, media.win_list.map((r) => r[0]), f.from, f.to).catch(() => null);
  const teamOf = (code: string) => (teamWin ? teamWin[code]?.result ?? "none" : "");
  const winTests = test.list.map((x): WinRow => [x.code, !x.result || x.result === "testing" ? "Đang test" : `Đã đánh giá: ${x.result}`, "test", 0, 0, 0, "", "test"]);
  const winRows: WinRow[] = [...media.win_list.map((r): WinRow => [...r, teamOf(r[0])]), ...winTests];
  const winCount = (k: string) => winRows.filter((r) => r[2] !== "test" && (r[7] || r[2]) === k).length;

  // Hàng về / sắp về của các SPU team đang bán (PO của mọi team, chỉ phần chưa về)
  const sell = new Set(spuRows.map((r) => r[0])), in7 = addDays(today, 7);
  const poLines = (qldh?.lines ?? []).filter((l) => sell.has(l.code) && l.eta);
  const late = groupIncoming(poLines, (l) => (l.eta as string) < today, today).sort((a, b) => b.late - a.late);
  const arrive = groupIncoming(poLines, (l) => l.eta === today, today).sort((a, b) => b.qty - a.qty);
  const soon = groupIncoming(poLines, (l) => (l.eta as string) > today && (l.eta as string) <= in7, today).sort((a, b) => a.eta.localeCompare(b.eta) || b.qty - a.qty);
  const sumQ = (r: InRow[]) => r.reduce((n, x) => n + x.qty, 0);
  const todayPos = new Set(poLines.filter((l) => l.eta === today).map((l) => l.po)).size;
  const incRows: [string, InRow[]][] = [["Quá hạn, cần giục", late.slice(0, 8)], [`Dự kiến về hôm nay ${dm(today)}`, arrive.slice(0, 8)], ["Sắp về 7 ngày tới", soon.slice(0, 8)]];

  // Thống kê SPU: gắn PO đang đặt (mọi team) và phân loại tồn kho của CÔNG TY (tồn mọi kho + SL bán 30 ngày cả công ty, ngưỡng ở trang KPI) vào từng SPU team đã bán
  const spuStat: SpuStatRow[] = spuRows.map(([code, name, sold, delivered, videos, stock, sold30]) => {
    const c = qldh?.cov[code], fl = saleFlags(stock, sold30, rules!);
    const cls: SpuClass = fl.bad ? "bad" : fl.hot ? "hot" : fl.normal ? "normal" : fl.slow ? "slow" : "other";
    return { code, name, sold, delivered, videos, ordered: c?.pending ?? 0, pos: c?.pos ?? 0, eta: c?.nextEta ?? null, stock, cls };
  });
  const withVideo = spuStat.filter((r) => r.cls !== "other" && r.videos > 0).length;
  const grpOf = (test: (r: SpuStatRow) => boolean) => { const rs = spuStat.filter(test); return { spus: rs.length, qty: rs.reduce((n, r) => n + r.sold, 0) }; };
  // Mã không thuộc bảng SPU (mã trung gian chế tác MATRUNGGIAN…, quà tặng, mã cũ chưa gộp) không có phân loại tồn: gom thành ô riêng để 5 ô cộng lại đúng bằng số sản phẩm của thẻ Đơn hàng
  const otherCls = grpOf((r) => r.cls === "other");
  // 6 ô như trang SPU: số lớn = số SPU của CẢ CÔNG TY theo phân loại tồn kho; dòng nhỏ = số sản phẩm và số SPU của team đã bán trong kỳ thuộc nhóm đó
  const stockCls: [string, string, number, ReturnType<typeof grpOf>, string | undefined, string][] = [
    ["SPU Active", "classified", company.active, grpOf((r) => r.cls !== "other"), undefined, "Còn tồn kho hoặc có bán trong 30 ngày gần nhất (cả công ty)"],
    ["SPU còn hàng", "instock", company.in_stock, grpOf((r) => r.stock > 0), "var(--good)", "Tồn kho lớn hơn 0 (cộng mọi kho)"],
    ["SPU bán chạy", "hot", company.hot, grpOf((r) => r.cls === "hot"), "var(--star)", `SL bán 30 ngày của cả công ty từ ${rules.sales.normalBelow} trở lên`],
    ["SPU bán thường", "normal", company.normal, grpOf((r) => r.cls === "normal"), undefined, `SL bán 30 ngày từ ${rules.sales.slowBelow} đến dưới ${rules.sales.normalBelow}`],
    ["SPU bán chậm", "slow", company.slow, grpOf((r) => r.cls === "slow"), "var(--warn-ink)", `SL bán 30 ngày từ 1 đến dưới ${rules.sales.slowBelow}`],
    ["SPU tồn xấu", "bad", company.bad, grpOf((r) => r.cls === "bad"), "var(--bad)", "Còn hàng nhưng cả công ty không bán được sản phẩm nào trong 30 ngày"],
  ];

  // 4 ô của thẻ Đơn hàng: số kỳ này + biểu đồ xu hướng theo ngày + tăng / giảm so với kỳ trước (cùng độ dài)
  const cmpTitle = `Kỳ trước ${dm(prev.from)}${prev.from === prev.to ? "" : ` đến ${dm(prev.to)}`}`, noPrev = po.orders + po.cancelled === 0;
  const dy = o.daily, ser = (f: (x: (typeof dy)[number]) => number | null | undefined) => dy.map((x) => f(x) ?? null);
  const minis = [
    { key: "days", cmp: false, tone: "bl", tip: "Số ngày trung bình mỗi đơn, tính từ lúc đặt đến khi giao (chỉ đơn đã giao)", value: o.avg_days != null ? `${o.avg_days.toLocaleString("vi-VN")} ngày` : "–", label: "giao trung bình",
      series: [], color: "#2a78d6", cur: o.avg_days, prev: noPrev ? null : po.avg_days, goodUp: false, d: 1 },
    { key: "canc", cmp: true, tone: "rd", tip: "Đơn hủy trên tổng đơn đặt trong kỳ (kể cả đơn hủy)", value: `${nf(o.cancelled)} đơn`, label: `hủy (${pct(o.cancelled, o.orders + o.cancelled, 0)})`,
      series: ser((x) => x.c), color: "#d03b3b", cur: o.cancelled, prev: noPrev ? null : po.cancelled, goodUp: false, d: 0 },
    { key: "del", cmp: false, tone: "gr", tip: "Đơn đã giao khách: đơn có ít nhất một sản phẩm đã có ngày giao", value: nf(o.delivered_orders), label: `đã giao (${pct(o.delivered_orders, o.orders, 0)})`,
      series: [], color: "#008300", cur: o.delivered_orders, prev: noPrev ? null : po.delivered_orders, goodUp: true, d: 0 },
    { key: "pen", cmp: false, tone: "bl", tip: "Đơn chưa giao khách: chưa có sản phẩm nào được giao", value: nf(pendOrders), label: `chưa giao (${pct(pendOrders, o.orders, 0)})`,
      series: [], color: "#2a78d6", cur: pendOrders, prev: noPrev ? null : po.orders - po.delivered_orders, goodUp: false, d: 0 },
  ] as const;

  const chips = (
    <div className="stamp" style={{ marginLeft: 8 }}>
      <span className="chip"><span className="dot" />Đơn hàng {hhmm(extra.orders_at)}</span>
      <span className="chip">Tồn, video {hhmm(extra.summary_at)}</span>
    </div>
  );
  const left = <><div className="avatar">{initials}</div><div><h1>Team {team.name}</h1><div className="sub">QLHH · {weekday}</div></div>{chips}</>;
  const bar = <RangeBar from={f.from} to={f.to} today={today} teams={teams} teamId={team.id} note={note} />;

  const podium = [top[1], top[0], top[2]].map((r, i) => (r ? { r, rank: [2, 1, 3][i] } : null));
  const cover = (r: { stock: number; sold30: number }) => (r.stock <= 0 ? null : r.sold30 ? Math.round((r.stock / r.sold30) * 30) : 999);
  const coverText = (c: number | null) => (c === null ? "Hết hàng" : c < 999 ? `${c} ngày` : "Chưa có tốc độ bán");

  const dash = (
    <>
      <div className="sec-t">Kết quả bán hàng <span className="scope">· theo khoảng ngày đã chọn</span></div>
      <div className="hero">
        <section className="card">
          <div className="lbl">Đơn hàng {lbl}</div>
          <div className="big" title="Đơn tiếp nhận trong kỳ, không tính đơn hủy; số sản phẩm là số lượng dòng có giá, không tính quà tặng"><b>{nf(o.orders)}</b><span>đơn · {nf(o.qty)} sản phẩm</span><Delta cur={o.orders} prev={noPrev ? null : po.orders} goodUp title={`${cmpTitle}: ${nf(po.orders)} đơn`} /></div>
          <div>
            <div className="pbar" role="img" aria-label={`Sản phẩm đã giao ${o.delivered_qty}, còn thiếu ${pend}`}>
              <i style={{ width: `${o.qty ? (o.delivered_qty / o.qty) * 100 : 0}%`, background: "var(--ok)" }} /><i style={{ width: `${o.qty ? (pend / o.qty) * 100 : 0}%`, background: "#eda100" }} />
            </div>
            <div className="legend" style={{ marginTop: 8 }}>
              <span title="Số sản phẩm đã giao khách (đã có ngày giao)"><i style={{ background: "var(--ok)" }} />Đã giao {nf(o.delivered_qty)} ({pct(o.delivered_qty, o.qty, 0)})</span>
              <span title="Số sản phẩm khách đã đặt nhưng chưa giao"><i style={{ background: "#eda100" }} />Còn thiếu {nf(pend)} ({pct(pend, o.qty, 0)})</span>
            </div>
          </div>
          <div className="minis">
            {minis.map((m) => (
              <div key={m.key} className={`mini ${m.tone}${m.cmp ? " sp" : ""}`} title={m.tip}>
                <div className="mv"><b>{m.value}</b><span>{m.label}</span></div>
                {m.cmp && <div className="ms"><Spark values={m.series} color={m.color} label={`Xu hướng theo ngày: ${m.label}`} /><Delta cur={m.cur} prev={m.prev} goodUp={m.goodUp} d={m.d} title={`${cmpTitle}: ${m.prev === null ? "chưa có" : m.prev.toLocaleString("vi-VN", { maximumFractionDigits: m.d })}`} /></div>}
              </div>))}
          </div>
          <GoLink to="lines" className="lnk">Xem DS đơn hàng ›</GoLink>
        </section>
        <section className="card">
          <div className="card-h"><h2>Sản phẩm khách đặt mỗi ngày</h2><span className="hint">{asOf}</span></div>
          <div className="kpis">
            <div><b>{avg.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}</b><span>TB/ngày, {lbl}</span></div>
            <div><b>{delta === null ? "–" : avgPrev.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}</b><span>{delta === null ? "TB/ngày kỳ trước" : `TB/ngày, ${dm(prev.from)}${prev.from === prev.to ? "" : ` đến ${dm(prev.to)}`}`}</span></div>
            <div><b className={delta === null ? "" : delta >= 0 ? "up" : "down"}>{delta === null ? "–" : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(delta))}%`}</b><span>so với kỳ trước</span></div>
          </div>
          <DailyChart data={o.daily} />
        </section>
      </div>

      <div className="sec-t">Cần xử lý hôm nay <span className="scope">· bấm để xem danh sách · chưa giao tính từ {dm(f.from)}, các số khác là hiện tại</span></div>
      <div className="urgent">
        <Urgent n={spu.hot_short} label="SPU bán chạy vẫn thiếu hàng" sub={`${spu.hot_short_stock} nếu chưa tính hàng về · cần bổ sung`} go="Xem danh sách bổ sung ›" tone="bad" to="push" />
        <Urgent n={nf(cur.pending_over7)} label="sản phẩm khách đặt chưa giao quá 7 ngày" sub={topShort ? `${topShort.code} thiếu ${topShort.short} để giao` : `tổng chưa giao ${nf(cur.pending_qty)}`} go="Xem đơn đang chờ ›" tone="bad" to="lines" />
        <Urgent n={qldh ? nf(qldh.orders.remaining) : "–"} label="sản phẩm team đã order chưa về" sub={qldh ? `${qldh.orders.overduePos} PO quá hạn dự kiến về` : "chưa đọc được Qlydonhang"} go="Giục mua hàng ›" tone="warn" to="order" />
        <Urgent n={spu.dead} label="SPU tồn xấu cần đẩy" sub={`kèm ${noVideoNew.length} SPU mới chưa có video`} go="Giao Media đẩy ›" tone="warn" to="push" />
      </div>

      <div className="sec-t">Sức khỏe hàng hóa và Media <span className="scope">· tồn kho và phân loại là hiện tại; SPU, video, win theo khoảng ngày đã chọn</span></div>
      <div className="cols">
        <section className="card">
          <div className="card-h"><h2>SPU team đã bán theo phân loại tồn kho</h2><span className="hint">Team bán {nf(stockCls[0][3].spus)} SPU · {lbl}</span></div>
          <div className="cls">
            {stockCls.slice(2).map(([label, f, total, g, color, tip]) => (
              <GoLink key={f} to="spu" filter={f} className={`kc kcb${f === "bad" ? " rd" : f === "hot" ? " gr" : ""}`} title={tip}>
                <span className="cl">{label}</span><b style={color ? { color } : undefined}>{nf(g.qty)}<small> sp</small></b>
                <em><strong>{nf(g.spus)}</strong> SPU team · công ty {nf(total)}</em>
              </GoLink>))}
            {otherCls.qty > 0 && (
              <div className="kcb oth" style={{ gridColumn: "1 / -1" }} title="Mã trung gian của đơn chế tác (MATRUNGGIANBAC / MATRUNGGIANVANG), quà tặng và mã không có trong bảng SPU (mã cũ chưa gộp): không có phân loại tồn kho">
                <span className="cl">Chế tác và mã chưa xếp loại</span><b>{nf(otherCls.qty)}<small> sp</small></b>
                <em><strong>{nf(otherCls.spus)}</strong> mã · không có phân loại tồn kho</em>
              </div>
            )}
          </div>

        </section>
        <section className="card">
          <div className="card-h"><h2>Media và Win</h2><span className="hint">{spu.last_video_day ? `Video đến ${dm(spu.last_video_day)}` : ""}</span></div>
          <div className="prog-r">
            <span title="SPU mới = SPU R&D đánh giá là mới mà team có bán trong kỳ. Đã có video = team đã đăng ít nhất 1 video cho SPU đó.">SPU mới đã có video</span>
            <b>{media.new_video} / {media.new_total} SPU · {newPct}%</b>
            <div className="prog"><i style={{ width: `${newPct}%`, background: newPct >= 90 ? "#008300" : "#e0a100" }} /><u style={{ left: "90%" }} /></div>
            <span className="hint" style={{ gridColumn: "1 / -1" }}>
              {newNeed > 0 ? `Mục tiêu 90%: cần thêm ${newNeed} SPU có video.` : "Đã đạt mục tiêu 90%."}
              {noVideoNew.length > 0 && <> <GoLink to="push" className="lnk">Xem {noVideoNew.length} SPU mới chưa có video ›</GoLink></>}
            </span>
          </div>
          <div className="prog-r">
            <span>SPU team đã bán có video đăng trong kỳ</span><b>{withVideo} / {stockCls[0][3].spus} · {pct(withVideo, stockCls[0][3].spus, 0)}</b>
            <div className="prog"><i style={{ width: `${(withVideo / Math.max(1, stockCls[0][3].spus)) * 100}%`, background: "#2a78d6" }} /></div>
          
          </div>
          <div className="chips">
            <GoLink to="win" filter="win" className="kc ok kcb" title="Win của team: đạt KPI Win bán hàng chỉ tính đơn và video của team trong kỳ"><b>{winCount("win")}</b><span>SPU win bán hàng</span></GoLink>
            <GoLink to="win" filter="win_traffic" className="kc ok kcb" title="Win của team: đạt KPI traffic chỉ tính video của team trong kỳ"><b>{winCount("win_traffic")}</b><span>SPU win traffic</span></GoLink>
            <GoLink to="win" filter="fail" className="kc kcb rd" title="Team đã đăng video nhưng chưa đạt KPI Win trong kỳ"><b>{winCount("fail")}</b><span>SPU chưa đạt</span></GoLink>
            <GoLink to="win" filter="test" className="kc kcb"><b>{test.codes} / {test.win}</b><span>SP test / SP win</span></GoLink>
          </div>
          <div className="media" style={{ marginTop: 2 }}>
            <div><b>{nf(spu.videos)}</b><span>video đăng trong kỳ</span></div>
            <div><b>{(spu.videos / Math.max(1, days)).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}</b><span>video TB/ngày</span></div>
            <div><b>{nf(spu.views)}</b><span>lượt xem trong kỳ</span></div>
          </div>
          <div className="hint">Win của team tính trên {media.video_spus} SPU team đăng video trong kỳ.{test.codes ? ` SP test: ${test.list.map((x) => x.code).join(", ")}.` : ""}</div>
        </section>
      </div>

      <div className="sec-t">Bán chạy và hàng về <span className="scope">· Top 15 theo khoảng ngày đã chọn, hàng về là hiện tại</span></div>
      <div className="cols">
        <section className="card">
          <div className="card-h"><h2>SPU team bán chạy nhất</h2><span className="hint">Top 15 · {lbl}</span></div>
          {top.length >= 3 && (
            <div className="podium">
              {podium.map((x) => { if (!x) return null; const { r, rank } = x, cv = cover(r), t = tone(cv); return (
                <div key={r.code} className={`pod p${rank}`}>
                  <div className="pimg"><SpuImg src={r.image} alt={r.code} /><span className={`rb r${rank}`}>{rank}</span></div>
                  <div className="pn" title={`${r.code} ${shortSpu(r.name)}`}><b>{r.code}</b> {shortSpu(r.name)}</div>
                  <div className="pq">{r.q}<small> sp</small></div>
                  <div className="ps">Tồn {r.stock} · về {r.incoming}</div>
                  <Pill tone={t}>{cv === null ? "Hết hàng" : cv < 999 ? `Đủ bán ${cv} ngày` : "Chưa có tốc độ bán"}</Pill>
                </div>); })}
            </div>
          )}
          <div className="scroll"><table className="dtbl">
            <thead><tr><th className="n">#</th><th>SPU</th><th className="n">Bán</th><th className="n">Tồn</th><th className="n">Đang về</th><th className="n">Đủ bán</th><th>Win</th></tr></thead>
            <tbody>{top.slice(3).map((r, i) => { const cv = cover(r); return (
              <tr key={r.code}><td className="n rk">{i + 4}</td><SpuCell code={r.code} name={shortSpu(r.name)} /><td className="n"><b>{r.q}</b></td><td className="n">{r.stock}</td><td className="n">{r.incoming || "–"}</td>
                <td className="n"><Pill tone={tone(cv)}>{coverText(cv)}</Pill></td>
                <td>{r.result === "win" && <Pill tone="ok">Win</Pill>}{r.result === "win_traffic" && <Pill tone="info">Win traffic</Pill>}{!r.has_video && <>{r.result === "win" || r.result === "win_traffic" ? " " : ""}<Pill tone="bad">Chưa video</Pill></>}</td></tr>); })}</tbody>
          </table></div>
          <div className="hint">Đủ bán = tồn chia tốc độ bán 30 ngày của cả công ty; đỏ dưới 4 ngày hoặc hết hàng, vàng 4 đến 14 ngày. <GoLink to="spu" className="lnk">Xem thống kê tất cả SPU ›</GoLink></div>
        </section>
        <section className="card">
          <div className="card-h"><h2>Hàng về và sắp về</h2><span className="hint">SPU team đang bán · PO các team</span></div>
          {qldh ? (
            <>
              <div className="chips">
                <div className="kc ok"><b>{nf(sumQ(arrive))}</b><span>về hôm nay ({todayPos} PO)</span></div>
                <div className="kc bad"><b>{nf(sumQ(late))}</b><span>quá hạn chưa về</span></div>
                <div className="kc"><b>{nf(sumQ(soon))}</b><span>sắp về 7 ngày tới</span></div>
              </div>
              <div className="scroll"><table className="dtbl inc">
                <colgroup><col style={{ width: "20%" }} /><col style={{ width: "16%" }} /><col style={{ width: "26%" }} /><col style={{ width: "38%" }} /></colgroup>
                <thead><tr><th>SPU</th><th className="n">Số lượng</th><th>Dự kiến</th><th>PO · NCC</th></tr></thead>
                <tbody>{incRows.map(([title, rows]) => rows.length ? (
                  <Fragment key={title}>
                    <tr className="sep"><td colSpan={4}>{title}</td></tr>
                    {rows.map((r) => (
                      <tr key={`${title}${r.code}`}><td><b className="code">{r.code}</b></td><td className="n"><b>{nf(r.qty)}</b></td>
                        <td>{r.late ? <Pill tone={r.late >= 7 ? "bad" : "warn"}>Quá {r.late} ngày</Pill> : dm(r.eta)}</td><td>{r.po}</td></tr>))}
                  </Fragment>) : null)}</tbody>
              </table></div>
              <div className="hint">Chỉ tính phần PO chưa về. {extra.receipts_today ? `Hôm nay có ${extra.receipts_today} phiếu nhập kho` : "Hôm nay chưa có phiếu nhập kho nào"}{extra.last_receipt ? `; phiếu gần nhất ${dm(extra.last_receipt)}` : ""}.</div>
            </>
          ) : <div className="hint" style={{ color: "var(--bad)" }}>Chưa đọc được dữ liệu Qlydonhang (kiểm tra ORDERS_SUPABASE_URL / ORDERS_SUPABASE_SECRET_KEY).</div>}
        </section>
      </div>

      <div className="sec-t">Cơ cấu và giá vốn <span className="scope">· theo khoảng ngày đã chọn</span></div>
      <div className="cols">
        <section className="card">
          <div className="card-h"><h2>Cơ cấu theo loại sản phẩm</h2><span className="hint">{lbl} · {nf(mixTotal)} sản phẩm</span></div>
          <div className="bars">
            {mix.grp.map((g) => <Hb key={g.name} label={g.name} value={g.q} max={grpMax} text={`${nf(g.q)} (${pct(g.q, mixTotal, 0)}) · ${g.spus} SPU`} color="#2a78d6" />)}
          </div>
          <div className="hint">Gồm cả sản phẩm của đơn chế tác (xếp vào Khác). Cùng nguồn với thẻ Đơn hàng.</div>
        </section>
        <AgeCard age={mix.age} rev={rev} range={lbl} prevAge={prevMix?.age ?? null} prevRev={prevRev} prevLabel={`${dm(pm.from)} đến ${dm(pm.to)}`} />
      </div>

      {cost && <CostCard delivery={sideOf(0)} order={sideOf(1)} excl={excl} exclHref={exclHref} range={lbl} />}
    </>
  );

  // ===== Tab chi tiết: thứ tự theo mức ưu tiên, khớp thứ tự thẻ trên dashboard =====
  const jumps: [string, string][] = [["lines", "DS đơn hàng"], ["spu", "Thống kê SPU"], ["push", "Tồn kho & đẩy hàng"], ["chetac", "Đơn chế tác"], ["order", "Team đang order"], ["win", "SPU win, SP test"], ["cost", "Giá vốn / giá bán"]];
  const sg = sideOf(0), sd = sideOf(1);
  const cells = (x: { q: number; orders?: number; rev: number; cost: number }, b = false, sep = false) => (
    [x.orders === undefined ? "–" : nf(x.orders), nf(x.q), fmtTr(x.rev), fmtTr(x.cost), fmtTr(x.rev - x.cost), pct(x.cost, x.rev)].map((v, i) => <td key={i} className={`n${sep && i === 0 ? " sep" : ""}`}>{b ? <b>{v}</b> : v}</td>));

  const detail = (
    <>
      <div className="jump" aria-label="Chuyển nhanh tới bảng">
        <GoLink to="dashboard" className="back">‹ Về dashboard</GoLink>
        {jumps.filter(([id]) => id !== "cost" || cost).map(([id, l]) => <GoLink key={id} to={id}>{l}</GoLink>)}
      </div>

      <section className="card" id="d-lines">
        <div className="card-h"><h2>DS đơn hàng</h2><span className="hint">{nf(lines.length)} dòng · {nf(o.qty)} sản phẩm · đơn đặt {lbl}</span></div>
        <OrderListTable rows={lines} />
        <div className="hint">Mỗi dòng là một SKU trong đơn, không tính đơn hủy. Số ngày xử lý = từ ngày đặt đến ngày giao; dòng chưa giao ghi số ngày đã chờ đến hôm nay. “Còn hàng, chưa giao”: kho đủ SKU này, hàng cấp cho đơn cũ trước. “Thiếu hàng”: kho không đủ. “Đang chế tác”: còn mã trung gian, chưa ra SPU thật.</div>
      </section>

      <section className="card" id="d-spu">
        <div className="card-h"><h2>Thống kê SPU team bán trong tháng</h2><span className="hint">{spuStat.length} SPU · {lbl}</span></div>
        <SpuStatTable rows={spuStat} today={today} />
        <div className="hint">Còn thiếu = bán − đã giao. Đã order = số lượng PO đã đặt nhà cung cấp, chưa về (PO của mọi team); dự kiến về = ngày PO gần nhất (đỏ là đã quá hạn). Video = số video team đăng trong kỳ.</div>
      </section>

      {pushData && pushReqs && <PushBoard rows={pushData.rows} teams={pushData.teams} requests={pushReqs} canCreate={isAdmin} myTeam={isAdmin ? null : team.name} focusTeam={team.name} defaultTeam={teams.find((t) => t.id === user.team_id)?.name ?? team.name} range={lbl} today={today} refreshedAt={pushData.refreshedAt} />}

          <section className="card" id="d-chetac">
            <div className="card-h"><h2>Đơn hàng chế tác</h2><span className="hint">Còn mã trung gian = đang chế tác · {nf(chetacOver14)} quá 14 ngày</span></div>
            <div className="scroll"><table>
              <thead><tr><th>Loại</th><th className="n">Tổng đơn</th><th className="n">Đang chế tác</th><th className="n" title="Chế tác xong, đã gắn SPU thật, chưa giao khách">Đã xong</th><th className="n">Đã giao</th><th className="n">Quá 14 ngày</th></tr></thead>
              <tbody>
                {cur.chetac.map((c) => <tr key={c.kind}><td><b className="code">{c.kind}</b></td><td className="n">{c.orders + c.ready + c.done}</td><td className="n">{c.orders}</td><td className="n">{c.ready}</td><td className="n">{c.done}</td><td className="n"><Pill tone={c.over14 ? "bad" : "mute"}>{c.over14}</Pill></td></tr>)}
                <tr><td><b>Tổng</b></td><td className="n"><b>{chetacOrders + chetacReady + chetacDone}</b></td><td className="n"><b>{chetacOrders}</b></td><td className="n"><b>{chetacReady}</b></td><td className="n"><b>{chetacDone}</b></td><td className="n"><b>{chetacOver14}</b></td></tr>
              </tbody>
            </table></div>
          </section>

      <section className="card" id="d-order">
        <div className="card-h"><h2>Sản phẩm team đang order</h2><span className="hint">Lệnh order của team, Qlydonhang</span></div>
        {qldh ? (
          <>
            <div className="minis" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
              <div className="mini"><b>{nf(qldh.orders.ordered)}</b><span>sản phẩm đã order, {qldh.orders.rows.length} dòng</span></div>
              <div className="mini"><b>{nf(qldh.orders.received)}</b><span>đã về (đã nhập kho)</span></div>
              <div className="mini"><b style={{ color: "var(--bad)" }}>{nf(qldh.orders.remaining)}</b><span>còn thiếu</span></div>
              <div className="mini"><b style={{ color: "var(--warn)" }}>{qldh.orders.overduePos} PO</b><span>quá hạn dự kiến về</span></div>
            </div>
            <div className="scroll"><table>
              <thead><tr><th>Ngày tạo</th><th>SKU</th><th className="n">SL đặt</th><th>Trạng thái</th><th className="n">Đã về</th><th className="n">Còn thiếu</th><th>Ngày đặt · PO</th><th>Dự kiến về</th></tr></thead>
              <tbody><PagerRows size={15} cols={8}>{qldh.orders.rows.map((r, i) => (
                <tr key={i}><td>{dm(r.createdAt)}</td><td title={r.sku}><b className="code">{r.sku}</b></td><td className="n"><b>{r.qty}</b></td>
                  <td>{r.remaining > 0 ? <Pill tone="info">Đã tiếp nhận</Pill> : <Pill tone="ok">Đã về đủ</Pill>}{r.qc > 0 && <span className="hint"> QC nhận {r.qc}, chưa nhập kho</span>}</td>
                  <td className="n">{r.received || "–"}</td><td className="n">{r.remaining > 0 ? <Pill tone={r.overdueDays ? "bad" : "warn"}>{r.remaining}</Pill> : "–"}</td>
                  <td>{r.poNo ? <>{r.poDate ?? "–"} <span className="hint">{r.poNo}</span></> : "–"}</td>
                  <td>{r.eta ? <>{dm(r.eta)} <span className="hint" style={r.overdueDays ? { color: "var(--bad)" } : undefined}>{r.overdueDays ? `Quá hạn ${r.overdueDays} ngày` : ""}</span></> : "–"}</td></tr>))}</PagerRows></tbody>
            </table></div>
            <div className="hint">Chỉ tính hàng đã nhập kho. {qldh.orders.qcPending} sản phẩm đã về QC chờ nhập.</div>
          </>
        ) : <div className="hint" style={{ color: "var(--bad)" }}>Chưa đọc được dữ liệu Qlydonhang (kiểm tra ORDERS_SUPABASE_URL / ORDERS_SUPABASE_SECRET_KEY).</div>}
      </section>

      <section className="card" id="d-win">
        <div className="card-h"><h2>SPU win và SP test</h2><span className="hint">{media.video_spus} SPU team đăng video trong kỳ, {test.codes} mã test</span></div>
        <WinTable rows={winRows} />
        <div className="hint">Win tính trên SPU team đăng video trong kỳ. Win traffic: nhiều lượt xem, chưa chắc bán tốt. Chưa đạt: đã đăng nhưng không đạt tiêu chuẩn.</div>
      </section>

      {cost && (
        <section className="card" id="d-cost">
          <div className="card-h"><h2>Tỷ lệ giá vốn / giá bán, đơn giao thành công<span className="tag">Chỉ quản lý xem</span></h2><span className="hint">{lbl}</span></div>
          <div className="scroll"><table className="cmp">
            <thead><tr><th rowSpan={2}>Chất liệu</th><th className="g" colSpan={6}>Theo ngày giao hàng</th><th className="g sep" colSpan={6}>Theo ngày đặt hàng</th></tr>
              <tr>{[0, 1].flatMap((k) => ["Đơn", "Sản phẩm", "Doanh thu", "Vốn", "Lợi nhuận", "Vốn / DT"].map((h, i) => <th key={`${k}${h}`} className={`n${k && i === 0 ? " sep" : ""}`}>{h}</th>))}</tr></thead>
            <tbody>
              {[0, 1, 2].filter((i) => sg.rows[i].q || sd.rows[i].q).map((i) => <tr key={i}><td>{MAT[i]}</td>{cells(sg.rows[i])}{cells(sd.rows[i], false, true)}</tr>)}
              <tr><td><b>Tổng</b></td>{cells(sg.t, true)}{cells(sd.t, true, true)}</tr>
            </tbody></table></div>
          <div className="hint">SKU -S- bạc, -G14/-G18 vàng · vốn theo giá vốn SKU hiện tại · chưa trừ đơn hoàn · <a href={exclHref} style={{ color: "inherit" }}><input type="checkbox" readOnly checked={excl} style={{ pointerEvents: "none" }} aria-hidden /> Loại dòng có vốn lớn hơn giá bán (khách gửi vàng cũ)</a>{!excl && cost[1].flagged.length > 0 ? ` · đang có ${cost[1].flagged.length} dòng: ${cost[1].flagged.map((x) => x.order_id).join(", ")}` : ""}</div>
        </section>
      )}
    </>
  );

  return <div className="qlhn"><Tabs left={left} bar={bar} dash={dash} detail={detail} /></div>;
}
