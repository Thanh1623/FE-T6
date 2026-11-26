import "server-only";
import type { AutoResult, Check, Metrics } from "@/lib/eval/rules";
export type Forecast = {
    views: number;
    viewers: number;
    qty_net: number;
    predicted: AutoResult;
    days_left: number;
} | null;
export type VideoRank = {
    id: string;
    channel_id: string;
    date: string;
    url: string | null;
    thumb: string | null;
    views: number;
    viewers: number;
    ctr: number | null;
};
export type Evaluation = {
    code: string;
    product_id: string | null;
    first_post_date: string;
    window_end: string;
    days_elapsed: number;
    age: "new" | "old";
    age_reason: string;
    age_reliable: boolean;
    source: "auto" | "session";
    session_id: string | null;
    result: AutoResult;
    sales_status: string;
    traffic_status: string;
    metrics: Metrics;
    checks: {
        group: string;
        items: Check[];
    }[];
    forecast: Forecast;
    videos: VideoRank[];
    evaluated_at: string;
    product?: {
        name: string;
        line: string | null;
        category: string | null;
        material: string | null;
        stone: string | null;
        image_paths: string[];
        confirmed_result?: "win" | "win_traffic" | "win_sp" | "fail" | null;
        stage?: string | null;
        st_code?: string | null;
        media_review?: "accepted" | "dismissed" | null;
        team_id?: string | null;
    } | null;
    confirmed?: boolean;
};
export declare const RESULT_TEXT: Record<AutoResult, string>;
export declare const RESULT_COLOR: Record<AutoResult, string>;
export declare const AGE_REASON: Record<string, string>;
export declare const STATUS_TEXT: Record<string, string>;
export declare function listEvaluations(opts?: {
    age?: "new" | "old";
    from?: string;
    to?: string;
    testOnly?: boolean;
}): Promise<{
    confirmed: boolean;
    code: string;
    product_id: string | null;
    first_post_date: string;
    window_end: string;
    days_elapsed: number;
    age: "new" | "old";
    age_reason: string;
    age_reliable: boolean;
    source: "auto" | "session";
    session_id: string | null;
    result: AutoResult;
    sales_status: string;
    traffic_status: string;
    metrics: Metrics;
    checks: {
        group: string;
        items: Check[];
    }[];
    forecast: Forecast;
    videos: VideoRank[];
    evaluated_at: string;
    product?: {
        name: string;
        line: string | null;
        category: string | null;
        material: string | null;
        stone: string | null;
        image_paths: string[];
        confirmed_result?: "win" | "win_traffic" | "win_sp" | "fail" | null;
        stage?: string | null;
        st_code?: string | null;
        media_review?: "accepted" | "dismissed" | null;
        team_id?: string | null;
    } | null;
}[]>;
export type EvaluationLite = {
    code: string;
    result: AutoResult;
    age: "new" | "old";
    age_reason?: string | null;
    product: {
        name: string;
        stage?: string | null;
        origin?: string | null;
        age_override?: "new" | "old" | null;
    } | null;
    first_post_date: string;
    window_end: string;
    win_views: number | null;
    win_qty: number | null;
    win_kind: "first" | "recent" | null;
    win_from: string | null;
    win_to: string | null;
};
export declare function listEvaluationsLite(): Promise<EvaluationLite[]>;
export declare function listEvaluationResults(): Promise<{
    code: string;
    product_id: string | null;
    result: AutoResult;
    name: string | null;
}[]>;
export declare function getEvaluation(code: string): Promise<Evaluation>;
export declare function getEvaluationsByProduct(ids: string[]): Promise<Record<string, Evaluation>>;
export type Tally = {
    total: number;
    win: number;
    win_traffic: number;
    win_sp: number;
    fail: number;
    testing: number;
};
export declare const emptyTally: () => Tally;
export declare function tally(list: Evaluation[]): Tally;
export declare function rates(t: Tally): {
    done: number;
    win: number;
    win_traffic: number;
    win_sp: number;
    anyWin: number;
    fail: number;
};
export declare function weekOf(date: string): string;
