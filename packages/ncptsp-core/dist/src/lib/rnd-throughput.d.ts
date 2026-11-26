import "server-only";
export declare const EVENTS: readonly [{
    readonly key: "created";
    readonly label: "Sưu tầm mới";
}, {
    readonly key: "approved";
    readonly label: "Được duyệt";
}, {
    readonly key: "design";
    readonly label: "3D đạt";
}, {
    readonly key: "received";
    readonly label: "Ra mẫu (nhận mẫu)";
}, {
    readonly key: "source";
    readonly label: "Source xong";
}, {
    readonly key: "video";
    readonly label: "Lên video";
}, {
    readonly key: "win";
    readonly label: "Win";
}];
export type EventKey = (typeof EVENTS)[number]["key"];
export type Throughput = Awaited<ReturnType<typeof rndThroughput>>;
export declare function rndThroughput(team: string | null, weeks?: number): Promise<{
    series: {
        source: number;
        created: number;
        video: number;
        win: number;
        approved: number;
        design: number;
        received: number;
        week: string;
        label: string;
    }[];
    rates: Record<"source" | "created" | "video" | "win" | "approved" | "design" | "received", {
        cur: number;
        prev: number;
        thisWeek: number;
    }>;
    lead: {
        key: string;
        label: string;
        days: number;
    }[];
    wip: {
        stage: "p0" | "p1" | "p2" | "p3" | "p4" | "p5" | "p6";
        count: number;
    }[];
    total: number;
    killed: number;
}>;
