import "server-only";
import { type TokenSource } from "@/lib/meta/token";
import { type Actor } from "@/lib/system-log";
export declare function extractHashtags(text?: string | null): string[];
export declare function setupChannels(userToken: string, source?: TokenSource): Promise<{
    id: string;
    platform: string;
    name: string;
}[]>;
export declare function connectTeamPages(userToken: string, teamId: string): Promise<{
    connected: {
        platform: string;
        name: string;
    }[];
    skipped: {
        name: string;
        teamId: string;
    }[];
}>;
export declare function retagPosts(): Promise<number>;
export type SyncOptions = {
    by?: Actor;
    days?: number;
    postDays?: number;
    budgetMs?: number;
    concurrency?: number;
    minAgeMin?: number;
    heavy?: "auto" | boolean;
    heavyEveryMin?: number;
    onBatch?: (b: {
        left: number;
    }) => void;
};
export declare function syncAll(opts?: SyncOptions): Promise<{
    account: string;
    ok: boolean;
    message: string;
}[]>;
