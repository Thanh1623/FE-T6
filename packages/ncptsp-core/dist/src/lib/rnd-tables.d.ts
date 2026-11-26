import "server-only";
import { type CurrentUser } from "@/lib/session";
import { type PipelineItem } from "@/lib/pipeline";
import type { Col, GridRow } from "@/components/grid/types";
type Ctx = Awaited<ReturnType<typeof loadContext>>;
type DesignRow = {
    product_id: string;
    assignee_id: string | null;
    status: string;
    file_url: string | null;
    image_paths: string[];
    note: string | null;
    review_note: string | null;
    created_at: string;
    done_at: string | null;
};
type OrderRow = {
    id: number;
    product_id: string;
    supplier: string | null;
    status: string;
    ordered_at: string;
    expected_at: string | null;
    received_at: string | null;
    qty: number | null;
    unit: string | null;
    weight_chi: number | null;
    size: string | null;
    color: string | null;
    cost: number | null;
    cost_other: number | null;
    price: number | null;
    note: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
};
type MediaRow = {
    id: number;
    product_id: string;
    sample_order_id: number | null;
    request_type: string;
    assignee_id: string | null;
    lead_id: string | null;
    deadline: string | null;
    status: string;
    drive_url: string | null;
    photo_paths: string[];
    approval: string | null;
    review_note: string | null;
    note: string | null;
    received_at: string;
    done_at: string | null;
    created_by: string | null;
    updated_at: string;
};
export declare function loadContext(user: CurrentUser): Promise<{
    user: CurrentUser;
    options: import("@/lib/rnd-options").RndOptions;
    teams: import("@/lib/pipeline").Team[];
    scoreCards: (import("./rnd-score-calc").Card & {
        product_id: string;
    })[];
    scoreCfg: import("./rnd-score-calc").ScoreCfg;
    products: PipelineItem[];
    byId: Map<string, PipelineItem>;
    design: Map<string, DesignRow>;
    orders: OrderRow[];
    media: MediaRow[];
    posted: Set<string>;
    imgs: (ps: string[]) => {
        thumb?: string;
        path: string;
        url: string;
    }[];
    people: {
        id: string;
        name: string;
    }[];
    peopleOf: (roles: string[]) => {
        id: string;
        name: string;
    }[];
    rndTeamPeople: {
        id: string;
        name: string;
    }[];
    teamPeople: {
        id: string;
        name: string;
    }[];
    productPick: {
        id: string;
        name: string;
    }[];
}>;
export declare const START_LABEL = "B\u1EAFt \u0111\u1EA7u s\u1EA3n xu\u1EA5t";
export declare const CANCEL_LABEL = "H\u1EE7y";
export declare function approvedTable(ctx: Ctx): {
    cols: Col[];
    rows: GridRow[];
};
export declare function collectionTable(ctx: Ctx): {
    cols: Col[];
    rows: GridRow[];
};
export declare function designTable(ctx: Ctx): {
    cols: Col[];
    rows: GridRow[];
};
export declare function ordersTable(ctx: Ctx): Promise<{
    cols: Col[];
    rows: GridRow[];
}>;
export declare function mediaTable(ctx: Ctx): {
    cols: Col[];
    rows: GridRow[];
};
type MarketStat = {
    first: string | null;
    videos: number;
    views: number;
    engagement: number;
    topUrl: string | null;
    sold: number;
    returned: number;
    viewers: number;
    clicks: number;
    trendPct: number | null;
};
export declare function marketStats(codes: {
    id: string;
    code: string;
    sapo: string | null;
    from?: string | null;
    to?: string | null;
    pages?: string[];
}[]): Promise<Map<string, MarketStat>>;
export declare function trafficTable(ctx: Ctx): Promise<{
    cols: Col[];
    rows: GridRow[];
}>;
export declare function winTable(ctx: Ctx): Promise<{
    cols: Col[];
    rows: GridRow[];
}>;
export declare function effectTable(ctx: Ctx): Promise<{
    cols: Col[];
    rows: GridRow[];
}>;
export {};
