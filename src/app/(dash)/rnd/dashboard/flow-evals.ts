import "server-only";
import { sb } from "@/lib/supabase/admin";
import { listEvaluations, type Evaluation } from "@/lib/eval/data";
import { isSystemTestCode } from "@/lib/tags";
import type { Filters } from "@/lib/data";

// Kết quả đánh giá của MỌI mã đã qua bộ lọc dashboard (khoảng ngày theo video đầu · team · Page), chỉ mẫu mới, chia theo luồng:
//   rnd   = mẫu đã vào quy trình R&D (có mốc P0–P6)
//   media = mã SPU test (Media tự test, kể cả mẫu test đã được R&D nhận vào)
//   both  = hợp của hai luồng, mỗi mã một lần (dùng cho cảnh báo gộp ở Tổng quan)
export async function loadFlowEvals(f: Pick<Filters, "from" | "to" | "scope" | "teams">) {
  const [all, { data: people }] = await Promise.all([listEvaluations({ age: "new", from: f.from, to: f.to }), sb.core().from("profiles").select("id, team_id")]);
  const teamByUser = new Map((people ?? []).map((p) => [p.id as string, (p.team_id as string | null) ?? null]));
  // Team của mã = team của mẫu; chưa có thì team của người tạo mã
  const teamOf = (e: Evaluation) => e.product?.team_id ?? teamByUser.get((e.product as { created_by?: string | null } | null)?.created_by ?? "") ?? null;
  const pageScope = f.scope === "all" || f.scope === "mine" ? null : f.scope.split(",");
  const kept = all.filter((e) =>
    e.age === "new" && e.first_post_date >= f.from && e.first_post_date <= f.to
    && (!f.teams.length || f.teams.includes(teamOf(e) ?? ""))
    && (!pageScope || e.videos.some((v) => pageScope.includes(v.channel_id))));
  const rnd = kept.filter((e) => !!e.product?.stage);
  const media = kept.filter((e) => isSystemTestCode(e.code, (e.product as { created_by?: string | null } | null)?.created_by));   // chỉ mã test tạo trên hệ thống
  const seen = new Set<string>();
  const both = [...rnd, ...media].filter((e) => (seen.has(e.code) ? false : (seen.add(e.code), true)));
  return { rnd, media, both };
}
