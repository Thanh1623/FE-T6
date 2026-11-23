import "server-only";
import { unstable_cache } from "next/cache";
import { fetchAll, sb } from "@/lib/supabase/admin";
import { TAG } from "@/lib/cache-tags";

// BẢNG QUY ĐỔI MÃ SPU CŨ → MỚI (sales.spu_aliases, migration 066): gộp tồn, số bán và video của mã cũ vào SPU mới khi tổng hợp.
// KHÔNG sửa dữ liệu gốc — tồn kho, số bán, bài đăng, đánh giá vẫn mang mã cũ; chỉ khi gom theo SPU thì mã cũ được quy về mã mới (xoá dòng trong bảng = hoàn tác).
// SPU cũ tách theo cỡ đá sang nhiều SPU mới không dùng bảng này mà dùng sales.sku_spu_overrides (theo từng SKU).
// Chưa chạy migration 066 / lỗi đọc → bảng rỗng, mọi thứ chạy như cũ.
const cached = unstable_cache(
  async () => fetchAll<{ old_code: string; new_code: string }>((a, b) => sb.sales().from("spu_aliases").select("old_code, new_code").order("old_code").range(a, b)),
  ["spu-aliases", "v1"], { tags: [TAG.spuData], revalidate: 21_600 },
);

export type SpuAliases = Map<string, string>;
export async function loadSpuAliases(): Promise<SpuAliases> {
  try { return new Map((await cached()).map((r) => [r.old_code.toUpperCase(), r.new_code.toUpperCase()])); } catch { return new Map(); }
}
// Quy mã về mã SPU mới (mã không có trong bảng giữ nguyên)
export const canonOf = (aliases: SpuAliases) => (code: string) => aliases.get(code.toUpperCase()) ?? code;
// Mọi mã cũ đã gộp vào một SPU mới (để lọc bài đăng / video theo SPU gồm cả bài còn gắn mã cũ)
export const oldCodesOf = (aliases: SpuAliases, code: string) => [...aliases].filter(([, n]) => n === code.toUpperCase()).map(([o]) => o);
// Danh sách mã + toàn bộ mã cũ đã gộp vào các mã đó (truy vấn theo mã SPU mới phải lấy luôn dữ liệu của mã cũ). Bảng rỗng → trả nguyên danh sách, không tốn thêm.
export function expandCodes(aliases: SpuAliases, codes: string[]): string[] {
  if (!aliases.size) return codes;
  const want = new Set(codes.map((c) => c.toUpperCase()));
  const out = new Set(codes);
  for (const [o, n] of aliases) if (want.has(n)) out.add(o);
  return [...out];
}
// Bài đăng với product_codes đã quy về mã SPU mới (khử trùng); bảng rỗng → giữ nguyên mảng gốc
export function canonPosts<T extends { product_codes: string[] }>(aliases: SpuAliases, posts: T[]): T[] {
  if (!aliases.size) return posts;
  const canon = canonOf(aliases);
  return posts.map((p) => ({ ...p, product_codes: [...new Set(p.product_codes.map(canon))] }));
}
