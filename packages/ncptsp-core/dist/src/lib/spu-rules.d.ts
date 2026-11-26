import "server-only";
import { type KpiRule } from "@/lib/kpi-constants";
import { type SpuRules } from "@/lib/spu-tracking";
export declare const SPU_RULES_KEY = "spu_rules";
export declare function mergeSpuRules(saved: unknown): SpuRules;
export declare function loadSpuRules(): Promise<SpuRules>;
export declare function loadVideoWinRules(): Promise<{
    rules: KpiRule[];
    match: "all" | "any";
}>;
