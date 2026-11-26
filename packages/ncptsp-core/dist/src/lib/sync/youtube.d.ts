import "server-only";
export declare const YT_INITIAL_DAYS = 90;
export type YouTubeChannel = {
    id: string;
    platform: string;
    name: string;
    last_synced_at?: string | null;
};
export declare function activeYouTube(): Promise<YouTubeChannel[]>;
export declare function syncYouTubeChannel(ch: YouTubeChannel, postDays: number, extractHashtags: (t?: string | null) => string[]): Promise<{
    posts: number;
    newViews: number;
}>;
