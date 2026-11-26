export type Counters = {
    views: number;
    viewers: number;
    reactions: number;
    clicks: number;
};
export type SnapAt = Counters & {
    day: string;
};
export type Gain = Counters & {
    exact: boolean;
};
export declare const shiftDay: (d: string, n: number) => string;
export declare function gainInRange(a: {
    pubDay: string;
    from: string;
    to: string;
    today: string;
    cur: Counters;
    end?: SnapAt | null;
    base?: SnapAt | null;
    maxLag?: number;
}): Gain | null;
export type RangeTotals = Counters & {
    posts: number;
    videos: number;
    unknown: number;
    approx: number;
};
export declare const emptyTotals: () => RangeTotals;
export declare function addGain(t: RangeTotals, g: Gain | null, opts: {
    published: boolean;
    video: boolean;
}): void;
