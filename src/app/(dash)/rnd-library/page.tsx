import FilterBar from "@/components/FilterBar";
import ParamSelect from "@/components/ParamSelect";
import { fmtInt, getPostsPage, parseFilters, scopePageIds } from "@/lib/data";
import { RESULT_FILTERS, cardProducts, codeInfos, filterCodes, getRndChannels, type ResultFilter } from "@/lib/rnd-video";
import { postTrends } from "@/lib/post-trends";
import VideoCard, { CARD_SIZES, type CardSize } from "./VideoCard";
import { requireUser } from "@/lib/session";
import Info from "@/components/InfoTip";
import { PLATFORMS } from "@/lib/platforms";

const SORTS = { views: "Lượt xem", published_at: "Mới nhất", reactions: "Cảm xúc", video_views: "Xem video", comments: "Bình luận" } as const;
const PAGE_SIZE = 30;

// Video sản phẩm do các Page R&D đăng (kênh đánh dấu "Page R&D"). Mọi team đều xem được: chọn video WIN / sản phẩm đẹp → "Lấy source" để tự edit và đăng lên kênh của mình.
export default async function RndVideoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser(["admin", "rnd", "media"]);
  const sp = await searchParams;
  const f = parseFilters(sp);
  const sort = (typeof sp.sort === "string" && sp.sort in SORTS ? sp.sort : "views") as keyof typeof SORTS;
  const result = (typeof sp.result === "string" && sp.result in RESULT_FILTERS ? sp.result : "all") as ResultFilter;
  const onlySource = sp.source === "1";
  const size = (typeof sp.size === "string" && sp.size in CARD_SIZES ? sp.size : "m") as CardSize;
  const query = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]).toString();

  const allChannels = await getRndChannels();
  if (allChannels === null || !allChannels.length) {
    return (
      <div className="space-y-3">
        <h1 className="font-semibold">Thư viện SP mới</h1>
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-2">
          {allChannels === null
            ? "Chưa chạy migration 022 (cột đánh dấu Page R&D) trong Supabase."
            : <>Chưa có Page nào được đánh dấu là <b>Page R&amp;D</b>. {user.role === "admin" ? <>Vào <a className="text-accent underline" href="/team">Team của tôi</a> và bấm “Đặt làm Page R&amp;D” ở các Page R&amp;D đăng video sản phẩm.</> : "Nhờ Quản lý đánh dấu các Page R&D."}</>}
        </div>
      </div>
    );
  }

  // Lọc theo nền tảng (Facebook / TikTok / YouTube…): chỉ liệt kê nền tảng đang có Page R&D; lọc xong thì ô Page chỉ còn các Page của nền tảng đó
  const platformsHere = Object.keys(PLATFORMS).filter((k) => allChannels.some((c) => c.platform === k));
  const platform = typeof sp.platform === "string" && platformsHere.includes(sp.platform) ? sp.platform : "all";
  const channels = platform === "all" ? allChannels : allChannels.filter((c) => c.platform === platform);
  const picked = scopePageIds(f, channels.map((a) => a.id));
  const ids = picked ? channels.filter((a) => picked.includes(a.id)).map((a) => a.id) : channels.map((a) => a.id);

  const infos = await codeInfos();
  const codes = filterCodes(infos, result, onlySource);
  const wantPage = Math.max(1, Math.floor(Number(typeof sp.page === "string" ? sp.page : 1)) || 1);
  let res = ids.length ? await getPostsPage(ids, f.from, f.to, sort, wantPage, PAGE_SIZE, "all", "video", codes ?? undefined) : { posts: [], total: 0 };
  const pages = Math.max(1, Math.ceil(res.total / PAGE_SIZE));
  const page = Math.min(wantPage, pages);
  if (page !== wantPage && ids.length) res = await getPostsPage(ids, f.from, f.to, sort, page, PAGE_SIZE, "all", "video", codes ?? undefined);
  const { posts, total } = res;
  const [cards, trends] = await Promise.all([cardProducts(posts, infos), postTrends(posts.map((p) => p.id))]);
  const channelOf = (id: string) => channels.find((a) => a.id === id);

  const pageHref = (n: number) => {
    const p = new URLSearchParams(query);
    if (n <= 1) p.delete("page"); else p.set("page", String(n));
    return `?${p}`;
  };
  const pager = pages > 1 && (
    <nav className="flex flex-wrap items-center justify-center gap-2 text-sm" aria-label="Phân trang">
      {page > 1 ? <a href={pageHref(1)} className="rounded-md px-2.5 py-1 text-ink-2 hover:bg-grid">« Đầu</a> : null}
      {page > 1 ? <a href={pageHref(page - 1)} className="rounded-md border border-line px-3 py-1 hover:bg-grid">‹ Trước</a> : null}
      <span className="tabular px-2 text-ink-2">Trang <b className="text-ink-1">{page}</b> / {fmtInt(pages)}</span>
      {page < pages ? <a href={pageHref(page + 1)} className="rounded-md border border-line px-3 py-1 hover:bg-grid">Sau ›</a> : null}
      {page < pages ? <a href={pageHref(pages)} className="rounded-md px-2.5 py-1 text-ink-2 hover:bg-grid">Cuối »</a> : null}
    </nav>
  );
  const sourceHref = (() => { const p = new URLSearchParams(query); if (onlySource) p.delete("source"); else p.set("source", "1"); p.delete("page"); return `?${p}`; })();

  return (
    <div className="space-y-3">
      {/* Đầu trang: MỘT hàng trong một khung, cùng kiểu thanh công cụ bảng R&D.
          Thứ tự = mạch lọc từ rộng đến hẹp: Nền tảng → Page (hai ô này đi liền vì chọn nền tảng sẽ lọc luôn danh sách Page) → Kết quả → Sắp xếp → Có source → thời gian;
          dồn phải là nhóm HIỂN THỊ (cỡ thẻ, trang) chứ không phải lọc. FilterBar bị tách làm 2 mảnh (only="selects" / only="date") để xen ô lọc riêng của trang vào giữa.
          Hai ô ngày nằm trong bảng thả xuống của ô thời gian nên không chiếm chỗ; phân trang đầy đủ vẫn ở chân trang. */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 shadow-sm">
        <h1 className="whitespace-nowrap font-semibold">Thư viện SP mới</h1>
        <span className="tabular whitespace-nowrap rounded-md bg-accent/10 px-1.5 py-0.5 text-xs font-semibold text-accent">{fmtInt(total)}</span>
        <Info text="Video sản phẩm từ các Page R&D. Chọn video WIN hoặc sản phẩm đẹp, bấm “Lấy source” để tự edit và đăng lên kênh của team." />
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden />
        {platformsHere.length > 1 && (
          <ParamSelect soft label="Nền tảng" param="platform" value={platform} defaultValue="all" query={query}
            options={[{ value: "all", label: "Tất cả" }, ...platformsHere.map((k) => ({ value: k, label: PLATFORMS[k as keyof typeof PLATFORMS].label }))]} />
        )}
        <FilterBar compact only="selects" filters={f} accounts={channels} scopeAllLabel="Tất cả" />
        <ParamSelect soft label="Kết quả" param="result" value={result} defaultValue="all" query={query}
          options={Object.entries(RESULT_FILTERS).map(([value, label]) => ({ value, label }))} />
        <ParamSelect soft label="Sắp xếp" param="sort" value={sort} defaultValue="views" query={query}
          options={Object.entries(SORTS).map(([value, label]) => ({ value, label }))} />
        {/* Chip bật/tắt dạng liên kết: trạng thái đọc được qua dấu ✓ + nhãn, nên không dùng aria-pressed (thuộc tính của nút, không hợp vai trò link) */}
        <a href={sourceHref}
          className={`flex h-8 items-center whitespace-nowrap rounded-md px-2 text-xs transition-colors ${onlySource ? "bg-accent font-semibold text-white shadow-sm" : "bg-grid text-ink-1 hover:bg-line"}`}>
          {onlySource ? "✓ Có source" : "Có source"}
        </a>
        <FilterBar compact only="date" filters={f} />
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <ParamSelect soft label="Cỡ thẻ" param="size" value={size} defaultValue="m" query={query}
            options={Object.entries(CARD_SIZES).map(([value, c]) => ({ value, label: c.label }))} />
          {pages > 1 && (
            <nav className="flex h-8 items-center rounded-md bg-grid text-xs" aria-label="Phân trang">
              {page > 1 ? <a href={pageHref(page - 1)} aria-label="Trang trước" className="flex h-full items-center px-2 text-ink-2 hover:text-ink-1">‹</a> : <span className="px-2 text-ink-muted opacity-40" aria-hidden>‹</span>}
              <span className="tabular whitespace-nowrap text-ink-2"><b className="text-ink-1">{page}</b> / {fmtInt(pages)}</span>
              {page < pages ? <a href={pageHref(page + 1)} aria-label="Trang sau" className="flex h-full items-center px-2 text-ink-2 hover:text-ink-1">›</a> : <span className="px-2 text-ink-muted opacity-40" aria-hidden>›</span>}
            </nav>
          )}
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-ink-2">
          Không có video phù hợp trong khoảng này{result !== "all" || onlySource ? " — thử bỏ bớt bộ lọc." : "."}
        </div>
      ) : (
        <div className={`grid gap-3 ${CARD_SIZES[size].grid}`}>
          {posts.map((p) => {
            const ch = channelOf(p.channel_id);
            return (
              <VideoCard key={p.id} p={p} ch={ch} trend={trends.get(p.id)} items={cards.get(p.id) ?? []} size={size} canLink={user.role === "admin" || user.role === "rnd"} />
            );
          })}
        </div>
      )}

      {pager}
      <p className="text-xs text-ink-muted">Kết quả WIN / WIN TRAFFIC lấy từ đánh giá tự động theo KPI (kèm kết luận của R&amp;D nếu đã xác nhận). Số bên cạnh “Lấy source” là số lần các team đã lấy.</p>
    </div>
  );
}
