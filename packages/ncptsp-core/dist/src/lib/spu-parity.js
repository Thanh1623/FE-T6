"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkSpuParity = checkSpuParity;
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
const pipeline_1 = require("@/lib/pipeline");
const data_1 = require("@/lib/data");
const spu_data_1 = require("@/lib/spu-data");
const spu_rules_1 = require("@/lib/spu-rules");
const spu_winflags_1 = require("@/lib/spu-winflags");
const spu_dash_1 = require("@/lib/spu-dash");
const spu_query_1 = require("@/lib/spu-query");
// ĐỐI CHIẾU ĐƯỜNG NHANH (hàm SQL) VỚI ĐƯỜNG CŨ (tính trực tiếp) — xem docs/KIEN-TRUC-TONG-HOP-SPU.md, mục 5.
// Chạy: GET /api/cron/spu-summary?check=2 (cần CRON_SECRET). Mỗi ca = một bộ lọc; ok = hai đường ra cùng kết quả.
// Cờ Win Traffic / Win Đơn hàng / Ngôi sao của hai đường cùng lấy từ lib/spu-winflags (quy tắc duy nhất ở trang KPI) nên phải khớp cả khi lọc team.
// Lưu ý: kỳ so là 30 ngày gần nhất; các ca đổi kỳ (7 ngày, tháng trước) dùng chung tập cờ này nên chỉ kiểm tra logic lọc / đếm, không kiểm tra cờ theo kỳ.
const canon = (x) => Array.isArray(x) ? x.map(canon) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])])) : x;
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
async function checkSpuParity() {
    try {
        const [rows, rules, teams] = await Promise.all([(0, spu_data_1.loadSpuRows)(), (0, spu_rules_1.loadSpuRules)(), (0, pipeline_1.getTeams)(true)]);
        const today = (0, data_1.todayVN)(), db = admin_1.sb.sales();
        const teamNames = teams.map((t) => t.name);
        const whs = [...new Set(rows.flatMap((r) => Object.keys(r.stockBy)))].sort();
        const win = await (0, spu_winflags_1.loadRollingWin)({ pageIds: null, channels: [], rules: rules.win });
        const base = { today, days: 30, endAge: 0, teams: [], wh: "", group: "", words: [], status: "all", sort: "stock", dir: "desc", page: 1, pageSize: 50, rules, win };
        const sets = [["mặc định", {}], ["sắp xếp bán tăng", { sort: "sold", dir: "asc" }], ["sắp xếp lượt xem", { sort: "views" }], ["trang 2", { page: 2 }], ["7 ngày", { days: 7 }], ["tháng trước", { days: 30, endAge: 30 }]];
        for (const s of ["instock", "outstock", "hot", "normal", "slow", "bad", "star", "win", "wintraffic", "novideo", "video"])
            sets.push([`trạng thái ${s}`, { status: s }]);
        for (const t of teamNames.slice(0, 3))
            sets.push([`team ${t}`, { teams: [t] }]);
        for (const w of whs.slice(0, 2))
            sets.push([`kho ${w}`, { wh: w }]);
        sets.push(["nhóm Nhẫn", { group: "Nhẫn" }], ["tìm 'nhan'", { words: ["nhan"] }]);
        const cases = [];
        for (const [name, over] of sets) {
            const q = { ...base, ...over };
            const L = (0, spu_query_1.queryLegacy)(rows, q);
            const { data, error } = await db.rpc("spu_query", { p: (0, spu_query_1.rpcParams)(q) });
            if (error) {
                cases.push({ name: `query · ${name}`, ok: false, diffs: [`spu_query lỗi: ${error.message}`] });
                continue;
            }
            const S = data;
            const diffs = [];
            const eq = (label, a, b) => { if (!same(a, b))
                diffs.push(`${label}: cũ=${JSON.stringify(canon(a)).slice(0, 160)} nhanh=${JSON.stringify(canon(b)).slice(0, 160)}`); };
            const sc = { ...S.status_counts }, lc = { ...L.statusCounts };
            const { n: _n, ...tot } = S.totals;
            void _n;
            eq("kho", L.warehouses, S.warehouses);
            eq("thẻ", L.cards, S.cards);
            eq("số trên nút lọc", lc, sc);
            eq("tổng số / trang", [L.total, L.page, L.pages], [S.total, S.page, S.pages]);
            eq("dòng tổng", L.totals, tot);
            {
                const sv = S.rows.map((r) => (0, spu_query_1.viewFromSql)(r, q));
                eq("mã theo thứ tự", L.rows.map((v) => v.row.code), sv.map((v) => v.row.code));
                const pick = (v) => ({ s: v.stock, a: v.available, so: v.sold, vi: v.videos, vw: v.views, inc: v.row.incoming, age: v.row.ageDays, act: v.action });
                eq("giá trị từng dòng", L.rows.map(pick), sv.map(pick));
            }
            cases.push({ name: `query · ${name}`, ok: diffs.length === 0, diffs });
        }
        // Dashboard
        const dbase = { today, days: 30, endAge: 0, teams: [], pageIds: null, rules, limit: 8, win };
        const dsets = [["mặc định", {}], ["7 ngày", { days: 7 }], ["90 ngày", { days: 90 }]];
        for (const t of teamNames.slice(0, 2))
            dsets.push([`team ${t}`, { teams: [t] }]);
        for (const [name, over] of dsets) {
            const q = { ...dbase, ...over };
            const L = (0, spu_dash_1.dashLegacy)(rows, q);
            const { data, error } = await db.rpc("spu_dash", { p: (0, spu_dash_1.dashRpcParams)(q) });
            if (error) {
                cases.push({ name: `dashboard · ${name}`, ok: false, diffs: [`spu_dash lỗi: ${error.message}`] });
                continue;
            }
            const S = await (0, spu_dash_1.dashFromSql)(data, q);
            const diffs = [];
            const eq = (label, a, b) => { if (!same(a, b))
                diffs.push(`${label}: cũ=${JSON.stringify(canon(a)).slice(0, 160)} nhanh=${JSON.stringify(canon(b)).slice(0, 160)}`); };
            const byName = (x) => [...x].sort((a, b) => (a.name < b.name ? -1 : 1));
            eq("thẻ S0", L.s0, S.s0);
            eq("thẻ S1", L.s1, S.s1);
            eq("thẻ S2–S4 (đang Win)", L.winNow, S.winNow);
            eq("cơ cấu theo dòng SP", byName(L.videoCats), byName(S.videoCats));
            eq("cơ cấu theo trạng thái tồn", L.videoGroups, S.videoGroups);
            eq("trạng thái tồn từng SPU", [...L.stockStatus].sort(), [...S.stockStatus].sort());
            eq("SPU Active", [...L.activeCodes].sort(), [...S.activeCodes].sort());
            eq("cảnh báo: SPU có gợi ý", L.alertViews.filter((v) => v.action).map((v) => v.row.code).sort(), S.alertViews.filter((v) => v.action).map((v) => v.row.code).sort());
            eq("video tiềm năng: tổng + top lượt xem", [L.vids.total, L.vids.items.map((i) => i.x.views)], [S.vids.total, S.vids.items.map((i) => i.x.views)]);
            cases.push({ name: `dashboard · ${name}`, ok: diffs.length === 0, diffs });
        }
        return { ok: cases.every((c) => c.ok), cases };
    }
    catch (e) {
        const err = e;
        return { error: err.message ?? "Lỗi không rõ" };
    }
}
