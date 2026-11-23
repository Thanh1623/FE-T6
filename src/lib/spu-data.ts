import "server-only";
import { unstable_cache } from "next/cache";
import { fetchAll, sb } from "@/lib/supabase/admin";
import { heavyRpc } from "@/lib/db-gate";
import { TAG, bust, bustSoft } from "@/lib/cache-tags";
import { loadSkuOverrides } from "@/lib/sku-overrides";
import { canonOf, loadSpuAliases } from "@/lib/spu-alias";
import { getAccounts, todayVN } from "@/lib/data";
import { TT_NAME_PREFIX, normTikTokName } from "@/lib/tiktok/name";
import { loadStaffLookup } from "@/lib/staff-teams";
import { getTeams } from "@/lib/pipeline";
import { groupOfProduct, isNonProduct, spuOf } from "@/lib/spu-code";
import type { SpuRow, SpuSale, SpuVid } from "@/lib/spu-tracking";

// Dữ liệu THẬT cho trang "Theo dõi hiệu quả SPU" và các khối SPU ở Dashboard (thay cho dữ liệu mẫu trước đây):
//   • Danh sách SPU + số mã con: sales.inventory_skus (mọi SKU trong file tồn Sapo, gộp theo mã SPU = phần trước dấu "-")
//   • Tồn theo kho + hàng đang về: sales.inventory_stock (nhập bằng nút "Nhập tồn kho"); tuổi tồn: start_date (migration 040) nếu có, chưa có → null
//   • Bán 30 ngày: sales.daily_sales (đồng bộ từ Sapo, trừ kênh bảo hành); chưa có dữ liệu đồng bộ trong 30 ngày thì dùng file đơn hàng đã nhập (sales.imported_order_lines)
//   • Video: social.posts (video / reel) gắn hashtag mã SPU; team theo kênh đăng; tên + ảnh: sales.catalog
// Hiện MỌI mã trong file tồn kho (kể cả hộp, khăn lau, đá rời, charm, mã trung gian — nhóm "Khác"); nhóm hàng phân theo tên sản phẩm (lib/spu-code groupOfProduct), thiếu tên thì theo tiền tố mã.

const DAY = 86_400_000;
const vnDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const PLATFORM: Record<string, "FB" | "IG" | "TT"> = { facebook: "FB", instagram: "IG", tiktok: "TT" };
// Đơn của kênh Ads KHÔNG tính cho team bán hàng (team chỉ tính đơn tự bán): đơn mang các tag này, hoặc thuộc kênh gán cho team "ADS", được gán cho team "ADS"
const ADS_TEAM = "ADS";
const ADS_TAGS = ["page_id_1659994180936411", "page_HuyK - Trang sức thiết kế"].map((t) => t.toLowerCase());
const isAdsTags = (tags: string | null | undefined) => !!tags && tags.split(",").some((t) => ADS_TAGS.includes(t.trim().toLowerCase()));
const VIDEO_DAYS = 360;   // lấy video đăng trong 360 ngày gần nhất (hôm nay + 359 ngày trước) — KHỚP cửa sổ của sales.video_daily (089) để hai đường cho cùng kết quả

