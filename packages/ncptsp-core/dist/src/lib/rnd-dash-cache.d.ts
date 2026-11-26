import "server-only";
import { rndDashboard } from "@/lib/rnd-dashboard";
import { testCostReport } from "@/lib/test-costs";
import { type CurrentUser } from "@/lib/session";
import type { Market } from "@/lib/channel-market";
type NoMap<T> = T extends ReadonlyMap<unknown, unknown> | ReadonlySet<unknown> | Date ? never : T extends (infer U)[] ? NoMap<U>[] : T extends object ? {
    [K in keyof T]: NoMap<T[K]>;
} : T;
type Dash = Awaited<ReturnType<typeof rndDashboard>>;
type Cost = Awaited<ReturnType<typeof testCostReport>>;
export type _PlainDash = NoMap<Dash>;
export type _PlainCost = NoMap<Cost>;
type F = {
    from: string;
    to: string;
    teams: string[];
    market?: Market;
};
export declare function rndDashboardCached(user: CurrentUser, f: F): Promise<Dash>;
export declare function testCostReportCached(f: F): Promise<Cost>;
export {};
