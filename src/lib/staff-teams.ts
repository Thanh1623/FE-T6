import "server-only";
import { sb, supabaseOrders } from "@/lib/supabase/admin";

// Nhân viên ↔ team của khối kinh doanh, đọc từ hệ thống đơn hàng Qlydonhang (public.profiles + public.teams, chỉ đọc).
// Dùng để chia SỐ BÁN theo team: cột "Nhân viên phụ trách" của đơn (tên tài khoản Sapo) → nhân viên → team.
// Tên trên Sapo thường thêm hậu tố (TMĐT, STORE, KD1/2/3, NLB, TAV…) hoặc đảo chữ nên so khớp theo từ: mọi từ trong tên Sapo phải nằm trong tên nhân viên;
// hậu tố tên team (vd "NLB") dùng để phân biệt người trùng tên ở hai team; vẫn mơ hồ (nhiều team cùng khớp) thì KHÔNG gán.
export type StaffProfile = { name: string; team: string };

// Mã team trên Qlydonhang → tên team trong hệ thống này (team không có ở đây dùng tên đầy đủ trên Qlydonhang)
const TEAM_ALIAS: Record<string, string> = { HN: "Hồng Ngọc", "TĐQ": "Đá quý", GB: "Global" };
// Hậu tố trong tên Sapo gợi ý team
const SUFFIX_TEAM: Record<string, string> = { tmdt: "TMĐT", store: "SHOP", nlb: "NLB", hlb: "HLB", tav: "TAV", ntd: "NTĐ", global: "GB", dvl: "ĐVL" };
// Từ bỏ qua khi so tên: nhãn ca / vai trò, và đệm "thị" / "văn" (Sapo hay thêm / bớt)
const NOISE = new Set(["kd1", "kd2", "kd3", "kho", "demo", "test", "admin", "sale", "sales", "nv", "ql", "thi", "van"]);

const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const words = (s: string) => fold(s).replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
const nameTokens = (s: string) => words(s).filter((w) => !NOISE.has(w) && !(w in SUFFIX_TEAM));
const hintOf = (s: string) => words(s).map((w) => SUFFIX_TEAM[w]).find(Boolean) ?? null;
const shiftOf = (s: string) => words(s).find((w) => /^kd[123]$/.test(w)) ?? null;   // nhãn ca KD1 / KD2 / KD3 trong tên

// Hàm thuần (kiểm thử được): dựng bộ tra tên nhân viên Sapo → tên team
export function buildStaffMatcher(profiles: (StaffProfile & { teamCode?: string })[]) {
  const ps = profiles.map((p) => ({ ...p, tk: nameTokens(p.name), code: p.teamCode ?? p.team, kd: shiftOf(p.name) }));
  const cache = new Map<string, string | null>();
  return (sapoName: string | null | undefined): string | null => {
    const key = (sapoName ?? "").trim();
    if (!key) return null;
    if (cache.has(key)) return cache.get(key)!;
    const a = nameTokens(key), hint = hintOf(key);
    let out: string | null = null;
    if (a.length >= 2 || (a.length === 1 && hint)) {
      // Khớp chặt: mọi từ của tên Sapo nằm trong tên nhân viên; không có thì khớp ngược: mọi từ của nhân viên (≥ 2 từ) nằm trong tên Sapo ("Huyền Đỗ" ~ "Đỗ Thị Thanh Huyền")
      let cand = ps.filter((p) => a.every((w) => p.tk.includes(w)));
      if (!cand.length) cand = ps.filter((p) => p.tk.length >= 2 && p.tk.every((w) => a.includes(w)));
      if (hint) cand = cand.filter((p) => p.code === hint || p.team === hint);
      const kd = shiftOf(key);
      if (kd) { const same = cand.filter((p) => p.kd === kd); if (same.length) cand = same; }   // cùng ca KD → ưu tiên hồ sơ cùng nhãn ca
      const teams = [...new Set(cand.map((p) => p.team))];
      if (teams.length === 1) out = teams[0];
    }
    cache.set(key, out);
    return out;
  };
}

let cached: { at: number; fn: (n: string | null | undefined) => string | null } | null = null;
export async function loadStaffTeams(): Promise<(n: string | null | undefined) => string | null> {
  if (cached && Date.now() - cached.at < 600_000) return cached.fn;
  let fn: (n: string | null | undefined) => string | null = () => null;
  try {
    const db = supabaseOrders();
    const [{ data: teams, error: e1 }, { data: people, error: e2 }] = await Promise.all([
      db.from("teams").select("id, code, name, department"),
      db.from("profiles").select("full_name, team_id"),
    ]);
    if (e1 || e2) throw e1 ?? e2;
    const team = new Map((teams ?? []).filter((t) => t.department === "kinh_doanh").map((t) => [t.id as string, t as { code: string; name: string }]));
    const profiles = (people ?? []).flatMap((p) => {
      const t = p.team_id ? team.get(p.team_id as string) : undefined;
      return t && p.full_name ? [{ name: String(p.full_name), team: TEAM_ALIAS[t.code] ?? String(t.name), teamCode: String(t.code) }] : [];
    });
    fn = buildStaffMatcher(profiles);
  } catch (e) { console.error("loadStaffTeams:", e); }   // chưa cấu hình / không đọc được Qlydonhang → chỉ dùng tag
  cached = { at: Date.now(), fn };
  return fn;
}

// ---------- Lưu tên nhân viên + team vào database của dự án này (sales.staff_teams, migration 046) ----------
// Tra cứu: bảng staff_teams trước (có cả dòng sửa tay), thiếu thì suy trực tiếp từ Qlydonhang
export async function loadStaffLookup(): Promise<(n: string | null | undefined) => string | null> {
  const live = await loadStaffTeams();
  let saved = new Map<string, string>();
  try {
    const { data } = await sb.sales().from("staff_teams").select("sapo_name, team").not("team", "is", null);
    saved = new Map((data ?? []).map((r) => [String(r.sapo_name).trim(), String(r.team)]));
  } catch { /* chưa chạy migration 046 */ }
  return (n) => { const k = (n ?? "").trim(); return k ? saved.get(k) ?? live(k) : null; };
}

// Ghi các tên nhân viên mới (kèm team suy được) — không ghi đè dòng đã sửa tay. Trả về số tên, số tên đã có team, danh sách tên chưa có team
export async function saveStaffNames(names: (string | null | undefined)[]) {
  const uniq = [...new Set(names.map((n) => (n ?? "").trim()).filter(Boolean))];
  const out = { names: uniq.length, matched: 0, unmatched: [] as string[], saved: false };
  if (!uniq.length) return out;
  const live = await loadStaffTeams();
  const manual = new Set<string>();
  try {
    for (let i = 0; i < uniq.length; i += 200) {
      const { data, error } = await sb.sales().from("staff_teams").select("sapo_name").eq("source", "manual").in("sapo_name", uniq.slice(i, i + 200));
      if (error) throw error;
      for (const r of data ?? []) manual.add(String(r.sapo_name));
    }
    const now = new Date().toISOString();
    const rows = uniq.filter((n) => !manual.has(n)).map((n) => ({ sapo_name: n, team: live(n), source: "auto", updated_at: now }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.sales().from("staff_teams").upsert(rows.slice(i, i + 500), { onConflict: "sapo_name" });
      if (error) throw error;
    }
    out.saved = true;
  } catch { /* chưa chạy migration 046: vẫn tính được team trực tiếp từ Qlydonhang, chỉ chưa lưu */ }
  const lookup = await loadStaffLookup();
  for (const n of uniq) { if (lookup(n)) out.matched++; else out.unmatched.push(n); }
  return out;
}
