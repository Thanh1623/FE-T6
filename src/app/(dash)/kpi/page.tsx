import Link from "next/link";
import KpiCard, { WindowForm } from "@/components/kpi/KpiCard";
import CriteriaCard from "@/components/kpi/CriteriaCard";
import StockRulesForm from "@/components/kpi/StockRulesForm";
import WinRulesForm from "@/components/kpi/WinRulesForm";
import CommercialRulesForm from "@/components/kpi/CommercialRulesForm";
import ProductImageImport from "@/components/kpi/ProductImageImport";
import ReceiptImport from "@/components/kpi/ReceiptImport";
import VideoBuildPanel from "@/components/kpi/VideoBuildPanel";
import DataFreshness from "@/components/kpi/DataFreshness";
import VideoSyncPanel from "@/components/kpi/VideoSyncPanel";
import YouTubePanel from "@/components/kpi/YouTubePanel";
import { youtubeConfigured } from "@/lib/youtube/api";
import { getTeams } from "@/lib/pipeline";
import SystemLog from "@/components/kpi/SystemLog";
import { loadFreshness } from "@/lib/data-freshness";
import { COMMERCIAL_RULES_KEY, mergeCommercialRules } from "@/lib/commercial-eval";
import { SPU_RULES_KEY, mergeSpuRules } from "@/lib/spu-rules";
import ResultBadge from "@/components/rnd/ResultBadge";
import { requireUser } from "@/lib/session";
import { listTemplates } from "@/lib/kpi";
import { sb } from "@/lib/supabase/admin";
import type { AutoResult } from "@/lib/eval/rules";

// Một mục cài đặt: thẻ có đầu (tên + mô tả ngắn) và thân; mọi mục dùng chung kiểu này cho gọn và đồng nhất
function Section({ title, hint, children, flush }: { title: string; hint?: React.ReactNode; children: React.ReactNode; flush?: boolean }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line bg-grid/40 px-5 py-3">
        <h2 className="text-sm font-semibold text-ink-1">{title}</h2>
        {hint && <span className="text-xs text-ink-muted">{hint}</span>}
      </div>
      <div className={flush ? "" : "px-5 py-4"}>{children}</div>
    </section>
  );
}

// Nhóm cài đặt (tab): mỗi lần chỉ hiện một nhóm
const TABS = [
  { id: "data", label: "Dữ liệu", desc: "Nhập file, đồng bộ API, độ mới" },
  { id: "win", label: "Quy tắc Win", desc: "Điều kiện chấm Win mã test và SPU" },
  { id: "classify", label: "Phân loại & đánh giá", desc: "Bán chạy / chậm, thương mại hoá" },
  { id: "log", label: "Nhật ký", desc: "Lịch sử cập nhật dữ liệu (chỉ Quản lý)" },
] as const;
type TabId = (typeof TABS)[number]["id"];

// Cài đặt KPI đánh giá Win. Mọi mã sản phẩm có video gắn hashtag được hệ thống tự chấm theo 2 bộ KPI mặc định:
//   đạt KPI Bán hàng → WIN · chỉ đạt KPI Traffic → WIN TRAFFIC · hết cửa sổ test mà chưa đạt → FAIL
// Server action nhập file (tồn kho / ảnh sản phẩm…) ghi vài chục nghìn dòng: cho chạy tối đa 60 giây (mặc định 10 giây của gói thấp có thể không đủ)
export const maxDuration = 300;

// Đếm nhanh SPU còn tồn kho nhưng chưa có ảnh mà không phải kéo toàn bộ video posts và catalog
async function countInStockNoImage(): Promise<number> {
  try {
    const [{ data: stock }, { data: imgs }, { data: cat }] = await Promise.all([
      sb.sales().from("inventory_stock").select("code").gt("stock", 0),
      sb.sales().from("spu_images").select("code").not("image_url", "is", null),
      sb.sales().from("catalog").select("code").not("image_url", "is", null),
    ]);
    const hasImg = new Set([
      ...(imgs ?? []).map((r) => String(r.code).toUpperCase().split("-")[0]),
      ...(cat ?? []).map((r) => String(r.code).toUpperCase().split("-")[0]),
    ]);
    const inStock = new Set((stock ?? []).map((r) => String(r.code).toUpperCase().split("-")[0]));
    let count = 0;
    for (const c of inStock) if (!hasImg.has(c)) count++;
    return count;
  } catch {
    return 0;
  }
}

