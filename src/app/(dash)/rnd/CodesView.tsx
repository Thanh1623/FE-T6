import Link from "next/link";
import RndStats from "@/components/rnd/RndStats";
import { RND_STATUS, getCardStats, listRndProducts, signImages } from "@/lib/rnd";
import { latestSessions, listGoals } from "@/lib/kpi";
import { RESULT_LABELS } from "@/lib/kpi-constants";
import ResultBadge from "@/components/rnd/ResultBadge";
import { getEvaluationsByProduct } from "@/lib/eval/data";
import { fmtDate, fmtInt, getProductInfo, todayVN } from "@/lib/data";

const STATUS_STYLE: Record<string, string> = {
  researching: "bg-grid text-ink-2",
  testing: "bg-accent text-white",
  ended: "bg-ink-1 text-page",
};

// Tab "Mã theo dõi": mọi mã có hashtag (mẫu R&D đã gắn SPU + mã hệ thống tự nhận từ bài đăng), kèm đánh giá
export default async function CodesView({ filter, canEdit }: { filter?: string; canEdit: boolean }) {
  const products = await listRndProducts(filter);
  const [stats, images, catalog, sessions, goals] = await Promise.all([
    getCardStats(products),
    signImages(products.map((p) => p.image_paths[0]).filter(Boolean)),
    getProductInfo(products.map((p) => p.sapo_code ?? p.code)),
    latestSessions(products.map((p) => p.id)),
    listGoals(true),
  ]);
  const evals = await getEvaluationsByProduct(products.map((p) => p.id));
  const goalName = (c: string) => goals.find((g) => g.code === c)?.name ?? c;
  const dayOf = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  const today = todayVN();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-2">{fmtInt(products.length)} mã{filter ? ` · ${RND_STATUS[filter as keyof typeof RND_STATUS] ?? ""}` : ""}</p>
        <div className="flex gap-1 rounded-lg border border-line bg-surface p-1 text-sm">
          <Link href="/rnd/kanban?view=codes" className={`rounded-md px-3 py-1.5 ${!filter ? "bg-accent text-white" : "text-ink-2 hover:bg-grid"}`}>Tất cả</Link>
          {Object.entries(RND_STATUS).map(([k, label]) => (
            <Link key={k} href={`/rnd/kanban?view=codes&status=${k}`}
              className={`rounded-md px-3 py-1.5 ${filter === k ? "bg-accent text-white" : "text-ink-2 hover:bg-grid"}`}>{label}</Link>
          ))}
        </div>
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-ink-2">
          Chưa có mã nào{filter ? " ở trạng thái này" : ""}.{canEdit && !filter && " Mã xuất hiện khi bài đăng gắn hashtag mã sản phẩm."}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {products.map((p) => {
            const img = p.image_paths[0] ? images[p.image_paths[0]] : null;
            const inStock = catalog[(p.sapo_code ?? p.code).toUpperCase()];
            const meta = [p.category, p.material, p.stone].filter(Boolean).join(" · ");
            return (
              <Link key={p.id} href={`/rnd/${p.id}`} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-2.5 hover:border-accent"
                title={`${p.name}${p.line ? ` · Line ${p.line}` : ""} · ${inStock ? "có trên Sapo" : "chưa có trên Sapo"} · cập nhật ${fmtDate(p.updated_at)}${p.created_by_name ? ` · ${p.created_by_name}` : ""}`}>
                <div className="flex gap-2.5">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL ký tạm thời của Storage
                    <img src={img} alt="" className="h-14 w-14 flex-none rounded-lg object-cover" />
                  ) : <div className="flex h-14 w-14 flex-none items-center justify-center rounded-lg bg-page text-xl text-ink-muted">💍</div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="truncate text-sm font-semibold">#{p.code}{evals[p.id]?.age === "old" && <span className="font-normal text-ink-muted"> · cũ</span>}</span>
                      {p.confirmed_result
                        ? <span className="flex flex-none items-center gap-0.5" title="R&D đã xác nhận">
                            <ResultBadge result={p.confirmed_result} size="xs" />✓
                          </span>
                        : evals[p.id]
                        ? <ResultBadge result={evals[p.id].result} size="xs" />
                        : <span className={`flex-none rounded-md px-1.5 py-0.5 text-2xs ${STATUS_STYLE[p.status]}`}>{RND_STATUS[p.status]}</span>}
                    </div>
                    <div className="truncate text-sm">{p.name}</div>
                    <div className="truncate text-2xs text-ink-muted">{meta || "—"}{!inStock && " · chưa lên Sapo"}</div>
                    {evals[p.id]?.forecast && !sessions[p.id] && (
                      <div className="flex items-center gap-1 truncate text-2xs text-ink-2">
                        dự kiến <ResultBadge result={evals[p.id].forecast!.predicted} size="xs" /> · còn {evals[p.id].forecast!.days_left} ngày
                      </div>
                    )}
                    {sessions[p.id] && (() => {
                      const ss = sessions[p.id];
                      return (
                        <div className="truncate text-2xs text-ink-2">
                          🎯 {goalName(ss.goal_code)} ·{" "}
                          {ss.status === "running"
                            ? `ngày ${Math.min(Math.max(dayOf(ss.start_date, today), 0), dayOf(ss.start_date, ss.end_date))}/${dayOf(ss.start_date, ss.end_date)}`
                            : ss.result ? <b>{RESULT_LABELS[ss.result]}</b> : "chờ xác nhận"}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <RndStats s={stats[p.code]} today={today} compact />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
