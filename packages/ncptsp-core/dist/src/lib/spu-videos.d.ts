import type { SpuRow } from "@/lib/spu-tracking";
import type { First3d } from "@/lib/video-win";
export type SpuVideo = {
    id: string;
    title: string;
    platform: "FB" | "IG" | "TT";
    channel: string;
    team: string | null;
    date: string;
    views: number;
    url: string | null;
    thumb: string | null;
    first3d?: First3d;
};
export declare function spuVideos(row: SpuRow, opt: {
    days: number;
    endAge?: number;
}, today: string): SpuVideo[];
