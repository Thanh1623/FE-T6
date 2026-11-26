import "server-only";
import { type Handoff, type HandoffStatus } from "@/lib/handoff";
export type Video = {
    id: string;
    channelId: string;
    publishedAt: string;
    url: string | null;
    thumb: string | null;
    message: string | null;
    views: number;
    win: boolean | null;
    progress: number | null;
    kpiLines: string[];
};
export type TeamRef = {
    id: string;
    name: string;
};
export type ChannelRef = {
    id: string;
    name: string;
    platform: string;
    teamId: string | null;
};
export type Assignment = {
    handoffId: string;
    productId: string;
    team: TeamRef | null;
    status: HandoffStatus;
    deadline: string | null;
    createdAt: string;
    receivedAt: string | null;
    doneAt: string | null;
    note: string | null;
    teamNote: string | null;
    videos: Video[];
    posted: ChannelRef[];
    notPosted: ChannelRef[];
    sold: number;
    soldByChannel: Record<string, number>;
    views: number;
    winCount: number;
};
export type Sample = {
    productId: string;
    code: string;
    name: string;
    ownTeam: TeamRef | null;
    result: Handoff["result"];
    assignments: Assignment[];
};
export type TeamRow = {
    team: TeamRef;
    samples: number;
    byStatus: Record<HandoffStatus | "unassigned", number>;
    videos: number;
    winVideos: number;
    views: number;
    sold: number;
    channels: number;
    channelsPosted: number;
};
export type ChannelRow = {
    channel: ChannelRef;
    teamName: string | null;
    samples: number;
    videos: number;
    winVideos: number;
    views: number;
    sold: number;
};
export type Overview = {
    samples: Sample[];
    teams: TeamRef[];
    channels: ChannelRef[];
    teamRows: TeamRow[];
    channelRows: ChannelRow[];
    totals: {
        samples: number;
        assignments: number;
        teams: number;
        teamsPosted: number;
        channelsPosted: number;
        channelsTotal: number;
        videos: number;
        winVideos: number;
        sold: number;
    };
};
export declare function buildTeamRows(samples: Sample[], teams: TeamRef[], channels: ChannelRef[]): TeamRow[];
export declare function buildChannelRows(samples: Sample[], teamRows: TeamRow[], teams: TeamRef[], channels: ChannelRef[]): ChannelRow[];
export declare function handoffOverview(): Promise<Overview>;
export declare const getHandoffOverview: typeof handoffOverview;
