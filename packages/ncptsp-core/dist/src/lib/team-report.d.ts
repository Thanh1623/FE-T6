import "server-only";
export type OrderStats = {
    orders: number;
    qty: number;
    delivered_qty: number;
    cancelled: number;
    delivered_orders: number;
    avg_days: number | null;
    st: {
        done: number;
        running: number;
        booked: number;
        archived: number;
    };
    daily: {
        d: string;
        q: number;
        o?: number;
        c?: number;
    }[];
    staff: {
        name: string;
        orders: number;
        qty: number;
        delivered_orders: number;
        cancelled: number;
    }[];
};
export type ChetacRow = {
    kind: string;
    orders: number;
    running: number;
    booked: number;
    archived: number;
    over14: number;
    ready: number;
    done: number;
};
export type ShortRow = {
    code: string;
    name: string;
    pending: number;
    pending7: number;
    stock: number;
    incoming: number;
    short: number;
};
export type CurrentStats = {
    pending_qty: number;
    pending_over7: number;
    chetac: ChetacRow[];
    short: ShortRow[];
};
export type CostMat = {
    mat: number;
    q: number;
    orders?: number;
    rev: number;
    revc: number;
    cost: number;
};
export type CostStats = {
    orders?: number;
    mat: CostMat[];
    flagged: {
        order_id: string;
        sku: string;
        price: number;
        cost: number;
        qty: number;
    }[];
};
export type MixStats = {
    grp: {
        name: string;
        q: number;
        spus: number;
    }[];
    age: {
        cat: "old" | "new" | "made" | "out";
        q: number;
        spus: number;
        orders?: number;
        sup: number;
    }[];
    new_list: {
        code: string;
        name: string;
        grp: string;
        q: number;
        created: string | null;
        first_order: string | null;
    }[];
};
export type SpuListRow = {
    code: string;
    name: string;
    team_qty: number;
    sold30: number;
    stock: number;
    incoming: number;
    cover: number | null;
    cover_in: number | null;
};
export type PushRow = {
    code: string;
    name: string;
    stock: number;
    age_days: number | null;
    sold30: number;
    has_video: boolean;
    n_teams: number;
};
export type SpuStats = {
    videos: number;
    views: number;
    video_spus: number;
    last_video_day: string | null;
    spus: number;
    in_stock: number;
    with_video: number;
    hot: number;
    normal: number;
    slow: number;
    dead: number;
    hot_short_stock: number;
    hot_short: number;
    short_list: SpuListRow[];
    push_list: PushRow[];
};
export type TestStats = {
    codes: number;
    win: number;
    win_traffic: number;
    fail: number;
    testing: number;
    videos: number;
    views: number;
    list: {
        code: string;
        result: string | null;
    }[];
};
export type LineStatus = "d" | "c" | "t" | "m" | "r";
export type OrderLine = [od: string, orderId: string, code: string, sku: string, name: string, qty: number, status: LineStatus, days: number, ret?: "" | "i" | "p" | "f"];
export type SpuRow = [code: string, name: string, sold: number, delivered: number, videos: number, stock: number, sold30: number | null];
export type TopRow = {
    code: string;
    name: string;
    q: number;
    stock: number;
    incoming: number;
    sold30: number;
    image: string | null;
    result: string | null;
    has_video: boolean;
};
export type WinRowRaw = [code: string, name: string, result: string, sold: number, videos: number, views: number, age: string];
export type WinRow = [...WinRowRaw, team: string];
export type MediaStats = {
    new_total: number;
    new_video: number;
    new_no_video: {
        code: string;
        name: string;
        q: number;
        stock: number;
        incoming: number;
        sold30: number;
    }[];
    video_spus: number;
    win: number;
    win_traffic: number;
    fail: number;
    win_list: WinRowRaw[];
};
export declare class MigrationMissing extends Error {
}
export declare const loadOrders: (team: string, from: string, to: string) => Promise<OrderStats>;
export declare const loadCurrent: (team: string, from: string) => Promise<CurrentStats>;
export declare const loadMix: (team: string, from: string, to: string) => Promise<MixStats>;
export declare const loadSpu: (team: string, from: string, to: string) => Promise<SpuStats>;
export declare const loadOrderList: (team: string, from: string, to: string) => Promise<OrderLine[]>;
export declare const loadSpuList: (team: string, from: string, to: string) => Promise<SpuRow[]>;
export declare const loadTop: (team: string, from: string, to: string) => Promise<TopRow[]>;
export declare const loadMedia: (team: string, from: string, to: string) => Promise<MediaStats>;
export type RevCat = "old" | "new" | "made" | "out";
export type RevMix = {
    cats: {
        cat: RevCat;
        q: number;
        orders: number;
        spus: number;
        rev: number;
        rev_del: number;
        revc: number;
        cost: number;
    }[];
};
export declare const loadRevMix: (team: string, from: string, to: string, by: "order" | "delivery") => Promise<RevMix>;
export type CompanyClass = {
    active: number;
    in_stock: number;
    hot: number;
    normal: number;
    slow: number;
    bad: number;
};
export declare const loadCompanyClass: (slow: number, normal: number) => Promise<CompanyClass>;
export type ExtraStats = {
    receipts_today: number;
    last_receipt: string | null;
    orders_at: string | null;
    summary_at: string | null;
};
export declare const loadExtra: (team: string) => Promise<ExtraStats>;
export declare const loadTest: (team: string) => Promise<TestStats>;
export declare const loadCost: (team: string, from: string, to: string, by: "order" | "delivery", excl: boolean) => Promise<CostStats>;
export declare const previousRange: (from: string, to: string) => {
    from: string;
    to: string;
};
export type TeamOrderRow = {
    createdAt: string;
    sku: string;
    qty: number;
    received: number;
    remaining: number;
    poNo: string | null;
    poDate: string | null;
    eta: string | null;
    qc: number;
    overdueDays: number;
};
export type TeamOrders = {
    rows: TeamOrderRow[];
    ordered: number;
    received: number;
    remaining: number;
    overduePos: number;
    qcPending: number;
};
export declare const loadTeamOrders: (teamName: string) => Promise<TeamOrders>;
export type PoCoverage = {
    pending: number;
    pos: number;
    nextEta: string | null;
    overdue: boolean;
};
export type PoLine = {
    code: string;
    po: string;
    eta: string | null;
    left: number;
    sup: string;
};
export declare const loadPo: () => Promise<{
    cov: Record<string, PoCoverage>;
    lines: PoLine[];
}>;
