import "server-only";
export type StaffProfile = {
    name: string;
    team: string;
};
export declare function buildStaffMatcher(profiles: (StaffProfile & {
    teamCode?: string;
})[]): (sapoName: string | null | undefined) => string | null;
export declare function loadStaffTeams(): Promise<(n: string | null | undefined) => string | null>;
export declare function loadStaffLookup(): Promise<(n: string | null | undefined) => string | null>;
export declare function saveStaffNames(names: (string | null | undefined)[]): Promise<{
    names: number;
    matched: number;
    unmatched: string[];
    saved: boolean;
}>;
