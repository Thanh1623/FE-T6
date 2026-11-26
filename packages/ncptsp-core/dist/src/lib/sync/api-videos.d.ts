import "server-only";
import { type Actor } from "@/lib/system-log";
export declare const VIDEO_SYNC: {
    storeDays: number;
    recentDays: number;
    viralAbs: number;
    viralPct: number;
    thumbMarginDays: number;
};
export declare function apiFreshFacebook(ids: string[], maxAgeHours?: number): Promise<Set<string>>;
export declare function hasProductCode(message: string | null | undefined, known: Set<string>): boolean;
export type Platform = "facebook" | "tiktok";
export type VideoSyncResult = {
    platform: Platform;
    apiTotal: number;
    read: number;
    candidates: number;
    written: number;
    created: number;
    recent: number;
    viral: number;
    thumbs: number;
    newChannels: number;
    skippedInactive: number;
    seconds: number;
    staleApi?: number;
};
export declare const API_STALE_DAYS = 7;
export declare const API_ACTIVE_DAYS = 60;
export type ApiStale = {
    at: string;
    days: number;
    activeDays: number;
    quiet: number;
    channels: {
        id: string;
        name: string;
        days: number;
        direct: boolean;
    }[];
};
export declare function syncApiVideos(platform: Platform, opts?: {
    dryRun?: boolean;
    known?: Set<string>;
}): Promise<VideoSyncResult>;
export type VideoRunResult = {
    ok: true;
    results: VideoSyncResult[];
} | {
    ok: false;
    error: string;
    results: VideoSyncResult[];
};
export declare function runApiVideoSync(platforms?: Platform[], by?: Actor): Promise<VideoRunResult>;
