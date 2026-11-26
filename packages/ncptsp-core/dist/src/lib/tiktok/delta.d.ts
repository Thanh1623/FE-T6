export type Counts = {
    views: number;
    reactions: number;
    comments: number;
    shares: number;
};
export type VideoNow = {
    id: string;
    createdSec: number;
} & Counts;
export declare const FRESH_HOURS = 48;
export declare function dailyDelta(prev: Map<string, Counts>, now: VideoNow[], nowMs: number): {
    views: number;
    engagements: number;
};
export declare function followDelta(prev: number | null | undefined, cur: number | undefined): {
    gained: number;
    lost: number;
};
