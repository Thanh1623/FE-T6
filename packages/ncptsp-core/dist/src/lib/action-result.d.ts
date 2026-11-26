export type ActionResult<T = unknown> = {
    ok: true;
    data: T;
} | {
    error: string;
};
export declare function attempt<T>(fn: () => Promise<T>): Promise<ActionResult<T>>;
export declare function unwrap<T>(r: ActionResult<T>): T;
export declare function unwrap(r: unknown): unknown;
