import "server-only";
export type ParityCase = {
    name: string;
    ok: boolean;
    diffs: string[];
};
export declare function checkSpuParity(): Promise<{
    ok: boolean;
    cases: ParityCase[];
} | {
    error: string;
}>;
