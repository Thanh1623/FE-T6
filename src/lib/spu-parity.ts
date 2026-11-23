import "server-only";
import { sb } from "@/lib/supabase/admin";
import { getTeams } from "@/lib/pipeline";
import { todayVN } from "@/lib/data";
import { loadSpuRows } from "@/lib/spu-data";
import { loadSpuRules } from "@/lib/spu-rules";
import { loadRollingWin } from "@/lib/spu-winflags";
import { dashFromSql, dashLegacy, dashRpcParams, type DashParams } from "@/lib/spu-dash";
import { queryLegacy, rpcParams, viewFromSql, type SpuQuery } from "@/lib/spu-query";

// ĐỐI CHIẾU ĐƯỜNG NHANH (hàm SQL) VỚI ĐƯỜNG CŨ (tính trực tiếp) — xem docs/KIEN-TRUC-TONG-HOP-SPU.md, mục 5.
// Chạy: GET /api/cron/spu-summary?check=2 (cần CRON_SECRET). Mỗi ca = một bộ lọc; ok = hai đường ra cùng kết quả.
// Cờ Win Traffic / Win Đơn hàng / Ngôi sao của hai đường cùng lấy từ lib/spu-winflags (quy tắc duy nhất ở trang KPI) nên phải khớp cả khi lọc team.
// Lưu ý: kỳ so là 30 ngày gần nhất; các ca đổi kỳ (7 ngày, tháng trước) dùng chung tập cờ này nên chỉ kiểm tra logic lọc / đếm, không kiểm tra cờ theo kỳ.

const canon = (x: unknown): unknown => Array.isArray(x) ? x.map(canon) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon((x as Record<string, unknown>)[k])])) : x;
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

export type ParityCase = { name: string; ok: boolean; diffs: string[] };

