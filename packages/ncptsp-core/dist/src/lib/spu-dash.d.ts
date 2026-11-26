import "server-only";
import { type SqlRow } from "@/lib/spu-query";
import { type SpuRow, type SpuRules, type View, type WinFlags } from "@/lib/spu-tracking";
import { type SpuVideo } from "@/lib/spu-videos";
import type { StockStatus } from "@/lib/spu-win";
export type DashParams = {
    today: string;
    days: number;
    endAge: number;
    teams: string[];
    pageIds: string[] | null;
    rules: SpuRules;
    limit: number;
    win: WinFlags;
};
export declare const DASH_GROUPS: readonly [readonly ["SPU Active", "var(--ink-1)"], readonly ["SPU còn hàng", "var(--good)"], readonly ["SPU bán chậm", "var(--warn-ink)"], readonly ["SPU tồn xấu", "var(--bad)"], readonly ["SPU bán chạy", "var(--star)"]];
export type DashSpu = {
    source: "sql" | "legacy";
    s0: {
        active: number;
        hot: number;
        normal: number;
        slow: number;
        bad: number;
        noStockSold: number;
    };
    s1: {
        total: number;
    };
    winNow: {
        wt: number;
        win: number;
        star: number;
    };
    s1Codes: Set<string>;
    videoCats: {
        name: string;
        posted: number;
    }[];
    videoGroups: {
        label: string;
        tone: string;
        spu: number;
        withVideo: number;
        posted: number;
    }[];
    stockStatus: Map<string, StockStatus>;
    activeCodes: Set<string>;
    alertViews: View[];
    vids: {
        total: number;
        items: {
            x: SpuVideo;
            code: string;
        }[];
    };
};
export declare function dashLegacy(rows: SpuRow[], q: DashParams): Omit<DashSpu, "source">;
type SqlDash = {
    s0: {
        active: number;
        hot: number;
        normal: number;
        slow: number;
        bad: number;
        no_stock_sold: number;
    };
    s1: {
        total: number;
    };
    win: {
        wt: number;
        win: number;
        star: number;
    };
    s1_codes: string[];
    cats: {
        name: string;
        posted: number;
    }[];
    groups: {
        label: string;
        spu: number;
        with_video: number;
        posted: number;
    }[];
    stock_status: {
        bad: string[];
        slow: string[];
        hot: string[];
    };
    active_codes: string[];
    alerts: {
        vids_total: number;
        top_videos: {
            id: string;
            channel_id: string;
            published_at: string;
            views: number;
            code: string;
        }[];
        rows: SqlRow[];
    };
    refreshed_at: string | null;
};
export declare const dashRpcParams: (q: DashParams) => {
    today: string;
    days: number;
    end_age: number;
    teams: string[];
    channels: string[];
    slow_below: number;
    normal_below: number;
    alert_limit: number;
    wt: string[];
    ord: string[];
};
export declare function dashFromSql(d: SqlDash, q: DashParams): Promise<Omit<DashSpu, "source">>;
export declare function warmDashSpu(q: DashParams): Promise<void>;
export declare function loadDashSpu(q: DashParams): Promise<DashSpu>;
export {};
