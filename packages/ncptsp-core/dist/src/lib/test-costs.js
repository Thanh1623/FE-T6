"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testCostReport = testCostReport;
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
const rnd_options_1 = require("@/lib/rnd-options");
const order_cost_1 = require("@/lib/order-cost");
const pipeline_1 = require("@/lib/pipeline");
async function testCostReport(f) {
    let q = admin_1.sb.rnd().from("products").select("*").not("stage", "is", null);
    if (f.teams.length)
        q = q.in("team_id", f.teams);
    const { data, error } = await q;
    if (error)
        throw error;
    const all = (data ?? []); // gồm cả mẫu CHƯA được cấp mã SPU: tiền đặt mẫu đã chi thật nên vẫn tính (bảng hiện tên mẫu, cột SPU để "—")
    const ids = all.map((p) => p.id);
    const [{ data: orders }, { data: evs }, options, teams, { data: p1ev }] = await Promise.all([
        ids.length ? admin_1.sb.rnd().from("sample_orders").select("product_id, cost, cost_other, qty, status, ordered_at").in("product_id", ids) : { data: [] },
        ids.length ? admin_1.sb.rnd().from("evaluations").select("code, result").in("code", all.map((p) => p.code).filter(Boolean)) : { data: [] },
        (0, pipeline_1.getRndOptions)(), (0, pipeline_1.getTeams)(),
        // Ngày duyệt: approved_at; mẫu cũ thiếu thì lấy lần đầu lên P1 trong nhật ký
        ids.length ? admin_1.sb.rnd().from("product_events").select("product_id, changes, created_at").eq("action", "stage_changed").in("product_id", ids) : { data: [] },
    ]);
    const p1At = new Map();
    for (const e of p1ev ?? []) {
        const st = e.changes?.stage;
        if (st?.[1] === "p1" && (!p1At.has(e.product_id) || e.created_at < p1At.get(e.product_id)))
            p1At.set(e.product_id, e.created_at);
    }
    const approvedIn = (p) => { const d = p.approved_at ?? p1At.get(p.id); return !!d && p.stage !== "p0" && (0, pipeline_1.inVnRange)(d, f.from, f.to); };
    const cancelled = (0, rnd_options_1.flagged)(options.order_status, "cancel"), doneSt = (0, rnd_options_1.flagged)(options.order_status, "done");
    const noCost = new Set();
    const teamName = new Map(teams.map((t) => [t.id, t.name]));
    const res = new Map((evs ?? []).map((e) => [e.code, e.result]));
    const cost = new Map();
    // Mọi đơn (bỏ đơn huỷ) của mẫu; mẫu vào báo cáo theo NGÀY DUYỆT (xem đầu tệp). Chi phí SX = đơn giá × số lượng (lib/order-cost).
    for (const o of orders ?? []) {
        if (cancelled.includes(o.status))
            continue;
        if ((doneSt.includes(o.status) || o.status === "Hoàn thành") && !(Number(o.cost) > 0))
            noCost.add(o.product_id);
        const c = cost.get(o.product_id) ?? { sample: 0, other: 0 };
        c.sample += (0, order_cost_1.orderMakeCost)(o);
        c.other += (0, order_cost_1.orderOtherCost)(o);
        cost.set(o.product_id, c);
    }
    // Mẫu vào báo cáo: có đơn đặt trong kỳ; mẫu KHÔNG có đơn nào nhưng có chi phí Ads / quay nhập tay thì xét theo ngày vào luồng R&D (không có ngày đặt để xét)
    // Mẫu vào báo cáo: được duyệt trong kỳ VÀ đã phát sinh chi phí (có đơn đặt mẫu, hoặc có Ads / quay mẫu nhập tay)
    const items = all.filter((p) => approvedIn(p) && (cost.has(p.id) || Number(p.ads_cost ?? 0) > 0 || Number(p.video_cost ?? 0) > 0));
    const rows = items.map((p) => {
        const c = cost.get(p.id) ?? { sample: 0, other: 0 }, r = p.code ? res.get(p.code) : undefined;
        const result = ["win", "win_traffic", "win_sp"].includes(r ?? "") ? "win" : r === "fail" || p.killed_at ? "fail" : "testing";
        const ads = Number(p.ads_cost ?? 0), video = Number(p.video_cost ?? 0);
        return { id: p.id, code: p.code, name: p.name, team: p.team_id ? teamName.get(p.team_id) ?? null : null, source: (p.entry_source === "media" ? "Media test" : "R&D"),
            sample: c.sample, other: c.other, ads, video, total: c.sample + c.other + ads + video, result };
    }).sort((a, b) => b.total - a.total);
    const group = (name, rs) => {
        const total = rs.reduce((n, r) => n + r.total, 0), wins = rs.filter((r) => r.result === "win").length, fails = rs.filter((r) => r.result === "fail").length;
        const failCost = rs.filter((r) => r.result === "fail").reduce((n, r) => n + r.total, 0);
        return { name, samples: rs.length, total, wins, fails, perWin: wins ? total / wins : null, perFail: fails ? failCost / fails : null };
    };
    const by = (key) => {
        const m = new Map();
        for (const r of rows)
            m.set(key(r), [...(m.get(key(r)) ?? []), r]);
        return [...m].map(([k, rs]) => group(k, rs)).sort((a, b) => b.total - a.total);
    };
    const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
    const total = rows.reduce((n, r) => n + r.total, 0), wins = rows.filter((r) => r.result === "win").length;
    const wasted = rows.filter((r) => r.result === "fail").reduce((n, r) => n + r.total, 0);
    return {
        totals: { total, samples: rows.length, perSample: rows.length ? total / rows.length : null, perWin: wins ? total / wins : null, wasted, wastedPct: total ? (wasted / total) * 100 : null,
            sample: sum("sample"), other: sum("other"), ads: sum("ads"), video: sum("video") },
        byTeam: by((r) => r.team ?? "Chưa gắn team"), bySource: by((r) => r.source), rows,
        missingCost: items.filter((p) => noCost.has(p.id)).map((p) => ({ id: p.id, st_code: p.st_code ?? null, code: p.code, name: p.name })),
    };
}
