import "server-only";
import { sb } from "@/lib/supabase/admin";

// Số liệu bài đăng theo mã mẫu do DATABASE tính (hàm social.rnd_code_stats, migration 057) — thay cho việc kéo hàng chục nghìn bài về cộng trong code.
// Mỗi phần tử: id (khoá kết quả), codes (các mã — bài gắn BẤT KỲ mã nào, tính 1 lần), from / to (YYYY-MM-DD giờ VN, null = không giới hạn).
// Trả null khi chưa chạy migration 057 (hoặc lỗi) → nơi gọi quay về cách tính cũ.
export type CodeStat = { first: string | null; posts: number; videos: number; views: number; viewers: number; reactions: number; comments: number; shares: number; clicks: number; topUrl: string | null };
export type CodeStatItem = { id: string; codes: string[]; from?: string | null; to?: string | null };

export async function rndCodeStats(items: CodeStatItem[]): Promise<Map<string, CodeStat> | null> {
  if (!items.length) return new Map();
  const payload = items.map((i) => ({ id: i.id, codes: [...new Set(i.codes.map((c) => c.toUpperCase()))].join(","), d_from: i.from ?? null, d_to: i.to ?? null }));
  const { data, error } = await sb.social().rpc("rnd_code_stats", { p_items: payload });
  if (error) return null;
  const out = new Map<string, CodeStat>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    out.set(String(r.id), {
      first: (r.first_day as string | null) ?? null, posts: Number(r.posts ?? 0), videos: Number(r.videos ?? 0), views: Number(r.views ?? 0), viewers: Number(r.viewers ?? 0),
      reactions: Number(r.reactions ?? 0), comments: Number(r.comments ?? 0), shares: Number(r.shares ?? 0), clicks: Number(r.clicks ?? 0), topUrl: (r.top_url as string | null) ?? null,
    });
  }
  return out;
}
