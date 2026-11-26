import "server-only";
export type FreshKey = "stock" | "orders" | "receipts" | "images" | "videos";
export type Freshness = {
    key: FreshKey;
    label: string;
    lastAt: string | null;
    coverTo: string | null;
    ageDays: number | null;
    cadence: string;
    warnAfterDays: number;
    why: string;
    status: "ok" | "warn" | "never";
};
export declare function loadFreshness(): Promise<Record<FreshKey, Freshness> & {
    videoMessage: string | null;
}>;
