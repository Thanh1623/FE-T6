import "server-only";
export type SkuOverride = {
    sku: string;
    spu_code: string;
};
export declare function loadSkuOverrides(): Promise<Map<string, string>>;
export declare function applyOverrides<T extends {
    sku: string;
    code: string;
}>(rows: T[], overrides: Map<string, string>): T[];
