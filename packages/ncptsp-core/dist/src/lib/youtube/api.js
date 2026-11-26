"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadsOf = exports.youtubeConfigured = void 0;
exports.resolveChannel = resolveChannel;
exports.channelSubscribers = channelSubscribers;
exports.listUploadIds = listUploadIds;
exports.getVideos = getVideos;
require("server-only");
// YouTube Data API v3 — chỉ dữ liệu CÔNG KHAI của kênh (tiêu đề, mô tả / hashtag, thumbnail, lượt xem, like, comment), chỉ cần API key, không cần chủ kênh đăng nhập.
// Biến môi trường: YOUTUBE_API_KEY. Hạn mức mặc định 10.000 đơn vị/ngày; channels.list / playlistItems.list / videos.list đều 1 đơn vị mỗi lần gọi (KHÔNG dùng search.list: 100 đơn vị).
const BASE = "https://www.googleapis.com/youtube/v3";
const youtubeConfigured = () => !!process.env.YOUTUBE_API_KEY;
exports.youtubeConfigured = youtubeConfigured;
async function call(path, params) {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key)
        throw new Error("Chưa cấu hình YOUTUBE_API_KEY");
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(params))
        url.searchParams.set(k, v);
    url.searchParams.set("key", key);
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    const json = (await res.json().catch(() => ({})));
    if (!res.ok) {
        const reason = json.error?.errors?.[0]?.reason;
        throw new Error(`YouTube API ${res.status}${reason ? ` (${reason})` : ""}: ${json.error?.message ?? "lỗi không rõ"}`);
    }
    return json;
}
// Link kênh → ID kênh bằng cách đọc trang kênh công khai (dự phòng khi @handle có dấu / ký tự lạ mà API không nhận ra)
async function channelIdFromPage(url) {
    try {
        const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000), headers: { "accept-language": "en", "user-agent": "Mozilla/5.0" } });
        const html = await res.text();
        return html.match(/"(?:externalId|channelId)":"(UC[\w-]{20,})"/)?.[1] ?? html.match(/youtube\.com\/channel\/(UC[\w-]{20,})/)?.[1] ?? null;
    }
    catch {
        return null;
    }
}
// Nhận ID (UCxxxx), @handle, hoặc link kênh (youtube.com/@handle, /channel/UC…; handle có dấu / mã hoá %XX đều được) → thông tin kênh
async function resolveChannel(input) {
    const raw = input.trim();
    if (!raw)
        throw new Error("Trống");
    let id = null, handle = null;
    const url = raw.match(/youtube\.com\/(?:channel\/(UC[\w-]{20,})|@([^/?#\s]+))/i);
    if (url) {
        if (url[1])
            id = url[1];
        else
            handle = safeDecode(url[2]);
    }
    else if (/^UC[\w-]{20,}$/.test(raw))
        id = raw;
    else
        handle = safeDecode(raw.replace(/^@/, ""));
    const fetchBy = (q) => call("/channels", { part: "snippet,statistics,contentDetails", ...q });
    let c = (await fetchBy(id ? { id } : { forHandle: `@${handle}` })).items?.[0];
    if (!c && !id && /^https?:/i.test(raw)) { // API không nhận ra handle → đọc ID kênh từ trang kênh
        const fromPage = await channelIdFromPage(raw);
        if (fromPage)
            c = (await fetchBy({ id: fromPage })).items?.[0];
    }
    if (!c)
        throw new Error(`Không tìm thấy kênh "${raw}" — thử dán ID kênh (UC…) lấy ở YouTube Studio → Cài đặt → Kênh → Thông tin nâng cao`);
    return {
        id: c.id, title: c.snippet.title, handle: c.snippet.customUrl ?? null, uploadsPlaylist: c.contentDetails.relatedPlaylists.uploads,
        subscribers: c.statistics && !c.statistics.hiddenSubscriberCount && c.statistics.subscriberCount ? Number(c.statistics.subscriberCount) : null,
    };
}
const safeDecode = (s) => { try {
    return decodeURIComponent(s);
}
catch {
    return s;
} };
async function channelSubscribers(channelId) {
    const r = await call("/channels", { part: "statistics", id: channelId });
    const s = r.items?.[0]?.statistics;
    return s && !s.hiddenSubscriberCount && s.subscriberCount ? Number(s.subscriberCount) : null;
}
// Playlist "uploads" của kênh (UC… → UU…): mọi video đã đăng, MỚI NHẤT TRƯỚC. Dừng khi gặp video cũ hơn sinceMs.
const uploadsOf = (channelId) => `UU${channelId.slice(2)}`;
exports.uploadsOf = uploadsOf;
async function listUploadIds(playlistId, sinceMs, maxPages = 40) {
    const ids = [];
    let pageToken = "";
    for (let i = 0; i < maxPages; i++) {
        const r = await call("/playlistItems", { part: "contentDetails", playlistId, maxResults: "50", ...(pageToken ? { pageToken } : {}) });
        for (const it of r.items ?? []) {
            const at = it.contentDetails.videoPublishedAt ? Date.parse(it.contentDetails.videoPublishedAt) : NaN;
            if (Number.isFinite(at) && at < sinceMs)
                return ids;
            ids.push(it.contentDetails.videoId);
        }
        if (!r.nextPageToken)
            break;
        pageToken = r.nextPageToken;
    }
    return ids;
}
const durationSec = (iso) => {
    const m = iso.match(/^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
};
// Chi tiết tối đa 50 video / lần gọi. likeCount / commentCount có thể vắng (chủ video ẩn like / tắt bình luận) → null
async function getVideos(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 50) {
        const r = await call("/videos", { part: "snippet,statistics,contentDetails", id: ids.slice(i, i + 50).join(",") });
        for (const v of r.items ?? []) {
            const th = v.snippet.thumbnails ?? {};
            out.push({
                id: v.id, title: v.snippet.title, description: v.snippet.description ?? "", tags: v.snippet.tags ?? [], publishedAt: v.snippet.publishedAt,
                thumbnail: (th.maxres ?? th.standard ?? th.high ?? th.medium ?? th.default)?.url ?? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`, // link YouTube cố định, không hết hạn
                views: Number(v.statistics?.viewCount ?? 0),
                likes: v.statistics?.likeCount !== undefined ? Number(v.statistics.likeCount) : null,
                comments: v.statistics?.commentCount !== undefined ? Number(v.statistics.commentCount) : null,
                seconds: durationSec(v.contentDetails?.duration ?? ""), liveOrUpcoming: (v.snippet.liveBroadcastContent ?? "none") !== "none",
            });
        }
    }
    return out;
}
