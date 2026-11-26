"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rndTrafficCached = void 0;
require("server-only");
const cache_1 = require("next/cache");
const admin_1 = require("@/lib/supabase/admin");
const cache_tags_1 = require("@/lib/cache-tags");
const channel_market_1 = require("@/lib/channel-market");
const zero = () => ({ posts: 0, views: 0, viewers: 0, comments: 0, reactions: 0, shares: 0 });
const ORDER = ["facebook", "instagram", "tiktok", "youtube"];
async function load(from, to, market) {
    const { data: chans, error } = await admin_1.sb.social().from("channels").select("id, name, platform").eq("is_active", true).eq("is_rnd", true).order("name");
    if (error)
        throw error;
    const sel = (0, channel_market_1.marketForSql)(market); // "" = mọi thị trường; còn lại chỉ giữ kênh thuộc thị trường đó (sales.channel_market, migration 102)
    const mk = sel ? await (0, channel_market_1.loadChannelMarkets)() : null;
    const channels = (chans ?? []).filter((c) => !mk || (mk[c.id] ?? "vn") === sel);
    const byCh = new Map(channels.map((c) => [c.id, { ...zero(), id: c.id, name: c.name.trim(), platform: c.platform }]));
    if (channels.length) {
        const end = new Date(Date.parse(`${to}T00:00:00+07:00`) + 86_400_000).toISOString(); // hết ngày `to` giờ VN
        const posts = await (0, admin_1.fetchAll)((a, b) => admin_1.sb.social().from("posts").select("channel_id, views, viewers, comments, reactions, shares")
            .in("channel_id", channels.map((c) => c.id)).gte("published_at", `${from}T00:00:00+07:00`).lt("published_at", end).order("published_at").order("id").range(a, b));
        for (const p of posts) {
            const r = byCh.get(p.channel_id);
            if (!r)
                continue;
            r.posts += 1;
            r.views += Number(p.views ?? 0);
            r.viewers += Number(p.viewers ?? 0);
            r.comments += Number(p.comments ?? 0);
            r.reactions += Number(p.reactions ?? 0);
            r.shares += Number(p.shares ?? 0);
        }
    }
    const add = (t, r) => { t.posts += r.posts; t.views += r.views; t.viewers += r.viewers; t.comments += r.comments; t.reactions += r.reactions; t.shares += r.shares; };
    const byPlat = new Map();
    const total = zero();
    for (const c of byCh.values()) {
        const p = byPlat.get(c.platform) ?? { ...zero(), platform: c.platform, channels: [] };
        byPlat.set(c.platform, p);
        p.channels.push(c);
        add(p, c);
        add(total, c);
    }
    const rank = (p) => (ORDER.indexOf(p) + 1) || 99;
    const platforms = [...byPlat.values()].sort((a, b) => rank(a.platform) - rank(b.platform));
    for (const p of platforms)
        p.channels.sort((a, b) => b.views - a.views);
    return { platforms, total, channelCount: channels.length };
}
// Lưu đệm 5 phút theo kỳ; xoá khi đồng bộ xong hoặc khi đổi kênh R&D
const rndTrafficCached = (from, to, market = "all") => (0, cache_1.unstable_cache)(() => load(from, to, market), ["rnd-channel-traffic", "v2", from, to, market], { revalidate: 300, tags: [cache_tags_1.TAG.spuData, cache_tags_1.TAG.channels] })();
exports.rndTrafficCached = rndTrafficCached;
