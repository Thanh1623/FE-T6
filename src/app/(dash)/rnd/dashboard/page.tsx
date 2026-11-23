import { loadSpuRules, loadVideoWinRules } from "@/lib/spu-rules";
import { SHOW_FINANCE } from "@/lib/features";
import Link from "next/link";
import { canSeeProfit, isRndEditor, requireUser } from "@/lib/session";
import { winNotices } from "@/lib/rnd-dashboard";
import { rndDashboardCached, testCostReportCached } from "@/lib/rnd-dash-cache";
import TestResults from "./TestResults";
import StatCard from "./StatCard";
import WinBanner from "./WinBanner";
import { PCards, SCards } from "./FlowCards";
import VideoByCategory from "./VideoByCategory";
import { TeamBreakdownTable } from "./TeamVideoTables";
import PushTable from "./PushTable";
import PotentialLists from "./PotentialLists";
import SpuAlerts from "./SpuAlerts";
import { loadFlowEvals } from "./flow-evals";
import TestCostSection from "./TestCostSection";
import RndTrafficTable from "./RndTrafficTable";
import { rndTrafficCached } from "@/lib/rnd-channel-traffic";
import { loadDashSpu } from "@/lib/spu-dash";
import { loadLaunchWinFlagsByMarket, loadRollingWinByMarket } from "@/lib/spu-winflags";
import { fmtRule } from "@/lib/kpi-constants";
import { spuWinStats } from "@/lib/spu-win";
import DashboardHero from "./DashboardHero";
import FilterBar from "@/components/FilterBar";
import ParamSelect from "@/components/ParamSelect";
import { MARKET_OPTIONS, loadChannelMarkets, parseMarket } from "@/lib/channel-market";
import { getTeams } from "@/lib/pipeline";
import { limitAccounts, scopedPageIds, type TeamScope } from "@/lib/team-scope";
import Info from "@/components/InfoTip";
import { CHANNELS, daysBetween, todayVN, fmtInt, fmtMoneyShort, getAccounts, limitByTeams, parseFilters } from "@/lib/data";


// Dashboard R&D — theo LỨA mẫu sưu tầm trong kỳ (mọi khối cùng mẫu số)
const pct = (v: number | null, digits = 0) => (v === null ? "—" : `${(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: digits })}%`);

// Chú thích ẩn sau dấu ⓘ — rê chuột để xem (trang gọn, không dòng chữ xám dài)

