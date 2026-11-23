import "server-only";
import { signImages } from "@/lib/rnd";
import { profileNames } from "@/lib/session";
import { sb } from "@/lib/supabase/admin";

// Chat trao đổi theo từng mẫu (rnd.product_messages, migration 048). Đọc bằng service role; phân quyền ở server action.
export type ChatImage = { path: string; url: string };
export type ChatMessage = { id: string; userId: string; author: string; content: string | null; images: ChatImage[]; recalled: boolean; createdAt: string };
export const CHAT_PAGE = 40;
export const CHAT_COLUMNS = "id, user_id, content, image_paths, recalled_at, created_at";

export type ChatRow = { id: string; user_id: string; content: string; image_paths: string[] | null; recalled_at: string | null; created_at: string };

// Tin bị thu hồi KHÔNG trả nội dung / ảnh về trình duyệt; ảnh được ký link xem tạm
export async function toMessages(rows: ChatRow[]): Promise<ChatMessage[]> {
  const [names, urls] = await Promise.all([
    profileNames(rows.map((r) => r.user_id)),
    signImages(rows.filter((r) => !r.recalled_at).flatMap((r) => r.image_paths ?? [])),
  ]);
  return rows.map((r) => ({
    id: r.id, userId: r.user_id, author: names.get(r.user_id) ?? "Người dùng", createdAt: r.created_at,
    recalled: !!r.recalled_at, content: r.recalled_at ? null : r.content,
    images: r.recalled_at ? [] : (r.image_paths ?? []).flatMap((p) => (urls[p] ? [{ path: p, url: urls[p] }] : [])),
  }));
}

// Trang tin mới nhất (before = lấy các tin cũ hơn mốc đó). Phân trang theo con trỏ thời gian, trả theo thứ tự cũ → mới
export async function loadProductMessages(productId: string, before?: string | null) {
  let q = sb.rnd().from("product_messages").select(CHAT_COLUMNS).eq("product_id", productId)
    .order("created_at", { ascending: false }).limit(CHAT_PAGE + 1);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as ChatRow[];
  const hasMore = rows.length > CHAT_PAGE;
  return { messages: await toMessages(rows.slice(0, CHAT_PAGE).reverse()), hasMore };
}
