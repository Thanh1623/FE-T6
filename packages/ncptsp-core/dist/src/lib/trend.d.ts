export type Snap = {
    date: string;
    views: number;
};
export type Trend = {
    totals: Snap[];
    days: {
        date: string;
        gain: number;
    }[];
    direction: "up" | "down" | "flat" | "none";
    changePct: number | null;
};
export declare function trendOf(snaps: Snap[], maxDays?: number): Trend;