// Nguồn số bán đang dùng (hiện trên trang để đối chiếu): "orders" = file đơn hàng đã nhập · "sapo" = số Sapo đồng bộ · "none" = chưa có
export type SpuMeta = { salesSource: "orders" | "sapo" | "none"; salesLines: number; salesQty: number; salesFrom: string | null; salesTo: string | null; skus: number; teamQty: number };   // teamQty = số bán gán được cho 1 team (theo tag đơn)
let cache: { at: number; rows: SpuRow[]; meta: SpuMeta } | null = null;
// Chi tiết của một số video (nội dung, link bài, ảnh bìa) — nạp theo yêu cầu cho danh sách video đang hiện (ngăn video của 1 SPU, 8 video của cảnh báo dashboard)
export type VideoDetail = { title: string; url: string | null; thumb: string | null };
export async function loadVideoDetails(ids: string[]): Promise<Map<string, VideoDetail>> {
  const out = new Map<string, VideoDetail>();
  const uniq = [...new Set(ids.filter(Boolean))];
  const parts: string[][] = [];
  for (let i = 0; i < uniq.length; i += 150) parts.push(uniq.slice(i, i + 150));
  for (let i = 0; i < parts.length; i += 6) {
    const res = await Promise.all(parts.slice(i, i + 6).map((c) => sb.social().from("posts").select("id, message, permalink_url, thumbnail_url").in("id", c)));
    for (const { data } of res) for (const p of data ?? []) out.set(String(p.id), { title: String(p.message ?? "").replace(/#[\p{L}\p{N}_]+/gu, "").trim(), url: (p.permalink_url as string | null) ?? null, thumb: (p.thumbnail_url as string | null) ?? null });
  }
  return out;
}

// soft = true: lần cập nhật do HỆ THỐNG (đồng bộ) → người xem tiếp theo vẫn nhận ngay số cũ, số mới tải lại ở nền (stale-while-revalidate); mặc định xoá hẳn (nhập file, sửa tay)
export const invalidateSpuRows = (soft = false) => {
  cache = null; if (soft) bustSoft(TAG.spuData); else bust(TAG.spuData);
  void import("@/lib/spu-summary").then((m) => m.scheduleSpuSummaryRefresh()).catch(() => {});   // làm mới bảng tổng hợp ở nền (docs/KIEN-TRUC-TONG-HOP-SPU.md)
};   // xoá cả bộ đệm chung các số liệu đã gom
export async function loadSpuMeta(): Promise<SpuMeta> { await loadSpuRows(); return cache!.meta; }

export async function loadSpuRows(): Promise<SpuRow[]> {
  if (cache && Date.now() - cache.at < 300_000) return cache.rows;   // bộ nhớ tiến trình 5 phút; phần nặng (video, đơn…) đã có bộ đệm chung bên dưới
  return (await computeSpuRows(false)).rows;
}

// BẢN NHẸ cho việc làm mới bảng tổng hợp (lib/spu-summary): KHÔNG đọc ~32.000 bài đăng (vids rỗng, teams rỗng) — số video / team video của bảng tổng hợp lấy từ sales.video_daily (migration 089).
// Không dùng và không ghi bộ nhớ tiến trình `cache` (nơi khác cần rows có đủ video).
export const loadSpuRowsLight = () => computeSpuRows(true);

async function computeSpuRows(light: boolean): Promise<{ rows: SpuRow[]; meta: SpuMeta }> {
  const today = todayVN();
  const since = addDays(today, -29);

  const [accounts, teams, staffTeam] = await Promise.all([getAccounts(), getTeams(), loadStaffLookup()]);   // staffTeam: nhân viên phụ trách → team (bảng sales.staff_teams, thiếu thì suy từ Qlydonhang)
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  // Team của một đơn: tag "page_id_<số>" → Trang Facebook; "tiktok_business_<tên>" → kênh TikTok (ghép theo tên chuẩn hoá); kênh thuộc team nào thì số bán tính cho team đó
  const chanById = new Map(accounts.map((a) => [a.id, a]));
  const chanByTikTok = new Map(accounts.filter((a) => a.platform === "tiktok").map((a) => [normTikTokName(a.name), a]));
  const teamOfChannel = (id: string | null | undefined) => { const a = id ? chanById.get(id) : undefined; return a?.team_id ? teamName.get(a.team_id) ?? null : null; };
  const teamOfTags = (tags: string | null | undefined) => {
    if (!tags) return null;
    const parts = tags.split(",").map((t) => t.trim());
    for (const t of parts) { const m = t.match(/^(?:page_id_)?(\d{6,})$/i); if (m) { const tm = teamOfChannel(m[1]); if (tm) return tm; } }
    for (const t of parts) {
      const m = t.match(/^tiktok_business_(?!id_)(.+)$/i);
      if (m) { const n = normTikTokName(m[1]); const a = chanByTikTok.get(n) ?? chanById.get(TT_NAME_PREFIX + n); const tm = a?.team_id ? teamName.get(a.team_id) ?? null : null; if (tm) return tm; }
    }
    return null;
  };
  const canon = canonOf(await loadSpuAliases());   // mã SPU cũ → mới (bảng quy đổi, migration 066): gộp tồn / số bán / video của mã cũ vào SPU mới
  const [skuSum, stockRaw0, catalog, sold, posts, ownImages, skuOv, ownNames, receipts, excluded] = await Promise.all([
    loadSkuSummary(),
    loadStock(),
    loadCatalog(),   // ~11.000 dòng: bộ đệm chung chia đoạn 3.000 dòng (mỗi mục < 2 MB)
    loadSold30(since, today, (staff, tags) => (isAdsTags(tags) || teamOfTags(tags) === ADS_TEAM ? ADS_TEAM : staffTeam(staff) ?? teamOfTags(tags)), teamOfChannel, canon),
    light ? Promise.resolve([] as VideoPost[]) : loadVideoPosts(today),   // ~30.000 video gắn mã: bộ đệm chung chia đoạn theo thời gian (nội dung / link / ảnh bìa chỉ nạp khi mở ngăn video — loadVideoDetails)
    loadOwnImages(),
    loadSkuOverrides(),
    loadOwnNames(),
    loadReceipts(),
    loadExcluded(),
  ]);

  const stockRaw = stockRaw0.map((s) => ({ ...s, code: canon(s.code) }));
  const splitCodes = new Set([...skuOv.values()].flatMap((c) => [c, c.slice(0, -1)]));   // mã đã tách và mã gốc của nó
  const sales30 = sold.map;
  // Danh sách SPU + số mã con (SKU)
  const variants = new Map<string, number>();
  for (const k of skuSum) { const c = canon(k.code); variants.set(c, (variants.get(c) ?? 0) + k.variants); }
  for (const s of stockRaw) if (!variants.has(s.code)) variants.set(s.code, 1);   // đã nhập theo kiểu cũ (chưa có bảng SKU)
  // SPU có đơn trong 30 ngày nhưng KHÔNG có trong file tồn kho (hàng đã ngừng quản lý kho, mã đổi…) vẫn là SPU Active: thêm vào danh sách
  for (const c of sales30.keys()) if (c && !variants.has(c)) variants.set(c, 1);

  // Tồn theo kho, hàng đang về, tuổi tồn (TB theo tồn)
  const stockHasAvail = stockRaw.some((s) => s.available !== null);   // đã nhập file có cột "Có thể bán" chưa
  const availBy = new Map<string, Record<string, number>>();   // "Có thể bán" theo kho (có thể âm)
  const stockBy = new Map<string, Record<string, number>>(), incoming = new Map<string, number>(), ageW = new Map<string, { w: number; d: number }>();
  for (const s of stockRaw) {
    const m = stockBy.get(s.code) ?? {};
    if (s.stock > 0) m[s.warehouse] = (m[s.warehouse] ?? 0) + s.stock;
    stockBy.set(s.code, m);
    incoming.set(s.code, (incoming.get(s.code) ?? 0) + s.incoming);
    if (s.available !== null) { const am = availBy.get(s.code) ?? {}; am[s.warehouse] = (am[s.warehouse] ?? 0) + s.available; availBy.set(s.code, am); }
    if (!receipts.bySku.size && s.stock > 0 && s.start_date) { const a = ageW.get(s.code) ?? { w: 0, d: 0 }; a.w += s.stock; a.d += s.stock * Math.max(0, dayDiff(s.start_date, today)); ageW.set(s.code, a); }   // chưa nhập lô nhập kho → dùng ngày bắt đầu tồn của file tồn (nếu có)
  }
  // THỜI GIAN TỒN theo FIFO từ các lô nhập kho: tồn hiện tại của mỗi SKU là các lô nhập GẦN NHẤT (trừ dần từ lô mới nhất), tuổi = bình quân gia quyền theo SL.
  // Phần tồn KHÔNG có lô (nhập trước ngày đầu của file đơn nhập) tính bằng số ngày từ ngày đầu file → tuổi tồn của SPU đó là "≥" (ageApprox).
  const ageApprox = new Set<string>();
  if (receipts.bySku.size && receipts.first) {
    const floorAge = Math.max(0, dayDiff(receipts.first, today));
    const perSku = new Map<string, { code: string; total: number }>();
    for (const s of stockRaw) if (s.stock > 0 && s.sku) { const k = s.sku.toUpperCase(), c = perSku.get(k) ?? { code: s.code, total: 0 }; c.total += s.stock; perSku.set(k, c); }
    for (const [sku, { code, total }] of perSku) {
      let need = total;
      const a = ageW.get(code) ?? { w: 0, d: 0 };
      for (const [date, qty] of receipts.bySku.get(sku) ?? []) {
        if (need <= 0) break;
        const take = Math.min(qty, need);
        a.w += take; a.d += take * Math.max(0, dayDiff(date, today)); need -= take;
      }
      if (need > 0) { a.w += need; a.d += need * floorAge; ageApprox.add(code); }
      ageW.set(code, a);
    }
  }

  // Tên + ảnh: danh mục Sapo trước; chưa có thì tên SKU trong file tồn kho (cột "Sản phẩm", cần migration 044)
  const skuName = new Map<string, string>();
  for (const k of skuSum) if (k.name && !skuName.has(k.code) && canon(k.code) === k.code) skuName.set(k.code, k.name);   // tên của mã cũ không đặt tên cho SPU mới
  const info = new Map<string, { name: string | null; image: string | null }>();
  for (const c of catalog) { const k = spuOf(c.code); const cur = info.get(k); if (!cur || (c.code.toUpperCase() === k && !cur.name)) info.set(k, { name: c.name, image: c.image_url }); }
  for (const [c, url] of ownImages) info.set(c, { name: info.get(c)?.name ?? null, image: url });   // ảnh nhập từ file Excel (Cài đặt → Ảnh sản phẩm) ưu tiên hơn ảnh catalog

  // Video theo SPU (mỗi bài có thể gắn nhiều mã; gắn 2 SKU của cùng SPU chỉ tính 1 lần)
  const chan = new Map(accounts.map((a) => [a.id, a]));
  const vidsBy = new Map<string, SpuVid[]>();
  for (const p of posts) {
    const ch = chan.get(p.channel_id);
    if (!ch) continue;   // chỉ đếm video của kênh đang bật (kênh đã tắt / xoá bỏ)
    const vid: SpuVid = {
      id: p.id, channelId: p.channel_id, age: Math.max(0, dayDiff(vnDay(p.published_at), today)), views: Number(p.views ?? 0),
      platform: ch ? PLATFORM[ch.platform] ?? "FB" : "FB", channel: ch?.name ?? "—", team: ch?.team_id ? teamName.get(ch.team_id) ?? null : null,
    };
    for (const c of new Set((p.product_codes ?? []).map((x) => canon(spuOf(x))))) (vidsBy.get(c) ?? vidsBy.set(c, []).get(c)!).push(vid);
  }

  const rows: SpuRow[] = [];
  for (const [code, n] of variants) {
    if (!code) continue;
    const stock = stockBy.get(code) ?? {};
    const a = ageW.get(code), vids = vidsBy.get(code) ?? [];
    const i = info.get(code);
    // SPU bị tách (mã X và X+"X"): danh mục Sapo đã gộp theo mã nên tên sai → lấy tên của SKU thực sự thuộc SPU này
    const own = ownNames.get(code);   // tên sản phẩm Sapo nhập từ file (Cài đặt → Ảnh sản phẩm): đúng theo từng SPU, ưu tiên nhất
    const catName = splitCodes.has(code) ? null : i?.name;
    const name = pickName([own, catName, skuName.get(code), i?.name], code);
    if (excluded.has(code) || isNonProduct(name, code)) continue;   // nhóm "Công cụ dụng cụ" (084) + hộp, nước rửa, mã trung gian…: không phải sản phẩm → không thống kê   // hộp, nước rửa / khăn lau bạc, bộ đo ni, dụng cụ, giấy đảm bảo, mã trung gian: không phải sản phẩm → không thống kê
    rows.push({
      code, name, group: groupOfProduct(own || catName || skuName.get(code) || i?.name, code), variants: n, image: i?.image ?? null, stockBy: stock, availBy: stockHasAvail ? availBy.get(code) ?? {} : null, incoming: incoming.get(code) ?? 0,
      ageDays: a && a.w > 0 ? Math.round(a.d / a.w) : null, ageApprox: ageApprox.has(code), sold30: sales30.has(code) ? sales30.get(code)! : sales30.size ? 0 : null, soldBy: sold.byTeam.get(code) ?? {}, sales: sold.saleLines.get(code) ?? [],
      vids, footage: null, teams: [...new Set(vids.map((v) => v.team).filter((t): t is string => !!t))],
    });
  }
  const meta: SpuMeta = { salesSource: sold.source, salesLines: sold.lines, salesQty: sold.qty, salesFrom: sold.from, salesTo: sold.to, skus: skuSum.reduce((n, k) => n + k.variants, 0), teamQty: sold.teamQty };
  if (!light) cache = { at: Date.now(), rows, meta };
  return { rows, meta };
}

// Video / reel gắn mã SPU trong VIDEO_DAYS ngày. Mỗi đoạn thời gian lưu đệm DÙNG CHUNG (giới hạn 2 MB/mục nên chia 4 đoạn; dạng mảng gọn, không tên cột).
// 7 đoạn (≈ 2–6 nghìn bài mỗi đoạn, mỗi lượt gọi hàm SQL ≲ 2 giây — đo thật: gộp 13 nghìn bài trong MỘT đoạn mất ~4 giây, gần giới hạn 8 giây của kết nối). Đoạn gần nhất làm mới thường xuyên; các đoạn cũ đổi rất ít. Cả bộ bị xoá khi đồng bộ xong (bust TAG.spuData) hoặc nhập file (invalidateSpuRows).
type VideoPost = { id: string; channel_id: string; published_at: string; views: number | null; product_codes: string[] };
type VideoTuple = [string, string, string, number | null, string[]];
const videoChunk = (revalidate: number) => unstable_cache(
  async (fromIso: string, toIso: string): Promise<VideoTuple[]> => {
    // Đường nhanh (migration 088): MỘT lượt gọi hàm SQL trả cả đoạn; chưa chạy migration / lỗi → phân trang như cũ
    const fast = await heavyRpc(() => sb.sales().rpc("video_posts_chunk", { p_from: fromIso, p_to: toIso }), 2, 2000);   // ≤ 3 đoạn chạy cùng lúc + thử lại khi quá thời gian (7 đoạn song song từng làm 3 đoạn bị 500)
    if (!fast.error && Array.isArray(fast.data)) return fast.data as VideoTuple[];
    const rows = await fetchAll<VideoPost>((a, b) =>
      sb.social().from("posts").select("id, channel_id, published_at, views, product_codes")   // CỘT NHẸ: nội dung / link / ảnh bìa chỉ nạp khi mở ngăn video (loadVideoDetails)
        .in("kind", ["video", "reel"]).neq("product_codes", "{}").gte("published_at", fromIso).lt("published_at", toIso).order("published_at").order("id").range(a, b));
    return rows.map((r): VideoTuple => [r.id, r.channel_id, r.published_at, r.views, r.product_codes]);
  },
  ["spu-video-chunk", `v3-${revalidate}`], { tags: [TAG.spuData], revalidate },
);
const recentVideos = videoChunk(600), olderVideos = videoChunk(21_600);
async function loadVideoPosts(today: string): Promise<VideoPost[]> {
  // Các mốc tính lùi từ hôm nay (mốc trên = ngày mai để gồm cả bài hôm nay); đoạn i lấy [edges[i+1], edges[i])
  const edges = [1, -29, -79, -129, -194, -259, -329, -(VIDEO_DAYS - 1)].map((n) => `${addDays(today, n)}T00:00:00+07:00`);
  // Lỗi (vd statement timeout lúc DB đang bận đồng bộ) thì thử lại 1 lần sau 2 giây; vẫn lỗi → rỗng (lỗi KHÔNG được lưu đệm). refreshSpuSummary từ chối ghi bảng tổng hợp khi không có video.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const parts = await Promise.all(edges.slice(0, -1).map((hi, i) => (i === 0 ? recentVideos : olderVideos)(edges[i + 1], hi)));
      return parts.flat().sort((a, b) => (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0))
        .map(([id, channel_id, published_at, views, product_codes]) => ({ id, channel_id, published_at, views, product_codes }));
    } catch (e) {
      console.error("loadVideoPosts lỗi:", e instanceof Error ? e.message : e);
      if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return [];
}

// Danh sách SKU của file tồn (kèm tên nếu đã có cột name — migration 044)
// Tóm tắt SKU theo SPU (số mã con + tên): hàm SQL sales.spu_sku_summary (migration 047) gom sẵn ~1.500 dòng thay vì kéo ~13.000 SKU; kết quả nhỏ nên lưu đệm DÙNG CHUNG
// mọi máy chủ, chỉ đổi khi nhập tồn kho (invalidateSpuRows xoá). Chưa chạy migration 047 → gom ở máy chủ từ từng SKU như cũ.
type SkuSummary = { code: string; variants: number; name: string | null };
const skuSummaryCached = unstable_cache(
  async () => fetchAll<SkuSummary>((a, b) => sb.sales().rpc("spu_sku_summary").range(a, b) as never),
  ["spu-sku-summary", "v2"], { tags: [TAG.spuData], revalidate: 21_600 },
);
async function loadSkuSummary(): Promise<SkuSummary[]> {
  try { return await skuSummaryCached(); } catch { /* chưa có hàm SQL → đọc từng SKU */ }
  const out = new Map<string, SkuSummary>();
  for (const k of await loadSkus()) {
    const c = spuOf(k.code || k.sku), cur = out.get(c) ?? { code: c, variants: 0, name: null };
    cur.variants += 1;
    if (k.name && !cur.name) cur.name = k.name;
    out.set(c, cur);
  }
  return [...out.values()];
}

// Ảnh SPU nhập từ file Excel (sales.spu_images, migration 049). Lưu đệm chung, xoá khi nhập file; cắt tiền tố link CDN Sapo để đủ nhỏ (giới hạn 2 MB của bộ đệm). Chưa có bảng → rỗng
const IMG_BASE = "https://bizweb.dktcdn.net/100/561/898/products/";
const ownImagesCached = unstable_cache(async () => {
  const rows = await fetchAll<{ code: string; image_url: string }>((a, b) => sb.sales().from("spu_images").select("code, image_url").not("image_url", "is", null).order("code").range(a, b));
  return rows.map((r): [string, string] => [r.code, r.image_url.startsWith(IMG_BASE) ? r.image_url.slice(IMG_BASE.length) : r.image_url]);
}, ["spu-own-images", "v2"], { tags: [TAG.spuData], revalidate: 21_600 });
// Tên sản phẩm theo SPU từ file Sapo (cột name, migration 054) — tách riêng với ảnh để mỗi mục lưu đệm đều nhỏ hơn giới hạn 2 MB. Chưa có cột → rỗng
const ownNamesCached = unstable_cache(async () =>
  (await fetchAll<{ code: string; name: string }>((a, b) => sb.sales().from("spu_images").select("code, name").not("name", "is", null).order("code").range(a, b)))
    .map((r): [string, string] => [r.code, r.name]),
["spu-own-names", "v2"], { tags: [TAG.spuData], revalidate: 21_600 });
// SPU bị LOẠI khỏi mọi thống kê (nhóm "Công cụ dụng cụ" trên Sapo, migration 084: sales.spu_excluded). Chưa chạy migration → rỗng
const excludedCached = unstable_cache(async () =>
  (await fetchAll<{ code: string }>((a, b) => sb.sales().from("spu_excluded").select("code").order("code").range(a, b))).map((r) => r.code.toUpperCase()),
["spu-excluded", "v1"], { tags: [TAG.spuData], revalidate: 21_600 });
async function loadExcluded(): Promise<Set<string>> {
  try { return new Set(await excludedCached()); } catch { return new Set(); }
}
// Tên đại diện của SPU: bỏ qua tên hồ sơ chế tác "(CHẾ TÁC) …" (mỗi SKU chế tác của một SPU thường có tên riêng) khi còn tên khác; nếu mọi tên đều là chế tác thì dùng tên đầu tiên
const isCraftName = (n: string | null | undefined) => /^\s*[(\[]?\s*chế\s*tác/i.test(String(n ?? "").normalize("NFC"));
function pickName(cands: (string | null | undefined)[], fallback: string): string {
  const list = cands.map((c) => c?.trim()).filter((c): c is string => !!c);
  return list.find((c) => !isCraftName(c)) ?? list[0] ?? fallback;
}
async function loadOwnNames(): Promise<Map<string, string>> {
  try { return new Map(await ownNamesCached()); } catch { return new Map(); }
}
async function loadOwnImages(): Promise<[string, string][]> {
  try { return (await ownImagesCached()).map(([c, u]): [string, string] => [c, u.startsWith("http") ? u : IMG_BASE + u]); } catch { return []; }
}

async function loadSkus() {
  type K = { sku: string; code: string; name?: string | null };
  const q = (cols: string) => fetchAll<K>((a, b) => sb.sales().from("inventory_skus").select(cols).order("sku").range(a, b) as never);
  try { return await q("sku, code, name"); }
  catch { try { return await q("sku, code"); } catch { return [] as K[]; } }
}

// Lô nhập kho (sales.stock_receipts, migration 055; nhập ở Cài đặt → Đơn nhập hàng): [SKU, ngày nhập, SL]. Lưu đệm chung, xoá khi nhập file. Chưa có bảng / chưa nhập → rỗng
const receiptsCached = unstable_cache(async () =>
  (await fetchAll<{ sku: string; received_on: string; qty: number }>((a, b) => sb.sales().from("stock_receipts").select("sku, received_on, qty").order("sku").order("received_on", { ascending: false }).range(a, b)))
    .map((r): [string, string, number] => [r.sku.toUpperCase(), r.received_on, Number(r.qty)]),
["stock-receipts", "v2"], { tags: [TAG.spuData], revalidate: 21_600 });
async function loadReceipts() {
  const bySku = new Map<string, [string, number][]>();   // mỗi SKU: các lô mới nhất trước
  let first: string | null = null;
  try {
    for (const [sku, d, q] of await receiptsCached()) { (bySku.get(sku) ?? bySku.set(sku, []).get(sku)!).push([d, q]); if (!first || d < first) first = d; }
  } catch { /* chưa có bảng */ }
  return { bySku, first };
}

// Danh mục Sapo (sales.catalog): chia đoạn 3.000 dòng theo thứ tự mã, mỗi đoạn lưu đệm chung riêng (một mục cache tối đa 2 MB). Đoạn rỗng gần như không tốn gì.
// Quá 8 đoạn (24.000 dòng) thì phần dư bị bỏ qua — tăng CATALOG_CHUNKS nếu danh mục lớn hơn.
type CatalogRow = { code: string; name: string | null; image_url: string | null };
const CATALOG_CHUNK = 3000, CATALOG_CHUNKS = 8;
const catalogChunk = unstable_cache(
  async (i: number): Promise<CatalogRow[]> => fetchAll<CatalogRow>((a, b) => {
    const from = i * CATALOG_CHUNK + a, to = Math.min(i * CATALOG_CHUNK + b, (i + 1) * CATALOG_CHUNK - 1);
    if (from > to) return Promise.resolve({ data: [] as CatalogRow[], error: null });   // fetchAll gửi 6 trang song song (6.000 dòng) > 1 đoạn
    return sb.sales().from("catalog").select("code, name, image_url").order("code").range(from, to);
  }),
  ["spu-catalog-chunk", "v1"], { tags: [TAG.spuData], revalidate: 21_600 },
);
async function loadCatalog(): Promise<CatalogRow[]> {
  try { return (await Promise.all(Array.from({ length: CATALOG_CHUNKS }, (_, i) => catalogChunk(i)))).flat(); } catch { return []; }
}

// Tồn kho nhập từ file; start_date (tuổi tồn FIFO) chỉ có sau migration 040 → thiếu cột thì bỏ qua
type StockRow = { sku?: string; code: string; warehouse: string; stock: number; incoming: number; available: number | null; start_date: string | null };
// Lưu đệm CHUNG (~0,3 MB): chỉ đổi khi nhập file tồn kho (invalidateSpuRows xoá) hoặc sau mỗi lô đồng bộ (bust TAG.spuData)
const stockCached = unstable_cache(async () => loadStockFresh(), ["spu-stock", "v1"], { tags: [TAG.spuData], revalidate: 21_600 });
async function loadStock(): Promise<StockRow[]> { try { return await stockCached(); } catch { return loadStockFresh(); } }
async function loadStockFresh() {
  type R = { sku?: string; code: string; warehouse: string; stock: number; incoming: number | null; available?: number | null; start_date?: string | null };
  const q = (cols: string) => fetchAll<R>((a, b) => sb.sales().from("inventory_stock").select(cols).order("sku").order("warehouse").range(a, b) as never);
  // Thử đủ cột trước; thiếu cột nào (chưa chạy migration 040 / 051) thì bỏ cột đó
  for (const cols of ["sku, code, warehouse, stock, incoming, available, start_date", "sku, code, warehouse, stock, incoming, available", "sku, code, warehouse, stock, incoming, start_date", "sku, code, warehouse, stock, incoming"]) {
    try { return (await q(cols)).map((r) => ({ ...r, incoming: Number(r.incoming ?? 0), available: r.available === null || r.available === undefined ? null : Number(r.available), start_date: r.start_date ?? null })); }
    catch { /* thiếu cột → thử bộ cột ít hơn */ }
  }
  return [] as StockRow[];   // chưa chạy migration / chưa nhập tồn kho
}

// Bán 30 ngày theo SPU (không trừ hoàn, bỏ quà tặng giá 0 và đơn "Đã hủy"), kèm số bán THEO TEAM (theo tag trên đơn / page_id của số Sapo đồng bộ).
// ƯU TIÊN file đơn hàng đã nhập (nút "Nhập số bán") — đầy đủ và do bạn kiểm soát; chưa nhập thì dùng số Sapo đồng bộ (sales.daily_sales).
// Map rỗng = không có nguồn nào → "chưa có dữ liệu bán"
type OrderGroup = { code: string; day: string; staff: string | null; tags: string | null; status: string | null; qty: number; lines: number };
const orderGroupsCached = unstable_cache(
  async (since: string) => fetchAll<OrderGroup>((a, b) => sb.sales().rpc("spu_order_groups", { p_since: `${since}T00:00:00+07:00` }).range(a, b) as never),
  ["spu-order-groups", "v2"], { tags: [TAG.spuData], revalidate: 21_600 },
);
async function loadSold30(since: string, today: string, teamOfLine: (staff: string | null, tags: string | null) => string | null, teamOfChannel: (id: string | null) => string | null, canon: (code: string) => string = (c) => c) {
  const out = new Map<string, number>(), byTeam = new Map<string, Record<string, number>>(), saleLines = new Map<string, SpuSale[]>();
  const add = (code: string, qty: number, team: string | null, day: string) => {
    out.set(code, (out.get(code) ?? 0) + qty);
    (saleLines.get(code) ?? saleLines.set(code, []).get(code)!).push({ age: Math.max(0, dayDiff(day, today)), qty, team });
    if (team) { const m = byTeam.get(code) ?? {}; m[team] = (m[team] ?? 0) + qty; byTeam.set(code, m); }
  };
  const none = { map: out, byTeam, saleLines, source: "none" as "orders" | "sapo" | "none", lines: 0, qty: 0, teamQty: 0, from: null as string | null, to: null as string | null };
  // Đường nhanh: dòng đơn đã gom sẵn trong database (hàm sales.spu_order_groups, migration 047), lưu đệm chung theo ngày bắt đầu; quy tắc (bỏ đơn huỷ, gán team) vẫn tính ở đây
  try {
    const groups = await orderGroupsCached(since);
    if (groups.length) {
      let qty = 0, teamQty = 0, lines = 0;
      const days: string[] = [];
      for (const g of groups) {
        lines += Number(g.lines);
        if (/hủy|huỷ/i.test(g.status ?? "")) continue;
        const n = Number(g.qty), team = teamOfLine(g.staff ?? null, g.tags ?? null);
        days.push(g.day);
        add(canon(spuOf(g.code)), n, team, g.day); qty += n; if (team) teamQty += n;
      }
      days.sort();
      return { map: out, byTeam, saleLines, source: "orders" as const, lines, qty, teamQty, from: days[0] ?? null, to: days[days.length - 1] ?? null };
    }
  } catch { /* chưa chạy migration 047 → đọc từng dòng như cũ */ }
  type L = { code: string; qty: number; status: string | null; ordered_at: string; tags?: string | null; staff?: string | null };
  const q = (cols: string) => fetchAll<L>((a, b) => sb.sales().from("imported_order_lines").select(cols).gt("price", 0).gte("ordered_at", `${since}T00:00:00+07:00`).order("order_id").order("sku").range(a, b) as never);
  try {
    // cột tags / staff có sau migration 045; thiếu thì vẫn đọc được số bán (chỉ chưa chia được theo team)
    let rows: L[];
    try { rows = await q("code, qty, status, ordered_at, tags, staff"); }
    catch { try { rows = await q("code, qty, status, ordered_at, tags"); } catch { rows = await q("code, qty, status, ordered_at"); } }
    if (rows.length) {
      let qty = 0, teamQty = 0;
      const days: string[] = [];
      for (const r of rows) {
        if (/hủy|huỷ/i.test(r.status ?? "")) continue;
        const n = Number(r.qty ?? 0), team = teamOfLine(r.staff ?? null, r.tags ?? null);   // nhân viên phụ trách trước, thiếu thì theo tag kênh
        days.push(vnDay(r.ordered_at));
        add(canon(spuOf(r.code)), n, team, vnDay(r.ordered_at)); qty += n; if (team) teamQty += n;
      }
      days.sort();
      return { map: out, byTeam, saleLines, source: "orders" as const, lines: rows.length, qty, teamQty, from: days[0] ?? null, to: days[days.length - 1] ?? null };
    }
  } catch { /* chưa có bảng → thử số Sapo đồng bộ */ }
  try {
    const rows = await fetchAll<{ code: string; qty_sold: number; page_id: string | null; date: string }>((a, b) => sb.sales().from("daily_sales").select("code, qty_sold, page_id, date").gte("date", since).neq("channel", "bao_hanh").order("date").order("code").range(a, b));
    let qty = 0, teamQty = 0;
    for (const r of rows) {
      const n = Number(r.qty_sold ?? 0), team = teamOfChannel(r.page_id);
      add(canon(spuOf(r.code)), n, team, r.date); qty += n; if (team) teamQty += n;
    }
    if (rows.length) return { map: out, byTeam, saleLines, source: "sapo" as const, lines: rows.length, qty, teamQty, from: since, to: null };
  } catch { /* không có nguồn nào */ }
  return none;
}
