import "server-only";
export declare function todayVN(): string;
export declare function addDays(date: string, n: number): string;
export declare function daysBetween(from: string, to: string): number;
export declare const RANGE_PRESETS: readonly [7, 30, 90, 365];
export declare const CHANNELS: {
    readonly facebook: "Facebook";
    readonly tiktok_shop: "TikTok Shop";
    readonly tiktok: "TikTok";
    readonly shopee: "Shopee";
    readonly web: "Web";
    readonly cua_hang: "Cửa hàng";
    readonly zalo: "Zalo";
    readonly instagram: "Instagram";
    readonly khac: "Khác";
    readonly bao_hanh: "Bảo hành";
};
export type Filters = {
    from: string;
    to: string;
    range: string;
    scope: string;
    teams: string[];
    channels: string[];
};
type SP = Record<string, string | string[] | undefined>;
export declare function parseFilters(sp: SP): Filters;
export declare const limitByTeams: <T extends {
    team_id?: string | null;
}>(accounts: T[], f: Pick<Filters, "teams">) => T[];
export declare function scopePageIds(f: Filters, myPageIds: string[]): string[] | null;
export declare function previousPeriod(f: Filters): {
    from: string;
    to: string;
};
export type AccountInfo = {
    id: string;
    name: string;
    platform: string;
    team_id: string | null;
    color: string;
};
export declare const getAccounts: () => Promise<AccountInfo[]>;
export declare const OVERVIEW_METRICS: {
    readonly views: "Lượt xem";
    readonly viewers: "Người xem";
    readonly new_follows: "Theo dõi mới";
    readonly engagements: "Tương tác";
    readonly video_views: "Lượt xem video";
};
export type OverviewMetric = keyof typeof OVERVIEW_METRICS;
export declare function getDailyMetrics(channelIds: string[], from: string, to: string): Promise<{
    account_id: string;
    metric: "views" | "viewers" | "engagements" | "new_follows" | "video_views";
    date: string;
    value: number;
}[]>;
export type ChannelRow = {
    channel: string;
    qty_net: number;
};
export declare function getSalesByChannel(code: string, from: string, to: string): Promise<ChannelRow[]>;
export type PostRow = {
    id: string;
    channel_id: string;
    published_at: string;
    kind: string;
    message: string | null;
    hashtags: string[];
    product_codes: string[];
    unknown_codes: string[];
    content_line: string | null;
    concept: "old" | "new" | null;
    staff_code: string | null;
    permalink_url: string | null;
    thumbnail_url: string | null;
    views: number;
    viewers: number;
    reactions: number;
    comments: number | null;
    shares: number | null;
    clicks: number;
    video_views: number;
};
export declare function getPosts(channelIds: string[], from: string, to: string): Promise<PostRow[]>;
export type PostSku = "all" | "with" | "without" | "unknown";
export declare function getPostsPage(channelIds: string[], from: string, to: string, sort: string, page: number, size: number, sku?: PostSku, kind?: "all" | "video", codes?: string[], minViews?: number | {
    rules: {
        metric: string;
        op: string;
        value: number;
    }[];
    match: "all" | "any";
}, search?: string): Promise<{
    posts: PostRow[];
    total: number;
}>;
export declare const getPostsPageCached: typeof getPostsPage;
export type ProductInfo = {
    product_code: string;
    name: string;
    image_url: string | null;
    ageInfo?: {
        age?: "new" | "old" | null;
        age_reason?: string | null;
        stage?: string | null;
        origin?: string | null;
    } | null;
};
export declare function getProductInfo(codes: string[]): Promise<Record<string, ProductInfo>>;
export type SyncLog = {
    job: string;
    channel_id: string | null;
    status: string;
    message: string | null;
    finished_at: string | null;
};
export declare const getLatestSyncLogs: () => Promise<SyncLog[]>;
export { fmtCompact, fmtInt } from "@/lib/format";
export declare const fmtMoney: (n: number) => string;
export declare const fmtDate: (d: string | Date) => string;
export declare const fmtDateTime: (d: string | Date) => string;
export declare function fmtMoneyShort(n: number): string;
