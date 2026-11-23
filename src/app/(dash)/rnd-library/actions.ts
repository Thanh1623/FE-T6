"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/session";
import { sb } from "@/lib/supabase/admin";

export type ProductHit = { id: string; label: string; name: string };

// Tìm sản phẩm R&D theo mã ST (VST0015), mã SPU (D0002) hoặc tên — để gắn vào video
export async function searchProducts(q: string): Promise<ProductHit[]> {
  await requireActionUser(["admin", "rnd"]);
  const s = q.trim().replace(/[%,()]/g, " ").slice(0, 60);
  if (s.length < 2) return [];
  const { data } = await sb.rnd().from("products").select("id, st_code, code, name")
    .or(`st_code.ilike.%${s}%,code.ilike.%${s}%,name.ilike.%${s}%`).order("created_at", { ascending: false }).limit(8);
  return (data ?? []).map((p) => ({ id: p.id as string, label: (p.code as string) || (p.st_code as string) || "—", name: (p.name as string) ?? "" }));
}

export type SpuHit = { code: string; name: string };
// Tìm SPU theo mã hoặc tên trong bảng tổng hợp SPU (cả SPU chưa có trong bảng R&D) — để gắn mã thủ công vào video
export async function searchSpus(q: string): Promise<SpuHit[]> {
  await requireActionUser(["admin", "rnd"]);
  const s = q.trim().replace(/[%,()*]/g, " ").slice(0, 60);
  if (s.length < 2) return [];
  const { data: meta } = await sb.sales().from("spu_summary_meta").select("run_id").limit(1).maybeSingle();
  if (!meta?.run_id) return [];
  const { data } = await sb.sales().from("spu_summary").select("code, name").eq("run_id", meta.run_id)
    .or(`code.ilike.${s}%,name.ilike.%${s}%`).order("code").limit(8);
  return (data ?? []).map((r) => ({ code: String(r.code), name: String(r.name ?? "") }));
}

// Gắn tay một MÃ SPU vào video (video đã đăng nhưng hashtag chưa có / chưa nhận diện được mã). Lưu ở social.post_codes (migration 081) để lần tách hashtag kế tiếp không xoá mất
export async function attachPostCode(postId: string, rawCode: string) {
  const user = await requireActionUser(["admin", "rnd"]);
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z]{1,4}\d{3,}$/.test(code)) throw new Error("Mã SPU không hợp lệ (VD D0002, N0123)");
  const { error } = await sb.social().from("post_codes").upsert({ post_id: postId, code, linked_by: user.id });
  if (error) throw new Error(error.code === "PGRST205" || error.code === "42P01" ? "Chưa chạy migration 081 trong Supabase" : error.message);
  // Thêm ngay vào mã của video để thống kê / đánh giá tính luôn (không chờ lần tách hashtag kế tiếp)
  const { data: post } = await sb.social().from("posts").select("product_codes, unknown_codes").eq("id", postId).maybeSingle();
  if (!post) throw new Error("Không tìm thấy video");
  const cur = (post.product_codes as string[] | null) ?? [];
  const oldUnk = (post.unknown_codes as string[] | null) ?? [];
  const unk = oldUnk.filter((u) => u !== code);
  if (!cur.includes(code) || unk.length !== oldUnk.length) {
    await sb.social().from("posts").update({ product_codes: cur.includes(code) ? cur : [...cur, code], unknown_codes: unk }).eq("id", postId);
  }
  revalidatePath("/rnd-library");
}

// Bỏ mã gắn tay khỏi video (mã nhận từ hashtag của chính video thì giữ lại)
export async function detachPostCode(postId: string, rawCode: string) {
  await requireActionUser(["admin", "rnd"]);
  const code = rawCode.trim().toUpperCase();
  const { error } = await sb.social().from("post_codes").delete().eq("post_id", postId).eq("code", code);
  if (error) throw new Error(error.message);
  const { data: post } = await sb.social().from("posts").select("product_codes, hashtags").eq("id", postId).maybeSingle();
  const fromTag = ((post?.hashtags as string[] | null) ?? []).some((h) => h.toUpperCase() === code);
  if (post && !fromTag) await sb.social().from("posts").update({ product_codes: ((post.product_codes as string[]) ?? []).filter((c) => c !== code) }).eq("id", postId);
  revalidatePath("/rnd-library");
}

export async function linkPostProduct(postId: string, productId: string) {
  const user = await requireActionUser(["admin", "rnd"]);
  const { data: p } = await sb.rnd().from("products").select("id, code").eq("id", productId).maybeSingle();
  if (!p) throw new Error("Không tìm thấy sản phẩm");
  const { error } = await sb.social().from("post_links").upsert({ post_id: postId, product_id: productId, linked_by: user.id });
  if (error) throw new Error(error.code === "PGRST205" || error.code === "42P01" ? "Chưa chạy migration 023 trong Supabase" : error.message);
  // Có mã SPU → thêm ngay vào mã của video để thống kê / đánh giá tính luôn (không chờ lần tách hashtag kế tiếp)
  if (p.code) {
    const code = String(p.code).toUpperCase();
    const { data: post } = await sb.social().from("posts").select("product_codes").eq("id", postId).maybeSingle();
    const cur = (post?.product_codes as string[] | null) ?? [];
    if (!cur.includes(code)) await sb.social().from("posts").update({ product_codes: [...cur, code] }).eq("id", postId);
  }
  revalidatePath("/rnd-library");
}

export async function unlinkPostProduct(postId: string, productId: string) {
  await requireActionUser(["admin", "rnd"]);
  const { error } = await sb.social().from("post_links").delete().eq("post_id", postId).eq("product_id", productId);
  if (error) throw new Error(error.message);
  revalidatePath("/rnd-library");
}
