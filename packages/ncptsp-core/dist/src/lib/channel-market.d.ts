import "server-only";
export type Market = "all" | "vn" | "intl";
export declare const DEFAULT_MARKET: Market;
export declare const MARKET_OPTIONS: readonly [{
    readonly value: "all";
    readonly label: "Tất cả";
}, {
    readonly value: "vn";
    readonly label: "Trong nước";
}, {
    readonly value: "intl";
    readonly label: "Nước ngoài";
}];
export declare const parseMarket: (v: string | undefined | null) => Market;
export declare const marketForSql: (m: Market | undefined) => "" | "vn" | "intl";
export declare function loadChannelMarkets(): Promise<Record<string, "vn" | "intl">>;