function Card({ title, hint, children, className = "" }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-4 shadow-sm ${className}`}>
      <h2 className="mb-3 font-semibold">{title}{hint && <Info text={hint} />}</h2>
      {children}
    </section>
  );
}

// Mục có tiêu đề + mô tả ngắn: mỗi hàng chỉ số thuộc về 1 mục để biết đang xem nhóm chỉ số nào
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 border-b border-line pb-1.5">
        <h2 className="text-lg font-bold">{title}{hint && <Info text={hint} />}</h2>
      </div>
      {children}
    </section>
  );
}

// sub = dòng số liệu phụ (hiện); info = lời giải thích cố định (ẩn sau ⓘ)
function Kpi({ label, value, sub, tone, info }: { label: string; value: string; sub?: string; tone?: string; info?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2">
      <div className="text-xs text-ink-2">{label}{info && <Info text={info} />}</div>
      <div className="text-xl font-semibold tabular" style={tone ? { color: `var(${tone})` } : undefined}>{value}</div>
      {sub && <div className="text-2xs text-ink-muted">{sub}</div>}
    </div>
  );
}

type DimRow = { name: string; total: number; approved: number; video: number; win: number; res?: unknown };

// Biểu đồ tròn (vành khuyên) tỷ trọng số mẫu + chú giải dạng bảng (số, %, tỷ lệ duyệt / lên video / Win).
// Mẫu chưa điền = lát xám "Chưa điền". Quá 7 nhóm thì gộp phần nhỏ vào "Khác".
function DimPie({ rows, missing }: { rows: DimRow[]; missing: number }) {
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  const head = sorted.slice(0, 7);
  const rest = sorted.slice(7);
  const slices: (DimRow & { color: string })[] = head.map((r, i) => ({ ...r, color: `var(--series-${i + 1})` }));
  if (rest.length) slices.push({
    name: `Khác (${rest.length})`, color: "var(--series-8)",
    ...rest.reduce((t, r) => ({ total: t.total + r.total, approved: t.approved + r.approved, video: t.video + r.video, win: t.win + r.win }), { total: 0, approved: 0, video: 0, win: 0 }),
  });
  if (missing) slices.push({ name: "Chưa điền", total: missing, approved: 0, video: 0, win: 0, color: "var(--grid)" });
  const sum = slices.reduce((t, x) => t + x.total, 0);
  if (!sum) return <p className="text-xs text-ink-muted">Chưa có dữ liệu.</p>;

  // Vẽ vành khuyên bằng stroke-dasharray trên các vòng tròn chồng nhau (r = 15.915 → chu vi 100)
  const lens = slices.map((x) => (x.total / sum) * 100);
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((t, v) => t + v, 0));
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 42 42" className="h-28 w-28 flex-none -rotate-90" role="img" aria-label="Tỷ trọng số mẫu">
        {slices.map((x, i) => {
          const len = lens[i];
          return (
            <circle key={x.name} cx="21" cy="21" r="15.915" fill="none" stroke={x.color} strokeWidth="6"
              strokeDasharray={`${Math.max(0, len - 0.6)} ${100 - Math.max(0, len - 0.6)}`} strokeDashoffset={-starts[i]}>
              <title>{`${x.name}: ${x.total} mẫu (${Math.round((x.total / sum) * 100)}%)`}</title>
            </circle>
          );
        })}
        <text x="21" y="20" transform="rotate(90 21 21)" textAnchor="middle" dominantBaseline="central" className="fill-[var(--ink-1)] text-[8px] font-bold">{sum}</text>
        <text x="21" y="26.5" transform="rotate(90 21 21)" textAnchor="middle" dominantBaseline="central" className="fill-[var(--ink-muted)] text-[2.6px]">Tổng mẫu</text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm tabular">
        {slices.map((x) => (
          <li key={x.name} className={`flex items-center gap-2 ${x.name === "Chưa điền" ? "text-warn-ink" : ""}`}
            title={x.name === "Chưa điền" ? "Bổ sung ở bảng Sưu tầm" : `${x.total} mẫu · duyệt ${pct(x.approved / x.total)} · lên video ${pct(x.video / x.total)} · Win ${x.win}`}>
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: x.color }} />
            <span className="min-w-0 flex-1 truncate">{x.name}</span>
            <span className="flex-none"><b>{x.total}</b> <span className="text-ink-muted">({Math.round((x.total / sum) * 100)}%)</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function RndDashboardPage({ searchParams }: PageProps<"/rnd/dashboard">) {
  const user = await requireUser();   // mọi vai trò xem được (số tiền ẩn theo quyền trong lib/rnd-dashboard)
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const isMedia = user.role === "media";   // Media: xem Báo cáo đẩy tồn + Báo cáo test mẫu (không có Báo cáo R&D)
  const view = one("view") === "test" ? "test" : one("view") === "rnd" && !isMedia ? "rnd" : "overview";
  const tab = (key: string, href: string, label: string, title: string) => (
    <Link href={href} aria-current={view === key ? "page" : undefined} className={`rounded px-3.5 py-1 text-xs font-semibold transition ${view === key ? "bg-surface text-ink-1 shadow-sm" : "text-ink-2 hover:text-ink-1"}`} title={title}>{label}</Link>
  );
  const viewTabs = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-0.5 rounded-md bg-grid p-0.5">
        {tab("overview", "/rnd/dashboard", "Báo cáo đẩy tồn", "Quản lý sản phẩm toàn công ty (S0–S4), cơ cấu video, thống kê video theo team và cảnh báo sản phẩm / video tiềm năng của cả hai luồng")}
        {!isMedia && tab("rnd", "/rnd/dashboard?view=rnd", "Báo cáo R&D", "Mẫu đã qua ít nhất 1 bước quy trình R&D: sưu tầm → duyệt → 3D → mẫu → media → video → Win")}
        {tab("test", "/rnd/dashboard?view=test", "Báo cáo test mẫu", "Chỉ mã SPU test lên video gắn hashtag; WIN / WIN TRAFFIC / FAIL theo KPI")}
      </div>
      <Link href="/rnd/test-codes" className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink-2 shadow-sm hover:border-accent hover:text-accent" title="Cấp mã SPU test không trùng cho Media">🏷️ Tạo mã SPU test</Link>
    </div>
  );
  // Media: xem Báo cáo đẩy tồn (mặc định) và Báo cáo test mẫu (mã SPU test, lọc được theo team). Quản lý, R&D, Thiết kế 3D: thêm Báo cáo R&D
  if (isMedia && view === "test") {
    return (
      <div className="space-y-3">
        <DashboardHero name={user.full_name} />
        <TestResults sp={sp} user={user} lead={viewTabs} />
      </div>
    );
  }
  const team = one("team") ?? null;
  // Luồng Media: bộ lọc nằm cùng hàng với các tab chế độ xem (bên phải), giống luồng R&D; banner Win nằm dưới hàng đó
  if (one("view") === "test") return <div className="space-y-3"><DashboardHero name={user.full_name} /><TestResults sp={sp} user={user} lead={viewTabs} banner={<WinBanner {...await winNotices(team)} />} /></div>;
  // Bộ lọc dùng chung (FilterBar): khoảng ngày · team · Page · kênh bán — ghi vào URL
  const f = parseFilters(sp);
  const market = parseMarket(one("market"));   // Thị trường: Tất cả / Trong nước (mặc định) / Nước ngoài — lọc theo KÊNH (sales.channel_market, migration 102)
  // Các khối không phụ thuộc nhau bắt đầu tải NGAY (song song), thay vì chờ từng bước — mỗi bước nối đuôi tốn thêm ~1 lượt hỏi database
  const canSeeCost = isRndEditor(user) || canSeeProfit(user) || user.is_team_lead;   // chi phí: cùng quyền xem giá vốn
  const pSpu = loadSpuRules();   // ngưỡng phân loại SPU (số SPU thật đọc qua lib/spu-dash: bảng tổng hợp hoặc tính trực tiếp)
  const isRndView = one("view") === "rnd";
  // Báo cáo R&D và Báo cáo đẩy tồn dùng hai bộ số liệu khác nhau: mỗi chế độ chỉ tải phần của mình (trước đây chế độ nào cũng tải cả hai)
  const pDash = isRndView ? rndDashboardCached(user, { from: f.from, to: f.to, teams: f.teams, market }) : Promise.resolve(null);
  const pCost = isRndView && canSeeCost ? testCostReportCached({ from: f.from, to: f.to, teams: f.teams, market }) : Promise.resolve(null);
  const pVideoWin = loadVideoWinRules();
  const pFlow = isRndView ? loadFlowEvals(f) : Promise.resolve(null);
  const pTraffic = isRndView ? rndTrafficCached(f.from, f.to, market).catch(() => null) : Promise.resolve(null);   // traffic kênh R&D mọi nền tảng; lỗi thì ẩn mục, không làm hỏng cả trang
  // Báo cáo đẩy tồn: MỌI tài khoản xem được số liệu tổng toàn công ty; muốn xem riêng team mình thì tự lọc Team / Page ở bộ lọc (không giới hạn theo team của người xem)
  const scope: TeamScope = { limited: false, teamId: user.team_id, teamName: null, channelIds: [] };
  const [teams, rawAccounts] = await Promise.all([getTeams(true), getAccounts()]);
  const accounts = limitByTeams(limitAccounts(rawAccounts.filter((a) => a.platform === "facebook" || a.platform === "instagram" || a.platform === "tiktok"), scope), f);
  const pageIdsBase = scopedPageIds(f, accounts, scope);   // lọc team thì không bao giờ là "toàn hệ thống"
  // Thị trường: các khối đọc theo Page (thẻ S, video theo team / nhóm hàng…) chỉ giữ kênh thuộc thị trường đang chọn (giao với Page / team đã lọc).
  // Cờ Win Traffic thì chấm RIÊNG từng thị trường rồi hợp lại (lib/spu-winflags: …ByMarket): "Tất cả" = đạt ở ÍT NHẤT MỘT thị trường, không cộng gộp.
  const markets = await loadChannelMarkets();
  const poolIds = rawAccounts.map((a) => a.id);
  const pageIds = market === "all" ? pageIdsBase : (pageIdsBase ?? poolIds).filter((id) => (markets[id] ?? "vn") === market);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]).toString();
  const spuRules = await pSpu;
  const periodDays = Math.max(1, daysBetween(f.from, f.to)), periodEnd = Math.max(0, daysBetween(f.to, todayVN()) - 1);
  const teamNames = teams.filter((t) => f.teams.includes(t.id)).map((t) => t.name);   // video / số bán ghi team theo tên
  // Số liệu SPU của Dashboard (thẻ S0, cơ cấu video, trạng thái tồn kho, cảnh báo) — MỘT lượt gọi: đường nhanh = hàm SQL đọc bảng tổng hợp, đường cũ = tính trực tiếp (lib/spu-dash.ts)
  // Báo cáo đẩy tồn: số liệu SPU và thống kê Win chạy SONG SONG (thống kê Win chỉ chờ trạng thái tồn ở bước cuối). Báo cáo R&D không cần số liệu SPU.
  // QUY TẮC WIN duy nhất (trang KPI, dùng chung với trang Theo dõi đẩy hàng): tính trong kỳ + Page + kênh bán đang lọc, lưu đệm 5 phút
  const videoWinRule = await pVideoWin;
  // Báo cáo R&D: cột "Đánh giá SP" của bảng đẩy hàng dùng cùng cờ Win (cấp SPU) với trang Theo dõi đẩy hàng
  const rndWinP = isRndView ? (codes: string[]) => loadLaunchWinFlagsByMarket({ codes, from: new Date(Date.parse(todayVN()) - 400 * 86_400_000).toISOString().slice(0, 10), to: todayVN(), pageIds: pageIdsBase, poolIds, markets, market, channels: f.channels, rules: spuRules.win }) : null;   // SP R&D mới: theo mốc video đầu tiên từ trước đến nay
  const dashP = isRndView ? null : loadRollingWinByMarket({ pageIds: pageIdsBase, poolIds, markets, market, channels: f.channels, rules: spuRules.win })
    .then((winFlags) => loadDashSpu({ today: todayVN(), days: periodDays, endAge: periodEnd, teams: teamNames, pageIds, rules: spuRules, limit: 8, win: winFlags }));
  const [dashN, dN, win, costReport] = await Promise.all([
    dashP,
    pDash,
    spuWinStats({ from: f.from, to: f.to, teams: f.teams, pageIds, channels: f.channels, winRules: spuRules.win, videoWin: videoWinRule, winFlags: rndWinP ?? undefined, stockInfo: dashP ? dashP.then((x) => ({ stockStatus: x.stockStatus, s1Codes: x.s1Codes })) : undefined }),
    pCost,
  ]);
  // Danh sách SPU của một trạng thái ở trang Theo dõi SPU: giữ NGUYÊN bộ lọc đang áp dụng (kỳ, team, Page, kênh bán, kho, nhóm hàng) — cùng tham số URL với bộ lọc dùng chung
  const spuListHref = (status: string | null) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v !== "" && k !== "view") p.set(k, v);
    if (status) p.set("status", status); else p.delete("status");
    const q = p.toString();
    return `/spu${q ? `?${q}` : ""}`;
  };
  // Bấm số trên thẻ P0–P6 → danh sách mẫu đúng con số đó (giữ kỳ + team đang lọc)
  const milestoneHref = (stage: string, here: boolean) => {
    const p = new URLSearchParams();
    for (const k of ["range", "from", "to", "team"]) { const v = sp[k]; if (typeof v === "string" && v) p.set(k, v); }
    p.set("stage", stage); if (here) p.set("here", "1");
    return `/rnd/milestone?${p}`;
  };
  const monthly = daysBetween(f.from, f.to) >= 28 && daysBetween(f.from, f.to) <= 31;   // đang xem ~1 tháng → so với mục tiêu 10 mẫu / tháng
  const [videoWin, flowN, rndTraffic] = await Promise.all([pVideoWin, pFlow, pTraffic]);
  // Mỗi chế độ chỉ dùng phần số liệu đã tải cho mình (chế độ kia để null và không bao giờ được đọc)
  const dash = dashN!, d = dN!, flow = flowN!;
  return (
    <div className="keep-tbl space-y-3">
      <DashboardHero name={user.full_name} />
      {/* Kiểu trang QLHN: tab chế độ xem, rồi một thẻ lọc gọn (khoảng ngày · team · Page · kênh bán) */}
      {viewTabs}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-line bg-surface px-2.5 py-2 text-xs shadow-sm [&_.h-\[34px\]]:h-8 [&_.h-\[34px\]]:rounded-md [&_.text-sm]:text-xs!"
        title="Thẻ P: mẫu sưu tầm trong kỳ (theo ngày sưu tầm). Thẻ S, video và team: bài đăng trong kỳ. Lọc Page / team chỉ tính Page đó; kênh bán chỉ ảnh hưởng số bán. Thị trường (mặc định Trong nước) lọc theo kênh đăng: thẻ S, Win, video, traffic kênh R&D; thẻ P (mẫu sưu tầm) không theo thị trường.">
        <FilterBar filters={f} teams={teams} accounts={accounts} channels={CHANNELS} />
        <ParamSelect label="Thị trường" param="market" value={market} defaultValue="vn" query={qs} options={[...MARKET_OPTIONS]} />
      </div>

      {!isRndView ? (
        <>
        <Section title="Quản lý sản phẩm toàn công ty (S0 – S4)" hint={`Quy tắc Win theo biên bản họp (chỉnh ở trang KPI, dùng chung với trang Theo dõi đẩy hàng), CUỐN CHIẾU, không phụ thuộc kỳ lọc: Win Traffic = lượt xem tăng thêm ≥ ${spuRules.win.traffic.views.toLocaleString("vi-VN")} và bình luận tăng thêm ≥ ${spuRules.win.traffic.comments} trong ${spuRules.win.traffic.days} ngày gần nhất · Win Đơn hàng = bán ≥ ${spuRules.win.order.qty} sản phẩm trong ${spuRules.win.order.days} ngày gần nhất · Ngôi sao = đạt cả hai. Đánh giá cấp SPU: gộp mọi video gắn mã SPU. S1 = SPU Active có video trong kỳ; S2–S4 = SPU Active đang Win.`}>
          <SCards win={win} s0={dash.s0} s1={dash.s1} winNow={dash.winNow} rules={spuRules.win} linkFor={spuListHref} />
        </Section>
        <Section title="Cơ cấu video đã lên" hint="Video đã đăng trong kỳ theo dòng sản phẩm và theo trạng thái tồn kho của SPU">
          <VideoByCategory cats={dash.videoCats} groups={dash.videoGroups} />
        </Section>
        <Section title="Thống kê video theo team" hint="Video có gắn mã SP trong kỳ, phân theo loại SPU (trạng thái tồn kho · mã test · mã R&D)">
          <details className="group">
            <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1 text-sm font-medium text-accent hover:bg-grid [&::-webkit-details-marker]:hidden">
              <span className="transition group-open:rotate-90" aria-hidden>▸</span>
              <span className="group-open:hidden">Xem bảng thống kê</span><span className="hidden group-open:inline">Ẩn bảng</span>
            </summary>
            <div className="mt-2"><TeamBreakdownTable rows={win.breakdown} /></div>
          </details>
        </Section>
          <Section title="Cảnh báo sản phẩm và video tiềm năng" hint="Tính từ dữ liệu Theo dõi SPU (tồn kho × video × bán, dữ liệu tồn kho mẫu). Bấm tab để xem từng loại cảnh báo, bấm một dòng để mở danh sách video của SPU">
            <SpuAlerts videoWin={videoWin} views={dash.alertViews} vids={dash.vids} />
          </Section>
        </>
      ) : (
        <>
        <Section title="Luồng phát triển sản phẩm mới (P0 – P6)" hint="P0 = mẫu sưu tầm trong kỳ · P1 = mẫu được DUYỆT trong kỳ (kể cả mẫu sưu tầm từ trước) · P2–P6 = trong số mẫu được duyệt trong kỳ, bao nhiêu mẫu đã tới mốc đó (tính tới hiện tại, kể cả mẫu sau đó bị dừng) · dòng nhỏ = số mẫu đang nằm ở bước đó (toàn hệ thống) · bấm số để xem danh sách">
          <PCards stages={d.stageCounts} monthly={monthly} hrefOf={milestoneHref} />
        </Section>
        {rndTraffic && (
          <Section title="Traffic kênh R&D theo nền tảng" hint="Các kênh được đánh dấu Page R&D ở trang Team, trên mọi nền tảng (Facebook, YouTube, TikTok, Instagram). Tính trên các bài ĐĂNG TRONG KỲ, gồm cả bài không gắn mã SPU; lượt xem, bình luận, cảm xúc, chia sẻ là số hiện tại của các bài đó. Không phụ thuộc bộ lọc team / Page.">
            <RndTrafficTable data={rndTraffic} />
          </Section>
        )}
          <Section title="Đề xuất sản phẩm Win và SP Win" hint="Chỉ mẫu của luồng R&D trong kỳ: đề xuất những mẫu chưa Win đủ nhưng dự báo đạt hoặc gần đạt; thống kê các SP đã Win (đạt KPI bán hàng)">
            <PotentialLists list={flow.rnd} spWin videoMode="win" videoWin={videoWin} productTitle="Đề xuất sản phẩm Win" productHint="Mẫu R&D chưa Win đủ nhưng dự báo đạt hoặc gần đạt KPI còn lại — nên đẩy thêm video" videoTitle="Đề xuất video Win" />
          </Section>
        {costReport && (
          <Section title="Chi phí test" hint="Chi phí của các mẫu được DUYỆT (P1) trong kỳ — cùng tập mẫu với thẻ P1–P6 (kể cả mẫu chưa có mã SPU): mọi đơn đặt mẫu (Chi phí SX / chiếc × số lượng) + chi phí khác + Ads + quay mẫu">
            <TestCostSection report={costReport} />
          </Section>
        )}
        <Section title="Sản phẩm & kết quả test" hint="Kết quả test (WIN / WIN TRAFFIC / FAIL / đang test), mẫu dừng và cơ cấu mẫu theo dòng, nhóm, chất liệu, loại đá — chi tiết traffic xem ở “Luồng Media”">
          {SHOW_FINANCE && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Kpi label="Giá bán dự kiến TB" value={d.price.avgPrice === null ? "—" : fmtMoneyShort(d.price.avgPrice)} sub={`${d.price.pricedCount}/${d.kpi.total} mẫu đã nhập giá`} />
              {d.price.avgCost !== null && <Kpi label="Giá vốn dự kiến TB" value={fmtMoneyShort(d.price.avgCost)} />}
              {d.price.margin !== null && <Kpi label="Biên lợi nhuận dự kiến TB" value={pct(d.price.margin, 1)} info="(giá bán − giá vốn) ÷ giá bán" />}
              {d.results.sampleCost !== null && <Kpi label="Chi phí làm mẫu" value={fmtMoneyShort(d.results.sampleCost)} sub={d.results.costPerWin !== null ? `${fmtMoneyShort(d.results.costPerWin)} / mẫu Win` : "chưa có Win"} />}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatCard icon="trophy" label="WIN" value={fmtInt(d.results.win)} tone="--res-win" />
            <StatCard icon="bars" label="WIN TRAFFIC" value={fmtInt(d.results.winTraffic)} tone="--res-wt" />
            <StatCard icon="x" label="FAIL" value={fmtInt(d.results.fail)} tone="--res-fail" />
            <StatCard icon="clock" label="Đang test" value={fmtInt(d.results.testing)} tone="--res-testing" />
            <StatCard icon="pause" label="Mẫu dừng (kill)" value={fmtInt(d.kpi.killed)} tone="--ink-2" sub={d.killReason ? `nhiều nhất: ${d.killReason[0]} (${d.killReason[1]})` : "chưa có lý do"} />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card title="Cơ cấu theo dòng SP" hint="Chỉ mẫu đã duyệt · 1 mẫu nhiều dòng được đếm ở mỗi dòng"><DimPie {...d.lines} /></Card>
            <Card title="Cơ cấu theo nhóm SP" hint="Chỉ mẫu đã duyệt"><DimPie {...d.groups} /></Card>
            <Card title="Cơ cấu theo chất liệu" hint="Chỉ mẫu đã duyệt"><DimPie {...d.materials} /></Card>
            <Card title="Cơ cấu theo loại đá" hint="Chỉ mẫu đã duyệt · 1 mẫu nhiều đá được đếm ở mỗi loại"><DimPie {...d.stones} /></Card>
          </div>
        </Section>
        <Section title="Thống kê đẩy hàng" hint="Từng SPU R&D mà team đã đăng video: số video, số video Win (chấm riêng từng video theo cài đặt Video Win ở trang KPI) và số bán của team trong kỳ">
          <PushTable rows={win.push} videoWinText={videoWin.rules.map(fmtRule).join(videoWin.match === "all" ? " và " : " hoặc ")} />
        </Section>
        </>
      )}
    </div>
  );
}
