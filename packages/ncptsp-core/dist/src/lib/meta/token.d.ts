import "server-only";
export type TokenSource = "system" | "user";
export declare const TOKEN_LABELS: Record<TokenSource, string>;
export declare function metaTokens(): {
    source: TokenSource;
    token: string;
}[];
export declare const REQUIRED_SCOPES: string[];
export declare const OPTIONAL_SCOPES: string[];
export type TokenStatus = {
    source: TokenSource;
    valid: boolean;
    error?: string;
    owner: string | null;
    expiresAt: Date | null;
    daysLeft: number | null;
    scopes: string[];
    missing: string[];
};
export declare function inspectToken(source: TokenSource, token: string): Promise<TokenStatus>;
export declare function tokenStatuses(): Promise<TokenStatus[]>;
