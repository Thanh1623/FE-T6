import "server-only";

// Nguồn số bán qua REST API (thay cho đọc thẳng Qlydonhang). Bật khi có SALES_API_URL; không có → đồng bộ vẫn dùng RPC Qlydonhang.
//   SALES_API_URL   gốc API, VD https://api.example.com/v1   ·   SALES_API_KEY  (tuỳ chọn) gửi dạng "Authorization: Bearer <key>"
// Hợp đồng (JSON, tên trường giữ nguyên như hàm RPC cũ để đồng bộ không phải đổi):
//   GET {url}/daily-sales?since=YYYY-MM-DD[&until=YYYY-MM-DD]  → [{ product_code, sale_date, page_id, channel, qty_sold, qty_returned }]
//   GET {url}/catalog?offset=0&limit=1000                      → [{ product_code, name, image_url, base_masp, first_seen_at }]  (hết khi trả < limit dòng)
export type ApiSaleRow = { sale_date: string; product_code: string; page_id: string; channel: string; qty_sold: number; qty_returned: number };
export type ApiCatalogRow = { product_code: string; name: string; image_url: string | null; base_masp: string; first_seen_at?: string | null };

export const salesApiEnabled = () => !!process.env.SALES_API_URL;

async function get<T>(path: string, params: Record<string, string | number | null>): Promise<T[]> {
  const url = new URL(`${process.env.SALES_API_URL!.replace(/\/+$/, "")}/${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== null) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...(process.env.SALES_API_KEY ? { Authorization: `Bearer ${process.env.SALES_API_KEY}` } : {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Sales API ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  if (!Array.isArray(body)) throw new Error(`Sales API ${path}: phản hồi không phải mảng JSON`);
  return body as T[];
}

export const fetchApiSales = (since: string, until: string | null) => get<ApiSaleRow>("daily-sales", { since, until });

export async function fetchApiCatalog(): Promise<ApiCatalogRow[]> {
  const out: ApiCatalogRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const rows = await get<ApiCatalogRow>("catalog", { offset, limit: 1000 });
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
