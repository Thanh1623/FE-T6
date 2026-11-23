import "server-only";
import { sb } from "@/lib/supabase/admin";
import { loadDailySales } from "@/lib/daily-sales";
import { isRndEditor, type CurrentUser } from "@/lib/session";
import { isTestCode } from "@/lib/tags";
import { spuOf } from "@/lib/spu-code";

// Liên kết Mã SPU test (luồng Media, T10001) ↔ Mã SPU thương mại (Sapo, N0123) — migration 035.
// Mã test giữ nguyên làm mã của mẫu; liên kết chỉ nói "bài gắn #N0123 thuộc mẫu này" và đặt ngày mở bán:
//   trước ngày mở bán = giai đoạn test · từ ngày mở bán = giai đoạn thương mại. Luồng R&D không dùng (R&D gắn thẳng mã SPU).
export type CodeLink = { id: string; product_id: string; test_code: string; sku_code: string; launch_date: string; note: string | null; created_at: string };

const vnDate = (iso: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
const SKU_SHAPE = /^[A-Z]{1,4}[0-9]{3,}$/;

// Bảng chưa tạo (chưa chạy migration 035) → coi như chưa có liên kết nào, không làm hỏng trang / lượt đánh giá
export async function loadCodeLinks(): Promise<CodeLink[]> {
  const { data, error } = await sb.rnd().from("product_code_links").select("id, product_id, test_code, sku_code, launch_date, note, created_at").order("created_at");
  if (error) return [];
  return (data ?? []) as CodeLink[];
}

// Bộ tra mã → liên kết; dùng ở engine (gom bài về mẫu test) và thống kê
export function linkIndex(links: CodeLink[]) {
  const bySku = new Map(links.map((l) => [l.sku_code, l]));
  const byTest = new Map<string, CodeLink[]>();
  for (const l of links) byTest.set(l.test_code, [...(byTest.get(l.test_code) ?? []), l]);
  return { bySku, byTest };
}

// Mã hashtag của 1 bài sau khi gom về mẫu test: bài đăng từ ngày mở bán trở đi thuộc giai đoạn thương mại → không tính vào đánh giá test
export function testPhaseCodes(codes: string[], publishedAt: string, links: CodeLink[]): string[] {
  if (!links.length) return codes;
  const { bySku, byTest } = linkIndex(links);
  const day = vnDate(publishedAt);
  const out = new Set<string>();
  for (const c of codes) {
    const l = bySku.get(c) ?? byTest.get(c)?.[0];
    if (!l) { out.add(c); continue; }
    if (day < l.launch_date) out.add(l.test_code);
  }
  return [...out];
}

async function assertCanLink(user: CurrentUser) {
  if (!isRndEditor(user) && user.role !== "media") throw new Error("Chỉ Quản lý / R&D / Media gắn mã SPU");
}

export async function linkSpu(user: CurrentUser, productId: string, rawSku: string, launchDate: string, note: string) {
  await assertCanLink(user);
  const sku = spuOf(rawSku).replace(/\s+/g, "");   // dán cả N0123-00-S-WH vẫn được
  if (!SKU_SHAPE.test(sku)) throw new Error("Mã SPU phải là 1–4 chữ cái + ít nhất 3 số, VD N0123");
  if (isTestCode(sku)) throw new Error("Đây là mã test — nhập mã SPU thương mại của Sapo");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(launchDate)) throw new Error("Chọn ngày mở bán");

  const { data: p } = await sb.rnd().from("products").select("id, code, stage, entry_source").eq("id", productId).maybeSingle();
  if (!p) throw new Error("Không tìm thấy mẫu");
  if (!p.code || !isTestCode(p.code)) throw new Error("Chỉ mẫu mang mã SPU test (luồng Media) mới cần gắn SPU. Mẫu R&D dùng thẳng mã SPU");

  let ownerToDrop: string | null = null;
  const { data: owner } = await sb.rnd().from("products").select("id, stage, code").eq("code", sku).maybeSingle();
  if (owner && owner.id !== productId) {
    if (owner.stage) throw new Error(`Mã ${sku} đã thuộc một mẫu R&D khác`);
    // Mẫu tự động sinh từ bài đăng gắn #SKU (chưa vào quy trình): chỉ bỏ nếu chưa có kết luận / phiên test / phiếu giao
    const [d, t, h] = await Promise.all([
      sb.rnd().from("decisions").select("id", { count: "exact", head: true }).eq("product_id", owner.id),
      sb.rnd().from("test_sessions").select("id", { count: "exact", head: true }).eq("product_id", owner.id),
      sb.rnd().from("handoffs").select("id", { count: "exact", head: true }).eq("product_id", owner.id),
    ]);
    if ((d.count ?? 0) + (t.count ?? 0) + (h.count ?? 0) > 0) throw new Error(`Mã ${sku} đang có kết luận / phiên test của một mẫu khác — xử lý mẫu đó trước`);
    ownerToDrop = owner.id;
  }
  const { error } = await sb.rnd().from("product_code_links").insert({
    product_id: productId, test_code: p.code, sku_code: sku, launch_date: launchDate, note: note.trim() || null, created_by: user.id,
  });
  if (error) throw new Error(error.code === "23505" ? `Mã ${sku} đã được gắn cho mẫu khác` : error.message);
  // Chỉ xoá mẫu tự sinh cũ SAU KHI đã gắn được (trước đây xoá trước, gắn lỗi thì mất mẫu cũ mà không có liên kết)
  if (ownerToDrop) {
    await sb.rnd().from("evaluations").delete().eq("code", sku);
    await sb.rnd().from("product_events").delete().eq("product_id", ownerToDrop);
    const { error: de } = await sb.rnd().from("products").delete().eq("id", ownerToDrop);
    if (de) throw new Error(`Đã gắn mã SPU nhưng chưa xoá được mẫu tự sinh cũ: ${de.message}`);
  }
  await sb.rnd().from("product_events").insert({ product_id: productId, actor_id: user.id, action: "spu_linked", changes: { spu: [null, sku], launch_date: [null, launchDate] } });
  return { sku };
}

