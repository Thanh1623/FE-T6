import "server-only";
type SnapPost = {
    id: string;
    published_at: string;
    views: number;
    reactions: number;
    viewers?: number;
    clicks?: number;
    comments?: number | null;
};
export declare function snapshotPosts(rows: SnapPost[], opts?: {
    includeOld?: boolean;
    date?: string;
}): Promise<void>;
export declare function pruneSnapshots(): Promise<void>;
export {};
