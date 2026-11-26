"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketForSql = exports.parseMarket = exports.MARKET_OPTIONS = exports.DEFAULT_MARKET = void 0;
exports.loadChannelMarkets = loadChannelMarkets;
require("server-only");
const cache_1 = require("next/cache");
const admin_1 = require("@/lib/supabase/admin");
const cache_tags_1 = require("@/lib/cache-tags");
exports.DEFAULT_MARKET = "vn"; // không có tham số market trên URL = Trong nước
exports.MARKET_OPTIONS = [{ value: "all", label: "Tất cả" }, { value: "vn", label: "Trong nước" }, { value: "intl", label: "Nước ngoài" }];
const parseMarket = (v) => (v === "all" || v === "intl" || v === "vn" ? v : exports.DEFAULT_MARKET);
exports.parseMarket = parseMarket;
// Giá trị gửi cho hàm SQL: "" = không lọc
const marketForSql = (m) => (m === "vn" || m === "intl" ? m : "");
exports.marketForSql = marketForSql;
// Lỗi (chưa chạy migration 102…) thì ném lỗi để KHÔNG bị lưu đệm rỗng; nơi gọi bắt lỗi và coi mọi kênh là trong nước
const cached = (0, cache_1.unstable_cache)(async () => {
    const { data, error } = await admin_1.sb.sales().from("channel_market").select("channel_id, market").limit(5000);
    if (error)
        throw error;
    return Object.fromEntries((data ?? []).map((r) => [r.channel_id, r.market]));
}, ["channel-market", "v1"], { tags: [cache_tags_1.TAG.channels, cache_tags_1.TAG.spuData], revalidate: 3600 });
async function loadChannelMarkets() {
    try {
        return await cached();
    }
    catch {
        return {};
    }
}