export async function checkSpuParity(): Promise<{ ok: boolean; cases: ParityCase[] } | { error: string }> {
  try {
    const [rows, rules, teams] = await Promise.all([loadSpuRows(), loadSpuRules(), getTeams(true)]);
    const today = todayVN(), db = sb.sales();
    const teamNames = teams.map((t) => t.name);
    const whs = [...new Set(rows.flatMap((r) => Object.keys(r.stockBy)))].sort();
    const win = await loadRollingWin({ pageIds: null, channels: [], rules: rules.win });
    const base: SpuQuery = { today, days: 30, endAge: 0, teams: [], wh: "", group: "", words: [], status: "all", sort: "stock", dir: "desc", page: 1, pageSize: 50, rules, win };
    const sets: [string, Partial<SpuQuery>][] = [["mặc định", {}], ["sắp xếp bán tăng", { sort: "sold", dir: "asc" }], ["sắp xếp lượt xem", { sort: "views" }], ["trang 2", { page: 2 }], ["7 ngày", { days: 7 }], ["tháng trước", { days: 30, endAge: 30 }]];
    for (const s of ["instock", "outstock", "hot", "normal", "slow", "bad", "star", "win", "wintraffic", "novideo", "video"] as const) sets.push([`trạng thái ${s}`, { status: s }]);
    for (const t of teamNames.slice(0, 3)) sets.push([`team ${t}`, { teams: [t] }]);
    for (const w of whs.slice(0, 2)) sets.push([`kho ${w}`, { wh: w }]);
    sets.push(["nhóm Nhẫn", { group: "Nhẫn" }], ["tìm 'nhan'", { words: ["nhan"] }]);

    const cases: ParityCase[] = [];
    for (const [name, over] of sets) {
      const q: SpuQuery = { ...base, ...over };
      const L = queryLegacy(rows, q);
      const { data, error } = await db.rpc("spu_query", { p: rpcParams(q) });
      if (error) { cases.push({ name: `query · ${name}`, ok: false, diffs: [`spu_query lỗi: ${error.message}`] }); continue; }
      const S = data as { warehouses: string[]; cards: unknown; status_counts: Record<string, number>; total: number; page: number; pages: number; totals: Record<string, number>; wh: string; rows: Parameters<typeof viewFromSql>[0][] };
      const diffs: string[] = [];
      const eq = (label: string, a: unknown, b: unknown) => { if (!same(a, b)) diffs.push(`${label}: cũ=${JSON.stringify(canon(a)).slice(0, 160)} nhanh=${JSON.stringify(canon(b)).slice(0, 160)}`); };
      const sc = { ...S.status_counts }, lc: Record<string, number> = { ...L.statusCounts };
      const { n: _n, ...tot } = S.totals as Record<string, number>; void _n;
      eq("kho", L.warehouses, S.warehouses); eq("thẻ", L.cards, S.cards); eq("số trên nút lọc", lc, sc);
      eq("tổng số / trang", [L.total, L.page, L.pages], [S.total, S.page, S.pages]); eq("dòng tổng", L.totals, tot);
      {
        const sv = S.rows.map((r) => viewFromSql(r, q));
        eq("mã theo thứ tự", L.rows.map((v) => v.row.code), sv.map((v) => v.row.code));
        const pick = (v: (typeof sv)[number]) => ({ s: v.stock, a: v.available, so: v.sold, vi: v.videos, vw: v.views, inc: v.row.incoming, age: v.row.ageDays, act: v.action });
        eq("giá trị từng dòng", L.rows.map(pick), sv.map(pick));
      }
      cases.push({ name: `query · ${name}`, ok: diffs.length === 0, diffs });
    }

    // Dashboard
    const dbase: DashParams = { today, days: 30, endAge: 0, teams: [], pageIds: null, rules, limit: 8, win };
    const dsets: [string, Partial<DashParams>][] = [["mặc định", {}], ["7 ngày", { days: 7 }], ["90 ngày", { days: 90 }]];
    for (const t of teamNames.slice(0, 2)) dsets.push([`team ${t}`, { teams: [t] }]);
    for (const [name, over] of dsets) {
      const q: DashParams = { ...dbase, ...over };
      const L = dashLegacy(rows, q);
      const { data, error } = await db.rpc("spu_dash", { p: dashRpcParams(q) });
      if (error) { cases.push({ name: `dashboard · ${name}`, ok: false, diffs: [`spu_dash lỗi: ${error.message}`] }); continue; }
      const S = await dashFromSql(data as never, q);
      const diffs: string[] = [];
      const eq = (label: string, a: unknown, b: unknown) => { if (!same(a, b)) diffs.push(`${label}: cũ=${JSON.stringify(canon(a)).slice(0, 160)} nhanh=${JSON.stringify(canon(b)).slice(0, 160)}`); };
      const byName = (x: { name: string }[]) => [...x].sort((a, b) => (a.name < b.name ? -1 : 1));
      eq("thẻ S0", L.s0, S.s0); eq("thẻ S1", L.s1, S.s1); eq("thẻ S2–S4 (đang Win)", L.winNow, S.winNow); eq("cơ cấu theo dòng SP", byName(L.videoCats), byName(S.videoCats)); eq("cơ cấu theo trạng thái tồn", L.videoGroups, S.videoGroups);
      eq("trạng thái tồn từng SPU", [...L.stockStatus].sort(), [...S.stockStatus].sort()); eq("SPU Active", [...L.activeCodes].sort(), [...S.activeCodes].sort());
      eq("cảnh báo: SPU có gợi ý", L.alertViews.filter((v) => v.action).map((v) => v.row.code).sort(), S.alertViews.filter((v) => v.action).map((v) => v.row.code).sort());
      eq("video tiềm năng: tổng + top lượt xem", [L.vids.total, L.vids.items.map((i) => i.x.views)], [S.vids.total, S.vids.items.map((i) => i.x.views)]);
      cases.push({ name: `dashboard · ${name}`, ok: diffs.length === 0, diffs });
    }
    return { ok: cases.every((c) => c.ok), cases };
  } catch (e) {
    const err = e as { message?: string };
    return { error: err.message ?? "Lỗi không rõ" };
  }
}
