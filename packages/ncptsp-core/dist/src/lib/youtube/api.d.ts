import "server-only";
export declare const youtubeConfigured: () => boolean;
export type YtChannel = {
    id: string;
    title: string;
    handle: string | null;
    subscribers: number | null;
    uploadsPlaylist: string;
};
export declare function resolveChannel(input: string): Promise<YtChannel>;
export declare function channelSubscribers(channelId: string): Promise<number | null>;
export declare const uploadsOf: (channelId: string) => string;
export declare function listUploadIds(playlistId: string, sinceMs: number, maxPages?: number): Promise<string[]>;
export type YtVideo = {
    id: string;
    title: string;
    description: string;
    tags: string[];
    publishedAt: string;
    thumbnail: string | null;
    views: number;
    likes: number | null;
    comments: number | null;
    seconds: number;
    liveOrUpcoming: boolean;
};
export declare function getVideos(ids: string[]): Promise<YtVideo[]>;
