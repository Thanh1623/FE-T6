import "server-only";
export type CodeStat = {
    first: string | null;
    posts: number;
    videos: number;
    views: number;
    viewers: number;
    reactions: number;
    comments: number;
    shares: number;
    clicks: number;
    topUrl: string | null;
};
export type CodeStatItem = {
    id: string;
    codes: string[];
    from?: string | null;
    to?: string | null;
};
export declare function rndCodeStats(items: CodeStatItem[]): Promise<Map<string, CodeStat> | null>;
