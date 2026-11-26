"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildStaffMatcher = buildStaffMatcher;
exports.loadStaffTeams = loadStaffTeams;
exports.loadStaffLookup = loadStaffLookup;
exports.saveStaffNames = saveStaffNames;
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
// Mã team trên Qlydonhang → tên team trong hệ thống này (team không có ở đây dùng tên đầy đủ trên Qlydonhang)
const TEAM_ALIAS = { HN: "Hồng Ngọc", "TĐQ": "Đá quý", GB: "Global" };
// Hậu tố trong tên Sapo gợi ý team
const SUFFIX_TEAM = { tmdt: "TMĐT", store: "SHOP", nlb: "NLB", hlb: "HLB", tav: "TAV", ntd: "NTĐ", global: "GB", dvl: "ĐVL" };
// Từ bỏ qua khi so tên: nhãn ca / vai trò, và đệm "thị" / "văn" (Sapo hay thêm / bớt)
const NOISE = new Set(["kd1", "kd2", "kd3", "kho", "demo", "test", "admin", "sale", "sales", "nv", "ql", "thi", "van"]);
const fold = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const words = (s) => fold(s).replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
const nameTokens = (s) => words(s).filter((w) => !NOISE.has(w) && !(w in SUFFIX_TEAM));
const hintOf = (s) => words(s).map((w) => SUFFIX_TEAM[w]).find(Boolean) ?? null;
const shiftOf = (s) => words(s).find((w) => /^kd[123]$/.test(w)) ?? null; // nhãn ca KD1 / KD2 / KD3 trong tên
// Hàm thuần (kiểm thử được): dựng bộ tra tên nhân viên Sapo → tên team
function buildStaffMatcher(profiles) {
    const ps = profiles.map((p) => ({ ...p, tk: nameTokens(p.name), code: p.teamCode ?? p.team, kd: shiftOf(p.name) }));
    const cache = new Map();
    return (sapoName) => {
        const key = (sapoName ?? "").trim();
        if (!key)
            return null;
        if (cache.has(key))
            return cache.get(key);
        const a = nameTokens(key), hint = hintOf(key);
        let out = null;
        if (a.length >= 2 || (a.length === 1 && hint)) {
            // Khớp chặt: mọi từ của tên Sapo nằm trong tên nhân viên; không có thì khớp ngược: mọi từ của nhân viên (≥ 2 từ) nằm trong tên Sapo ("Huyền Đỗ" ~ "Đỗ Thị Thanh Huyền")
            let cand = ps.filter((p) => a.every((w) => p.tk.includes(w)));
            if (!cand.length)
                cand = ps.filter((p) => p.tk.length >= 2 && p.tk.every((w) => a.includes(w)));
            if (hint)
                cand = cand.filter((p) => p.code === hint || p.team === hint);
            const kd = shiftOf(key);
            if (kd) {
                const same = cand.filter((p) => p.kd === kd);
                if (same.length)
                    cand = same;
            } // cùng ca KD → ưu tiên hồ sơ cùng nhãn ca
            const teams = [...new Set(cand.map((p) => p.team))];
            if (teams.length === 1)
                out = teams[0];
        }
        cache.set(key, out);
        return out;
    };
}
let cached = null;
async function loadStaffTeams() {
    if (cached && Date.now() - cached.at < 600_000)
        return cached.fn;
    let fn = () => null;
    try {
        const db = (0, admin_1.supabaseOrders)();
        const [{ data: teams, error: e1 }, { data: people, error: e2 }] = await Promise.all([
            db.from("teams").select("id, code, name, department"),
            db.from("profiles").select("full_name, team_id"),
        ]);
        if (e1 || e2)
            throw e1 ?? e2;
        const team = new Map((teams ?? []).filter((t) => t.department === "kinh_doanh").map((t) => [t.id, t]));
        const profiles = (people ?? []).flatMap((p) => {
            const t = p.team_id ? team.get(p.team_id) : undefined;
            return t && p.full_name ? [{ name: String(p.full_name), team: TEAM_ALIAS[t.code] ?? String(t.name), teamCode: String(t.code) }] : [];
        });
        fn = buildStaffMatcher(profiles);
    }
    catch (e) {
        console.error("loadStaffTeams:", e);
    } // chưa cấu hình / không đọc được Qlydonhang → chỉ dùng tag
    cached = { at: Date.now(), fn };
    return fn;
}
// ---------- Lưu tên nhân viên + team vào database của dự án này (sales.staff_teams, migration 046) ----------
// Tra cứu: bảng staff_teams trước (có cả dòng sửa tay), thiếu thì suy trực tiếp từ Qlydonhang
async function loadStaffLookup() {
    const live = await loadStaffTeams();
    let saved = new Map();
    try {
        const { data } = await admin_1.sb.sales().from("staff_teams").select("sapo_name, team").not("team", "is", null);
        saved = new Map((data ?? []).map((r) => [String(r.sapo_name).trim(), String(r.team)]));
    }
    catch { /* chưa chạy migration 046 */ }
    return (n) => { const k = (n ?? "").trim(); return k ? saved.get(k) ?? live(k) : null; };
}
// Ghi các tên nhân viên mới (kèm team suy được) — không ghi đè dòng đã sửa tay. Trả về số tên, số tên đã có team, danh sách tên chưa có team
async function saveStaffNames(names) {
    const uniq = [...new Set(names.map((n) => (n ?? "").trim()).filter(Boolean))];
    const out = { names: uniq.length, matched: 0, unmatched: [], saved: false };
    if (!uniq.length)
        return out;
    const live = await loadStaffTeams();
    const manual = new Set();
    try {
        for (let i = 0; i < uniq.length; i += 200) {
            const { data, error } = await admin_1.sb.sales().from("staff_teams").select("sapo_name").eq("source", "manual").in("sapo_name", uniq.slice(i, i + 200));
            if (error)
                throw error;
            for (const r of data ?? [])
                manual.add(String(r.sapo_name));
        }
        const now = new Date().toISOString();
        const rows = uniq.filter((n) => !manual.has(n)).map((n) => ({ sapo_name: n, team: live(n), source: "auto", updated_at: now }));
        for (let i = 0; i < rows.length; i += 500) {
            const { error } = await admin_1.sb.sales().from("staff_teams").upsert(rows.slice(i, i + 500), { onConflict: "sapo_name" });
            if (error)
                throw error;
        }
        out.saved = true;
    }
    catch { /* chưa chạy migration 046: vẫn tính được team trực tiếp từ Qlydonhang, chỉ chưa lưu */ }
    const lookup = await loadStaffLookup();
    for (const n of uniq) {
        if (lookup(n))
            out.matched++;
        else
            out.unmatched.push(n);
    }
    return out;
}
