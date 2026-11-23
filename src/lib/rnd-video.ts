import "server-only";
import { fetchAll, sb } from "@/lib/supabase/admin";
import { listEvaluationResults } from "@/lib/eval/data";
import { isWinResult, type AutoResult } from "@/lib/eval/rules";

// Trang "Thư viện SP mới": video sản phẩm do các Page R&D đăng. Team xem video nào WIN / sản phẩm nào đẹp rồi bấm lấy source để tự edit.
export type RndChannel = { id: string; name: string; platform: string; color: string };

// Các kênh được đánh dấu R&D (migration 022). null = chưa chạy migration.
export async function getRndChannels(): Promise<RndChannel[] | null> {
  const { data, error } = await sb.social().from("channels").select("id, name, platform").eq("is_active", true).eq("is_rnd", true).order("created_at");
  if (error) return error.code === "42703" || error.code === "PGRST204" ? null : (() => { throw error; })();
  return (data ?? []).map((c, i) => ({ id: c.id as string, name: c.name as string, platform: c.platform as string, color: `var(--series-${(i % 8) + 1})` }));
}

export type ResultFilter = "all" | "win" | "win_traffic" | "any_win" | "testing" | "fail";
export const RESULT_FILTERS: Record<ResultFilter, string> = {
  all: "Tất cả", any_win: "Mọi loại WIN", win: "WIN", win_traffic: "WIN TRAFFIC", testing: "Đang test", fail: "FAIL",
};

export type CodeInfo = {
  result: AutoResult | null; productId: string | null; name: string | null; sourceUrl: string | null; taken: number;
};

// Mã SP → kết quả đánh giá (đã gồm kết luận R&D), sản phẩm R&D, link source, số lần các team đã lấy source
export async function codeInfos(): Promise<Map<string, CodeInfo>> {
  const [evals, { data: prods }, { data: taken }] = await Promise.all([
    listEvaluationResults(),
    fetchAll<{ id: string; code: string | null; name: string | null; source_url: string | null }>((a, b) => sb.rnd().from("products").select("id, code, name, source_url").not("code", "is", null).order("id").range(a, b)).then((data) => ({ data })),   // phân trang: bảng > 1.000 hồ sơ
    sb.rnd().from("product_events").select("product_id").eq("action", "source_taken"),
  ]);
  const takenBy = new Map<string, number>();
  for (const t of taken ?? []) takenBy.set(t.product_id as string, (takenBy.get(t.product_id as string) ?? 0) + 1);
  const out = new Map<string, CodeInfo>();
  for (const p of prods ?? []) {
    out.set((p.code as string).toUpperCase(), {
      result: null, productId: p.id as string, name: (p.name as string) ?? null, sourceUrl: (p.source_url as string) || null, taken: takenBy.get(p.id as string) ?? 0,
    });
  }
  for (const e of evals) {
    const cur = out.get(e.code.toUpperCase());
    if (cur) cur.result = e.result;
    else out.set(e.code.toUpperCase(), { result: e.result, productId: e.product_id, name: e.name, sourceUrl: null, taken: 0 });
  }
  return out;
}

// Danh sách mã thoả bộ lọc kết quả / chỉ-có-source (null = không lọc theo mã)
export function filterCodes(infos: Map<string, CodeInfo>, result: ResultFilter, onlySource: boolean): string[] | null {
  if (result === "all" && !onlySource) return null;
  const ok = (r: AutoResult | null) =>
    result === "all" ? true : result === "any_win" ? isWinResult(r) : r === result;
  return [...infos.entries()].filter(([, i]) => ok(i.result) && (!onlySource || !!i.sourceUrl)).map(([c]) => c);
}

// ---------- Dữ liệu từng thẻ video ----------

export type CardProduct = {
  key: string; label: string; name: string | null; result: AutoResult | null; productId: string | null;
  sourceUrl: string | null; taken: number; price: number | null; priceKind: "du_kien" | "thuc_te" | null; manual: boolean;
  manualCode: boolean;   // mã SPU gắn tay (social.post_codes) — bỏ gắn được
};

const isMissingTable = (e: { code?: string } | null) => !!e && (e.code === "PGRST205" || e.code === "42P01");

