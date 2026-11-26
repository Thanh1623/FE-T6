"use strict";
// Danh mục nền tảng — dùng chung server + client.
// Thêm nền tảng mới (YouTube, TikTok, Instagram):
//   1. Viết bộ kết nối (adapter) đúng interface PlatformAdapter trong src/lib/sync/ (đọc kênh, số liệu ngày, bài đăng)
//   2. Ghi số liệu vào CÁC CỘT CHUẨN của social.channel_daily / social.posts → dashboard tự hiện, không phải sửa giao diện
//   3. Đổi `connected: true`
Object.defineProperty(exports, "__esModule", { value: true });
exports.KIND_LABELS = exports.PLATFORMS = void 0;
exports.kindOf = kindOf;
// Màu theo thứ tự slot chuẩn 1–4 (đã kiểm định cho đường/cột). KHÔNG dùng cho biểu đồ tròn 4 phần — tròn tối đa 3 màu.
exports.PLATFORMS = {
    facebook: { label: "Facebook", color: "var(--series-1)", connected: true },
    instagram: { label: "Instagram", color: "var(--series-2)", connected: false },
    tiktok: { label: "TikTok", color: "var(--series-3)", connected: true },
    youtube: { label: "YouTube", color: "var(--series-4)", connected: true },
};
// Loại nội dung (cột social.posts.kind) và nhãn hiển thị
exports.KIND_LABELS = { reel: "Reel", video: "Video", photo: "Ảnh", status: "Bài đăng", other: "Khác" };
function kindOf(type, permalink) {
    if (permalink?.includes("/reel/") || permalink?.includes("/shorts/"))
        return "reel";
    if (type === "added_video")
        return "video";
    if (type === "added_photos")
        return "photo";
    if (type === "mobile_status_update")
        return "status";
    return "other";
}
