import "server-only";
import { type Market } from "@/lib/channel-market";
export type TrafficRow = {
    posts: number;
    views: number;
    viewers: number;
    comments: number;
    reactions: number;
    shares: number;
};
export type ChannelTraffic = TrafficRow & {
    id: string;
    name: string;
    platform: string;
};
export type PlatformTraffic = TrafficRow & {
    platform: string;
    channels: ChannelTraffic[];
};
export type RndTraffic = {
    platforms: PlatformTraffic[];
    total: TrafficRow;
    channelCount: number;
};
export declare const rndTrafficCached: (from: string, to: string, market?: Market) => Promise<RndTraffic>;
