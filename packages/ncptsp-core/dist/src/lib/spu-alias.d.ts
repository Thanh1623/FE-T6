import "server-only";
export type SpuAliases = Map<string, string>;
export declare function loadSpuAliases(): Promise<SpuAliases>;
export declare const canonOf: (aliases: SpuAliases) => (code: string) => string;
export declare const oldCodesOf: (aliases: SpuAliases, code: string) => string[];
export declare function expandCodes(aliases: SpuAliases, codes: string[]): string[];
export declare function canonPosts<T extends {
    product_codes: string[];
}>(aliases: SpuAliases, posts: T[]): T[];
