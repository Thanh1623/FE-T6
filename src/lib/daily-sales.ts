import "server-only";
import { unstable_cache } from "next/cache";
import { fetchAll, sb } from "@/lib/supabase/admin";
import { TAG } from "@/lib/cache-tags";
import { TT_NAME_PREFIX, normTikTokName } from "@/lib/tiktok/name";

// SỐ BÁN THEO NGÀY dùng chung cho mọi báo cáo (thẻ mẫu, bảng R&D, tổng quan giao mẫu, SP Win, tự chấm Win, đánh giá TMH…).
// Nguồn: ƯU TIÊN file đơn hàng đã nhập ("Nhập số bán" → sales.imported_order_lines — do bạn kiểm soát, cập nhật tới ngày nhập) cho các ngày file phủ được;
// ngày NGOÀI khoảng file (cũ hơn / mới hơn) lấy từ số đồng bộ Qlydonhang (sales.daily_sales) để không mất lịch sử. Mỗi ngày chỉ lấy từ MỘT nguồn → không tính trùng.
// Quy tắc số bán từ file giống trang Theo dõi đẩy hàng: bỏ quà tặng giá 0 và đơn "Đã hủy", KHÔNG trừ hoàn (qty_returned = 0).
export type SaleRow = {
  code: string; date: string; page_id: string; channel: string; qty_sold: number; qty_returned: number;
  fromFile: boolean;                                            // true = lấy từ file đơn hàng đã nhập
  revenue: number; returned_value: number; cost: number; returned_cost: number;   // tiền: file chỉ có đơn giá × SL (revenue); giá vốn chỉ có ở số đồng bộ
};
export type SalesQuery = {
  codes?: string[];          // mã Sapo (SPU), viết HOA; bỏ trống = mọi mã
  from: string; to?: string; // YYYY-MM-DD (giờ VN), bao gồm hai đầu
  channels?: string[];       // chỉ các kênh bán này (facebook, tiktok_shop, web…); bỏ trống = mọi kênh (trừ bảo hành, trừ khi keepWarranty)
  pageIds?: string[];        // chỉ các Page / kênh TikTok này (suy từ tag đơn hàng với số từ file)
  keepWarranty?: boolean;    // giữ kênh bảo hành
  fresh?: boolean;           // true = bỏ qua lưu đệm, đọc thẳng database (tự chấm Win sau đồng bộ cần số mới nhất)
};

const DAY = 86_400_000;
const vnDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);

// Nguồn đơn (cột "Nguồn" của file Sapo) → mã kênh bán đã dùng ở số đồng bộ
const CHANNEL_OF_SOURCE: [RegExp, string][] = [
  [/bao\s*hanh|bảo\s*hành/i, "bao_hanh"], [/tiktok\s*shop/i, "tiktok_shop"], [/tiktok/i, "tiktok"], [/shopee/i, "shopee"], [/zalo/i, "zalo"],
  [/facebook|live[-\s]*fb|messenger/i, "facebook"], [/instagram/i, "instagram"], [/pos|cửa\s*hàng|cua\s*hang|store/i, "cua_hang"], [/web/i, "web"],
];
export const channelOfSource = (source: string | null | undefined) => {
  const s = String(source ?? "").normalize("NFC");
  return CHANNEL_OF_SOURCE.find(([re]) => re.test(s))?.[1] ?? "khac";
};

// Page / kênh TikTok của đơn: tag "page_id_<số>" → Trang Facebook; "tiktok_business_<tên>" → kênh TikTok (cùng cách ghép của số đồng bộ)
export function pageOfTags(tags: string | null | undefined): string {
  if (!tags) return "";
  const parts = tags.split(",").map((t) => t.trim());
  for (const t of parts) { const m = t.match(/^(?:page_id_)?(\d{6,})$/i); if (m) return m[1]; }
  for (const t of parts) { const m = t.match(/^tiktok_business_(?!id_)(.+)$/i); if (m) return TT_NAME_PREFIX + normTikTokName(m[1]); }
  return "";
}

