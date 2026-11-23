import Link from "next/link";
import FilterBar from "@/components/FilterBar";
import ParamSearch from "@/components/ParamSearch";
import ParamSelect from "@/components/ParamSelect";
import InventoryImport from "./InventoryImport";
import SalesImport from "./SalesImport";
import InfoTip from "@/components/InfoTip";
import { requireUser } from "@/lib/session";
import SpuDrawer from "./SpuDrawer";
import { VIEW_FILTERS, type DrawerMode, type ViewFilter } from "./drawer-filters";
import { loadSpuRules } from "@/lib/spu-rules";
import { daysBetween, fmtDate, fmtInt, parseFilters, todayVN } from "@/lib/data";
import { getTeams } from "@/lib/pipeline";
import {
  ACTION_LABEL, GROUPS, STATUS_FILTERS, type StatusFilter,
} from "@/lib/spu-tracking";
import { querySpu, resolveOpenView, type SpuQuery } from "@/lib/spu-query";
import { loadRollingWinByMarket } from "@/lib/spu-winflags";
import { MARKET_OPTIONS, loadChannelMarkets, parseMarket } from "@/lib/channel-market";
import ZoomThumb, { ZoomViewer } from "./ZoomThumb";
import { getAccounts } from "@/lib/data";
import { loadFreshness } from "@/lib/data-freshness";
import CountSpark from "@/components/CountSpark";
import { loadSpuStatsHistory, recordSpuStats, type SpuStatKey, type SpuStats } from "@/lib/spu-stats-history";
import { after } from "next/server";

// Theo dõi hiệu quả SPU: tồn kho × video đã đăng × lượt xem × lượng bán — dữ liệu thật: tồn kho nhập từ file Sapo, số bán, bài đăng gắn mã SPU (lib/spu-data.ts).
const PAGE_SIZE = 50;
const SORTS = { stock: "Tồn", available: "Có thể bán", incoming: "Hàng đang về", age: "Thời gian tồn", sold: "Bán", videos: "Video", teams: "Số team đăng", views: "View", views3: "View 3N" } as const;
type SortKey = keyof typeof SORTS;
const GROUP_ICON: Record<string, string> = { "Nhẫn": "💍", "Dây chuyền": "📿", "Lắc tay": "⛓️", "Bông tai": "✨", "Kiềng": "🔗", "Mặt dây": "💎", "Vòng tay": "⭕", "Set": "🎁", "Khác": "📦" };
const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

function Card({ label, value, sub, tone, info, children, spark }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string; info?: string; children?: React.ReactNode; spark?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="flex items-center text-sm font-semibold text-ink-2"><span className="truncate">{label}</span>{info && <InfoTip text={info} />}</div>
      <div className="mt-1 flex items-start justify-between gap-2">
        <div className={`text-[28px] font-extrabold leading-none tabular-nums ${tone ?? ""}`}>{value}</div>
        {spark}
      </div>
      {sub && <div className="mt-1.5 text-xs text-ink-2">{sub}</div>}
      {children}
    </div>
  );
}
// Màu nhãn gợi ý: sản xuất / traffic = hành động tăng trưởng, xử lý tồn = cảnh báo, còn lại trung tính
const ACTION_CLS: Record<string, string> = {
  produce: "bg-good/15 text-good", traffic: "bg-accent/15 text-accent", convert: "bg-warn-bg text-warn-ink",
  bad: "bg-bad/10 text-bad", shoot: "bg-grid text-ink-1", video: "bg-grid text-ink-1", slow: "bg-warn-bg text-warn-ink",
};
const Chip = ({ cls, children, title }: { cls: string; children: React.ReactNode; title?: string }) => (
  <span title={title} className={`whitespace-nowrap rounded-md px-2 py-0.5 text-2xs font-semibold ${cls}`}>{children}</span>
);

// Server action nhập file (tồn kho / ảnh sản phẩm…) ghi vài chục nghìn dòng: cho chạy tối đa 60 giây (mặc định 10 giây của gói thấp có thể không đủ)
export const maxDuration = 60;

