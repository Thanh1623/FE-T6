export type CommercialRules = {
    opsRatePct: number;
    minMarginPct: number;
    maxBreakEvenDays: number;
    maxReturnPct: number;
    safetyDays: number;
    defaultLeadDays: number;
    minDataDays: number;
    minDataQty: number;
};
export declare const DEFAULT_COMMERCIAL_RULES: CommercialRules;
export type CommercialInput = {
    price: number | null;
    priceSource: "thực tế" | "dự kiến" | null;
    unitCost: number | null;
    costSource: "thực tế" | "dự kiến" | null;
    sampleCost: number;
    adsCost: number;
    videoCost: number;
    opsCost: number | null;
    launchDate: string | null;
    daysSinceLaunch: number | null;
    sold: number;
    soldGross: number;
    returned: number;
    perDay: {
        d7: number | null;
        d14: number | null;
        d30: number | null;
    };
    onHand: number | null;
    incoming: number;
    leadDays: number;
    minOrderQty: number;
    winMet: boolean;
};
export type Scenario = {
    label: string;
    perDay: number | null;
    days: number | null;
};
export type Check = {
    key: string;
    label: string;
    ok: boolean | null;
    detail: string;
};
export type Suggestion = "approve" | "conditional" | "reject";
export type CommercialResult = {
    sunk: number;
    unitMargin: number | null;
    marginPct: number | null;
    breakEvenQty: number | null;
    remainingQty: number | null;
    scenarios: Scenario[];
    profit: {
        d30: number | null;
        d60: number | null;
        d90: number | null;
    };
    order: {
        demand: number | null;
        safety: number | null;
        suggested: number | null;
        capital: number | null;
    };
    returnPct: number | null;
    checks: Check[];
    suggestion: Suggestion;
    missing: string[];
};
export declare function evaluateCommercialMath(i: CommercialInput, r: CommercialRules): CommercialResult;
export declare const SUGGESTION_LABEL: Record<Suggestion, string>;
