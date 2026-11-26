import "server-only";
import { type Filters } from "@/lib/data";
import type { CurrentUser } from "@/lib/session";
export type TeamScope = {
    limited: boolean;
    teamId: string | null;
    teamName: string | null;
    channelIds: string[];
};
export declare const isTeamLimited: (u: CurrentUser) => boolean;
export declare function getTeamScope(user: CurrentUser): Promise<TeamScope>;
export declare const limitAccounts: <T extends {
    id: string;
}>(accounts: T[], scope: TeamScope) => T[];
export declare function scopedPageIds(f: Filters, accounts: {
    id: string;
}[], scope: TeamScope): string[] | null;
