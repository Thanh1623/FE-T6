import "server-only";
import { sb } from "@/lib/supabase/admin";
import { canApprove, type CurrentUser } from "@/lib/session";
import { combine, mergeScoreCfg, type Card, type RowScore, type ScoreCfg } from "@/lib/rnd-score-calc";

// Phần máy chủ của bảng chấm điểm mẫu sưu tầm (thiết kế + luật: src/lib/rnd-score-calc.ts, migration 065).
// CHẤM MÙ: điểm của người khác chỉ trả cho người ĐÃ CHẤM mẫu đó, và cho Quản lý / trưởng team (người duyệt).
export const SCORE_KEY = "rnd_scorecard";   // core.settings

export async function loadScoreCfg(): Promise<ScoreCfg> {
  const { data } = await sb.core().from("settings").select("value").eq("key", SCORE_KEY).maybeSingle();
  return mergeScoreCfg(data?.value);
}

type CardRow = Card & { product_id: string };
// null = chưa chạy migration 065 (chưa có bảng) → tính năng chấm điểm tắt, mọi thứ chạy như cũ
export async function loadCards(productIds?: string[]): Promise<CardRow[] | null> {
  let q = sb.rnd().from("scorecards").select("product_id, scorer_id, scores, notes, fatal, total, updated_at");
  if (productIds) q = q.in("product_id", productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data, error } = await q;
  if (error) return null;
  return (data ?? []) as CardRow[];
}

// Người này được thấy điểm của mẫu không?
export const canSeeScore = (user: CurrentUser, teamId: string | null, cards: Card[]) =>
  canApprove(user, teamId) || cards.some((c) => c.scorer_id === user.id);

// Tóm tắt cho dòng bảng / thẻ: số người đã chấm (công khai), bạn đã chấm chưa, đạt hay không (chỉ khi được thấy)
export function rowScoreFor(user: CurrentUser, teamId: string | null, cards: Card[], cfg: ScoreCfg): { score: number | null; row: RowScore } {
  const mine = cards.some((c) => c.scorer_id === user.id);
  const seen = canSeeScore(user, teamId, cards);
  const all = combine(cards, cfg);
  return {
    score: seen && all ? all.total : null,
    row: {
      n: cards.length, mine, min: cfg.minScorers, passed: seen && all && cards.length >= cfg.minScorers ? all.passed : null,
      bypass: user.role === "admin",
      block: seen && !!all && cards.length >= cfg.minScorers && !all.passed && user.role !== "admin",
    },
  };
}

// Cổng duyệt (dùng ở mọi đường duyệt): đủ số người chấm; mẫu "Không đạt" chỉ Quản lý (admin) được duyệt
export async function assertCanApprove(productId: string, user: CurrentUser) {
  const [cfg, cards] = await Promise.all([loadScoreCfg(), loadCards([productId])]);
  if (!cards) return;   // chưa chạy migration 065: không chặn
  if (!cards.some((c) => c.scorer_id === user.id) && user.role !== "admin") throw new Error("Bạn cần chấm điểm mẫu này trước khi duyệt");   // người chưa chấm không duyệt được (Quản lý ngoại lệ)
  if (cards.length < cfg.minScorers) throw new Error(`Cần ít nhất ${cfg.minScorers} người chấm điểm trước khi duyệt (hiện ${cards.length}/${cfg.minScorers})`);
  const all = combine(cards, cfg)!;
  if (!all.passed && user.role !== "admin") throw new Error("Mẫu chưa đạt bảng chấm điểm — chỉ Quản lý được duyệt");   // không nêu lý do / điểm: giữ chấm mù với người chưa chấm
}
