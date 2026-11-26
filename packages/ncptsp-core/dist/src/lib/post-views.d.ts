import "server-only";
import { type RangeTotals, type SnapAt } from "@/lib/eval/views-window";
export type CodedPost = {
    id: string;
    published_at: string;
    kind: string;
    product_codes: string[];
    views: number;
    viewers: number;
    reactions: number;
    clicks: number;
};
export declare function snapshotsAt(postIds: string[], day: string): Promise<Map<string, SnapAt>>;
export declare function codeViewsInRange(posts: CodedPost[], from: string, to: string): Promise<Map<string, RangeTotals>>;
