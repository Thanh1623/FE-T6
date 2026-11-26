import "server-only";
import type { SpuRow } from "@/lib/spu-tracking";
export type SpuMeta = {
    salesSource: "orders" | "sapo" | "none";
    salesLines: number;
    salesQty: number;
    salesFrom: string | null;
    salesTo: string | null;
    skus: number;
    teamQty: number;
};
export type VideoDetail = {
    title: string;
    url: string | null;
    thumb: string | null;
};
export declare function loadVideoDetails(ids: string[]): Promise<Map<string, VideoDetail>>;
export declare const invalidateSpuRows: (soft?: boolean) => void;
export declare function loadSpuMeta(): Promise<SpuMeta>;
export declare function loadSpuRows(): Promise<SpuRow[]>;
export declare const loadSpuRowsLight: () => Promise<{
    rows: SpuRow[];
    meta: SpuMeta;
}>;
