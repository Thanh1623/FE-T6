export type SkuItem = {
    sku: string;
    productId: string;
    name: string;
    url: string;
};
export type ParsedImages = {
    items: SkuItem[];
    totalRows: number;
    badLinks: number;
    hasProductId: boolean;
    headers: string[];
    missing: string[];
    sheet: string;
};
export type ImageRow = {
    code: string;
    url: string | null;
    name: string | null;
    sku: string;
};
export declare function parseProductGrids(sheets: {
    name: string;
    grid: unknown[][];
}[]): ParsedImages;
export type SplitGroup = {
    code: string;
    newCode: string;
    skus: string[];
    baseName: string;
    splitName: string;
};
export declare function detectSplits(items: SkuItem[]): SplitGroup[];
export declare function imageRows(items: SkuItem[], overrides: Map<string, string>): {
    rows: ImageRow[];
    spus: number;
    withImage: number;
    withoutImage: number;
    withName: number;
};
