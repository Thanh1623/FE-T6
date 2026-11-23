import { loadVideoWinRules } from "@/lib/spu-rules";
import { loadSpuAliases, oldCodesOf } from "@/lib/spu-alias";
import PostThumb from "@/components/PostThumb";
import FilterBar from "@/components/FilterBar";
import ParamSearch from "@/components/ParamSearch";
import ParamSelect from "@/components/ParamSelect";
import { fmtDateTime, fmtInt, getAccounts, getPostsPageCached, getProductInfo, limitByTeams, parseFilters, scopePageIds, type PostSku } from "@/lib/data";
import { getTeams } from "@/lib/pipeline";
import TeamNotice from "@/components/TeamNotice";
import TrendSpark from "@/components/TrendSpark";
import { postTrends } from "@/lib/post-trends";
import { requireUser } from "@/lib/session";
import { limitAccounts, type TeamScope } from "@/lib/team-scope";

const SORTS = {
  views: "Lượt xem",
  viewers: "Người xem",
  video_views: "Xem video",
  clicks: "Lượt nhấp",
  reactions: "Cảm xúc",
  comments: "Bình luận",
} as const;

const PAGE_SIZE = 24;

// Lọc theo mã sản phẩm gắn trong bài (hashtag mã SP đã nhận diện)
const SKU_FILTERS = { all: "Tất cả", with: "Đã gắn mã SP", without: "Chưa gắn mã", unknown: "Mã chưa khai báo" } as const;

