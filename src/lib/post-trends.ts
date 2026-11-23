import "server-only";
import { sb } from "@/lib/supabase/admin";
import { trendOf, type Trend } from "@/lib/trend";

// Xu hướng lượt xem cho 1 nhóm bài (đọc social.post_daily, ~16 ngày gần nhất). Chưa chạy migration 024 → trả bản đồ rỗng.
export async function postTrends(postIds: string[]): Promise<Map<string, Trend>> {
  const out = new Map<string, Trend>();
  if (!postIds.length) return out;
  const since = new Date(Date.now() - 17 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await sb.social().from("post_daily").select("post_id, date, views").in("post_id", postIds).gte("date", since).order("date");
  if (error) return out;
  const by = new Map<string, { date: string; views: number }[]>();
  for (const r of data ?? []) by.set(r.post_id as string, [...(by.get(r.post_id as string) ?? []), { date: r.date as string, views: Number(r.views) }]);
  for (const [id, snaps] of by) out.set(id, trendOf(snaps));
  return out;
}
