import "server-only";
import { type CommercialInput, type CommercialResult, type CommercialRules } from "@/lib/commercial-math";
export declare const COMMERCIAL_RULES_KEY = "commercial_rules";
export declare function mergeCommercialRules(saved: unknown): CommercialRules;
export declare function loadCommercialRules(): Promise<CommercialRules>;
export type CommercialEval = {
    input: CommercialInput;
    result: CommercialResult;
    rules: CommercialRules;
    salesCodes: string[];
    evaluatedAt: string;
};
export declare function evaluateCommercial(productId: string): Promise<CommercialEval | null>;
