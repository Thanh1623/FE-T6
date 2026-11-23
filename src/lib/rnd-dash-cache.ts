import "server-only";
import { unstable_cache } from "next/cache";
import { rndDashboard } from "@/lib/rnd-dashboard";
import { testCostReport } from "@/lib/test-costs";
import { isRndEditor, canSeeProfit, type CurrentUser } from "@/lib/session";
import type { Market } from "@/lib/channel-market";

// Báo cáo R&D đọc nhiều bảng cho cả khoảng lọc (cả năm càng nặng); khi database bận thì lỗi cả trang.
// Lưu đệm 5 phút theo bộ lọc, dùng chung mọi người dùng: mở lại / đổi qua lại giữa các tab không đụng database.
// Kết quả đi qua JSON → CHỈ được chứa dữ liệu thuần (không Map / Set / Date); NoMap bên dưới báo lỗi biên dịch nếu có.
type NoMap<T> = T extends ReadonlyMap<unknown, unknown> | ReadonlySet<unknown> | Date ? never : T extends (infer U)[] ? NoMap<U>[] : T extends object ? { [K in keyof T]: NoMap<T[K]> } : T;
type Dash = Awaited<ReturnType<typeof rndDashboard>>;
type Cost = Awaited<ReturnType<typeof testCostReport>>;
export type _PlainDash = NoMap<Dash>;   // biên dịch lỗi ở đây nghĩa là rndDashboard trả Map / Set / Date
export type _PlainCost = NoMap<Cost>;
const _dash = null as unknown as Dash satisfies _PlainDash;
const _cost = null as unknown as Cost satisfies _PlainCost;
void _dash; void _cost;

type F = { from: string; to: string; teams: string[]; market?: Market };
const keyOf = (f: F) => [f.from, f.to, [...f.teams].sort().join(","), f.market ?? "all"];

export function rndDashboardCached(user: CurrentUser, f: F): Promise<Dash> {
  const showCost = isRndEditor(user) || canSeeProfit(user) || user.is_team_lead;   // số tiền hiện / ẩn theo quyền → tách khoá đệm
  return unstable_cache(() => rndDashboard(user, f), ["rnd-dashboard", "v7", String(showCost), ...keyOf(f)], { revalidate: 300 })();
}
export function testCostReportCached(f: F): Promise<Cost> {
  return unstable_cache(() => testCostReport(f), ["rnd-test-cost", "v6", ...keyOf(f)], { revalidate: 300 })();
}
