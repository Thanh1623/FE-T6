"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshToken = exports.exchangeCode = exports.TikTokError = exports.tiktokConfigured = exports.TIKTOK_SCOPES = void 0;
exports.authorizeUrl = authorizeUrl;
exports.getUser = getUser;
exports.listVideos = listVideos;
require("server-only");
// TikTok Display API v2 (Login Kit) — tài khoản CÁ NHÂN tự đăng nhập để cấp quyền đọc video / số liệu cơ bản.
// Biến môi trường: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REDIRECT_URI (vd https://<domain>/api/tiktok/callback)
exports.TIKTOK_SCOPES = ["user.info.basic", "user.info.stats", "video.list"];
const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const API = "https://open.tiktokapis.com/v2";
const tiktokConfigured = () => !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET && process.env.TIKTOK_REDIRECT_URI);
exports.tiktokConfigured = tiktokConfigured;
function authorizeUrl(state) {
    const u = new URL(AUTH_URL);
    u.searchParams.set("client_key", process.env.TIKTOK_CLIENT_KEY);
    u.searchParams.set("scope", exports.TIKTOK_SCOPES.join(","));
    u.searchParams.set("response_type", "code");
    u.searchParams.set("redirect_uri", process.env.TIKTOK_REDIRECT_URI);
    u.searchParams.set("state", state);
    return u.toString();
}
class TikTokError extends Error {
    code;
    constructor(code, message) {
        super(`TikTok ${code}: ${message}`);
        this.code = code;
    }
}
exports.TikTokError = TikTokError;
async function tokenRequest(body) {
    const res = await fetch(`${API}/oauth/token/`, {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
        body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY, client_secret: process.env.TIKTOK_CLIENT_SECRET, ...body }),
    });
    const json = await res.json();
    if (json.error || !json.access_token)
        throw new TikTokError(String(json.error ?? res.status), json.error_description ?? "không lấy được token");
    return json;
}
const exchangeCode = (code) => tokenRequest({ grant_type: "authorization_code", code, redirect_uri: process.env.TIKTOK_REDIRECT_URI });
exports.exchangeCode = exchangeCode;
const refreshToken = (refresh) => tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
exports.refreshToken = refreshToken;
async function call(path, token, init) {
    const res = await fetch(`${API}${path}`, {
        cache: "no-store", ...init,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const json = (await res.json());
    if (json.error && json.error.code !== "ok")
        throw new TikTokError(json.error.code, json.error.message);
    return json.data;
}
async function getUser(token) {
    const d = await call("/user/info/?fields=open_id,display_name,avatar_url,follower_count,likes_count,video_count", token);
    return d.user;
}
const VIDEO_FIELDS = "id,create_time,title,video_description,cover_image_url,share_url,like_count,comment_count,share_count,view_count";
// Video mới nhất trước; dừng khi gặp video cũ hơn `sinceSec` (hoặc hết trang / quá maxPages)
async function listVideos(token, sinceSec, maxPages = 10) {
    const out = [];
    let cursor;
    for (let page = 0; page < maxPages; page++) {
        const d = await call(`/video/list/?fields=${VIDEO_FIELDS}`, token, {
            method: "POST", body: JSON.stringify({ max_count: 20, ...(cursor !== undefined ? { cursor } : {}) }),
        });
        const vids = d.videos ?? [];
        out.push(...vids.filter((v) => v.create_time >= sinceSec));
        if (!d.has_more || !vids.length || vids[vids.length - 1].create_time < sinceSec)
            break;
        cursor = d.cursor;
    }
    return out;
}
