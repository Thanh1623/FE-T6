import type { KpiRule } from "@/lib/kpi-constants";
export type First3d = {
    views: number;
    viewers: number;
    exact: boolean;
    unknown?: boolean;
};
export type VideoWinRule = {
    rules: KpiRule[];
    match: "all" | "any";
};
export declare function videoWinOf(f: {
    views: number;
    viewers?: number | null;
    unknown?: boolean;
}, kpi: VideoWinRule): boolean;
