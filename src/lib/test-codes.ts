import "server-only";
import { sb } from "@/lib/supabase/admin";
import { profileNames, type CurrentUser } from "@/lib/session";
import { TEST_CATEGORY_NAMES, parseTestCode, testCodeProductName } from "@/lib/tags";
import { loadCodeLinks } from "@/lib/code-links";

// Mã SPU test (T10001 nhẫn test, T20003 lắc test… — số đầu là loại hàng, 1 nhẫn đến 9 set): Media tự test mẫu chưa có mã Sapo. Mã được CẤP TẬP TRUNG ở đây để không ai tạo trùng nhau:
//   • số thứ tự kế tiếp = số lớn nhất đã dùng ở loại đó + 1 (tính cả mã đã có trên bài đăng nhưng chưa có hồ sơ);
//   • tạo hồ sơ mẫu ngay (rnd.products.code là duy nhất) — hai người bấm cùng lúc thì DB từ chối người sau, hệ thống tự lấy số kế tiếp.
import { TEST_CATEGORIES } from "@/lib/test-codes-shared";
export { TEST_CATEGORIES };

const STANDARD = /^T[1-9]\d{4}$/i;   // mã cấp từ trang này: T + số loại hàng + 4 chữ số
const codeOf = (cat: string, n: number) => `T${cat}${String(n).padStart(4, "0")}`;   // 4 chữ số: đúng ràng buộc products_code_check (≥ 3 số)

async function maxNumbers() {
  const { data, error } = await sb.rnd().from("products").select("code").like("code", "T%");
  if (error) throw error;
  const max: Record<string, number> = {};
  for (const r of data ?? []) {
    const p = parseTestCode(String(r.code));   // mã kiểu cũ (TN0007) tính vào cùng loại để số thứ tự không lùi
    if (p && !p.legacy && !STANDARD.test(String(r.code))) continue;   // mã dài kiểu T171002 cấp từ trước (không đúng T + loại + 4 số) không được đẩy số thứ tự lên
    // Mã kiểu cũ chỉ tính khi đúng dạng mã test cũ (T + 1–2 chữ cái + tối đa 5 chữ số, vd TN0007). Mã thiết kế dài như TK0151001 (túi da, không phải mã test) trước đây bị hiểu là "Kiềng số 151001" và đẩy mã kế tiếp thành T5151002.
    if (p && p.legacy && !/^T[A-Z]{1,2}\d{1,5}$/i.test(String(r.code))) continue;
    if (p && !(p.legacy && String(r.code).length < 6)) max[p.cat] = Math.max(max[p.cat] ?? 0, p.num);
  }
  return max;
}

// Mã kế tiếp mỗi loại (chỉ để xem trước — mã thật được cấp lúc bấm tạo)
export async function peekNextCodes() {
  const max = await maxNumbers();
  return Object.fromEntries(TEST_CATEGORIES.map((c) => [c.key, codeOf(c.key, (max[c.key] ?? 0) + 1)])) as Record<string, string>;
}

// Số đầu tiên ≥ from mà mã chưa xuất hiện trên bài đăng nào (đề phòng bài gắn mã trước khi có hồ sơ)
async function firstUnusedOnPosts(cat: string, from: number) {
  for (let start = from; start < from + 300; start += 25) {
    const cands = Array.from({ length: 25 }, (_, i) => codeOf(cat, start + i));
    const [a, b] = await Promise.all([
      sb.social().from("posts").select("product_codes").overlaps("product_codes", cands).limit(200),
      sb.social().from("posts").select("unknown_codes").overlaps("unknown_codes", cands).limit(200),
    ]);
    const used = new Set<string>([...(a.data ?? []).flatMap((r) => r.product_codes as string[]), ...(b.data ?? []).flatMap((r) => r.unknown_codes as string[])].map((c) => c.toUpperCase()));
    const free = cands.findIndex((c) => !used.has(c));
    if (free >= 0) return start + free;
  }
  throw new Error("Không tìm được số còn trống");
}