export default async function KpiPage({ searchParams }: PageProps<"/kpi">) {
  const user = await requireUser(["admin", "rnd"]);
  const sp = await searchParams;
  const isAdmin = user.role === "admin";
  const tabs = TABS.filter((x) => x.id !== "log" || isAdmin);   // nhật ký chỉ Quản lý xem
  const tab: TabId = tabs.some((x) => x.id === sp.tab) ? (sp.tab as TabId) : "data";
  const [templates, { data: setting }, { data: evals }, { data: spuSetting }, { data: comSetting }, imgStat, { data: splitRows }, fresh, recFirst, recLast, noImage] = await Promise.all([
    listTemplates(isAdmin),
    sb.core().from("settings").select("value").eq("key", "evaluation").maybeSingle(),
    sb.rnd().from("evaluations").select("result"),
    sb.core().from("settings").select("value").eq("key", SPU_RULES_KEY).maybeSingle(),
    sb.core().from("settings").select("value").eq("key", COMMERCIAL_RULES_KEY).maybeSingle(),
    sb.sales().from("spu_images").select("updated_at", { count: "exact" }).order("updated_at", { ascending: false }).limit(1),   // số SPU đã có ảnh nhập từ file (lỗi = chưa chạy migration 049)
    sb.sales().from("sku_spu_overrides").select("sku, spu_code"),   // SPU đã tách do đặt trùng mã (migration 050; lỗi = chưa có)
    loadFreshness(),                                                  // độ mới của các bộ dữ liệu nhập từ file
    sb.sales().from("stock_receipts").select("received_on", { count: "exact" }).order("received_on", { ascending: true }).limit(1),   // lô nhập kho (migration 055; lỗi = chưa có)
    sb.sales().from("stock_receipts").select("received_on").order("received_on", { ascending: false }).limit(1),
    countInStockNoImage(),                                            // đếm SPU còn hàng chưa có ảnh (nhẹ hơn loadSpuRows ~10 lần)
  ]);
  // Kênh YouTube (chỉ cần ở nhóm Dữ liệu)
  const ytRows = tab === "data" ? await (async () => {
    const [{ data: yt }, teams] = await Promise.all([
      sb.social().from("channels").select("id, name, followers_count, last_synced_at, team_id").eq("platform", "youtube").eq("is_active", true).order("name"),
      getTeams(true),
    ]);
    const teamName = new Map(teams.map((t) => [t.id, t.name]));
    return (yt ?? []).map((c) => ({ id: String(c.id), name: String(c.name), followers: c.followers_count === null ? null : Number(c.followers_count), lastSyncedAt: (c.last_synced_at as string | null) ?? null, teamName: c.team_id ? teamName.get(c.team_id as string) ?? null : null }));
  })() : [];
  const splitMap = new Map<string, number>();
  for (const r of splitRows ?? []) splitMap.set(String(r.spu_code), (splitMap.get(String(r.spu_code)) ?? 0) + 1);
  const splits = [...splitMap].sort(([a], [b]) => a.localeCompare(b)).map(([newCode, skus]) => ({ code: newCode.slice(0, -1), newCode, skus }));
  const windowDays = Number((setting?.value as { window_days?: number } | null)?.window_days ?? 14);
  const defaultOf = (goal: string) => templates.find((t) => t.goal_code === goal && t.is_default && t.is_active) ?? null;
  const counts: Record<string, number> = {};
  for (const e of evals ?? []) counts[e.result as string] = (counts[e.result as string] ?? 0) + 1;
  const order: AutoResult[] = ["win", "win_traffic", "testing", "fail"];

  const spuRules = mergeSpuRules(spuSetting?.value);
  const custom = !!spuSetting?.value;
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Cài đặt</h1>
          <p className="mt-1 text-sm text-ink-2">{isAdmin ? "Dữ liệu nguồn, quy tắc Win và phân loại SPU." : "Điều kiện hiện hành. Chỉ Quản lý được sửa."}</p>
        </div>
        <WindowForm days={windowDays} canEdit={isAdmin} />
      </header>

      {/* Chọn nhóm cài đặt */}
      <nav aria-label="Nhóm cài đặt" className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((x) => {
          const on = x.id === tab;
          return (
            <Link key={x.id} href={x.id === "data" ? "/kpi" : `/kpi?tab=${x.id}`} aria-current={on ? "page" : undefined} title={x.desc}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${on ? "border-accent text-accent" : "border-transparent text-ink-2 hover:text-ink-1"}`}>
              {x.label}
            </Link>
          );
        })}
      </nav>

      {tab === "data" && (
        <div className="flex flex-col gap-5">
          <Section title="Độ mới của dữ liệu" hint="Nhập ở các mục bên dưới và ở trang Theo dõi đẩy hàng">
            <DataFreshness items={[fresh.stock, fresh.orders, fresh.receipts, fresh.videos, fresh.images]}
              extra={{ images: noImage ? `${noImage.toLocaleString("vi-VN")} SPU còn hàng chưa có ảnh — nên cập nhật file sản phẩm` : null }} />
          </Section>
          <Section title="Ảnh sản phẩm" hint="Hiện ở Theo dõi đẩy hàng, Dashboard và Bài đăng">
            <ProductImageImport count={imgStat.error ? null : imgStat.count ?? 0} updatedAt={(imgStat.data?.[0]?.updated_at as string | undefined) ?? null} splits={splits} />
          </Section>
          <div className="grid gap-5 xl:grid-cols-2">
            <Section title="Video từ API" hint="Nguồn số video, lượt xem">
              <VideoSyncPanel lastAt={fresh.videos.lastAt} lastMessage={fresh.videoMessage} />
            </Section>
            <Section title="Kênh YouTube" hint="Video công khai qua YouTube Data API">
              <YouTubePanel configured={youtubeConfigured()} channels={ytRows} />
            </Section>
            <Section title="Đơn nhập hàng" hint="Tính cột “Thời gian tồn”">
              <ReceiptImport count={recFirst.error ? null : recFirst.count ?? 0} lastAt={fresh.receipts.lastAt}
                from={(recFirst.data?.[0]?.received_on as string | undefined) ?? null} to={(recLast.data?.[0]?.received_on as string | undefined) ?? null} />
            </Section>
          </div>
          {isAdmin && (
            <Section title="Bảng tổng hợp video (SQL)" hint="Nguồn video của bảng tổng hợp SPU">
              <VideoBuildPanel />
            </Section>
          )}
        </div>
      )}

      {tab === "win" && (
        <div className="flex flex-col gap-5">
          {/* Kết quả hiện tại */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {order.map((r) => (
              <div key={r} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5">
                <ResultBadge result={r} size="xs" />
                <span className="text-3xl font-bold leading-none tabular-nums">{(counts[r] ?? 0).toLocaleString("vi-VN")}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink-1">Điều kiện đạt (mã test)</h2>
              <span className="text-xs text-ink-muted">Tự chấm Win cho mã test — Báo cáo test mẫu</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              <KpiCard goal="traffic" title="👁 Traffic" wins="WIN TRAFFIC" tone="--res-wt" tpl={defaultOf("traffic")} canEdit={isAdmin} windowDays={windowDays} />
              <KpiCard goal="sales" title="💰 Bán hàng" wins="WIN" tone="--res-win" tpl={defaultOf("sales")} canEdit={isAdmin} windowDays={windowDays} />
              <CriteriaCard rules={spuRules.video.rules} match={spuRules.video.match} canEdit={isAdmin} custom={custom} />
            </div>
          </div>
          <Section title="Quy tắc Win" hint="Dùng chung: Dashboard S2–S4 và nút Win / Ngôi sao ở Theo dõi đẩy hàng">
            <WinRulesForm rules={spuRules.win} canEdit={isAdmin} custom={!!(spuSetting?.value as { win?: unknown } | null)?.win} />
          </Section>
        </div>
      )}

      {tab === "log" && (
        <Section title="Nhật ký hệ thống" hint="Nhập file, đồng bộ, đổi cài đặt · tự xoá sau 180 ngày">
          <SystemLog kind={typeof sp.kind === "string" ? sp.kind : ""} page={Math.max(1, Math.floor(Number(typeof sp.page === "string" ? sp.page : "1")) || 1)} />
        </Section>
      )}

      {tab === "classify" && (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <Section title="Phân loại bán" hint="Theo SL bán 30 ngày">
            <StockRulesForm rules={spuRules} canEdit={isAdmin} custom={custom} />
          </Section>
          <Section title="Đánh giá thương mại hoá" hint="Chỉ áp dụng cho mẫu mới trong quy trình R&D">
            <CommercialRulesForm rules={mergeCommercialRules(comSetting?.value)} canEdit={isAdmin} custom={!!comSetting?.value} />
          </Section>
        </div>
      )}
    </div>
  );
}
