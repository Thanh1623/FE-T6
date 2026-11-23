import "server-only";
import { unstable_cache } from "next/cache";
import { GRAPH_VERSION, appSecretProof } from "@/lib/meta/graph";
import { TAG } from "@/lib/cache-tags";

// Hai nguồn token để phát hiện kênh (me/accounts):
//   FB_SYSTEM_TOKEN — Người dùng hệ thống của Business Manager: không hết hạn, không gắn Facebook cá nhân (ưu tiên)
//   FB_USER_TOKEN   — token cá nhân dài hạn (~60 ngày), dùng cho Trang chưa đưa vào Business Manager
// Có cả hai thì chạy cả hai; kênh nào cả hai cùng thấy thì dùng Page Token lấy từ Người dùng hệ thống.
export type TokenSource = "system" | "user";
export const TOKEN_LABELS: Record<TokenSource, string> = { system: "Người dùng hệ thống", user: "Token cá nhân" };

export function metaTokens(): { source: TokenSource; token: string }[] {
  const out: { source: TokenSource; token: string }[] = [];
  if (process.env.FB_USER_TOKEN) out.push({ source: "user", token: process.env.FB_USER_TOKEN });
  if (process.env.FB_SYSTEM_TOKEN) out.push({ source: "system", token: process.env.FB_SYSTEM_TOKEN });
  return out; // system đứng sau → ghi đè Page Token của user khi trùng kênh
}

// Quyền app cần khi tạo token (Người dùng hệ thống → Tạo mã mới → tick các quyền này)
export const REQUIRED_SCOPES = ["pages_show_list", "pages_read_engagement", "read_insights", "pages_read_user_content"];
export const OPTIONAL_SCOPES = ["business_management", "instagram_basic", "instagram_manage_insights"];

export type TokenStatus = {
  source: TokenSource; valid: boolean; error?: string;
  owner: string | null;                      // tên tài khoản sở hữu token
  expiresAt: Date | null; daysLeft: number | null;   // null = không hết hạn
  scopes: string[]; missing: string[];
};

const DAY_MS = 86_400_000;

// Kiểm tra token bằng debug_token. Cache 1 giờ (gọi từ layout mỗi lần tải trang).
export async function inspectToken(source: TokenSource, token: string): Promise<TokenStatus> {
  const base = { source, owner: null, expiresAt: null, daysLeft: null, scopes: [], missing: REQUIRED_SCOPES };
  try {
    // Có App ID + App Secret thì dùng app token (chuẩn nhất); không thì dùng chính token đó
    const appToken = process.env.FB_APP_ID && process.env.FB_APP_SECRET ? `${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}` : token;
    const dbg = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/debug_token`);
    dbg.searchParams.set("input_token", token);
    dbg.searchParams.set("access_token", appToken);
    const me = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me`);
    me.searchParams.set("fields", "name");
    me.searchParams.set("access_token", token);
    const proof = appSecretProof(token);
    if (proof) me.searchParams.set("appsecret_proof", proof);

    const [d, m] = await Promise.all([
      fetch(dbg, { next: { revalidate: 3600 } }).then((r) => r.json()),
      fetch(me, { next: { revalidate: 3600 } }).then((r) => r.json()).catch(() => ({})),
    ]);
    // Mã 4 / 17 / 32 / 613 = Meta giới hạn số lần gọi của ỨNG DỤNG (đang quá tải tạm thời), KHÔNG phải token hết hạn: không báo đỏ, coi là chưa kiểm tra được
    if (d.error && [4, 17, 32, 613].includes(d.error.code)) return { ...base, valid: true, missing: [], error: d.error.message };
    if (d.error) return { ...base, valid: false, error: d.error.message };
    const data = d.data ?? {};
    // Hạn thực tế = mốc sớm hơn giữa hạn token (expires_at) và hạn quyền đọc dữ liệu (data_access_expires_at,
    // ~90 ngày với token cá nhân, phải đăng nhập lại để gia hạn). 0 = không hết hạn.
    const exp = Math.min(...[data.expires_at, data.data_access_expires_at].filter((x: number | undefined) => !!x), Infinity);
    const scopes: string[] = data.scopes ?? [];
    return {
      source, valid: !!data.is_valid, error: data.error?.message,
      owner: m?.name ?? null,
      expiresAt: Number.isFinite(exp) ? new Date(exp * 1000) : null,
      daysLeft: Number.isFinite(exp) ? Math.floor((exp * 1000 - Date.now()) / DAY_MS) : null,
      scopes, missing: REQUIRED_SCOPES.filter((s) => !scopes.includes(s)),
    };
  } catch (e) {
    return { ...base, valid: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Gọi từ layout mỗi lần tải trang → cache dùng chung 1 giờ (debug_token ~300ms). Khoá cache gồm đuôi token:
// đổi token trong env là tự lấy trạng thái mới. Cache lưu dạng JSON nên Date được dựng lại khi đọc.
const cachedStatuses = unstable_cache(
  async (fingerprint: string) => { void fingerprint; return Promise.all(metaTokens().map((t) => inspectToken(t.source, t.token))); },
  ["meta-token-status"], { tags: [TAG.metaToken], revalidate: 3600 },
);

export async function tokenStatuses(): Promise<TokenStatus[]> {
  const fp = metaTokens().map((t) => `${t.source}:${t.token.slice(-8)}`).join("|");
  const list = await cachedStatuses(fp);
  return list.map((t) => ({ ...t, expiresAt: t.expiresAt ? new Date(t.expiresAt) : null }));
}
