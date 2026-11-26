import "server-only";
export type CostRow = {
    id: string;
    code: string | null;
    name: string;
    team: string | null;
    source: "R&D" | "Media test";
    sample: number;
    other: number;
    ads: number;
    video: number;
    total: number;
    result: "win" | "fail" | "testing";
};
export type CostGroup = {
    name: string;
    samples: number;
    total: number;
    wins: number;
    fails: number;
    perWin: number | null;
    perFail: number | null;
};
export type TestCostReport = {
    totals: {
        total: number;
        samples: number;
        perSample: number | null;
        perWin: number | null;
        wasted: number;
        wastedPct: number | null;
        sample: number;
        other: number;
        ads: number;
        video: number;
    };
    byTeam: CostGroup[];
    bySource: CostGroup[];
    rows: CostRow[];
    missingCost: {
        id: string;
        st_code: string | null;
        code: string | null;
        name: string;
    }[];
};
export declare function testCostReport(f: {
    from: string;
    to: string;
    teams: string[];
}): Promise<TestCostReport>;
