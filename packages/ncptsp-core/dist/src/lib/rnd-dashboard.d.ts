import "server-only";
import { type CurrentUser } from "@/lib/session";
import { type Market } from "@/lib/channel-market";
import { type PipelineItem } from "@/lib/pipeline";
import { type Stage } from "@/lib/pipeline-constants";
export declare const FUNNEL: {
    stage: Stage;
    label: string;
    step: string;
}[];
export type Bucket = {
    key: string;
    name: string;
    total: number;
    approved: number;
    video: number;
    win: number;
    tested: number;
    sampleDays: number | null;
    sampleCost: number;
};
export declare function rndDashboard(user: CurrentUser, f: {
    from: string;
    to: string;
    teams: string[];
    market?: Market;
}): Promise<{
    kpi: {
        total: number;
        approved: number;
        decided: number;
        pending: number;
        approvalRate: number;
        wip: number;
        video: number;
        wins: number;
        tested: number;
        winRate: number;
        killed: number;
        fromMedia: number;
    };
    stageCounts: {
        stage: "p0" | "p1" | "p2" | "p3" | "p4" | "p5" | "p6";
        next: string;
        count: number;
        here: number;
        stuck: number;
    }[];
    stageLists: Record<"p0" | "p1" | "p2" | "p3" | "p4" | "p5" | "p6", {
        reached: ReturnType<(p: PipelineItem, date: string | null | undefined) => {
            id: string;
            st_code: string;
            code: string;
            name: string;
            team: string;
            stage: "p0" | "p1" | "p2" | "p3" | "p4" | "p5" | "p6";
            killed: boolean;
            date: string;
            image: string;
        }>[];
        here: ReturnType<(p: PipelineItem, date: string | null | undefined) => {
            id: string;
            st_code: string;
            code: string;
            name: string;
            team: string;
            stage: "p0" | "p1" | "p2" | "p3" | "p4" | "p5" | "p6";
            killed: boolean;
            date: string;
            image: string;
        }>[];
    }>;
    funnel: {
        count: number;
        stepRate: number;
        medianDays: number;
        stage: Stage;
        label: string;
        step: string;
    }[];
    stuck: {
        id: string;
        st_code: string;
        name: string;
        stage: "p0" | "p1" | "p2" | "p3" | "p4" | "p5" | "p6";
        next: string;
        days: number;
    }[];
    winCond: {
        win: {
            n: number;
            videos: number;
            views: number;
            sold: number;
        };
        rest: {
            n: number;
            videos: number;
            views: number;
            sold: number;
        };
    };
    p4cover: {
        total: number;
        anyChannel: number;
        videos: number;
        winVideos: number;
        channels: {
            id: string;
            name: string;
            posted: number;
            videos: number;
            winVideos: number;
        }[];
        missing: {
            id: string;
            st_code: string;
            name: string;
            stage: "p0" | "p1" | "p2" | "p3" | "p4" | "p5" | "p6";
            noCode: boolean;
            days: number;
        }[];
        hasChannels: boolean;
    };
    people: {
        sampleDays: number;
        key: string;
        name: string;
        total: number;
        approved: number;
        video: number;
        win: number;
        tested: number;
        sampleCost: number;
    }[];
    teams: {
        sampleDays: number;
        key: string;
        name: string;
        total: number;
        approved: number;
        video: number;
        win: number;
        tested: number;
        sampleCost: number;
    }[];
    results: {
        win: number;
        winTraffic: number;
        winSp: number;
        fail: number;
        testing: number;
        sampleCost: number;
        costPerWin: number;
    };
    lines: {
        rows: {
            name: string;
            total: number;
            approved: number;
            video: number;
            win: number;
            res: {
                win: number;
                wt: number;
                fail: number;
                testing: number;
            };
        }[];
        missing: number;
    };
    groups: {
        rows: {
            name: string;
            total: number;
            approved: number;
            video: number;
            win: number;
            res: {
                win: number;
                wt: number;
                fail: number;
                testing: number;
            };
        }[];
        missing: number;
    };
    materials: {
        rows: {
            name: string;
            total: number;
            approved: number;
            video: number;
            win: number;
            res: {
                win: number;
                wt: number;
                fail: number;
                testing: number;
            };
        }[];
        missing: number;
    };
    stones: {
        rows: {
            name: string;
            total: number;
            approved: number;
            video: number;
            win: number;
            res: {
                win: number;
                wt: number;
                fail: number;
                testing: number;
            };
        }[];
        missing: number;
    };
    price: {
        avgPrice: number;
        pricedCount: number;
        avgCost: number;
        margin: number;
    };
    killReason: [string, number];
    teams_list: import("@/lib/pipeline").Team[];
    showCost: boolean;
}>;
export type WinNotice = {
    id: string;
    st_code: string | null;
    code: string | null;
    name: string;
    result: "win" | "win_traffic" | "win_sp";
    decided_at: string;
    by: string | null;
    image: string | null;
};
export declare function winNotices(team: string | null, days?: number): Promise<{
    wins: WinNotice[];
    pending: number;
    days: number;
}>;
