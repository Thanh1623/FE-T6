"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshTeamLines = refreshTeamLines;
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
// Bảng chứa sẵn sales.tr_lines cho mọi team (migration 093 + 094). tr_lines tự tính trực tiếp khi bảng "cũ" (dirty), nên gọi hàm này chỉ để LẤY LẠI tốc độ — không ảnh hưởng độ đúng.
// Dựng lại THEO TỪNG TEAM (mỗi lượt gọi < giới hạn 8 giây của kết nối; dựng cả bảng một câu từng bị "statement timeout"), rồi một bước chốt: chỉ đặt "sạch" nếu không có dữ liệu nguồn nào đổi trong lúc dựng.
// Không ném lỗi: chưa chạy migration / hết thời gian thì bỏ qua (QLHH vẫn chạy bằng đường tính trực tiếp).
const isTimeout = (m) => /timeout|canceling statement/i.test(m ?? "");
async function refreshTeamLines(force = false) {
    try {
        const db = admin_1.sb.sales();
        if (!force) {
            const m = await db.from("team_lines_meta").select("dirty").eq("id", 1).maybeSingle();
            if (m.error)
                return { ok: false, error: m.error.message }; // chưa có migration 093
            if (m.data && m.data.dirty === false)
                return { ok: true, skipped: true };
        }
        const begin = await db.rpc("team_lines_begin");
        if (begin.error)
            return { ok: false, error: begin.error.message }; // chưa chạy migration 094
        const teams = await db.rpc("team_lines_teams");
        if (teams.error)
            return { ok: false, error: teams.error.message };
        const list = teams.data ?? [];
        for (const team of list) {
            let res = await db.rpc("team_lines_part", { p_team: team });
            for (let a = 0; a < 2 && res.error && isTimeout(res.error.message); a++) {
                await new Promise((r) => setTimeout(r, 1500 * (a + 1)));
                res = await db.rpc("team_lines_part", { p_team: team });
            }
            if (res.error)
                return { ok: false, error: `team_lines_part(${team}): ${res.error.message}`, teams: list.length };
        }
        const fin = await db.rpc("team_lines_finish", { p_started: begin.data });
        if (fin.error)
            return { ok: false, error: fin.error.message };
        const d = fin.data;
        return { ok: true, clean: !!d?.clean, rows: d?.rows, teams: list.length };
    }
    catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}