export async function unlinkSpu(user: CurrentUser, linkId: string) {
  await assertCanLink(user);
  const { data: l } = await sb.rnd().from("product_code_links").select("id, product_id, sku_code").eq("id", linkId).maybeSingle();
  if (!l) throw new Error("Không tìm thấy liên kết");
  const { error } = await sb.rnd().from("product_code_links").delete().eq("id", linkId);
  if (error) throw new Error(error.message);
  await sb.rnd().from("product_events").insert({ product_id: l.product_id, actor_id: user.id, action: "spu_unlinked", changes: { spu: [l.sku_code, null] } });
}

// ---------- Thống kê theo giai đoạn ----------
export type PhaseStats = { posts: number; videos: number; views: number; viewers: number; reactions: number; clicks: number };
export type Lifecycle = { link: CodeLink; test: PhaseStats; commercial: PhaseStats & { qtySold: number; qtyReturned: number } };

const emptyPhase = (): PhaseStats => ({ posts: 0, videos: 0, views: 0, viewers: 0, reactions: 0, clicks: 0 });

// Giai đoạn test = bài đăng trước ngày mở bán (gắn mã test hoặc mã SPU) · thương mại = từ ngày mở bán (gắn mã test hoặc mã SPU), số bán theo mã SPU.
// Mỗi bài chỉ tính 1 lần dù gắn cả 2 mã.
export async function lifecycleOf(link: CodeLink): Promise<Lifecycle> {
  const codes = [link.test_code, link.sku_code];
  const [{ data: posts }, sales] = await Promise.all([
    sb.social().from("posts").select("id, published_at, kind, views, viewers, reactions, clicks").overlaps("product_codes", codes).limit(2000),
    loadDailySales({ codes: [link.sku_code], from: link.launch_date }),   // file đơn hàng đã nhập + số đồng bộ cho ngày ngoài khoảng file
  ]);
  const test = emptyPhase(), com = { ...emptyPhase(), qtySold: 0, qtyReturned: 0 };
  for (const p of posts ?? []) {
    const t = vnDate(p.published_at as string) < link.launch_date ? test : com;
    t.posts += 1;
    if (p.kind === "video" || p.kind === "reel") t.videos += 1;
    t.views += Number(p.views ?? 0); t.viewers += Number(p.viewers ?? 0); t.reactions += Number(p.reactions ?? 0); t.clicks += Number(p.clicks ?? 0);
  }
  for (const r of sales) { com.qtySold += r.qty_sold; com.qtyReturned += r.qty_returned; }
  return { link, test, commercial: com };
}
