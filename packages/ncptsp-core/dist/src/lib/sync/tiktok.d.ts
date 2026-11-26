import "server-only";
export type TikTokChannel = {
    id: string;
    platform: string;
    name: string;
    last_synced_at?: string | null;
};
type TokenRow = {
    channel_id: string;
    open_id: string;
    access_token: string;
    refresh_token: string;
    access_expires_at: string;
    refresh_expires_at: string;
    scope: string | null;
};
export declare function activeTikTok(): Promise<(TikTokChannel & {
    token: TokenRow;
})[]>;
export declare function syncTikTokChannel(ch: TikTokChannel & {
    token: TokenRow;
}, postDays: number, extractHashtags: (t?: string | null) => string[]): Promise<{
    posts: number;
    newViews: number;
}>;
export {};
