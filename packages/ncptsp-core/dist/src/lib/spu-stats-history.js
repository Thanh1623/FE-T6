"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SPU_STAT_KEYS = void 0;
exports.loadSpuStatsHistory = loadSpuStatsHistory;
exports.recordSpuStats = recordSpuStats;
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
const data_1 = require("@/lib/data");
// Số SPU toàn công ty theo ngày (sales.spu_daily_stats, migration 058) — nguồn của biểu đồ xu hướng cạnh các thẻ ở trang Theo dõi SPU.
exports.SPU_STAT_KEYS = ["active", "inStock", "hot", "normal", "slow", "bad"];
const DAYS = 30;
// Lịch sử DAYS ngày gần nhất, cũ → mới; chưa chạy migration thì trả mảng rỗng (không lỗi)
async function loadSpuStatsHistory() {
    const { data, error } = await admin_1.sb.sales().from("spu_daily_stats").select("day, active, in_stock, hot, normal, slow, bad").order("day", { ascending: false }).limit(DAYS);
    if (error)
        return [];
    return (data ?? []).reverse().map((r) => ({ day: String(r.day), active: Number(r.active), inStock: Number(r.in_stock), hot: Number(r.hot), normal: Number(r.normal), slow: Number(r.slow), bad: Number(r.bad) }));
}
// Ghi (ghi đè) số của hôm nay; lỗi thì bỏ qua — chỉ là số phụ cho biểu đồ
async function recordSpuStats(s) {
    try {
        await admin_1.sb.sales().from("spu_daily_stats").upsert({ day: (0, data_1.todayVN)(), active: s.active, in_stock: s.inStock, hot: s.hot, normal: s.normal, slow: s.slow, bad: s.bad, updated_at: new Date().toISOString() }, { onConflict: "day" });
    }
    catch { /* bỏ qua */ }
}
