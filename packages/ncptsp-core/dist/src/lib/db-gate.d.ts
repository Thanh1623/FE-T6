export declare function heavyRpc<R extends {
    error: {
        message?: string;
        code?: string;
    } | null;
}>(fn: () => PromiseLike<R>, retries?: number, waitMs?: number): Promise<R>;
export declare function heavyQuery<T>(fn: () => Promise<T>): Promise<T>;
