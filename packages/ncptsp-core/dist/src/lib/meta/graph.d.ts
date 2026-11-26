import "server-only";
export declare const GRAPH_VERSION = "v26.0";
export declare class GraphError extends Error {
    code: number;
    constructor(code: number, message: string);
}
export declare function appSecretProof(token: string): string;
export declare function graph<T>(path: string, params: Record<string, string>, retries?: number): Promise<T>;
export declare function graphAll<T>(path: string, params: Record<string, string>, maxPages?: number): Promise<T[]>;
