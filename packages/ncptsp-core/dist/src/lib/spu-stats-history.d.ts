import "server-only";
export declare const SPU_STAT_KEYS: readonly ["active", "inStock", "hot", "normal", "slow", "bad"];
export type SpuStatKey = (typeof SPU_STAT_KEYS)[number];
export type SpuStats = Record<SpuStatKey, number>;
export type SpuStatPoint = {
    day: string;
} & SpuStats;
export declare function loadSpuStatsHistory(): Promise<SpuStatPoint[]>;
export declare function recordSpuStats(s: SpuStats): Promise<void>;
