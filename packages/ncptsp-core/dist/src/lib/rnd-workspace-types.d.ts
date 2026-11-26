import type { CellValue, Col, GridRow } from "@/components/grid/types";
export declare const WS_KEYS: readonly ["collection", "approved", "design", "orders", "media", "traffic", "win", "effect"];
export type WsKey = (typeof WS_KEYS)[number];
export declare const MEDIA_WS_KEYS: readonly WsKey[];
export declare const wsKeysFor: (role: string) => readonly WsKey[];
export type WsTable = {
    cols: Col[];
    rows: GridRow[];
    add: {
        cols?: Record<string, Col>;
        defaults?: Record<string, CellValue>;
        required?: string[];
        keys?: string[];
    } | null;
};
export type WsData = {
    tables: Partial<Record<WsKey, WsTable>>;
    counts: Record<string, number>;
    at: number;
    allowed: readonly WsKey[];
};
export declare const WS_PATH: Record<WsKey, string>;
export declare const wsKeyOf: (path: string) => WsKey | null;
export declare const RND_CHANNEL = "rnd-changes";
