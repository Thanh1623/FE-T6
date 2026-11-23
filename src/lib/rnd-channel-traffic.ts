import "server-only";
import { unstable_cache } from "next/cache";
import { fetchAll, sb } from "@/lib/supabase/admin";
import { TAG } from "@/lib/cache-tags";
import { loadChannelMarkets, marketForSql, type Market } from "@/lib/channel-market";

// Traffic của các kênh R&D (kênh được đánh dấu "Page R&D" ở trang Team) trên MỌI nền tảng: Facebook, Instagram, TikTok, YouTube…
// Tính trên các bài ĐĂNG TRONG KỲ (ngày đăng giờ Việt Nam), số liệu là số hiện tại của từng bài (lượt xem, bình luận, cảm xúc, chia sẻ).
// Gồm cả bài không gắn mã SPU — đây là traffic của kênh, không phải của sản phẩm.
export type TrafficRow = { posts: number; views: number; viewers: number; comments: number; reactions: number; shares: number };
export type ChannelTraffic = TrafficRow & { id: string; name: string; platform: string };
export type PlatformTraffic = TrafficRow & { platform: string; channels: ChannelTraffic[] };
export type RndTraffic = { platforms: PlatformTraffic[]; total: TrafficRow; channelCount: number };

const zero = (): TrafficRow => ({ posts: 0, views: 0, viewers: 0, comments: 0, reactions: 0, shares: 0 });
const ORDER = ["facebook", "instagram", "tiktok", "youtube"];

async function load(from: string, to: string, market: Market): Promise<RndTraffic> {
  const { data: chans, error } = await sb.social().from("channels").select("id, name, platform").eq("is_active", true).eq("is_rnd", true).order("name");
  if (error) throw error;
  const sel = marketForSql(market);   // "" = mọi thị trường; còn lại chỉ giữ kênh thuộc thị trường đó (sales.channel_market, migration 102)
  const mk = sel ? await loadChannelMarkets() : null;
  const channels = ((chans ?? []) as { id: string; name: string; platform: string }[]).filter((c) => !mk || (mk[c.id] ?? "vn") === sel);
  const byCh = new Map<string, ChannelTraffic>(channels.map((c) => [c.id, { ...zero(), id: c.id, name: c.name.trim(), platform: c.platform }]));
  if (channels.length) {
    const end = new Date(Date.parse(`${to}T00:00:00+07:00`) + 86_400_000).toISOString();   // hết ngày `to` giờ VN
    type P = { channel_id: string; views: number | null; viewers: number | null; comments: number | null; reactions: number | null; shares: number | null };
    const posts = await fetchAll<P>((a, b) => sb.social().from("posts").select("channel_id, views, viewers, comments, reactions, shares")
      .in("channel_id", channels.map((c) => c.id)).gte("published_at", `${from}T00:00:00+07:00`).lt("published_at", end).order("published_at").order("id").range(a, b));
    for (const p of posts) {
      const r = byCh.get(p.channel_id);
      if (!r) continue;
      r.posts += 1; r.views += Number(p.views ?? 0); r.viewers += Number(p.viewers ?? 0);
      r.comments += Number(p.comments ?? 0); r.reactions += Number(p.reactions ?? 0); r.shares += Number(p.shares ?? 0);
    }
  }
  const add = (t: TrafficRow, r: TrafficRow) => { t.posts += r.posts; t.views += r.views; t.viewers += r.viewers; t.comments += r.comments; t.reactions += r.reactions; t.shares += r.shares; };
  const byPlat = new Map<string, PlatformTraffic>();
  const total = zero();
  for (const c of byCh.values()) {
    const p = byPlat.get(c.platform) ?? { ...zero(), platform: c.platform, channels: [] };
    byPlat.set(c.platform, p);
    p.channels.push(c); add(p, c); add(total, c);
  }
  const rank = (p: string) => (ORDER.indexOf(p) + 1) || 99;
  const platforms = [...byPlat.values()].sort((a, b) => rank(a.platform) - rank(b.platform));
  for (const p of platforms) p.channels.sort((a, b) => b.views - a.views);
  return { platforms, total, channelCount: channels.length };
}

// Lưu đệm 5 phút theo kỳ; xoá khi đồng bộ xong hoặc khi đổi kênh R&D
export const rndTrafficCached = (from: string, to: string, market: Market = "all") =>
  unstable_cache(() => load(from, to, market), ["rnd-channel-traffic", "v2", from, to, market], { revalidate: 300, tags: [TAG.spuData, TAG.channels] })();
