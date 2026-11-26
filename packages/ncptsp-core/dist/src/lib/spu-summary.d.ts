import "server-only";
export type RefreshResult = {
    ok: true;
    runId: number;
    spus: number;
    salesRows: number;
    videoRows: number;
    ms: number;
} | {
    ok: false;
    error: string;
};
export declare function refreshSpuSummary(): Promise<RefreshResult>;
export type CheckLine = {
    name: string;
    live: number;
    summary: number;
    ok: boolean;
};
export declare function checkSpuSummary(): Promise<{
    ok: boolean;
    refreshedAt: string | null;
    lines: CheckLine[];
} | {
    error: string;
}>;
export declare function summaryNeedsRefresh(): Promise<{
    yes: boolean;
    reason: string;
}>;
export declare function postsChangedSinceSummary(): Promise<boolean>;
export declare function scheduleSpuSummaryRefresh(): void;
