"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rndDashboardCached = rndDashboardCached;
exports.testCostReportCached = testCostReportCached;
require("server-only");
const cache_1 = require("next/cache");
const rnd_dashboard_1 = require("@/lib/rnd-dashboard");
const test_costs_1 = require("@/lib/test-costs");
const session_1 = require("@/lib/session");
const _dash = null;
const _cost = null;
void _dash;
void _cost;
const keyOf = (f) => [f.from, f.to, [...f.teams].sort().join(","), f.market ?? "all"];
function rndDashboardCached(user, f) {
    const showCost = (0, session_1.isRndEditor)(user) || (0, session_1.canSeeProfit)(user) || user.is_team_lead; // số tiền hiện / ẩn theo quyền → tách khoá đệm
    return (0, cache_1.unstable_cache)(() => (0, rnd_dashboard_1.rndDashboard)(user, f), ["rnd-dashboard", "v7", String(showCost), ...keyOf(f)], { revalidate: 300 })();
}
function testCostReportCached(f) {
    return (0, cache_1.unstable_cache)(() => (0, test_costs_1.testCostReport)(f), ["rnd-test-cost", "v6", ...keyOf(f)], { revalidate: 300 })();
}
