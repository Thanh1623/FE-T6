"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TAG = void 0;
exports.bustSoft = bustSoft;
exports.bust = bust;
require("server-only");
const cache_1 = require("next/cache");
// Nhãn cache dữ liệu ít đổi (dùng chung mọi người dùng, mọi máy chủ Vercel — unstable_cache).
// Đọc: bọc hàm bằng unstable_cache(..., { tags: [TAG.x] }). Ghi: gọi bust(TAG.x) ngay sau khi sửa.
exports.TAG = {
    sync: "sync", // core.sync_runs (giờ cập nhật, lỗi đồng bộ trên sidebar)
    channels: "channels", // social.channels (danh sách kênh, Page ↔ team)
    metaToken: "meta-token", // trạng thái token Meta (debug_token)
    rndOptions: "rnd-options", // core.settings rnd_options (Cấu hình)
    teams: "teams", // core.teams
    profiles: "profiles", // core.profiles (danh sách người)
    spuData: "spu-data", // số liệu SPU đã gom (tóm tắt SKU, đơn hàng 30 ngày, danh mục) — xoá khi nhập tồn kho / đơn hàng
    handoffs: "handoffs", // tổng quan giao mẫu (phiếu + video + số bán) — xoá khi phân công / đổi trạng thái phiếu
};
// Đánh dấu cũ KIỂU "stale-while-revalidate" (profile "max"): người xem tiếp theo vẫn nhận ngay dữ liệu cũ, dữ liệu mới được tải lại ở nền. Dùng cho các lần cập nhật do HỆ THỐNG (đồng bộ,
// làm mới bảng tổng hợp) để không ai phải chờ tải lại cả bộ số liệu nặng — trước đây mỗi lần đồng bộ xong thì người mở trang đầu tiên chờ 10–25 giây (hoặc quá thời gian → 503).
function bustSoft(...tags) {
    for (const t of tags) {
        try {
            (0, cache_1.revalidateTag)(t, "max");
        }
        catch { /* ngoài ngữ cảnh Next */ }
    }
}
// Xoá cache ngay (expire: 0 → lần đọc sau lấy dữ liệu mới). Gọi ngoài Next (script node) thì bỏ qua.
function bust(...tags) {
    for (const t of tags) {
        try {
            (0, cache_1.revalidateTag)(t, { expire: 0 });
        }
        catch { /* ngoài ngữ cảnh Next */ }
    }
}
