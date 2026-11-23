import "server-only";
import { sb } from "@/lib/supabase/admin";
import { addGain, emptyTotals, gainInRange, shiftDay, type RangeTotals, type SnapAt } from "@/lib/eval/views-window";

const vnDay = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(ms));

export type CodedPost = {
  id: string; published_at: string; kind: string; product_codes: string[];
  views: number; viewers: number; reactions: number; clicks: number;
};

// Ảnh chụp mới nhất của từng bài tính đến `day` (RPC social.post_stats_at, migration 026). Chưa có migration → rỗng (rơi về cách "chỉ bài đăng trong kỳ").
export async function snapshotsAt(postIds: string[], day: string): Promise<Map<string, SnapAt>> {
  const out = new Map<string, SnapAt>();
  if (!postIds.length) return out;
  const chunks: string[][] = [];
  for (let i = 0; i < postIds.length; i += 800) chunks.push(postIds.slice(i, i + 800));
  const results = await Promise.all(chunks.map((ids) => sb.social().rpc("post_stats_at", { p_post_ids: ids, p_day: day })));
  for (const { data, error } of results) {
    if (error) continue;
    for (const r of (data ?? []) as { post_id: string; day: string; views: number; viewers: number; reactions: number; clicks: number }[]) {
      out.set(r.post_id, { day: r.day, views: Number(r.views), viewers: Number(r.viewers), reactions: Number(r.reactions), clicks: Number(r.clicks) });
    }
  }
  return out;
}

// Lượt xem (cùng người xem, tương tác) TRONG [from, to] theo từng mã SP — gồm cả video đăng từ trước kỳ nếu đã có ảnh chụp đủ gần.
// Bài đăng nhiều mã được tính cho từng mã. unknown = số bài cũ chưa đủ lịch sử (không tính vào số); approx = số bài phải xấp xỉ mốc cuối.
export async function codeViewsInRange(posts: CodedPost[], from: string, to: string): Promise<Map<string, RangeTotals>> {
  const today = vnDay(Date.now());
  const pubDay = new Map(posts.map((p) => [p.id, vnDay(Date.parse(p.published_at))]));
  const old = posts.filter((p) => pubDay.get(p.id)! < from).map((p) => p.id);
  const [endSnaps, baseSnaps] = await Promise.all([
    to < today ? snapshotsAt(posts.filter((p) => pubDay.get(p.id)! <= to).map((p) => p.id), to) : new Map<string, SnapAt>(),
    old.length ? snapshotsAt(old, shiftDay(from, -1)) : new Map<string, SnapAt>(),
  ]);

  const out = new Map<string, RangeTotals>();
  for (const p of posts) {
    const d = pubDay.get(p.id)!;
    if (d > to) continue;
    const g = gainInRange({
      pubDay: d, from, to, today,
      cur: { views: Number(p.views), viewers: Number(p.viewers), reactions: Number(p.reactions), clicks: Number(p.clicks) },
      end: endSnaps.get(p.id), base: baseSnaps.get(p.id),
    });
    const published = d >= from;
    for (const c of p.product_codes) {
      const t = out.get(c) ?? emptyTotals();
      addGain(t, g, { published, video: p.kind === "video" || p.kind === "reel" });
      out.set(c, t);
    }
  }
  return out;
}