export async function createTestCode(user: CurrentUser, cat: string, note: string) {
  if (!(cat in TEST_CATEGORY_NAMES)) throw new Error("Chọn loại hàng");
  const text = note.trim().slice(0, 120);
  let last = "";
  for (let attempt = 0; attempt < 8; attempt++) {
    const max = await maxNumbers();
    const n = await firstUnusedOnPosts(cat, (max[cat] ?? 0) + 1 + attempt);   // + attempt: mỗi lần thử lại luôn nhảy sang số kế tiếp, kể cả khi lần đọc vừa rồi chưa thấy mã người khác mới tạo
    const code = codeOf(cat, n);
    const base = testCodeProductName(code) ?? code;
    const { data, error } = await sb.rnd().from("products").insert({
      code, name: text ? `${base} — ${text}` : base, description: text || null, status: "testing", origin: "auto", created_by: user.id, team_id: user.team_id,   // origin chỉ nhận manual / auto; mã test nhận ra qua dạng mã (isTestCode)
    }).select("id").single();
    if (!error) {
      await sb.rnd().from("product_events").insert({ product_id: data.id, actor_id: user.id, action: "created", changes: { code: [null, code] } });
      return { code, id: data.id as string };
    }
    if (error.code !== "23505") throw new Error(error.message);   // 23505 = người khác vừa lấy đúng số này → thử số kế tiếp
    last = `${code}: ${error.message}`;
  }
  throw new Error(`Nhiều người đang tạo mã cùng lúc — bấm tạo lại (${last})`);
}

export type TestCodeRow = {
  id: string; code: string; cat: string; name: string; note: string | null; createdAt: string; createdBy: string | null;
  result: string | null; firstPost: string | null; videos: number; views: number; stage: string | null;
  links: { id: string; sku: string; launch: string }[];   // mã SPU thương mại đã gắn (migration 035)
};

export async function listTestCodes(): Promise<TestCodeRow[]> {
  const { data, error } = await sb.rnd().from("products").select("id, code, name, description, created_at, created_by, stage").like("code", "T%").order("created_at", { ascending: false }).limit(2000);
  if (error) throw error;
  const rows = (data ?? []).filter((p) => { const t = parseTestCode(p.code as string); return t && !t.legacy && !!p.created_by; });   // chỉ T1…T9 + số, và chỉ mã do người dùng tạo trên hệ thống (bỏ mã kiểu cũ TX… và hồ sơ hệ thống tự sinh từ bài đăng, vd mã đồ da)
  const codes = rows.map((p) => p.code as string);
  const linkRows = await loadCodeLinks();
  const [names, { data: evs }, { data: livePosts }] = await Promise.all([
    profileNames(rows.map((p) => p.created_by as string | null)),
    codes.length ? sb.rnd().from("evaluations").select("code, result, first_post_date, metrics").in("code", codes) : { data: [] },
    // Số video / lượt xem ĐỌC TRỰC TIẾP từ bài đăng đã gắn mã (lần đánh giá tự động chạy vài lần mỗi ngày nên mã mới đăng video có thể chưa có dòng đánh giá → trước đây báo "chưa lên video" dù đã có video)
    codes.length ? sb.social().from("posts").select("product_codes, views, kind, published_at").overlaps("product_codes", codes).in("kind", ["video", "reel"]) : { data: [] },
  ]);
  const live = new Map<string, { videos: number; views: number; first: string | null }>();
  for (const po of livePosts ?? []) for (const c of (po.product_codes as string[]) ?? []) {
    const cur = live.get(c) ?? { videos: 0, views: 0, first: null };
    cur.videos += 1; cur.views += Number(po.views ?? 0);
    const d = po.published_at ? String(po.published_at).slice(0, 10) : null;
    if (d && (!cur.first || d < cur.first)) cur.first = d;
    live.set(c, cur);
  }
  const ev = new Map((evs ?? []).map((e) => [e.code as string, e as { result: string; first_post_date: string | null; metrics: { videos?: number; views?: number } | null }]));
  return rows.map((p) => {
    const e = ev.get(p.code as string);
    return {
      id: p.id as string, code: p.code as string, cat: parseTestCode(p.code as string)!.cat, name: p.name as string, note: (p.description as string | null) ?? null,
      createdAt: p.created_at as string, createdBy: p.created_by ? names.get(p.created_by as string) ?? null : null,
      result: e?.result ?? null, firstPost: e?.first_post_date ?? live.get(p.code as string)?.first ?? null, videos: Math.max(Number(e?.metrics?.videos ?? 0), live.get(p.code as string)?.videos ?? 0), views: Math.max(Number(e?.metrics?.views ?? 0), live.get(p.code as string)?.views ?? 0), stage: (p.stage as string | null) ?? null,
      links: linkRows.filter((l) => l.product_id === p.id).map((l) => ({ id: l.id, sku: l.sku_code, launch: l.launch_date })),
    };
  });
}