export default async function PostsPage({ searchParams }: PageProps<"/posts">) {
  const user = await requireUser();
  // Trang Bài đăng: MỌI tài khoản (mọi vai trò, mọi team) xem được TẤT CẢ bài đăng của mọi Page; muốn xem riêng một team / Page thì tự lọc ở bộ lọc
  const scope: TeamScope = { limited: false, teamId: user.team_id, teamName: null, channelIds: [] };
  const sp = await searchParams;
  const f = parseFilters(sp);
  const sort = (typeof sp.sort === "string" && sp.sort in SORTS ? sp.sort : "views") as keyof typeof SORTS;
  const sku = (typeof sp.sku === "string" && sp.sku in SKU_FILTERS ? sp.sku : "all") as PostSku;
  const kind = sp.kind === "video" ? "video" : "all";
  const minv = (["1000", "5000", "10000", "win"].includes(typeof sp.minv === "string" ? sp.minv : "") ? sp.minv : "all") as string;   // lượt xem tối thiểu / Video Win — cùng lựa chọn với ngăn video của trang Theo dõi SPU
  const viewFilter = minv === "all" ? undefined : minv === "win" ? await loadVideoWinRules() : Number(minv);
  const spu = typeof sp.spu === "string" && /^[A-Za-z]{1,4}\d{3,}$/.test(sp.spu) ? sp.spu.toUpperCase() : null;   // lọc sẵn theo 1 mã SPU (từ trang Theo dõi SPU)

  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";   // từ khoá tìm kiếm (nội dung bài, mã SP, tên sản phẩm)
  const teams = await getTeams(true);
  const accounts = limitByTeams(limitAccounts((await getAccounts()).filter((a) => a.platform === "facebook" || a.platform === "tiktok"), scope), f);
  const picked = scopePageIds(f, accounts.map((a) => a.id));
  const shown = picked ? accounts.filter((a) => picked.includes(a.id)) : accounts;
  // Phân trang ở DB: mỗi trang PAGE_SIZE bài (trước đây kéo và vẽ toàn bộ bài → với nhiều kênh bị lag)
  const wantPage = Math.max(1, Math.floor(Number(typeof sp.page === "string" ? sp.page : 1)) || 1);
  const ids = shown.map((a) => a.id);
  const spuCodes = spu ? [spu, ...oldCodesOf(await loadSpuAliases(), spu)] : undefined;   // SPU đã gộp mã: gồm cả bài còn gắn mã cũ
  let res = ids.length ? await getPostsPageCached(ids, f.from, f.to, sort, wantPage, PAGE_SIZE, sku, kind, spuCodes, viewFilter, q) : { posts: [], total: 0 };
  const pages = Math.max(1, Math.ceil(res.total / PAGE_SIZE));
  const page = Math.min(wantPage, pages);
  if (page !== wantPage && ids.length) res = await getPostsPageCached(ids, f.from, f.to, sort, page, PAGE_SIZE, sku, kind, spuCodes, viewFilter, q);   // trang yêu cầu quá cuối → lấy trang cuối
  const { posts, total } = res;
  const [products, trends] = await Promise.all([getProductInfo(posts.flatMap((p) => p.product_codes)), postTrends(posts.map((p) => p.id))]);
  // Tag đã được hiểu (mã SP, tuyến, concept, nhân sự) không lặp lại ở dòng hashtag thường
  const structured = (p: (typeof posts)[number], t: string) =>
    p.product_codes.includes(t.toUpperCase()) || p.unknown_codes.includes(t.toUpperCase())
    || t.toUpperCase() === p.content_line || t.toUpperCase() === p.staff_code || (p.concept && (t === "c" || t === "m"));

  const accountOf = (id: string) => accounts.find((a) => a.id === id);
  // Tham số URL hiện tại — các ô thả xuống giữ nguyên bộ lọc khác khi đổi 1 lựa chọn
  const query = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]).toString();
  const pageHref = (n: number) => {
    const p = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]);
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-semibold">Bài đăng</h1>
        <p className="text-sm text-ink-2">Chỉ số trọn đời của mỗi bài, cập nhật mỗi lần đồng bộ · <b className="text-ink-1">{fmtInt(total)}</b> bài · {PAGE_SIZE} bài/trang</p>
      </div>

      {/* Một hàng lọc: ngày · team · page · mã SP · loại · lượt xem · sắp xếp ở bên trái, ô tìm kiếm dạt sang bên phải (hẹp thì tự xuống dòng) */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterBar filters={f} teams={teams} accounts={accounts} scopeAllLabel="Tất cả Trang" />
        <div className="flex flex-wrap items-center gap-2">
          <ParamSelect label="Mã SP" param="sku" value={sku} defaultValue="all" query={query}
            options={Object.entries(SKU_FILTERS).map(([value, label]) => ({ value, label }))} />
          <ParamSelect label="Loại" param="kind" value={kind} defaultValue="all" query={query}
            options={[{ value: "all", label: "Mọi bài" }, { value: "video", label: "Chỉ video" }]} />
          <ParamSelect label="Lượt xem" param="minv" value={minv} defaultValue="all" query={query}
            options={[{ value: "all", label: "Mọi view" }, { value: "1000", label: "≥ 1K" }, { value: "5000", label: "≥ 5K" }, { value: "10000", label: "≥ 10K" }, { value: "win", label: "Video Win" }]} />
          <ParamSelect label="Sắp xếp" param="sort" value={sort} defaultValue="views" query={query}
            options={Object.entries(SORTS).map(([value, label]) => ({ value, label }))} />
          {spu && (
            <a href={`?${(() => { const p = new URLSearchParams(query); p.delete("spu"); p.delete("page"); return p; })()}`} title="Bỏ lọc theo mã SPU"
              className="flex items-center gap-1.5 rounded-lg border border-accent bg-accent/10 px-2.5 py-1.5 text-sm font-medium text-accent hover:bg-accent/15">
              SPU <span className="font-mono font-bold">{spu}</span><span aria-hidden>✕</span>
            </a>
          )}
          {(sku !== "all" || kind !== "all" || minv !== "all") && (
            <a href={`?${(() => { const p = new URLSearchParams(query); p.delete("sku"); p.delete("kind"); p.delete("minv"); p.delete("page"); return p; })()}`}
              className="rounded-md px-2.5 py-1.5 text-sm text-accent hover:underline">Xoá lọc</a>
          )}
        </div>
        <ParamSearch value={q} query={query} placeholder="Tìm nội dung, mã SP, tên sản phẩm…" className="w-full min-w-56 sm:ml-auto sm:w-72" />
      </div>

      <TeamNotice scope={scope} pages={accounts.length} />

      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-ink-2">
          Không có bài đăng trong khoảng này.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {/* Lưới thẻ: điện thoại 1 · máy tính bảng 2 · laptop 3 cột · màn hình lớn (≥1536px) 4 cột. 24 thẻ/trang chia hết cho 2, 3 và 4 → hàng cuối luôn đầy */}
          {posts.map((p) => {
            const acc = accountOf(p.channel_id);
            return (
              <a key={p.id} href={p.permalink_url ?? "#"} target="_blank" rel="noreferrer"
                className="flex gap-3 rounded-xl border border-line bg-surface p-3 hover:border-accent">
                <PostThumb src={p.thumbnail_url} className="h-28 w-20 flex-none rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: acc?.color }} />
                    <span className="truncate">{acc?.name}</span> · {fmtDateTime(p.published_at)}
                    {(p.kind === "video" || p.kind === "reel") && " · 🎬"}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm">{p.message?.replace(/#[\p{L}\p{N}_]+/gu, "").trim() || "(không có nội dung)"}</p>
                  {/* Sản phẩm trong bài: mã + tên từ kho; chưa gắn mã thì nhắc */}
                  <div className="mt-1.5 space-y-1">
                    {p.product_codes.map((t) => {
                      const info = products[t];
                      return (
                        <div key={t} className="flex items-center gap-1.5 text-xs">
                          <span className="flex-none rounded bg-accent px-1.5 py-0.5 font-medium text-white">{t}</span>
                          <span className={`truncate ${info ? "text-ink-1" : "text-ink-muted"}`} title={info?.name}>
                            {info?.name ?? "Mã chưa có trong kho"}
                          </span>
                        </div>
                      );
                    })}
                    {p.unknown_codes.map((t) => (
                      <div key={t} className="text-xs text-warn-ink" title="Không có trên Sapo, chưa khai báo R&D">⚠ #{t} — mã chưa khai báo</div>
                    ))}
                    {!p.product_codes.length && !p.unknown_codes.length && (
                      <div className="text-xs text-ink-muted">Chưa gắn mã sản phẩm</div>
                    )}
                    {(p.content_line || p.concept || p.staff_code) && (
                      <div className="flex flex-wrap gap-1 text-2xs">
                        {p.content_line && <span className="rounded border border-line px-1.5">Tuyến {p.content_line}</span>}
                        {p.concept && <span className="rounded border border-line px-1.5">Concept {p.concept === "new" ? "Mới" : "Cũ"}</span>}
                        {p.staff_code && <span className="rounded border border-line px-1.5">👤 {p.staff_code}</span>}
                      </div>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.hashtags.filter((t) => !structured(p, t)).slice(0, 4).map((t) => (
                      <span key={t} className="rounded bg-page px-1.5 py-0.5 text-xs text-ink-2">#{t}</span>
                    ))}
                  </div>
                  <div className="mt-2"><TrendSpark trend={trends.get(p.id)} /></div>
                  <div className="tabular mt-2 grid grid-cols-3 gap-1 text-xs">
                    {(["views", "viewers", "reactions"] as const).map((k) => (
                      <div key={k}>
                        <div className="text-ink-muted">{SORTS[k]}</div>
                        <div className={`font-semibold ${k === sort ? "text-accent" : ""}`}>{fmtInt(p[k] ?? 0)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}

      {pager}
    </div>
  );
}
