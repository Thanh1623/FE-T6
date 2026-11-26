export declare const PLATFORMS: {
    readonly facebook: {
        readonly label: "Facebook";
        readonly color: "var(--series-1)";
        readonly connected: true;
    };
    readonly instagram: {
        readonly label: "Instagram";
        readonly color: "var(--series-2)";
        readonly connected: false;
    };
    readonly tiktok: {
        readonly label: "TikTok";
        readonly color: "var(--series-3)";
        readonly connected: true;
    };
    readonly youtube: {
        readonly label: "YouTube";
        readonly color: "var(--series-4)";
        readonly connected: true;
    };
};
export type Platform = keyof typeof PLATFORMS;
export interface PlatformAdapter {
    platform: Platform;
    listChannels(): Promise<{
        id: string;
        name: string;
        followers_count: number | null;
        access_token: string;
    }[]>;
    syncDaily(channelId: string, days: number): Promise<number>;
    syncPosts(channelId: string, days: number): Promise<number>;
}
export declare const KIND_LABELS: {
    readonly reel: "Reel";
    readonly video: "Video";
    readonly photo: "Ảnh";
    readonly status: "Bài đăng";
    readonly other: "Khác";
};
export type Kind = keyof typeof KIND_LABELS;
export declare function kindOf(type: string | null | undefined, permalink: string | null | undefined): Kind;