// Khoảng ngày file đơn hàng phủ được (giờ VN); null = chưa nhập file / chưa có bảng. Nhớ 60 giây trong tiến trình
let winCache: { at: number; win: { from: string; to: string } | null } | null = null;
export async function importWindow() {
  if (winCache && Date.now() - winCache.at < 60_000) return winCache.win;
  let win: { from: string; to: string } | null = null;
  try {
    const edge = async (asc: boolean) => {
      const { data, error } = await sb.sales().from("imported_order_lines").select("ordered_at").gt("price", 0).order("ordered_at", { ascending: asc }).limit(1);
      if (error) throw error;
      return data?.[0]?.ordered_at as string | undefined;
    };
    const [a, b] = await Promise.all([edge(true), edge(false)]);
    if (a && b) win = { from: vnDay(a), to: vnDay(b) };
  } catch { win = null; }
  winCache = { at: Date.now(), win };
  return win;
}
export const invalidateImportWindow = () => { winCache = null; };

const chunks = <T,>(l: T[], n: number) => { const o: T[][] = []; for (let i = 0; i < l.length; i += n) o.push(l.slice(i, i + n)); return o; };

// Lưu đệm 6 giờ (số bán nhập ~1 lần/ngày) DÙNG CHUNG theo đúng tham số truy vấn (hàm này là truy vấn lặp nhiều nhất vào database); bị xoá khi nhập đơn hàng / đồng bộ xong (TAG.spuData).
// Kết quả quá 2 MB thì Next không lưu được — vẫn trả đúng, chỉ không đệm.
const salesCached = unstable_cache(async (q: SalesQuery, day: string): Promise<SaleRow[]> => { void day; return loadDailySalesDb(q); },
  ["daily-sales", "v1"], { tags: [TAG.spuData], revalidate: 21_600 });
export async function loadDailySales(q: SalesQuery): Promise<SaleRow[]> {
  if (q.fresh) return loadDailySalesDb(q);
  const norm: SalesQuery = { ...q, codes: q.codes ? [...new Set(q.codes.map((c) => c.toUpperCase()))].sort() : undefined, channels: q.channels ? [...q.channels].sort() : undefined, pageIds: q.pageIds ? [...q.pageIds].sort() : undefined };
  return salesCached(norm, vnDay(new Date().toISOString()));   // day: sang ngày mới thì khoá đệm đổi
}

