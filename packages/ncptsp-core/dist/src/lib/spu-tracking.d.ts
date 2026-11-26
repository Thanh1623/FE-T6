import type { KpiRule } from "@/lib/kpi-constants";
import type { First3d } from "@/lib/video-win";
export declare const DEFAULT_SPU_RULES: {
    sales: {
        slowBelow: number;
        normalBelow: number;
    };
    win: WinRules;
    video: {
        rules: KpiRule[];
        match: "all" | "any";
    };
    push: {
        minStock: number;
        minAgeDays: number;
        maxVideos: number;
    };
    restock: {
        coverDays: number;
        minUnits: number;
        minSold: number;
    };
};
export type WinRules = {
    traffic: {
        days: number;
        views: number;
        comments: number;
    };
    order: {
        days: number;
        qty: number;
    };
};
export type WinFlags = {
    wt: ReadonlySet<string>;
    order: ReadonlySet<string>;
};
export type SpuRules = typeof DEFAULT_SPU_RULES;
export declare const SPU_RULES: SpuRules;
export declare const GROUPS: readonly ["Nhẫn", "Dây chuyền", "Lắc tay", "Bông tai", "Kiềng", "Mặt dây", "Vòng tay", "Set", "Khác"];
export type Group = (typeof GROUPS)[number];
export type SpuVid = {
    id?: string;
    channelId?: string;
    age: number;
    views: number;
    title?: string;
    platform?: "FB" | "IG" | "TT";
    channel?: string;
    team?: string | null;
    url?: string | null;
    thumb?: string | null;
    first3d?: First3d;
};
export type SpuSale = {
    age: number;
    qty: number;
    team: string | null;
};
export type SpuRow = {
    code: string;
    name: string;
    group: Group;
    variants: number;
    image: string | null;
    stockBy: Record<string, number>;
    availBy: Record<string, number> | null;
    incoming: number;
    ageApprox?: boolean;
    ageDays: number | null;
    sold30: number | null;
    sales: SpuSale[];
    soldBy: Record<string, number>;
    vids: SpuVid[];
    footage: number | null;
    teams: string[];
};
export type Flags = {
    active: boolean;
    inStock: boolean;
    hot: boolean;
    normal: boolean;
    other: boolean;
    slow: boolean;
    bad: boolean;
    star: boolean;
    win: boolean;
    winTraffic: boolean;
    hasVideo: boolean;
};
export type Action = "produce" | "traffic" | "convert" | "bad" | "shoot" | "video" | "slow" | null;
export declare const ACTION_LABEL: Record<Exclude<Action, null>, {
    label: string;
    hint: string;
}>;
export declare function saleFlags(stock: number, sl: number | null, R: SpuRules): {
    inStock: boolean;
    active: boolean;
    other: boolean;
    bad: boolean;
    slow: boolean;
    normal: boolean;
    hot: boolean;
};
export declare function actionOf(i: {
    stock: number;
    inStock: boolean;
    sl30: number | null;
    sold: number | null;
    videos: number;
    ageDays: number | null;
    footage: number | null;
    days: number;
    flags: Pick<Flags, "star" | "win" | "winTraffic" | "bad" | "slow">;
}, R: SpuRules): Action;
export type View = {
    row: SpuRow;
    stock: number;
    available: number | null;
    sold: number | null;
    videos: number;
    views: number | null;
    views3?: number | null;
    flags: Flags;
    action: Action;
};
export declare function viewOf(row: SpuRow, opt: {
    wh: string | null;
    days: number;
    endAge?: number;
    rules?: SpuRules;
    teams?: string[];
    pageIds?: string[];
    win?: WinFlags;
    companyClass?: boolean;
}): View;
export type StatusFilter = "all" | "instock" | "outstock" | "hot" | "normal" | "slow" | "bad" | "star" | "win" | "wintraffic" | "novideo" | "video";
export declare const STATUS_FILTERS: {
    id: StatusFilter;
    label: string;
    test: (f: Flags) => boolean;
}[];
