import type { AutoResult } from "@/lib/eval/rules";
type EvalLike = {
    result: AutoResult;
    traffic_status: string;
    sales_status: string;
    forecast: {
        predicted: AutoResult;
    } | null;
};
export type Potential = {
    level: "high" | "mid";
    reasons: string[];
};
export declare function productPotential(e: EvalLike): Potential | null;
type VideoLike = {
    views: number;
    ctr: number | null;
};
export declare function videoThresholds(videos: VideoLike[], minViews?: number): {
    views: number;
    hotViews: number;
    medianViews: number;
    ctr: number;
};
export declare function videoPotential(v: VideoLike, t: ReturnType<typeof videoThresholds>): string | null;
export {};
