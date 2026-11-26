import type { KpiMetric, KpiRule } from "@/lib/kpi-constants";
export type Metrics = Record<KpiMetric, number | null> & {
    posts: number;
    videos: number;
};
export type Check = {
    metric: KpiMetric;
    op: KpiRule["op"];
    target: number;
    actual: number | null;
    pass: boolean;
    progress: number;
};
export declare function buildMetrics(raw: {
    views: number;
    viewers: number;
    reactions: number;
    clicks: number;
    qty_net: number;
    posts: number;
    videos: number;
}): Metrics;
export declare function checkRules(rules: KpiRule[], m: Metrics): Check[];
export declare const rulesPass: (checks: Check[], match: "all" | "any") => boolean;
export declare function groupStatus(checks: Check[], match: "all" | "any", enoughData: boolean): "pass" | "not_enough" | "partial" | "weak";
export type AutoResult = "testing" | "win" | "win_traffic" | "win_sp" | "fail";
export declare const WIN_RESULTS: readonly ["win", "win_traffic", "win_sp"];
export type WinResult = (typeof WIN_RESULTS)[number];
export declare const WIN_NAME: Record<WinResult, string>;
export declare const WIN_VAR: Record<WinResult, string>;
export declare const isWinResult: (r: string | null | undefined) => r is WinResult;
export declare function decideAuto(salesPass: boolean, trafficPass: boolean, windowOver: boolean): AutoResult;
export type ProductAgeInfo = {
    age: "new" | "old";
    age_reason: string;
};
/**
 * Xác định sản phẩm Mới / Cũ tương đối theo kỳ lọc:
 * - Override: R&D chỉ định thủ công
 * - Mới (Media): Mẫu test do đội Media tự tìm source và test (T10001, T20003...)
 * - Mới R&D: có giai đoạn (stage) hoặc nghiên cứu thủ công (origin === 'manual')
 * - Cũ: đã bán trước kỳ lọc > 15 cái, HOẶC đã từng phát sinh đơn từ các tháng trước (> 21 ngày trước kỳ),
 *       HOẶC đã lên video > 14 ngày trước kỳ, HOẶC đã có trên Sapo catalog > 21 ngày trước kỳ.
 * - Mới: mới lên video và test bán lần đầu trong kỳ lọc (hoặc sát kỳ lọc).
 */
export declare function determineProductAge(params: {
    code?: string;
    ageOverride?: "new" | "old" | null;
    stage?: string | null;
    origin?: string | null;
    priorQty: number;
    oldHistoryQty?: number;
    firstPostDate?: string | null;
    firstSeenAt?: string | null;
    periodFrom: string;
}): ProductAgeInfo;
