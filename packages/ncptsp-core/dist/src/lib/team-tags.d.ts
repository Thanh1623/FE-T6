import "server-only";
export type TagChannel = {
    id: string;
    name: string;
    platform: "tiktok" | "facebook";
    username: string | null;
};
export type ParsedTag = {
    raw: string;
} & ({
    kind: "ttn";
    name: string;
} | {
    kind: "ttid";
    value: string;
} | {
    kind: "page";
    value: string;
});
export declare function parseTags(input: string): {
    tags: ParsedTag[];
    bad: string[];
};
export declare function resolveTags(parsed: ParsedTag[]): Promise<{
    channels: TagChannel[];
    errors: string[];
}>;
export declare function saveTagChannels(channels: TagChannel[], teamId: string): Promise<{
    added: string[];
    errors: string[];
}>;
