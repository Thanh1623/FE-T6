"use strict";
// Chỉ số Facebook Graph API v26.0 (đã kiểm tra còn hoạt động 10/2026) → CỘT chuẩn của DB v2.
// Meta đổi tên chỉ số thì chỉ cần sửa ở đây.
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST_COLUMNS = exports.PAGE_DAILY_COLUMNS = void 0;
// Cấp Trang, theo ngày → social.channel_daily
exports.PAGE_DAILY_COLUMNS = {
    page_media_view: "views",
    page_total_media_view_unique: "viewers",
    page_post_engagements: "engagements",
    page_daily_follows_unique: "new_follows",
    page_daily_unfollows_unique: "unfollows",
    page_views_total: "page_views",
    page_video_views: "video_views",
};
// Cấp bài, trọn đời (period=lifetime) → social.posts
exports.POST_COLUMNS = {
    post_media_view: "views",
    post_total_media_view_unique: "viewers",
    post_reactions_by_type_total: "reactions",
    post_clicks: "clicks",
    post_video_views: "video_views",
};
