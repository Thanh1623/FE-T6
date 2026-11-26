import type { SpuRow } from "@/lib/spu-tracking";
export declare const normSearch: (t: string) => string;
export type SummaryRow = {
    run_id: number;
    code: string;
    name: string;
    grp: string;
    variants: number;
    image: string | null;
    stock_by: Record<string, number>;
    stock_total: number;
    avail_by: Record<string, number> | null;
    incoming: number;
    age_days: number | null;
    age_approx: boolean;
    sold30: number | null;
    sold_by_team: Record<string, number>;
    video_teams: string[];
    search_text: string;
};
export type SalesDailyRow = {
    run_id: number;
    code: string;
    day: string;
    team: string;
    qty: number;
};
export type VideoDailyRow = {
    run_id: number;
    code: string;
    day: string;
    channel_id: string;
    team: string;
    platform: string;
    videos: number;
    views: number;
};
export declare function buildSummaryTables(rows: SpuRow[], today: string, runId: number): {
    summary: SummaryRow[];
    sales: SalesDailyRow[];
    videos: VideoDailyRow[];
};