async function loadDailySalesDb(q: SalesQuery): Promise<SaleRow[]> {
  const today = vnDay(new Date().toISOString());
  const to = q.to && q.to < today ? q.to : today;   // chưa có số bán của ngày tương lai: không hỏi DB các ngày đó (trước đây hỏi cả 7 ngày kế tiếp, luôn trả rỗng)
  if (to < q.from) return [];
  const codes = q.codes ? [...new Set(q.codes.map((c) => c.toUpperCase()))] : null;
  if (codes && !codes.length) return [];
  const win = await importWindow();
  const fileFrom = win ? (q.from > win.from ? q.from : win.from) : null, fileTo = win ? (to < win.to ? to : win.to) : null;
  const useFile = !!(win && fileFrom && fileTo && fileFrom <= fileTo);

  // Các khoảng ngày lấy từ số đồng bộ: phần nằm ngoài khoảng file
  const syncRanges: [string, string][] = [];
  if (!useFile) syncRanges.push([q.from, to]);
  else {
    if (q.from < win!.from) syncRanges.push([q.from, addDays(win!.from, -1) < to ? addDays(win!.from, -1) : to]);
    if (to > win!.to) syncRanges.push([addDays(win!.to, 1) > q.from ? addDays(win!.to, 1) : q.from, to]);
  }

  const out: SaleRow[] = [];
  const keepCh = (ch: string) => (q.channels?.length ? q.channels.includes(ch) : q.keepWarranty || ch !== "bao_hanh");
  const keepPage = (p: string) => !q.pageIds || q.pageIds.includes(p);

  const jobs: Promise<void>[] = [];
  // 1) Số đồng bộ Qlydonhang (daily_sales) cho các ngày ngoài khoảng file
  for (const [a, b] of syncRanges) {
    for (const part of codes ? chunks(codes, 100) : [null]) {
      jobs.push((async () => {
        type D = { code: string; date: string; page_id: string | null; channel: string | null; qty_sold: number; qty_returned: number; revenue?: number; returned_value?: number; cost?: number; returned_cost?: number };
        const read = (cols: string) => fetchAll<D>((x, y) => {
          let sel = sb.sales().from("daily_sales").select(cols).gte("date", a).lte("date", b);
          if (part) sel = sel.in("code", part);
          return sel.order("date").order("code").range(x, y) as never;
        });
        // cột tiền (revenue, cost…) đã bị bỏ ở migration 028 trên một số môi trường → đọc lại không kèm
        const rows = await read("code, date, page_id, channel, qty_sold, qty_returned, revenue, returned_value, cost, returned_cost").catch(() => read("code, date, page_id, channel, qty_sold, qty_returned"));
        for (const r of rows) {
          const ch = r.channel ?? "khac", page = r.page_id ?? "";
          if (!keepCh(ch) || !keepPage(page)) continue;
          out.push({ code: String(r.code).toUpperCase(), date: r.date, page_id: page, channel: ch, qty_sold: Number(r.qty_sold ?? 0), qty_returned: Number(r.qty_returned ?? 0), fromFile: false,
            revenue: Number(r.revenue ?? 0), returned_value: Number(r.returned_value ?? 0), cost: Number(r.cost ?? 0), returned_cost: Number(r.returned_cost ?? 0) });
        }
      })());
    }
  }
  // 2) File đơn hàng đã nhập cho các ngày trong khoảng file
  if (useFile) {
    for (const part of codes ? chunks(codes, 100) : [null]) {
      jobs.push((async () => {
        const lines = await fetchAll<{ code: string; ordered_at: string; qty: number; price: number; status: string | null; source: string | null; tags: string | null }>((x, y) => {
          let sel = sb.sales().from("imported_order_lines").select("code, ordered_at, qty, price, status, source, tags").gt("price", 0)
            .gte("ordered_at", `${fileFrom}T00:00:00+07:00`).lte("ordered_at", `${fileTo}T23:59:59+07:00`);
          if (part) sel = sel.in("code", part);
          return sel.order("order_id").order("sku").range(x, y);
        }).catch(async () => {   // chưa chạy migration 045 (cột tags): đọc không kèm tag — chưa lọc được theo Page
          return (await fetchAll<{ code: string; ordered_at: string; qty: number; price: number; status: string | null; source: string | null }>((x, y) => {
            let sel = sb.sales().from("imported_order_lines").select("code, ordered_at, qty, price, status, source").gt("price", 0)
              .gte("ordered_at", `${fileFrom}T00:00:00+07:00`).lte("ordered_at", `${fileTo}T23:59:59+07:00`);
            if (part) sel = sel.in("code", part);
            return sel.order("order_id").order("sku").range(x, y);
          })).map((l) => ({ ...l, tags: null }));
        });
        for (const l of lines) {
          if (/hủy|huỷ/i.test(l.status ?? "")) continue;
          const ch = channelOfSource(l.source), page = pageOfTags(l.tags);
          if (!keepCh(ch) || !keepPage(page)) continue;
          const qty = Number(l.qty ?? 0);
          out.push({ code: l.code.toUpperCase(), date: vnDay(l.ordered_at), page_id: page, channel: ch, qty_sold: qty, qty_returned: 0, fromFile: true,
            revenue: Number(l.price ?? 0) * qty, returned_value: 0, cost: 0, returned_cost: 0 });
        }
      })());
    }
  }
  await Promise.all(jobs);
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}
