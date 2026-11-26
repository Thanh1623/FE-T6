"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSkuOverrides = loadSkuOverrides;
exports.applyOverrides = applyOverrides;
require("server-only");
const cache_1 = require("next/cache");
const admin_1 = require("@/lib/supabase/admin");
const cache_tags_1 = require("@/lib/cache-tags");
const cached = (0, cache_1.unstable_cache)(async () => (0, admin_1.fetchAll)((a, b) => admin_1.sb.sales().from("sku_spu_overrides").select("sku, spu_code").order("sku").range(a, b)), ["sku-overrides", "v2"], { tags: [cache_tags_1.TAG.spuData], revalidate: 21_600 });
// Lỗi (chưa chạy migration 050) → rỗng, không làm hỏng trang
async function loadSkuOverrides() {
    try {
        return new Map((await cached()).map((r) => [r.sku.toUpperCase(), r.spu_code]));
    }
    catch {
        return new Map();
    }
}
// Gán lại mã SPU cho danh sách có trường sku + code theo bảng thay thế
function applyOverrides(rows, overrides) {
    if (!overrides.size)
        return rows;
    for (const r of rows) {
        const o = overrides.get(r.sku.toUpperCase());
        if (o)
            r.code = o;
    }
    return rows;
}
