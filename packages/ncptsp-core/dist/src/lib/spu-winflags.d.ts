import "server-only";
import type { WinFlags, WinRules } from "@/lib/spu-tracking";
import type { Market } from "@/lib/channel-market";
type Post = {
    channel_id: string;
    published_at: string;
    product_codes: string[];
    views: number | null;
    comments: number | null;
};
export type WinArgs = {
    from: string;
    to: string;
    pageIds: string[] | null;
    channels: string[];
    rules: WinRules;
    codes?: string[];
};
type WinOut = {
    wt: string[];
    order: string[];
};
export declare function computeWinFlags(posts: Post[], sales: {
    code: string;
    date: string;
    qty_sold: number;
    qty_returned: number;
}[], rules: WinRules, saleCode?: (c: string) => string): WinOut;
export declare function loadLaunchWinFlags(a: WinArgs): Promise<WinFlags>;
export declare const EMPTY_WIN: WinFlags;
export type RollingArgs = {
    pageIds: string[] | null;
    channels: string[];
    rules: WinRules;
};
export type RollingWin = WinFlags & {
    meta: {
        base: string;
        trafficReady: boolean;
        videos: number;
        unknownVideos: number;
    };
};
export declare function loadRollingWin(a: RollingArgs & {
    today?: string;
}): Promise<RollingWin>;
type MarketScope = {
    pageIds: string[] | null;
    poolIds: string[];
    markets: Record<string, "vn" | "intl">;
    market: Market;
};
export declare function loadRollingWinByMarket(a: MarketScope & {
    channels: string[];
    rules: WinRules;
    today?: string;
}): Promise<RollingWin>;
export declare function loadLaunchWinFlagsByMarket(a: MarketScope & Omit<WinArgs, "pageIds">): Promise<WinFlags>;
export {};