// Mỗi video → các sản phẩm gắn trong đó (mã hashtag + gắn tay), kèm kết quả, link source, giá bán
//   giá bán: "Giá bán dự kiến" R&D đã nhập (không còn lấy giá thực tế từ doanh thu)
export async function cardProducts(posts: { id: string; product_codes: string[] }[], infos: Map<string, CodeInfo>) {
  const postIds = posts.map((p) => p.id);
  const { data: links, error: lErr } = postIds.length ? await sb.social().from("post_links").select("post_id, product_id").in("post_id", postIds) : { data: [], error: null };
  if (lErr && !isMissingTable(lErr)) throw lErr;
  // Mã SPU gắn tay (migration 081); chưa chạy migration thì bỏ qua
  const { data: mcodes, error: mErr } = postIds.length ? await sb.social().from("post_codes").select("post_id, code").in("post_id", postIds) : { data: [], error: null };
  if (mErr && !isMissingTable(mErr)) throw mErr;
  const manualOf = new Set((mcodes ?? []).map((m) => `${m.post_id}|${String(m.code).toUpperCase()}`));
  const linkIds = [...new Set((links ?? []).map((l) => l.product_id as string))];
  const codes = [...new Set(posts.flatMap((p) => p.product_codes.map((c) => c.toUpperCase())))];

  const [byId, byCode] = await Promise.all([
    linkIds.length ? sb.rnd().from("products").select("id, code, st_code, name, source_url, expected_price").in("id", linkIds) : { data: [] },
    codes.length ? sb.rnd().from("products").select("id, code, st_code, name, source_url, expected_price").in("code", codes) : { data: [] },
  ]);
  type Prod = { id: string; code: string | null; st_code: string | null; name: string | null; source_url: string | null; expected_price: number | null };
  const prodById = new Map<string, Prod>();
  const prodByCode = new Map<string, Prod>();
  for (const p of [...(byId.data ?? []), ...(byCode.data ?? [])] as Prod[]) { prodById.set(p.id, p); if (p.code) prodByCode.set(p.code.toUpperCase(), p); }

  // Số lần lấy source của sản phẩm chưa có mã
  const [{ data: ev }] = await Promise.all([
    prodById.size ? sb.rnd().from("product_events").select("product_id").eq("action", "source_taken").in("product_id", [...prodById.keys()]) : { data: [] },
  ]);
  const takenById = new Map<string, number>();
  for (const e of ev ?? []) takenById.set(e.product_id as string, (takenById.get(e.product_id as string) ?? 0) + 1);

  const priceOf = (p: Prod | undefined, code: string | null) => {
    if (p?.expected_price && Number(p.expected_price) > 0) return { price: Number(p.expected_price), kind: "du_kien" as const };
    void code;
    return { price: null, kind: null };
  };

  const linksOf = new Map<string, string[]>();
  for (const l of links ?? []) linksOf.set(l.post_id as string, [...(linksOf.get(l.post_id as string) ?? []), l.product_id as string]);

  const out = new Map<string, CardProduct[]>();
  for (const post of posts) {
    const list: CardProduct[] = [];
    const seen = new Set<string>();
    const add = (code: string | null, prod: Prod | undefined, manual: boolean, manualCode = false) => {
      const id = prod?.id ?? null, key = id ?? code ?? "";
      if (!key || seen.has(key)) return;
      seen.add(key);
      const info = code ? infos.get(code) : undefined;
      const pr = priceOf(prod, code);
      list.push({
        key, label: code ?? prod?.st_code ?? "—", name: prod?.name ?? info?.name ?? null, result: info?.result ?? null, productId: id,
        sourceUrl: prod?.source_url || info?.sourceUrl || null, taken: id ? (takenById.get(id) ?? info?.taken ?? 0) : info?.taken ?? 0,
        price: pr.price, priceKind: pr.kind, manual, manualCode,
      });
    };
    for (const pid of linksOf.get(post.id) ?? []) { const p = prodById.get(pid); if (p) add(p.code?.toUpperCase() ?? null, p, true); }
    for (const c of post.product_codes) { const code = c.toUpperCase(); add(code, prodByCode.get(code), false, manualOf.has(`${post.id}|${code}`)); }
    out.set(post.id, list);
  }
  return out;
}
