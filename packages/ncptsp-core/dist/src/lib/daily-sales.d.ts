import "server-only";
export type SaleRow = {
    code: string;
    date: string;
    page_id: string;
    channel: string;
    qty_sold: number;
    qty_returned: number;
    fromFile: boolean;
    revenue: number;
    returned_value: number;
    cost: number;
    returned_cost: number;
};
export type SalesQuery = {
    codes?: string[];
    from: string;
    to?: string;
    channels?: string[];
    pageIds?: string[];
    keepWarranty?: boolean;
    fresh?: boolean;
};
export declare const channelOfSource: (source: string | null | undefined) => string;
export declare function pageOfTags(tags: string | null | undefined): string;
export declare function importWindow(): Promise<{
    from: string;
    to: string;
}>;
export declare const invalidateImportWindow: () => void;
export declare function loadDailySales(q: SalesQuery): Promise<SaleRow[]>;
