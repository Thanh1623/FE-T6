import "server-only";
import { type AutoResult } from "@/lib/eval/rules";
export type TeamWinRow = {
    result: AutoResult;
    qty: number;
    views: number;
};
export declare const loadTeamWin: (team: string, teamId: string, codes: string[], from: string, to: string) => Promise<Record<string, TeamWinRow>>;
