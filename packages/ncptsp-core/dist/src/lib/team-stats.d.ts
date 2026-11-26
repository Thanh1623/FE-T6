import "server-only";
export declare const teamStats: (channelIds: string[], allIds: string[], from: string, to: string) => Promise<{
    views: number;
    sold: number;
}>;
