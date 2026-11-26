import "server-only";
import { type AutoResult } from "@/lib/eval/rules";
export type RndChannel = {
    id: string;
    name: string;
    platform: string;
    color: string;
};
export declare function getRndChannels(): Promise<RndChannel[] | null>;
export type ResultFilter = "all" | "win" | "win_traffic" | "any_win" | "testing" | "fail";
export declare const RESULT_FILTERS: Record<ResultFilter, string>;
export type CodeInfo = {
    result: AutoResult | null;
    productId: string | null;
    name: string | null;
    sourceUrl: string | null;
    taken: number;
};
export declare function codeInfos(): Promise<Map<string, CodeInfo>>;
export declare function filterCodes(infos: Map<string, CodeInfo>, result: ResultFilter, onlySource: boolean): string[] | null;
export type CardProduct = {
    key: string;
    label: string;
    name: string | null;
    result: AutoResult | null;
    productId: string | null;
    sourceUrl: string | null;
    taken: number;
    price: number | null;
    priceKind: "du_kien" | "thuc_te" | null;
    manual: boolean;
    manualCode: boolean;
};
export declare function cardProducts(posts: {
    id: string;
    product_codes: string[];
}[], infos: Map<string, CodeInfo>): Promise<Map<string, CardProduct[]>>;
