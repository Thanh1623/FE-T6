import "server-only";
export type VideoRefresh = {
    ok: boolean;
    skipped?: boolean;
    error?: string;
    fact?: unknown;
    daily?: unknown;
    growth?: unknown;
    ms: number;
};
export declare function refreshVideoDaily(opts?: {
    full?: boolean;
}): Promise<VideoRefresh>;
export declare function checkVideoDaily(): Promise<{
    ok: boolean;
    error: string;
} | {
    only_old: number;
    only_new: number;
    diff_videos: number;
    ok: boolean;
    error?: undefined;
}>;
