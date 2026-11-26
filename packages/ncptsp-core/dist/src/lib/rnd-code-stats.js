"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rndCodeStats = rndCodeStats;
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
async function rndCodeStats(items) {
    if (!items.length)
        return new Map();
    const payload = items.map((i) => ({ id: i.id, codes: [...new Set(i.codes.map((c) => c.toUpperCase()))].join(","), d_from: i.from ?? null, d_to: i.to ?? null }));
    const { data, error } = await admin_1.sb.social().rpc("rnd_code_stats", { p_items: payload });
    if (error)
        return null;
    const out = new Map();
    for (const r of (data ?? [])) {
        out.set(String(r.id), {
            first: r.first_day ?? null, posts: Number(r.posts ?? 0), videos: Number(r.videos ?? 0), views: Number(r.views ?? 0), viewers: Number(r.viewers ?? 0),
            reactions: Number(r.reactions ?? 0), comments: Number(r.comments ?? 0), shares: Number(r.shares ?? 0), clicks: Number(r.clicks ?? 0), topUrl: r.top_url ?? null,
        });
    }
    return out;
}
