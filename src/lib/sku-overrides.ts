import "server-only";
import { unstable_cache } from "next/cache";
import { fetchAll, sb } from "@/lib/supabase/admin";
import { TAG } from "@/lib/cache-tags";

// SKU → SPU khác mã mặc định (sales.sku_spu_overrides, migration 050): dùng khi hai sản phẩm khác nhau bị đặt trùng mã (vd N400622 và N400622-5…9).
// Mã SPU thay thế KHÔNG có dấu "-" (vd N400622X) nên mọi chỗ cắt mã theo dấu "-" (spuOf, hàm SQL) vẫn cho đúng kết quả.
export type SkuOverride = { sku: string; spu_code: string };

const cached = unstable_cache(
  async () => fetchAll<SkuOverride>((a, b) => sb.sales().from("sku_spu_overrides").select("sku, spu_code").order("sku").range(a, b)),
  ["sku-overrides", "v2"], { tags: [TAG.spuData], revalidate: 21_600 },
);

// Lỗi (chưa chạy migration 050) → rỗng, không làm hỏng trang
export async function loadSkuOverrides(): Promise<Map<string, string>> {
  try { return new Map((await cached()).map((r) => [r.sku.toUpperCase(), r.spu_code])); } catch { return new Map(); }
}

// Gán lại mã SPU cho danh sách có trường sku + code theo bảng thay thế
export function applyOverrides<T extends { sku: string; code: string }>(rows: T[], overrides: Map<string, string>) {
  if (!overrides.size) return rows;
  for (const r of rows) { const o = overrides.get(r.sku.toUpperCase()); if (o) r.code = o; }
  return rows;
}
