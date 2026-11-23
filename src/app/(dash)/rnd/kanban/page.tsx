import Link from "next/link";
import { isRndEditor, requireUser } from "@/lib/session";
import { signImages } from "@/lib/rnd";
import { channelCoverage, getTeams, listPipeline, type BoardCard } from "@/lib/pipeline";
import { getEvaluationsByProduct } from "@/lib/eval/data";
import ResultBadge from "@/components/rnd/ResultBadge";
import {
  APPROVAL_LABELS, PRODUCT_GROUPS, STAGES, STAGE_LABELS, STAGE_NEXT, TASK_STATUS, type Stage,
} from "@/lib/pipeline-constants";
import { fmtDate, fmtInt } from "@/lib/data";
import CodesView from "../CodesView";
import ShowMore from "./ShowMore";

const days = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)) : null);

// Bảng Kanban theo mốc (P0 → P6) + mẫu đã dừng + danh sách mã theo dõi
export default async function PipelineBoardPage({ searchParams }: PageProps<"/rnd/kanban">) {
  const user = await requireUser(["admin", "rnd", "design3d"]);
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const v = one("view");
  const view = v === "codes" || v === "killed" ? v : "board";
  const team = one("team") ?? null;
  const mine = one("mine") === "1";
  const editor = isRndEditor(user);

  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, x] of Object.entries({ view: view === "board" ? null : view, team, mine: mine ? "1" : null, ...patch })) if (x) p.set(k, x);
    return p.size ? `/rnd/kanban?${p}` : "/rnd/kanban";
  };
  const tab = (v: string, label: string) => (
    <Link href={qs({ view: v === "board" ? null : v, status: null })}
      className={`rounded-md px-3 py-1.5 ${view === v ? "bg-accent font-medium text-white" : "text-ink-2 hover:bg-grid"}`}>{label}</Link>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-semibold">Quy trình theo mốc</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-line bg-surface p-1 text-sm">
            {tab("board", "Kanban")}{tab("killed", "Đã dừng")}{tab("codes", "Mã theo dõi")}
          </div>
        </div>
      </div>

      {view === "codes" ? <CodesView filter={one("status")} canEdit={editor} />
        : <Board team={team} mine={mine ? user.id : null} killed={view === "killed"} qs={qs} />}
    </div>
  );
}

