export type Criterion = {
    id: string;
    name: string;
    weight: number;
    guide: [string, string, string];
};
export type ScoreCfg = {
    criteria: Criterion[];
    pass: number;
    fatal: number;
    minScorers: number;
    spread: number;
};
export declare const DEFAULT_SCORE_CFG: ScoreCfg;
export declare function mergeScoreCfg(saved: unknown): ScoreCfg;
export type Scores = Record<string, number>;
export declare const scoreTotal: (scores: Scores, cfg: ScoreCfg) => number;
export type Verdict = {
    total: number;
    passed: boolean;
    fatalIds: string[];
    reasons: string[];
};
export declare function verdictOf(scores: Scores, cfg: ScoreCfg, fatalFlag?: boolean): Verdict;
export type Card = {
    scorer_id: string;
    scores: Scores;
    notes: Record<string, string>;
    fatal: boolean;
    total: number;
    updated_at: string;
};
export declare function combine(cards: Card[], cfg: ScoreCfg): (Verdict & {
    n: number;
    avg: Scores;
}) | null;
export declare const spreadIds: (cards: Card[], cfg: ScoreCfg) => string[];
export declare const fmt: (n: number) => string;
export type RowScore = {
    n: number;
    mine: boolean;
    min: number;
    passed: boolean | null;
    block: boolean;
    bypass: boolean;
};