export default async function SpuTrackingPage({ searchParams }: PageProps<"/spu">) {
  const user = await requireUser(["admin", "rnd", "media"]);
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  // Khoảng ngày + team: bộ lọc dùng chung FilterBar (7/30/90 ngày, tháng này / trước, tuỳ chọn từ–đến; chọn nhiều team)
  const f = parseFilters(sp);
  const days = Math.max(1, daysBetween(f.from, f.to));
  const endAge = Math.max(0, daysBetween(f.to, todayVN()) - 1);   // kỳ kết thúc cách hôm nay bao nhiêu ngày
  const [teamList, R, fresh, history] = await Promise.all([getTeams(true), loadSpuRules(), loadFreshness(), loadSpuStatsHistory()]);
  const teamNames = teamList.filter((t) => f.teams.includes(t.id)).map((t) => t.name);   // video ghi team theo tên
  const group = (GROUPS as readonly string[]).includes(one("group")) ? one("group") : "";
  const q = one("q").trim();
  const status = (STATUS_FILTERS.some((s) => s.id === one("status")) ? one("status") : "all") as StatusFilter;
  const dv = (VIEW_FILTERS.some(([k]) => k === one("dv")) ? one("dv") : "all") as ViewFilter, dt = one("dt") || null;
  const spuOpen = one("spu"), mode = (["views", "team"].includes(one("mode")) ? one("mode") : "new") as DrawerMode;
  const sort = (one("sort") in SORTS ? one("sort") : "stock") as SortKey;
  const dir = one("dir") === "asc" ? "asc" : "desc";
  const wantPage = Math.max(1, Math.floor(Number(one("page"))) || 1);
  const words = norm(q).split(/\s+/).filter(Boolean);
  // MỘT truy vấn trả về mọi thứ trang cần: đường nhanh = hàm SQL đọc bảng tổng hợp; đường cũ = tính trực tiếp (lib/spu-query.ts, tài liệu docs/KIEN-TRUC-TONG-HOP-SPU.md)
  // QUY TẮC WIN duy nhất (trang KPI), CUỐN CHIẾU: Win Traffic = lượt xem + bình luận tăng thêm trong N ngày gần nhất, Win Đơn hàng = bán trong M ngày gần nhất — KHÔNG phụ thuộc kỳ lọc; lọc team thì chỉ tính video và số bán của các Page của team
  const teamIds = f.teams.filter((id) => teamList.some((t) => t.id === id));
  const pageIds = teamIds.length ? (await getAccounts()).filter((a) => a.team_id && teamIds.includes(a.team_id)).map((a) => a.id) : null;
  // Thị trường (Tất cả / Trong nước / Nước ngoài): Win Traffic chấm RIÊNG từng thị trường; "Tất cả" = đạt ở ÍT NHẤT MỘT thị trường (lib/spu-winflags: loadRollingWinByMarket)
  const market = parseMarket(one("market"));   // mặc định Trong nước
  const [accountsAll, markets] = await Promise.all([getAccounts(), loadChannelMarkets()]);
  const winFlags = await loadRollingWinByMarket({ pageIds, poolIds: accountsAll.map((a) => a.id), markets, market, channels: [], rules: R.win });
  const query0: SpuQuery = { today: todayVN(), days, endAge, teams: teamNames, wh: one("wh"), group, words, status, sort, dir, page: wantPage, pageSize: PAGE_SIZE, market, rules: R, win: winFlags };
  const res = await querySpu(query0);
  const { warehouses, wh, meta, rows, totals, page, pages } = res;
  const allRowsCount = res.spus;
  const query = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]).toString();
  const href = (over: Record<string, string | null>) => {
    const p = new URLSearchParams(query);
    for (const [k, v] of Object.entries(over)) { if (v === null || v === "") p.delete(k); else p.set(k, v); }
    if (!("page" in over)) p.delete("page");
    const s = p.toString();
    return `/spu${s ? `?${s}` : ""}`;
  };

  // Thẻ thống kê: theo kho · nhóm hàng · tìm kiếm; danh sách SPU và phân loại theo tồn luôn toàn công ty (lọc team chỉ đổi SL bán / video của team) — tính trong lib/spu-query.ts
  const cTotal = res.cards.active, cStock = res.cards.instock, cSlow = res.cards.slow, cBad = res.cards.bad, cHot = res.cards.hot, cNormal = res.cards.normal;

  // Xu hướng cạnh thẻ: lịch sử số SPU toàn công ty theo ngày; không lọc kho / nhóm / tìm kiếm thì cũng ghi số hôm nay (và dùng số trực tiếp làm điểm cuối)
  const unfiltered = !wh && !group && !words.length;
  const live: SpuStats = { active: cTotal.all, inStock: cStock.all, hot: cHot.all, normal: cNormal.all, slow: cSlow.all, bad: cBad.all };
  if (unfiltered && allRowsCount) after(() => recordSpuStats(live));
  const series = (k: SpuStatKey) => {
    const pts = history.filter((h) => !unfiltered || h.day !== todayVN()).map((h) => ({ day: h.day, v: h[k] }));
    if (unfiltered) pts.push({ day: todayVN(), v: live[k] });
    return pts;
  };
  const spark = (k: SpuStatKey, goodWhen: "up" | "down" | "neutral" = "up") => <CountSpark points={series(k)} goodWhen={goodWhen} />;

  // Sang trang Bài đăng: lọc sẵn theo SPU, chỉ video, giữ khoảng ngày và team đang xem
  const postsHref = (code: string, dt: string | null = null, dv: string = "all") => {
    const p = new URLSearchParams({ spu: code, kind: "video", range: f.range, sort: "views" });
    if (dv !== "all") p.set("minv", dv);   // cùng lựa chọn lượt xem với ngăn video
    if (f.range === "custom") { p.set("from", f.from); p.set("to", f.to); }
    const drawerTeam = dt ? teamList.find((t) => t.name === dt)?.id : null;   // team chọn trong ngăn → lọc team ở trang Bài đăng (cùng ưu tiên hơn team đang lọc ở trang này)
    if (drawerTeam) p.set("team", drawerTeam); else if (f.teams.length) p.set("team", f.teams.join(","));
    return `/posts?${p}`;
  };
  // Ngăn video mặc định lọc đúng team đang chọn ở trang (chọn "Tất cả" trong ngăn thì ghi dt=all) để số video / số team khớp với bảng
  const defaultTeam = teamNames.length === 1 ? teamNames[0] : null;
  const openView = spuOpen ? await resolveOpenView(spuOpen, query0, res) : null;   // ngăn video: tìm trong cả phạm vi đang lọc, không chỉ trang hiện tại

  const th = "sticky top-0 z-10 whitespace-nowrap bg-grid px-2 py-2.5 text-left text-xs font-semibold text-ink-1";   // tiêu đề bảng dính mép trên màn hình khi cuộn (cần khung bảng không phải vùng cuộn, xem bên dưới)
  const sortTh = (k: SortKey, label: string, info?: string, align = "right") => {
    const on = sort === k;
    return (
      <th className={`${th} ${align === "right" ? "text-right" : ""}`} aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"} title={info}>
        <Link href={href({ sort: k, dir: on && dir === "desc" ? "asc" : "desc" })} className={`inline-flex items-center gap-1 hover:text-accent ${on ? "text-accent" : ""}`}>
          {label}<span className="text-[10px]">{on ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
        </Link>
      </th>
    );
  };
  const plainTh = (label: string, info: string) => <th className={th} title={info}>{label}</th>;   // chú thích hiện khi rê chuột vào tiêu đề cột (không cần biểu tượng ⓘ)
  // Chú thích tiêu đề cột (rê chuột vào tiêu đề để xem) — viết theo đúng công thức trong lib/spu-data.ts, lib/spu-tracking.ts (viewOf, actionOf, saleFlags) và các file nhập; số ngưỡng lấy từ cài đặt hiện hành (R)
  const TIP = {
    code: "Mã sản phẩm, lấy từ phần đầu của SKU Sapo (B0049-50-S-WH → B0049). “N mã con” là số SKU (cỡ, màu…) của mã này. Mã cũ đã đổi sang mã mới thì được gộp vào mã mới.",
    name: "Tên lấy từ file Sapo đã nhập; dòng nhỏ bên dưới là nhóm hàng (nhẫn, dây chuyền…). Bấm ảnh để xem ảnh lớn.",
    stock: "Số hàng đang còn trong kho (file tồn kho Sapo đã nhập). Chọn kho ở bộ lọc để xem riêng từng kho; để “Mọi kho” thì cộng tất cả.",
    available: "Số có thể bán ngay = tồn kho trừ hàng đã có đơn giữ. Có thể âm khi bán vượt tồn. “—” là file tồn kho chưa có cột này.",
    incoming: "Số hàng đã đặt nhưng chưa về kho (cột “Đang về” của file tồn kho Sapo).",
    age: "Hàng tồn đã nằm kho bao nhiêu ngày, tính từ các lô nhập kho gần nhất (bình quân theo số lượng). Dấu “≥” = một phần tồn nhập trước ngày đầu của file nhập hàng nên thực tế còn lâu hơn.",
    sold: `Số sản phẩm bán trong ${days} ngày của kỳ đang lọc (file đơn hàng đã nhập; không tính quà tặng giá 0 và đơn huỷ, không trừ hàng hoàn). Lọc Team thì chỉ tính đơn của team đó. Phân loại: chậm dưới ${R.sales.slowBelow}, thường dưới ${R.sales.normalBelow}, chạy từ ${R.sales.normalBelow} trở lên (số bán 30 ngày toàn công ty).`,
    videos: "Số video / reel gắn mã này đăng trong kỳ đang lọc. Một bài gắn nhiều SKU của cùng mã chỉ tính 1. Bấm số để xem danh sách video.",
    teams: "Số team đã đăng video cho mã này (trong 360 ngày gần nhất, không theo kỳ lọc). Chỉ hiện khi mã có video trong kỳ. Bấm số để xem theo team.",
    views: "Lượt xem TĂNG THÊM trong kỳ đang lọc của MỌI video gắn mã này (không chỉ video đăng trong kỳ): lượt xem cuối kỳ trừ đầu kỳ theo mốc lượt xem hằng ngày; video đăng trong kỳ tính từ 0. Lọc Team thì chỉ tính video của team đó. Mốc chỉ có từ 09/10/2026 nên kỳ lọc lùi xa hơn chỉ tính phần từ ngày đó. “—” = chưa có video, hoặc chưa chạy migration 101.",
    views3: "Lượt xem TĂNG THÊM trong 3 ngày qua của MỌI video gắn mã này, không phụ thuộc kỳ lọc (lượt xem hiện tại trừ lượt xem 3 ngày trước; video mới đăng trong 3 ngày tính từ 0). Lọc Team thì chỉ tính video của team đó. Chỉ tính được cho video được theo dõi hằng ngày (mới đăng / đang chạy). “—” = chưa có video, hoặc chưa làm mới bảng tổng hợp / chưa chạy migration 101.",
    status: `Win Traffic: lượt xem tăng thêm từ ${R.win.traffic.views.toLocaleString("vi-VN")} trong ${R.win.traffic.days} ngày gần nhất. Win Đơn hàng: bán từ ${R.win.order.qty} sản phẩm trong ${R.win.order.days} ngày gần nhất. Ngôi sao: đạt cả hai. Tính theo ngày gần nhất, không phụ thuộc kỳ lọc; ngưỡng chỉnh ở trang KPI.`,
    action: `Gợi ý xử lý, xét lần lượt: bán tốt mà sắp hết hàng → Đẩy mạnh SX · Ngôi sao / Win Đơn hàng → Đẩy mạnh traffic · Win Traffic → Tối ưu chuyển đổi · tồn xấu → Ưu tiên xử lý tồn · còn nhiều hàng mà ít video → Cần lên video · bán chậm → Theo dõi. Chỉ để tham khảo.`,
  } as const;
  const none = <span className="text-ink-muted" title="Chưa có dữ liệu">—</span>;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Theo dõi hiệu quả SPU</h1>
          <p className="text-sm text-ink-2">Tồn kho, video, lượt xem và lượng bán của từng SPU · {fmtDate(f.from)} – {fmtDate(f.to)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(user.role === "admin" || user.role === "rnd") && <><InventoryImport /><SalesImport /></>}
        </div>
      </header>

      {allRowsCount === 0 && (
        <div className="rounded-lg border border-dashed border-line bg-surface p-5 text-sm text-ink-2">
          Chưa có dữ liệu tồn kho. Bấm <b>Nhập tồn kho</b> và chọn file Sapo “Quản lý kho phiên bản sản phẩm” (cần chạy migration 038–043 trong Supabase); số bán lấy từ Sapo đã đồng bộ hoặc file đơn hàng qua nút <b>Nhập số bán</b>.
        </div>
      )}

      {/* ① Thẻ thống kê — theo bộ lọc kho / nhóm hàng / tìm kiếm; phân loại theo tồn toàn công ty, lọc team chỉ đổi số video / SL bán của team */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Card label="SPU Active" spark={spark("active", "neutral")} value={fmtInt(cTotal.all)} info="Gồm mọi SPU còn tồn kho, cộng SPU đã hết hàng nhưng có đơn trong 30 ngày gần nhất. Bảng bên dưới chỉ liệt kê nhóm này." sub={<><b className="text-ink-1">{fmtInt(cTotal.vids)}</b> video / <b className="text-ink-1">{fmtInt(cTotal.video)}</b> SPU</>} />
        <Card label="SPU còn hàng" spark={spark("inStock", "neutral")} info="SPU còn tồn kho (theo kho đang chọn; để “Mọi kho” thì cộng tất cả kho)." value={fmtInt(cStock.all)} tone="text-good" sub={<><b className="text-ink-1">{fmtInt(cStock.vids)}</b> video / <b className="text-ink-1">{fmtInt(cStock.video)}</b> SPU</>} />
        <Card label="SPU bán chạy" spark={spark("hot", "up")} info={`Bán từ ${R.sales.normalBelow} sản phẩm trở lên trong 30 ngày gần nhất (tính cả SPU đã hết hàng nhưng vẫn bán). Tính toàn công ty. Ngưỡng chỉnh ở trang KPI.`} value={fmtInt(cHot.all)} tone="text-[var(--star)]"
          sub={<><b className="text-ink-1">{fmtInt(cHot.vids)}</b> video / <b className="text-ink-1">{fmtInt(cHot.video)}</b> SPU</>} />
        <Card label="SPU bán thường" spark={spark("normal", "neutral")} info={`Bán từ ${R.sales.slowBelow} đến dưới ${R.sales.normalBelow} sản phẩm trong 30 ngày gần nhất. Tính toàn công ty. Ngưỡng chỉnh ở trang KPI.`} value={fmtInt(cNormal.all)} tone="text-ink-1" sub={<><b className="text-ink-1">{fmtInt(cNormal.vids)}</b> video / <b className="text-ink-1">{fmtInt(cNormal.video)}</b> SPU</>} />
        <Card label="SPU bán chậm" spark={spark("slow", "down")} info={`Bán từ 1 đến dưới ${R.sales.slowBelow} sản phẩm trong 30 ngày gần nhất. Tính toàn công ty. Ngưỡng chỉnh ở trang KPI.`} value={fmtInt(cSlow.all)} tone="text-warn-ink" sub={<><b className="text-ink-1">{fmtInt(cSlow.vids)}</b> video / <b className="text-ink-1">{fmtInt(cSlow.video)}</b> SPU</>} />
        <Card label="SPU tồn xấu" spark={spark("bad", "down")} info="Còn hàng nhưng 30 ngày gần nhất không bán được sản phẩm nào (không tính quà tặng và đơn huỷ)." value={fmtInt(cBad.all)} tone="text-bad" sub={<><b className="text-ink-1">{fmtInt(cBad.vids)}</b> video / <b className="text-ink-1">{fmtInt(cBad.video)}</b> SPU</>} />
      </div>

      {/* Cảnh báo dữ liệu nhập từ file đã quá cũ (tồn kho, đơn hàng: nhịp mỗi ngày; đơn nhập hàng: mỗi tuần) */}
      {(() => {
        const ago = (n: number | null) => (n === 1 ? "hôm qua" : `${n} ngày trước`);
        const msgs = [
          fresh.stock.status === "warn" ? `Tồn kho nhập lần cuối ${ago(fresh.stock.ageDays)} — nên nhập lại hôm nay (nút “Nhập tồn kho”).` : fresh.stock.status === "never" ? "Chưa nhập tồn kho." : null,
          fresh.orders.status === "warn" ? `Đơn hàng nhập lần cuối ${ago(fresh.orders.ageDays)}, số bán đang thiếu các ngày sau đó — nên nhập lại hôm nay (nút “Nhập số bán”).` : fresh.orders.status === "never" ? "Chưa nhập file đơn hàng." : null,
          fresh.receipts.status === "warn" ? `Đơn nhập hàng cập nhật lần cuối ${ago(fresh.receipts.ageDays)} — hàng mới về có thể bị tính là tồn cũ (nhập ở Cài đặt → Đơn nhập hàng).` : fresh.receipts.status === "never" ? "Chưa nhập file đơn nhập hàng nên chưa có thời gian tồn (Cài đặt → Đơn nhập hàng)." : null,
        ].filter(Boolean) as string[];
        return msgs.length ? (
          <div role="alert" className="flex flex-col gap-0.5 rounded-xl border border-warn-ink/30 bg-warn-bg px-4 py-2.5 text-sm text-warn-ink">
            {msgs.map((m) => <div key={m}>⚠ {m}</div>)}
          </div>
        ) : null;
      })()}


      {!winFlags.meta.trafficReady && (
        <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-ink">Chưa tính được Win Traffic: cần chạy migration 062 trong Supabase (lượt xem / bình luận tăng thêm theo ngày).</p>
      )}

      {market !== "all" && (res.source === "legacy" || res.marketApplied === false) && (
        <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-ink">Bộ lọc <b>Thị trường</b> chưa áp dụng được: cần chạy migration 102 trong Supabase (hoặc bảng tổng hợp SQL đang lỗi) — bảng đang hiện số của <b>tất cả</b> thị trường.</p>
      )}

      {teamNames.length > 0 && meta.teamQty === 0 && meta.salesSource !== "none" && (
        <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-ink">
          Chưa có số bán theo team: đơn hàng đã nhập chưa mang tag kênh được gán team. Chạy migration 045 trong Supabase rồi bấm <b>Nhập số bán</b> lại với file đơn hàng (file cần có cột Tags) để bảng tính được số bán của team.
        </p>
      )}

      {/* ② Bộ lọc: thời gian · team · kho · nhóm hàng · tìm kiếm · trạng thái (kết hợp được với nhau) */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <FilterBar filters={f} teams={teamList} />
          <ParamSelect label="Thị trường" param="market" value={market} defaultValue="vn" query={query} options={[...MARKET_OPTIONS]} />
          <ParamSelect label="Kho" param="wh" value={wh} defaultValue="" query={query} options={[{ value: "", label: "Mọi kho" }, ...warehouses.map((w) => ({ value: w, label: w }))]} />
          <ParamSelect label="Nhóm hàng" param="group" value={group} defaultValue="" query={query} options={[{ value: "", label: "Mọi nhóm hàng" }, ...GROUPS.map((g) => ({ value: g, label: g }))]} />
          <ParamSearch value={q} query={query} placeholder="Tìm mã SPU, tên sản phẩm…" className="min-w-64 flex-1" />
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface p-1 text-sm">
          {STATUS_FILTERS.map((s) => {
            const n = res.statusCounts[s.id];
            if (n === undefined) return null;   // đường SQL chưa có bộ lọc này (chưa chạy migration 095): ẩn tab
            return (
              <Link key={s.id} href={href({ status: s.id === "all" ? null : s.id })}
                className={`rounded-md px-3 py-1.5 ${status === s.id ? "bg-accent font-medium text-white" : "text-ink-2 hover:bg-grid"}`}>
                {s.label} <span className={`tabular-nums ${status === s.id ? "opacity-80" : "text-ink-muted"}`}>{fmtInt(n)}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ③ Bảng theo SPU */}
      {/* Màn hình rộng (≥1500px): bảng đã gọn vừa khung nên dùng overflow-x-clip để tiêu đề cột dính mép trên MÀN HÌNH khi cuộn trang (khung overflow-auto sẽ giữ tiêu đề trong khung). Màn hình hẹp: khung cuộn ngang bình thường. */}
      <ZoomViewer>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface min-[1500px]:overflow-x-clip">
        <table className="w-full min-w-[1240px] table-fixed text-[11.5px]">
          {/* Độ rộng cột cố định theo % để bảng luôn vừa khung ở màn hình rộng (không cần thanh cuộn ngang) */}
          <colgroup><col style={{ width: "6.5%" }} /><col style={{ width: "17%" }} /><col style={{ width: "5%" }} /><col style={{ width: "5.5%" }} /><col style={{ width: "6%" }} /><col style={{ width: "6%" }} /><col style={{ width: "6%" }} /><col style={{ width: "6%" }} /><col style={{ width: "7.5%" }} /><col style={{ width: "7%" }} /><col style={{ width: "8%" }} /><col style={{ width: "11%" }} /><col style={{ width: "8.5%" }} /></colgroup>
          <thead className="border-b border-line bg-grid">
            <tr>
              {plainTh("Mã SPU", TIP.code)}{plainTh("Tên sản phẩm", TIP.name)}
              {sortTh("stock", "Tồn kho", TIP.stock)}{sortTh("available", "Có thể bán", TIP.available)}{sortTh("incoming", "Đang về", TIP.incoming)}{sortTh("sold", `Bán ${days}N`, TIP.sold)}{sortTh("videos", "Video đăng", TIP.videos)}{sortTh("teams", "SL Team đăng", TIP.teams)}{sortTh("views", "View", TIP.views)}{sortTh("views3", "View 3N", TIP.views3)}
              {plainTh("Trạng thái", TIP.status)}{plainTh("Gợi ý hành động", TIP.action)}{sortTh("age", "Thời gian tồn", TIP.age)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((v) => {
              const r = v.row, f = v.flags, a = v.action ? ACTION_LABEL[v.action] : null;
              return (
                <tr key={r.code} className="hover:bg-grid/40">
                  <td className="px-2 py-2 align-middle"><div className="font-mono font-semibold">{r.code}</div><div className="whitespace-nowrap text-2xs text-ink-muted">{r.variants} mã con</div></td>
                  <td className="px-2 py-2 align-middle">
                    <div className="flex items-center gap-2.5">
                      {r.image
                        ? <ZoomThumb src={r.image} alt={r.name} />
                        : <span className="flex h-10 w-10 flex-none items-center justify-center rounded-md bg-grid text-lg" aria-hidden>{GROUP_ICON[r.group]}</span>}
                      <div className="min-w-0">
                        <div className="max-w-[300px] truncate font-semibold" title={r.name}>{r.name}</div>
                        <div className="text-2xs text-ink-muted">{r.footage ? `${fmtInt(r.footage)} clip source` : r.group}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right align-middle"><span className={`font-semibold tabular-nums ${f.inStock ? "" : "text-ink-muted"}`}>{fmtInt(v.stock)}</span></td>
                  <td className="px-2 py-2 text-right align-middle tabular-nums" title="Tồn kho trừ hàng đang giữ cho đơn chưa xuất (Sapo cho bán âm)">{v.available === null ? none : <span className={`font-semibold ${v.available < 0 ? "text-bad" : v.available === 0 ? "text-ink-muted" : ""}`}>{fmtInt(v.available)}</span>}</td>
                  <td className="px-2 py-2 text-right align-middle tabular-nums">{r.incoming ? <span className="font-semibold text-accent" title="Đã đặt, chưa nhập kho">+{fmtInt(r.incoming)}</span> : none}</td>
                  <td className="px-2 py-2 text-right align-middle font-semibold tabular-nums">{v.sold === null ? none : fmtInt(v.sold)}</td>
                  <td className="px-2 py-2 text-right align-middle tabular-nums">
                    {v.videos > 0
                      ? <Link href={href({ spu: r.code, mode: null })} scroll={false} prefetch={false} className="font-semibold text-accent hover:underline" title="Xem danh sách video đã đăng của mã SPU này">{fmtInt(v.videos)}</Link>
                      : <span className="text-ink-muted" title="Chưa có video gắn mã SPU">0</span>}
                  </td>
                  <td className="px-2 py-2 text-right align-middle tabular-nums">
                    {v.videos > 0 && r.teams.length > 0
                      ? <Link href={href({ spu: r.code, mode: "team" })} scroll={false} prefetch={false} className="font-semibold text-accent hover:underline" title={`${r.teams.join(", ")} — bấm để xem video theo team`}>{r.teams.length}</Link>
                      : <span className="text-ink-muted" title="Chưa team nào đăng video cho SPU này">0</span>}
                  </td>
                  <td className="px-2 py-2 text-right align-middle tabular-nums">{v.views === null ? none : <b>{fmtInt(v.views)}</b>}</td>
                  <td className="px-2 py-2 text-right align-middle tabular-nums">{v.views3 == null ? none : v.views3 > 0 ? <b className="text-good" title="Lượt xem tăng thêm trong 3 ngày qua">+{fmtInt(v.views3)}</b> : <span className="text-ink-muted" title="Không tăng trong 3 ngày qua">0</span>}</td>
                  <td className="px-2 py-2 align-middle">
                    {/* Trạng thái Win theo quy tắc biên bản họp (trang KPI): Ngôi sao > Win Đơn hàng > Win Traffic (tình trạng tồn xem ở các cột Tồn kho / Thời gian tồn / Gợi ý) */}
                    {f.star ? <Chip cls="bg-[color-mix(in_srgb,var(--star)_18%,transparent)] text-[var(--star)]" title={`Đạt cả Win Traffic và Win Đơn hàng (quy tắc ở trang KPI)`}>★ Ngôi sao</Chip>
                      : f.win ? <Chip cls="bg-good/15 text-good" title={`Bán ≥ ${R.win.order.qty} sản phẩm trong ${R.win.order.days} ngày gần nhất`}>Win Đơn hàng</Chip>
                      : f.winTraffic ? <Chip cls="bg-[#2a78d6]/15 text-[#2a78d6]" title={`Lượt xem tăng thêm ≥ ${R.win.traffic.views.toLocaleString("vi-VN")}${R.win.traffic.comments > 0 ? ` và bình luận tăng thêm ≥ ${R.win.traffic.comments}` : ""} trong ${R.win.traffic.days} ngày gần nhất`}>Win Traffic</Chip>
                      : <span className="text-ink-muted">—</span>}
                  </td>
                  <td className="px-2 py-2 align-middle">
                    {a ? <Chip cls={ACTION_CLS[v.action!]} title={a.hint}>{a.label}</Chip> : <span className="text-ink-muted">—</span>}
                  </td>
                  <td className={`whitespace-nowrap px-2 py-2 text-right align-middle tabular-nums ${f.bad ? "font-semibold text-bad" : f.slow ? "font-semibold text-warn-ink" : "text-ink-2"}`}>{f.inStock && r.ageDays !== null ? <span title={r.ageApprox ? "Có phần tồn nhập trước ngày đầu của file đơn nhập hàng nên tuổi tồn thực tế còn lớn hơn" : undefined}>{r.ageApprox ? "≥ " : ""}{fmtInt(r.ageDays)} ngày</span> : none}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={13} className="p-10 text-center text-ink-muted">Không có SPU nào khớp bộ lọc.</td></tr>}
          </tbody>
          {res.total > 0 && (
            <tfoot className="border-t border-line bg-grid/60 text-[11.5px] font-semibold">
              <tr>
                <td className="px-2 py-1.5" colSpan={2}>Tổng · {fmtInt(res.total)} SPU</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(totals.stock)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{rows.some((v) => v.available !== null) ? fmtInt(totals.available) : none}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{totals.incoming ? `+${fmtInt(totals.incoming)}` : none}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(totals.sold)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(totals.videos)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums" title="Số team khác nhau đã đăng video">{fmtInt(totals.teams)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtInt(totals.views)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums" title="Tổng lượt xem tăng 3 ngày của các SPU đang lọc (mọi video gắn mã, không theo kỳ)">{totals.views3 == null ? none : totals.views3 > 0 ? `+${fmtInt(totals.views3)}` : "0"}</td>
                <td className="px-2 py-1.5" colSpan={2} />
                <td className="px-2 py-1.5 text-right text-ink-muted">—</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      </ZoomViewer>

      {/* Dải dưới bảng gọn một khối: khoảng đang xem + nguồn số liệu (trái) · phân trang (phải) */}
      <div className="-mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-0 text-[11px] leading-5 text-ink-muted" aria-label="Phân trang và nguồn số liệu">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="tabular-nums text-ink-2">{res.total ? `${fmtInt((page - 1) * PAGE_SIZE + 1)}–${fmtInt(Math.min(page * PAGE_SIZE, res.total))} / ${fmtInt(res.total)} SPU` : "0 SPU"}</span><span aria-hidden>·</span>
<span className="min-w-0" title={`Tồn kho lấy từ file Sapo đã nhập; số bán 30 ngày lấy từ file đơn hàng đã nhập (hoặc số Sapo đồng bộ nếu chưa nhập file). Thời điểm cuối là lúc bảng tổng hợp được tính.${winFlags.meta.trafficReady && winFlags.meta.unknownVideos > 0 ? ` Win Traffic: ${fmtInt(winFlags.meta.videos)} video, ${fmtInt(winFlags.meta.unknownVideos)} video chưa đủ dữ liệu (chưa có ảnh chụp lượt xem trước ngày đó nên chưa tính).` : ""}`}>
        Tồn {fmtInt(allRowsCount)} mã · Bán 30 ngày: {meta.salesSource === "orders" ? <>{fmtInt(meta.salesQty)} SP{meta.salesFrom && meta.salesTo ? ` (${fmtDate(meta.salesFrom)} → ${fmtDate(meta.salesTo)})` : ""}</>
          : meta.salesSource === "sapo" ? <>{fmtInt(meta.salesQty)} SP (Sapo)</> : <>chưa có</>}
        {res.source === "sql" && res.refreshedAt && <> · cập nhật {new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(res.refreshedAt))}</>}
        {winFlags.meta.trafficReady && winFlags.meta.unknownVideos > 0 && <> · <span className="text-warn-ink">{fmtInt(winFlags.meta.unknownVideos)} video thiếu dữ liệu Win</span></>}
      </span>
        </div>
        <nav className="flex items-center gap-1 text-xs" aria-label="Phân trang">
        {pages > 1 && (
          <span className="flex items-center gap-1">
            {page > 1 && <Link href={href({ page: "1" })} className="rounded px-1.5 py-0.5 text-ink-2 hover:bg-grid">« Đầu</Link>}
            {page > 1 && <Link href={href({ page: String(page - 1) })} className="rounded border border-line px-2 py-0.5 hover:bg-grid">‹ Trước</Link>}
            <span className="px-2 tabular-nums text-ink-2">Trang <b className="text-ink-1">{page}</b> / {fmtInt(pages)}</span>
            {page < pages && <Link href={href({ page: String(page + 1) })} className="rounded border border-line px-2 py-0.5 hover:bg-grid">Sau ›</Link>}
            {page < pages && <Link href={href({ page: String(pages) })} className="rounded px-1.5 py-0.5 text-ink-2 hover:bg-grid">Cuối »</Link>}
          </span>
        )}
        </nav>
      </div>

      {openView && (
        <SpuDrawer v={openView} videoWin={R.video} days={days} endAge={endAge} today={todayVN()} mode={mode} icon={GROUP_ICON[openView.row.group] ?? "💍"}
          closeHref={href({ spu: null, mode: null, dt: null, dv: null })} team={dt === "all" ? null : dt || defaultTeam} defaultTeam={defaultTeam} view={dv}
          postsHrefs={Object.fromEntries([null, ...new Set(openView.row.vids.map((x) => x.team ?? "Chưa gán team"))].flatMap((t) => VIEW_FILTERS.map(([k]) => [`${t ?? ""}|${k}`, postsHref(openView.row.code, t, k)])))} />
      )}

    </div>
  );
}
