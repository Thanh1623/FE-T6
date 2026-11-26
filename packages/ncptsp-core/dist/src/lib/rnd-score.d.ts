import "server-only";
import { type CurrentUser } from "@/lib/session";
import { type Card, type RowScore, type ScoreCfg } from "@/lib/rnd-score-calc";
export declare const SCORE_KEY = "rnd_scorecard";
export declare function loadScoreCfg(): Promise<ScoreCfg>;
type CardRow = Card & {
    product_id: string;
};
export declare function loadCards(productIds?: string[]): Promise<CardRow[] | null>;
export declare const canSeeScore: (user: CurrentUser, teamId: string | null, cards: Card[]) => boolean;
export declare function rowScoreFor(user: CurrentUser, teamId: string | null, cards: Card[], cfg: ScoreCfg): {
    score: number | null;
    row: RowScore;
};
export declare function assertCanApprove(productId: string, user: CurrentUser): Promise<void>;
export {};
