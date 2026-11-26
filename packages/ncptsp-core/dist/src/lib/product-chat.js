"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHAT_COLUMNS = exports.CHAT_PAGE = void 0;
exports.toMessages = toMessages;
exports.loadProductMessages = loadProductMessages;
require("server-only");
const rnd_1 = require("@/lib/rnd");
const session_1 = require("@/lib/session");
const admin_1 = require("@/lib/supabase/admin");
exports.CHAT_PAGE = 40;
exports.CHAT_COLUMNS = "id, user_id, content, image_paths, recalled_at, created_at";
// Tin bị thu hồi KHÔNG trả nội dung / ảnh về trình duyệt; ảnh được ký link xem tạm
async function toMessages(rows) {
    const [names, urls] = await Promise.all([
        (0, session_1.profileNames)(rows.map((r) => r.user_id)),
        (0, rnd_1.signImages)(rows.filter((r) => !r.recalled_at).flatMap((r) => r.image_paths ?? [])),
    ]);
    return rows.map((r) => ({
        id: r.id, userId: r.user_id, author: names.get(r.user_id) ?? "Người dùng", createdAt: r.created_at,
        recalled: !!r.recalled_at, content: r.recalled_at ? null : r.content,
        images: r.recalled_at ? [] : (r.image_paths ?? []).flatMap((p) => (urls[p] ? [{ path: p, url: urls[p] }] : [])),
    }));
}
// Trang tin mới nhất (before = lấy các tin cũ hơn mốc đó). Phân trang theo con trỏ thời gian, trả theo thứ tự cũ → mới
async function loadProductMessages(productId, before) {
    let q = admin_1.sb.rnd().from("product_messages").select(exports.CHAT_COLUMNS).eq("product_id", productId)
        .order("created_at", { ascending: false }).limit(exports.CHAT_PAGE + 1);
    if (before)
        q = q.lt("created_at", before);
    const { data, error } = await q;
    if (error)
        throw error;
    const rows = (data ?? []);
    const hasMore = rows.length > exports.CHAT_PAGE;
    return { messages: await toMessages(rows.slice(0, exports.CHAT_PAGE).reverse()), hasMore };
}
