import "server-only";
import type { WinFlags, WinRules } from "@/lib/spu-tracking";
import { type VideoWinRule } from "@/lib/video-win";
export type TeamVideoRow = {
    id: string;
    name: string;
    videos: number;
    codes: number;
    views: number;
    winCodes: number;
    winRate: number | null;
};
export type TeamBreakdownRow = {
    id: string;
    name: string;
    total: number;
    bad: number;
    slow: number;
    hot: number;
    test: number;
    rnd: number;
};
export type Verdict = "star" | "win" | "wintraffic" | null;
export type PushRow = {
    teamId: string;
    team: string;
    code: string;
    name: string;
    videos: number;
    winVideos: number;
    qty: number;
    verdict: Verdict;
};
export type StockStatus = "bad" | "slow" | "hot";
export type SpuWin = {
    s1: {
        newCodes: number;
        oldCodes: number;
    };
    teams: TeamVideoRow[];
    breakdown: TeamBreakdownRow[];
    push: PushRow[];
};
export declare function spuWinStats(f: {
    from: string;
    to: string;
    teams: string[];
    pageIds: string[] | null;
    channels: string[];
    winRules: WinRules;
    videoWin: VideoWinRule;
    winFlags?: (codes: string[]) => Promise<WinFlags>;
    stockInfo?: Promise<{
        stockStatus: Map<string, StockStatus>;
        s1Codes: Set<string>;
    }>;
}): Promise<SpuWin>;
