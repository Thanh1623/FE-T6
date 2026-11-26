"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPTIONAL_SCOPES = exports.REQUIRED_SCOPES = exports.TOKEN_LABELS = void 0;
exports.metaTokens = metaTokens;
exports.inspectToken = inspectToken;
exports.tokenStatuses = tokenStatuses;
require("server-only");
const cache_1 = require("next/cache");
const graph_1 = require("@/lib/meta/graph");
const cache_tags_1 = require("@/lib/cache-tags");
exports.TOKEN_LABELS = { system: "Người dùng hệ thống", user: "Token cá nhân" };
function metaTokens() {
    const out = [];
    if (process.env.FB_USER_TOKEN)
        out.push({ source: "user", token: process.env.FB_USER_TOKEN });
    if (process.env.FB_SYSTEM_TOKEN)
        out.push({ source: "system", token: process.env.FB_SYSTEM_TOKEN });
    return out; // system đứng sau → ghi đè Page Token của user khi trùng kênh
}
// Quyền app cần khi tạo token (Người dùng hệ thống → Tạo mã mới → tick các quyền này)
exports.REQUIRED_SCOPES = ["pages_show_list", "pages_read_engagement", "read_insights", "pages_read_user_content"];
exports.OPTIONAL_SCOPES = ["business_management", "instagram_basic", "instagram_manage_insights"];
const DAY_MS = 86_400_000;
// Kiểm tra token bằng debug_token. Cache 1 giờ (gọi từ layout mỗi lần tải trang).
async function inspectToken(source, token) {
    const base = { source, owner: null, expiresAt: null, daysLeft: null, scopes: [], missing: exports.REQUIRED_SCOPES };
    try {
        // Có App ID + App Secret thì dùng app token (chuẩn nhất); không thì dùng chính token đó
        const appToken = process.env.FB_APP_ID && process.env.FB_APP_SECRET ? `${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}` : token;
        const dbg = new URL(`https://graph.facebook.com/${graph_1.GRAPH_VERSION}/debug_token`);
        dbg.searchParams.set("input_token", token);
        dbg.searchParams.set("access_token", appToken);
        const me = new URL(`https://graph.facebook.com/${graph_1.GRAPH_VERSION}/me`);
        me.searchParams.set("fields", "name");
        me.searchParams.set("access_token", token);
        const proof = (0, graph_1.appSecretProof)(token);
        if (proof)
            me.searchParams.set("appsecret_proof", proof);
        const [d, m] = await Promise.all([
            fetch(dbg, { next: { revalidate: 3600 } }).then((r) => r.json()),
            fetch(me, { next: { revalidate: 3600 } }).then((r) => r.json()).catch(() => ({})),
        ]);
        // Mã 4 / 17 / 32 / 613 = Meta giới hạn số lần gọi của ỨNG DỤNG (đang quá tải tạm thời), KHÔNG phải token hết hạn: không báo đỏ, coi là chưa kiểm tra được
        if (d.error && [4, 17, 32, 613].includes(d.error.code))
            return { ...base, valid: true, missing: [], error: d.error.message };
        if (d.error)
            return { ...base, valid: false, error: d.error.message };
        const data = d.data ?? {};
        // Hạn thực tế = mốc sớm hơn giữa hạn token (expires_at) và hạn quyền đọc dữ liệu (data_access_expires_at,
        // ~90 ngày với token cá nhân, phải đăng nhập lại để gia hạn). 0 = không hết hạn.
        const exp = Math.min(...[data.expires_at, data.data_access_expires_at].filter((x) => !!x), Infinity);
        const scopes = data.scopes ?? [];
        return {
            source, valid: !!data.is_valid, error: data.error?.message,
            owner: m?.name ?? null,
            expiresAt: Number.isFinite(exp) ? new Date(exp * 1000) : null,
            daysLeft: Number.isFinite(exp) ? Math.floor((exp * 1000 - Date.now()) / DAY_MS) : null,
            scopes, missing: exports.REQUIRED_SCOPES.filter((s) => !scopes.includes(s)),
        };
    }
    catch (e) {
        return { ...base, valid: false, error: e instanceof Error ? e.message : String(e) };
    }
}
// Gọi từ layout mỗi lần tải trang → cache dùng chung 1 giờ (debug_token ~300ms). Khoá cache gồm đuôi token:
// đổi token trong env là tự lấy trạng thái mới. Cache lưu dạng JSON nên Date được dựng lại khi đọc.
const cachedStatuses = (0, cache_1.unstable_cache)(async (fingerprint) => { void fingerprint; return Promise.all(metaTokens().map((t) => inspectToken(t.source, t.token))); }, ["meta-token-status"], { tags: [cache_tags_1.TAG.metaToken], revalidate: 3600 });
async function tokenStatuses() {
    const fp = metaTokens().map((t) => `${t.source}:${t.token.slice(-8)}`).join("|");
    const list = await cachedStatuses(fp);
    return list.map((t) => ({ ...t, expiresAt: t.expiresAt ? new Date(t.expiresAt) : null }));
}
