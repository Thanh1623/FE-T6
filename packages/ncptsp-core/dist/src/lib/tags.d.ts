export type HashtagRules = {
    staff_pattern: string;
    line_pattern: string;
    concept: Record<string, "old" | "new">;
};
export declare const DEFAULT_RULES: HashtagRules;
export declare const isTestCode: (code: string) => boolean;
export declare const TEST_CATEGORY_NAMES: Record<string, string>;
export declare const isSystemTestCode: (code: string, createdBy: string | null | undefined) => boolean;
export declare function parseTestCode(code: string): {
    cat: string;
    num: number;
    legacy: boolean;
} | null;
export declare function testCodeProductName(code: string): string | null;
export type ParsedTags = {
    product_codes: string[];
    unknown_codes: string[];
    content_line: string | null;
    concept: "old" | "new" | null;
    staff_code: string | null;
};
export declare function parseTags(tags: string[], known: Set<string>, rules?: HashtagRules): ParsedTags;
export declare function categoryOf(code: string, prefix: Record<string, string>): string;
