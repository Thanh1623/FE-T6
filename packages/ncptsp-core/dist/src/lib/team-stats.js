"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.teamStats = void 0;
require("server-only");
const cache_1 = require("next/cache");
const cache_tags_1 = require("@/lib/cache-tags");
const admin_1 = require("@/lib/supabase/admin");
const daily_sales_1 = require("@/lib/daily-sales");
const data_1 = require("@/lib/data");
const admin_2 = require("@/lib/supabase/admin");
// Lượt xem + SL bán của một nhóm Page / tag trong khoảng ngày — do DATABASE cộng sẵn (migration 064: social.team_views, sales.team_sold).
// Chưa chạy migration → quay về cách cũ (kéo dòng về cộng trong code, chậm hơn). Lỗi đọc thì trả null cho ô đó, không làm hỏng trang.
// Nhớ 6 giờ (xoá khi đồng bộ xong); đổi Page ↔ team gọi bust(TAG.channels) nên số đổi theo ngay.
// Page KHÔNG có số liệu theo ngày (kênh tạo từ API video, chưa kết nối Meta / TikTok nên không có channel_daily): lấy tổng lượt xem của các VIDEO GẮN MÃ SP đăng trong kỳ thay thế,
// để team không hiện 0 / vài chục lượt khi thực tế có hàng trăm nghìn. (Khác nhẹ: đây là lượt xem trọn đời của bài ĐĂNG trong kỳ, không phải lượt xem phát sinh trong kỳ.)
async function postViewsWhereNoDaily(channelIds, from, to) {
    const have = await (0, admin_2.fetchAll)((a, b) => admin_1.sb.social().from("channel_daily").select("channel_id").in("channel_id", channelIds).gte("date", from).lte("date", to).order("channel_id").range(a, b));
    const hasDaily = new Set(have.map((r) => r.channel_id));
    const rest = channelIds.filter((id) => !hasDaily.has(id));
    if (!rest.length)
        return 0;
    const posts = await (0, admin_2.fetchAll)((a, b) => admin_1.sb.social().from("posts").select("views").in("channel_id", rest).neq("product_codes", "{}").in("kind", ["video", "reel"])
        .gte("published_at", `${from}T00:00:00+07:00`).lte("published_at", `${to}T23:59:59+07:00`).order("id").range(a, b));
    return posts.reduce((n, r) => n + Number(r.views ?? 0), 0);
}
async function views(channelIds, from, to) {
    if (!channelIds.length)
        return 0;
    try {
        const { data, error } = await admin_1.sb.social().rpc("team_views", { p_channel_ids: channelIds, p_from: from, p_to: to });
        const daily = !error ? Number(data ?? 0) : (await (0, data_1.getDailyMetrics)(channelIds, from, to)).filter((r) => r.metric === "views").reduce((t, r) => t + r.value, 0);
        return daily + (await postViewsWhereNoDaily(channelIds, from, to));
    }
    catch {
        return null;
    }
}
async function sold(allIds, from, to) {
    try {
        const { data, error } = await admin_1.sb.sales().rpc("team_sold", { p_page_ids: allIds, p_from: from, p_to: to });
        if (!error)
            return Number(data ?? 0);
        return (await (0, daily_sales_1.loadDailySales)({ from, to, pageIds: allIds })).reduce((t, r) => t + r.qty_sold - r.qty_returned, 0);
    }
    catch {
        return null;
    }
}
exports.teamStats = (0, cache_1.unstable_cache)(async (channelIds, allIds, from, to) => {
    const [v, s] = await Promise.all([views(channelIds, from, to), sold(allIds, from, to)]);
    return { views: v, sold: s };
}, ["team-stats"], { tags: [cache_tags_1.TAG.channels, cache_tags_1.TAG.spuData], revalidate: 21_600 });