async function Board({ team, mine, killed, qs }: {
  team: string | null; mine: string | null; killed: boolean; qs: (p: Record<string, string | null>) => string;
}) {
  const [items, teams] = await Promise.all([listPipeline({ team, mine, killed }), getTeams()]);
  const p4Codes = items.filter((i) => i.stage === "p4" && i.code).map((i) => i.code!);
  const [images, evals, cover] = await Promise.all([
    signImages(items.map((i) => i.image_paths[0]).filter(Boolean)),
    getEvaluationsByProduct(items.filter((i) => i.stage === "p4" || i.stage === "p5").map((i) => i.id)),
    channelCoverage(p4Codes),
  ]);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const byStage = new Map<Stage, BoardCard[]>(STAGES.map((s) => [s, []]));
  for (const i of items) byStage.get(i.stage)?.push(i);

  const chip = (active: boolean) => `rounded-md px-2.5 py-1 ${active ? "bg-accent text-white" : "text-ink-2 hover:bg-grid"}`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
          <Link href={qs({ team: null })} className={chip(!team)}>Mọi team</Link>
          {teams.filter((t) => t.is_active).map((t) => <Link key={t.id} href={qs({ team: t.id })} className={chip(team === t.id)}>{t.name}</Link>)}
        </div>
        <Link href={qs({ mine: mine ? null : "1" })} className={`rounded-lg border px-3 py-1.5 ${mine ? "border-accent text-accent" : "border-line text-ink-2"}`}>
          {mine ? "✓ " : ""}Mẫu tôi sưu tầm
        </Link>
        <span className="text-ink-muted">{fmtInt(items.length)} mẫu</span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-ink-2">
          {killed ? "Không có mẫu nào bị dừng." : "Chưa có mẫu nào trong quy trình. Bấm “Sưu tầm mẫu” để bắt đầu."}
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
          <div className="grid min-w-[1400px] grid-cols-7 gap-3">
            {STAGES.map((s) => (
              <div key={s} className="flex flex-col gap-2 rounded-xl bg-page p-2">
                <div className="flex items-center justify-between px-1" title={`Bước kế: ${STAGE_NEXT[s]}`}>
                  <span className="text-sm font-semibold">{STAGE_LABELS[s]}</span>
                  <span className="text-xs text-ink-muted">{byStage.get(s)!.length}</span>
                </div>
                {s === "p4" && cover.channels.length > 0 && (() => {
                  // Gọn: chỉ liệt kê kênh ĐÃ có video (nhiều → ít); kênh chưa có video gộp vào một mục thu gọn (hàng chục kênh toàn 0/N làm cột dài vô ích)
                  const total = byStage.get("p4")!.length;
                  const rows = cover.channels.map((c) => ({ c, on: byStage.get("p4")!.filter((i) => i.code && cover.posted.get(i.code)?.has(c.id)).length }));
                  const used = rows.filter((r) => r.on > 0).sort((x, y) => y.on - x.on || x.c.name.localeCompare(y.c.name, "vi"));
                  const idle = rows.filter((r) => r.on === 0);
                  return (
                    <details className="rounded-lg border border-line bg-surface px-2 py-1.5 text-2xs text-ink-2">
                      <summary className="flex cursor-pointer select-none items-baseline justify-between gap-2 hover:text-accent">
                        <span className="font-medium text-ink-1">Đã lên video theo kênh</span>
                        <span title="Số kênh đã có video / tổng số kênh">{used.length}/{rows.length} kênh</span>
                      </summary>
                      <div className="mt-1.5 space-y-1">
                        {used.length === 0 && <div className="text-ink-muted">Chưa kênh nào có video.</div>}
                        {used.map(({ c, on }) => <div key={c.id} className="flex justify-between gap-2"><span className="truncate" title={c.name}>{c.name}</span><span className="font-medium tabular-nums text-ink-1">{on}/{total}</span></div>)}
                        {idle.length > 0 && (
                          <details className="border-t border-line pt-1">
                            <summary className="cursor-pointer select-none text-ink-muted hover:text-accent">{idle.length} kênh chưa có video</summary>
                            <div className="mt-1 space-y-0.5">{idle.map(({ c }) => <div key={c.id} className="truncate text-ink-muted" title={c.name}>{c.name}</div>)}</div>
                          </details>
                        )}
                      </div>
                    </details>
                  );
                })()}
                <ShowMore>{byStage.get(s)!.map((i) => {
                  const img = i.image_paths[0] ? images[i.image_paths[0]] : null;
                  const age = days(i.stage_at);
                  const status =
                    i.stage === "p0" ? i.approval && APPROVAL_LABELS[i.approval]
                    : i.stage === "p1" ? "Chờ bắt đầu sản xuất"
                    : i.stage === "p2" ? (i.design && i.design.status !== "done" && !i.sample ? `3D: ${TASK_STATUS[i.design.status]}`
                      : i.sample ? i.sample.status : "Chưa vẽ 3D")
                    : i.stage === "p3" ? (i.media && i.media.total > 0 && i.media.passed === i.media.total ? "Đã quay" : "Chưa quay")
                    : i.stage === "p4" ? (i.code ? null : "Chưa gắn SPU")
                    : i.stage === "p6" ? (i.win_qty ? `SL sản xuất ${fmtInt(i.win_qty)}` : "Đã duyệt thương mại hoá")
                    : null;
                  const warn = (i.stage === "p0" && i.approval === "rejected") || i.design?.status === "redo";
                  return (
                    <Link key={i.id} href={`/rnd/${i.id}`} className="block space-y-1.5 rounded-lg border border-line bg-surface p-2 hover:border-accent">
                      {/* Ảnh chiếm 1/3 bề rộng thẻ (bên TRÁI), chữ chiếm 2/3 (bên PHẢI) */}
                      <div className="grid grid-cols-3 items-start gap-2.5">
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element -- URL ký tạm thời của Storage
                          <img src={img} alt="" loading="lazy" className="aspect-square w-full rounded-md bg-page object-cover" />
                        ) : <div className="flex aspect-square w-full items-center justify-center rounded-md bg-page text-3xl text-ink-muted">💍</div>}
                        <div className="col-span-2 min-w-0">
                          <div className="truncate text-2xs text-ink-muted">{i.st_code}{i.code ? ` · #${i.code}` : ""}</div>
                          <div className="line-clamp-3 text-sm font-semibold leading-snug">{i.name}</div>
                        </div>
                      </div>
                      {status && <div className={`truncate text-2xs ${warn ? "text-warn-ink" : "text-ink-2"}`}>{status}</div>}
                      {(i.stage === "p4" || i.stage === "p5") && (
                        <div className="flex items-center gap-1.5 text-2xs text-ink-2">
                          {evals[i.id] && <ResultBadge result={evals[i.id].result} size="xs" />}
                          {i.stage === "p4" && cover.channels.length > 0 && (
                            <span title={cover.channels.map((c) => `${i.code && cover.posted.get(i.code)?.has(c.id) ? "✓" : "✗"} ${c.name}`).join(", ")}>
                              {i.code && cover.posted.get(i.code)?.size ? `${cover.posted.get(i.code)!.size}/${cover.channels.length} kênh` : "Chưa lên video"}
                            </span>
                          )}
                          {evals[i.id] && <span className="text-ink-muted" title="Số ngày kể từ video đầu">ngày {evals[i.id].days_elapsed}</span>}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-1 text-2xs text-ink-muted">
                        <span className="truncate" title={`${i.creator ?? "?"}${i.product_group ? ` · ${PRODUCT_GROUPS[i.product_group]}` : ""}`}>
                          {(i.team_id && teamName.get(i.team_id)) || i.creator || "?"}
                        </span>
                        {killed ? <span title={i.kill_reason ?? ""}>⛔ {i.killed_at ? fmtDate(i.killed_at) : ""}</span>
                          : age !== null && <span className={age > 7 && s !== "p6" ? "text-warn-ink" : ""} title="Số ngày ở mốc này">{age}n</span>}
                      </div>
                    </Link>
                  );
                })}</ShowMore>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
