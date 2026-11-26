"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadApiStale = void 0;
require("server-only");
const cache_1 = require("next/cache");
const admin_1 = require("@/lib/supabase/admin");
const cache_tags_1 = require("@/lib/cache-tags");
// Kênh Facebook có trong API video nhưng API đã đứng yên (xem lib/sync/api-videos: syncApiVideos ghi core.settings 'api_stale_channels' mỗi lần kéo API).
// Bản ghi quá 3 ngày (cron kéo API ngừng chạy) thì không hiện — tránh cảnh báo cũ. Danh sách rỗng = không có gì để cảnh báo.
exports.loadApiStale = (0, cache_1.unstable_cache)(async () => {
    const { data } = await admin_1.sb.core().from("settings").select("value").eq("key", "api_stale_channels").maybeSingle();
    const v = data?.value;
    if (!v?.channels?.length || Date.now() - Date.parse(v.at) > 3 * 86_400_000)
        return null;
    return v;
}, ["api-stale", "v1"], { tags: [cache_tags_1.TAG.sync], revalidate: 600 });
