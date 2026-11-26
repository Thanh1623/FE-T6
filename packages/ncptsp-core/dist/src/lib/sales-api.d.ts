import "server-only";
export type ApiSaleRow = {
    sale_date: string;
    product_code: string;
    page_id: string;
    channel: string;
    qty_sold: number;
    qty_returned: number;
};
export type ApiCatalogRow = {
    product_code: string;
    name: string;
    image_url: string | null;
    base_masp: string;
    first_seen_at?: string | null;
};
export declare const salesApiEnabled: () => boolean;
export declare const fetchApiSales: (since: string, until: string | null) => Promise<ApiSaleRow[]>;
export declare function fetchApiCatalog(): Promise<ApiCatalogRow[]>;
