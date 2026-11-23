"use server";

import { attempt } from "@/lib/action-result";
import { profileNames, requireActionUser } from "@/lib/session";
import { sb } from "@/lib/supabase/admin";
import { logEvent, revalidateRnd } from "@/lib/rnd-flow";
import { PRODUCT_GROUPS } from "@/lib/pipeline-constants";
import { signImages, signThumbs } from "@/lib/rnd";
import { canSeeScore, loadCards, loadScoreCfg } from "@/lib/rnd-score";
import { combine, spreadIds, verdictOf, type Card, type ScoreCfg, type Scores, type Verdict } from "@/lib/rnd-score-calc";

// Chấm điểm mẫu sưu tầm (thiết kế: src/lib/rnd-score-calc.ts). Ai có quyền xem bảng Sưu tầm đều chấm được; chấm mù — chỉ thấy điểm người khác sau khi đã chấm.
export type ScoreView = {
  cfg: ScoreCfg;
  product: {
    id: string; st_code: string | null; name: string; locked: boolean;   // locked: mẫu đã duyệt / từ chối / dừng → không chấm nữa
    images: { url: string; thumb?: string }[]; info: {
      line: string | null; material: string | null; stone: string[] | string | null; description: string | null;
      refUrl: string | null; refPlatform: string | null; refMetrics: string | null; priceRef: number | null; expectedCost: number | null; expectedPrice: number | null;
      group: string | null; source: string | null; createdAt: string | null; collector: string | null;   // thông tin sưu tầm hiện ở cột trái cửa sổ chấm điểm
    };
  };
  mine: Card | null;
  count: number;                                       // số người đã chấm (công khai)
  visible: boolean;                                    // được xem điểm người khác (đã chấm, hoặc là người duyệt)
  others: (Card & { name: string })[];                 // chỉ khi visible
  combined: (Verdict & { n: number; avg: Scores; spread: string[] }) | null;
};

async function product(id: string) {
  const { data } = await sb.rnd().from("products").select("id, st_code, name, stage, approval, team_id, killed_at, image_paths, line, material, stone, description, ref_url, ref_platform, ref_metrics, price_ref, expected_cost, expected_price, product_group, source_status, created_at, created_by").eq("id", id).maybeSingle();
  if (!data?.stage) throw new Error("Không tìm thấy mẫu trong quy trình R&D");
  return data as { id: string; st_code: string | null; name: string; stage: string; approval: string | null; team_id: string | null; killed_at: string | null; image_paths: string[] | null; line: string[] | string | null; material: string | null; stone: string | null; description: string | null;
    ref_url: string | null; ref_platform: string | null; ref_metrics: string | null; price_ref: number | null; expected_cost: number | null; expected_price: number | null; product_group: keyof typeof PRODUCT_GROUPS | null; source_status: string | null; created_at: string | null; created_by: string | null };
}

export async function getScoreView(productId: string) {
  return attempt(async (): Promise<ScoreView> => {
    const user = await requireActionUser();
    const [p, cfg, cards] = await Promise.all([product(productId), loadScoreCfg(), loadCards([productId])]);
    if (!cards) throw new Error("Chưa chạy migration 065 (bảng chấm điểm) trong Supabase");
    const visible = canSeeScore(user, p.team_id, cards);
    const names = visible ? await profileNames(cards.map((c) => c.scorer_id)) : new Map<string, string>();
    const others = visible ? cards.filter((c) => c.scorer_id !== user.id).map((c) => ({ ...c, name: names.get(c.scorer_id) ?? "—" })) : [];
    const all = visible ? combine(cards, cfg) : null;
    const paths = (p.image_paths ?? []).slice(0, 8);
    const [signed, thumbs, collector] = await Promise.all([signImages(paths), signThumbs(paths), profileNames([p.created_by])]);
    const money = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
    return {
      cfg, count: cards.length, visible, others,
      product: {
        id: p.id, st_code: p.st_code, name: p.name, locked: p.stage !== "p0" || p.approval === "approved" || p.approval === "rejected" || !!p.killed_at,
        images: paths.filter((x) => signed[x]).map((x) => ({ url: signed[x], ...(thumbs[x] ? { thumb: thumbs[x] } : {}) })),
        info: { line: Array.isArray(p.line) ? p.line.join(", ") || null : p.line, material: p.material, stone: Array.isArray(p.stone) ? p.stone.join(", ") || null : p.stone, description: p.description,
          refUrl: p.ref_url, refPlatform: p.ref_platform, refMetrics: p.ref_metrics, priceRef: money(p.price_ref), expectedCost: money(p.expected_cost), expectedPrice: money(p.expected_price),
          group: p.product_group ? PRODUCT_GROUPS[p.product_group] ?? null : null, source: p.source_status, createdAt: p.created_at, collector: p.created_by ? collector.get(p.created_by) ?? null : null },
      },
      mine: cards.find((c) => c.scorer_id === user.id) ?? null,
      combined: all ? { ...all, spread: spreadIds(cards, cfg) } : null,
    };
  });
}

export async function saveScore(productId: string, scores: Scores, note: string, fatal: boolean) {
  return attempt(async () => {
    const user = await requireActionUser();
    const [p, cfg] = await Promise.all([product(productId), loadScoreCfg()]);
    if (p.stage !== "p0" || p.approval === "approved" || p.approval === "rejected" || p.killed_at) throw new Error("Mẫu đã duyệt / từ chối / dừng — không chấm điểm nữa");
    const clean: Scores = {};
    const text = String(note ?? "").trim().slice(0, 1000);
    for (const c of cfg.criteria) {
      const v = Number(scores[c.id]);
      if (!Number.isInteger(v) || v < 0 || v > 5) throw new Error(`Chấm đủ điểm 0–5 cho “${c.name}”`);
      clean[c.id] = v;
    }
    if (!text && cfg.criteria.some((c) => clean[c.id] <= 1)) throw new Error("Có tiêu chí chấm 0–1 điểm — ghi lý do ở ô Nhận xét / Ghi chú");
    const v = verdictOf(clean, cfg, fatal);
    const { error } = await sb.rnd().from("scorecards").upsert({
      product_id: productId, scorer_id: user.id, scores: clean, notes: text ? { all: text } : {}, fatal, total: v.total, passed: v.passed, cfg, updated_at: new Date().toISOString(),
    }, { onConflict: "product_id,scorer_id" });
    if (error) throw new Error(error.message);
    await logEvent(productId, user.id, "scored");   // KHÔNG ghi điểm vào nhật ký (nhật ký ai cũng xem — chấm mù)
    revalidateRnd(productId);
  });
}
