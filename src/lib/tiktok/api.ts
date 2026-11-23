import "server-only";

// TikTok Display API v2 (Login Kit) — tài khoản CÁ NHÂN tự đăng nhập để cấp quyền đọc video / số liệu cơ bản.
// Biến môi trường: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REDIRECT_URI (vd https://<domain>/api/tiktok/callback)
export const TIKTOK_SCOPES = ["user.info.basic", "user.info.stats", "video.list"];

const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const API = "https://open.tiktokapis.com/v2";

export const tiktokConfigured = () => !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET && process.env.TIKTOK_REDIRECT_URI);

export function authorizeUrl(state: string) {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_key", process.env.TIKTOK_CLIENT_KEY!);
  u.searchParams.set("scope", TIKTOK_SCOPES.join(","));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", process.env.TIKTOK_REDIRECT_URI!);
  u.searchParams.set("state", state);
  return u.toString();
}

export class TikTokError extends Error {
  constructor(public code: string, message: string) { super(`TikTok ${code}: ${message}`); }
}

export type TikTokToken = {
  access_token: string; refresh_token: string; open_id: string; scope: string;
  expires_in: number; refresh_expires_in: number;
};

async function tokenRequest(body: Record<string, string>): Promise<TikTokToken> {
  const res = await fetch(`${API}/oauth/token/`, {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY!, client_secret: process.env.TIKTOK_CLIENT_SECRET!, ...body }),
  });
  const json = await res.json();
  if (json.error || !json.access_token) throw new TikTokError(String(json.error ?? res.status), json.error_description ?? "không lấy được token");
  return json as TikTokToken;
}

export const exchangeCode = (code: string) =>
  tokenRequest({ grant_type: "authorization_code", code, redirect_uri: process.env.TIKTOK_REDIRECT_URI! });

export const refreshToken = (refresh: string) => tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });

type Envelope<T> = { data?: T; error?: { code: string; message: string } };

async function call<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    cache: "no-store", ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await res.json()) as Envelope<T>;
  if (json.error && json.error.code !== "ok") throw new TikTokError(json.error.code, json.error.message);
  return json.data as T;
}

export type TikTokUser = { open_id: string; display_name?: string; avatar_url?: string; follower_count?: number; likes_count?: number; video_count?: number };

export async function getUser(token: string): Promise<TikTokUser> {
  const d = await call<{ user: TikTokUser }>("/user/info/?fields=open_id,display_name,avatar_url,follower_count,likes_count,video_count", token);
  return d.user;
}

export type TikTokVideo = {
  id: string; create_time: number; title?: string; video_description?: string; cover_image_url?: string; share_url?: string;
  like_count?: number; comment_count?: number; share_count?: number; view_count?: number;
};
const VIDEO_FIELDS = "id,create_time,title,video_description,cover_image_url,share_url,like_count,comment_count,share_count,view_count";

// Video mới nhất trước; dừng khi gặp video cũ hơn `sinceSec` (hoặc hết trang / quá maxPages)
export async function listVideos(token: string, sinceSec: number, maxPages = 10): Promise<TikTokVideo[]> {
  const out: TikTokVideo[] = [];
  let cursor: number | undefined;
  for (let page = 0; page < maxPages; page++) {
    const d = await call<{ videos?: TikTokVideo[]; cursor?: number; has_more?: boolean }>(`/video/list/?fields=${VIDEO_FIELDS}`, token, {
      method: "POST", body: JSON.stringify({ max_count: 20, ...(cursor !== undefined ? { cursor } : {}) }),
    });
    const vids = d.videos ?? [];
    out.push(...vids.filter((v) => v.create_time >= sinceSec));
    if (!d.has_more || !vids.length || vids[vids.length - 1].create_time < sinceSec) break;
    cursor = d.cursor;
  }
  return out;
}
