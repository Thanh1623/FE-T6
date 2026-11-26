import "server-only";
export declare function refreshTeamLines(force?: boolean): Promise<{
    ok: boolean;
    skipped?: boolean;
    clean?: boolean;
    rows?: number;
    teams?: number;
    error?: string;
}>;
