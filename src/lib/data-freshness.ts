import "server-only";
import { sb } from "@/lib/supabase/admin";

// "Độ mới" của các bộ dữ liệu nhập tay từ file: lần nhập cuối, ngày dữ liệu phủ tới, nhịp cập nhật khuyến nghị và cảnh báo khi quá hạn.
// Dùng ở Cài đặt (bảng độ mới) và trang Theo dõi đẩy hàng (dải cảnh báo khi tồn kho / đơn hàng quá cũ).
export type FreshKey = "stock" | "orders" | "receipts" | "images" | "videos";
export type Freshness = {
  key: FreshKey; label: string;
  lastAt: string | null;        // lần nhập cuối (ISO)
  coverTo: string | null;       // ngày dữ liệu phủ tới (YYYY-MM-DD), nếu file có
  ageDays: number | null;       // số ngày (lịch VN) từ lần nhập cuối
  cadence: string;              // nhịp cập nhật khuyến nghị
  warnAfterDays: number;        // quá số ngày này mà chưa nhập → cảnh báo
  why: string;                  // vì sao cần cập nhật theo nhịp đó
  status: "ok" | "warn" | "never";
};

const DAY = 86_400_000;
const vnDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));

// Nhịp khuyến nghị: tồn kho + đơn hàng mỗi ngày (số liệu đổi hằng ngày); đơn nhập hàng mỗi tuần (hoặc sau đợt hàng về lớn — thiếu lô thì hàng mới nhập bị tính là "cũ");
// ảnh / tên sản phẩm mỗi tháng hoặc khi ra mẫu mới (SKU mới)
const SPEC: Record<FreshKey, Pick<Freshness, "label" | "cadence" | "warnAfterDays" | "why">> = {
  stock: { label: "Tồn kho", cadence: "Mỗi ngày", warnAfterDays: 2, why: "Số tồn, hàng đang về và các cờ Tồn xấu / Bán chậm / Hết hàng đều dựa trên file này." },
  orders: { label: "Đơn hàng (số bán)", cadence: "Mỗi ngày", warnAfterDays: 2, why: "Số bán 30 ngày, phân loại Bán chạy / thường / chậm và mọi báo cáo số bán dựa trên file này; ngày sau lần nhập cuối thiếu số." },
  receipts: { label: "Đơn nhập hàng", cadence: "Mỗi tuần (và sau đợt hàng về lớn)", warnAfterDays: 7, why: "Tính thời gian tồn theo lô nhập. Nhập trễ thì hàng mới về chưa có lô và bị tính là tồn cũ." },
  videos: { label: "Video từ API", cadence: "Mỗi ngày (tự động)", warnAfterDays: 2, why: "Video đăng mới, lượt xem và video cũ bỗng nổi lấy từ API thống kê video; nút Đồng bộ ngay ở Cài đặt." },
  images: { label: "Ảnh & tên sản phẩm", cadence: "Mỗi tháng, hoặc khi ra mẫu / mã mới", warnAfterDays: 30, why: "Ảnh, tên chuẩn và việc tách SPU trùng mã chỉ đổi khi có sản phẩm mới." },
};

async function latest(table: string, col: string, extra?: string): Promise<{ at: string | null; to: string | null }> {
  try {
    const { data, error } = await sb.sales().from(table).select(extra ? `${col}, ${extra}` : col).order(col, { ascending: false }).limit(1);
    if (error) throw error;
    const row = (data?.[0] ?? null) as unknown as Record<string, string | null> | null;
    return { at: row?.[col] ?? null, to: extra ? row?.[extra] ?? null : null };
  } catch { return { at: null, to: null }; }   // chưa có bảng → coi như chưa nhập
}

// Lần đồng bộ video từ API thành công gần nhất (core.sync_runs, job "videos_api")
async function lastVideoRun(): Promise<{ at: string | null; to: string | null; message: string | null }> {
  try {
    const { data, error } = await sb.core().from("sync_runs").select("finished_at, message").eq("job", "videos_api").eq("status", "success").order("finished_at", { ascending: false }).limit(1);
    if (error) throw error;
    return { at: (data?.[0]?.finished_at as string | null) ?? null, to: null, message: (data?.[0]?.message as string | null) ?? null };
  } catch { return { at: null, to: null, message: null }; }
}

export async function loadFreshness(): Promise<Record<FreshKey, Freshness> & { videoMessage: string | null }> {
  const [stock, orders, receipts, images, videos] = await Promise.all([
    latest("inventory_imports", "created_at"),
    latest("sales_imports", "created_at", "date_to"),
    latest("receipt_imports", "created_at", "date_to"),
    latest("spu_images", "updated_at"),
    lastVideoRun(),
  ]);
  const today = vnDay(new Date().toISOString());
  const make = (key: FreshKey, v: { at: string | null; to: string | null }): Freshness => {
    const ageDays = v.at ? Math.round((Date.parse(today) - Date.parse(vnDay(v.at))) / DAY) : null;
    const s = SPEC[key];
    return { key, ...s, lastAt: v.at, coverTo: v.to, ageDays, status: ageDays === null ? "never" : ageDays >= s.warnAfterDays ? "warn" : "ok" };
  };
  return { stock: make("stock", stock), orders: make("orders", orders), receipts: make("receipts", receipts), images: make("images", images), videos: make("videos", videos), videoMessage: videos.message };
}
