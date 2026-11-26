export declare const PAGE_SIZE = 1000;
export declare function withRetry<T>(run: () => PromiseLike<{
    data: T[] | null;
    error: unknown;
}>): Promise<{
    data: T[] | null;
    error: unknown;
}>;
export declare function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: unknown;
}>): Promise<T[]>;
export declare function fetchAllByKey<T>(build: (after: string | null, limit: number) => PromiseLike<{
    data: T[] | null;
    error: unknown;
}>, keyOf: (row: T) => string, fallback: () => Promise<T[]>): Promise<T[]>;
