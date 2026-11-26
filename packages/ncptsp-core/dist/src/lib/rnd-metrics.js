"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshProductMetrics = refreshProductMetrics;
// Kéo số liệu traffic + bán hàng của từng mẫu R&D vào rnd.product_metrics (bảng của migration 031).
// Gọi ở cuối mỗi lần đồng bộ. Bảng chưa tạo (chưa chạy 031) → bỏ qua, không làm đồng bộ báo lỗi.
const admin_1 = require("@/lib/supabase/admin");
const rnd_1 = require("@/lib/rnd");
async function refreshProductMetrics() {
    // PHÂN TRANG: PostgREST cắt mỗi lượt ở 1.000 dòng và rnd.products đã có >1.000 hồ sơ (1.250 ngày 21/11/2026; phần lớn là mẫu tự tạo) — đọc một lượt sẽ mất âm thầm các hồ sơ cuối. Trước đây chỉ 1.000 mẫu đầu được kéo số liệu ("1000 mẫu" trong nhật ký) — ~50 mẫu cuối không bao giờ có số liệu.
    const products = await (0, admin_1.fetchAll)((a, b) => admin_1.sb.rnd().from("products").select("id, code, sapo_code, stage, created_at").not("code", "is", null).order("id").range(a, b));
    if (!products.length)
        return "không có mẫu nào có mã";
    const stats = await (0, rnd_1.getCardStats)(products);
    const now = new Date().toISOString();
    const rows = products.flatMap((p) => {
        const s = stats[p.code];
        return s ? [{
                product_id: p.id, code: p.code, since: s.since, posts: s.posts, videos: s.videos, views: s.views, viewers: s.viewers,
                reactions: s.reactions, clicks: s.clicks, qty_net: s.qtyNet, daily_qty: s.daily, refreshed_at: now,
            }] : [];
    });
    if (!rows.length)
        return "0 mẫu có số liệu";
    const { error: e2 } = await admin_1.sb.rnd().from("product_metrics").upsert(rows, { onConflict: "product_id" });
    if (e2) {
        if (e2.code === "42P01" || e2.code === "PGRST205")
            return "bỏ qua (chưa chạy migration 031)";
        throw e2;
    }
    return `${rows.length} mẫu`;
}
