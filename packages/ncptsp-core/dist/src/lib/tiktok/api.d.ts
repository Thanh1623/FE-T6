import "server-only";
export declare const TIKTOK_SCOPES: string[];
export declare const tiktokConfigured: () => boolean;
export declare function authorizeUrl(state: string): string;
export declare class TikTokError extends Error {
    code: string;
    constructor(code: string, message: string);
}
export type TikTokToken = {
    access_token: string;
    refresh_token: string;
    open_id: string;
    scope: string;
    expires_in: number;
    refresh_expires_in: number;
};
export declare const exchangeCode: (code: string) => Promise<TikTokToken>;
export declare const refreshToken: (refresh: string) => Promise<TikTokToken>;
export type TikTokUser = {
    open_id: string;
    display_name?: string;
    avatar_url?: string;
    follower_count?: number;
    likes_count?: number;
    video_count?: number;
};
export declare function getUser(token: string): Promise<TikTokUser>;
export type TikTokVideo = {
    id: string;
    create_time: number;
    title?: string;
    video_description?: string;
    cover_image_url?: string;
    share_url?: string;
    like_count?: number;
    comment_count?: number;
    share_count?: number;
    view_count?: number;
};
export declare function listVideos(token: string, sinceSec: number, maxPages?: number): Promise<TikTokVideo[]>;
