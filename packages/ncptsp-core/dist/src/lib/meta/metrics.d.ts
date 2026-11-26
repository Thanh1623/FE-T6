export declare const PAGE_DAILY_COLUMNS: {
    readonly page_media_view: "views";
    readonly page_total_media_view_unique: "viewers";
    readonly page_post_engagements: "engagements";
    readonly page_daily_follows_unique: "new_follows";
    readonly page_daily_unfollows_unique: "unfollows";
    readonly page_views_total: "page_views";
    readonly page_video_views: "video_views";
};
export declare const POST_COLUMNS: {
    readonly post_media_view: "views";
    readonly post_total_media_view_unique: "viewers";
    readonly post_reactions_by_type_total: "reactions";
    readonly post_clicks: "clicks";
    readonly post_video_views: "video_views";
};
export type DailyColumn = (typeof PAGE_DAILY_COLUMNS)[keyof typeof PAGE_DAILY_COLUMNS];
export type PostColumn = (typeof POST_COLUMNS)[keyof typeof POST_COLUMNS];
