import Paged from "@/components/Paged";
import PostThumb from "@/components/PostThumb";
import Link from "next/link";
import HandoffActions, { AssignForm, NewRequestForm } from "@/components/saobien/HandoffActions";
import ResultBadge from "@/components/rnd/ResultBadge";
import { requireUser } from "@/lib/session";
import { canAssignHandoff, canSeeHandoff, canWorkHandoff, listHandoffs, type Handoff, type HandoffStatus } from "@/lib/handoff";
import { signImages } from "@/lib/rnd";
import { sb } from "@/lib/supabase/admin";
import { fmtInt, todayVN } from "@/lib/data";
import { STAGE_LABELS, stageIndex, type Stage } from "@/lib/pipeline-constants";

// Trang "Đẩy mẫu ĐVKD": team R&D (hoặc Quản lý) giao mẫu cho team khác lên video. Team nhận tiếp nhận / từ chối,
// báo "Đã lên video", cuối cùng hoàn thành — và xem danh sách các video team đã lên cho mẫu đó.
type TabId = "unassigned" | HandoffStatus;
const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: "unassigned", label: "Chờ phân công", hint: "Mẫu đã có phiếu nhưng chưa giao cho team nào" },
  { id: "pending", label: "Chờ tiếp nhận", hint: "Đã giao, team nhận chưa trả lời" },
  { id: "received", label: "Đã tiếp nhận", hint: "Team nhận đã nhận việc, chưa lên video" },
  { id: "developing", label: "Đã lên video", hint: "Team đã bắt đầu lên video — xem các video đã lên" },
  { id: "done", label: "Danh sách video", hint: "Việc đã hoàn thành — danh sách video team đã lên cho mẫu" },
  { id: "returned", label: "Từ chối", hint: "Team nhận từ chối hoặc team giao huỷ — giao lại được cho team khác" },
];
const ACTION_TEXT: Record<string, string> = {
  created: "tạo phiếu giao việc", assigned: "giao cho", received: "tiếp nhận", developing: "báo đã lên video", done: "hoàn thành",
  returned: "từ chối", cancelled: "huỷ giao việc",
};
const dm = (d: string) => new Date(d).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
const tabOf = (h: Handoff): TabId => (h.status === "pending" && !h.team_id ? "unassigned" : h.status);

type Video = { id: string; channel_id: string; published_at: string; permalink_url: string | null; thumbnail_url: string | null; views: number; message: string | null };

export default async function SaoBienPage({ searchParams }: PageProps<"/sample-push">) {
  const user = await requireUser();
  const { tab } = await searchParams;
  const current = (TABS.some((t) => t.id === tab) ? tab : "pending") as TabId;
  const all = (await listHandoffs()).filter((h) => canSeeHandoff(user, h));
  const list = all.filter((h) => tabOf(h) === current);
  const images = await signImages(list.map((h) => h.product?.image_paths[0]).filter(Boolean) as string[]);

  const [{ data: teamsRaw }, { data: chRaw }] = await Promise.all([
    sb.core().from("teams").select("id, name").eq("is_active", true).order("name"),
    sb.social().from("channels").select("id, name, team_id").eq("is_active", true),
  ]);
  const teams = (teamsRaw ?? []) as { id: string; name: string }[];
  const chName = new Map((chRaw ?? []).map((c) => [c.id as string, c.name as string]));
  const chTeam = new Map((chRaw ?? []).map((c) => [c.id as string, c.team_id as string | null]));

  // Video team đã lên cho từng mẫu: bài video / reel gắn mã mẫu, đăng ở Page của team được giao, từ ngày giao việc
  const codes = [...new Set(list.filter((h) => h.status === "developing" || h.status === "done").map((h) => h.product?.code).filter(Boolean) as string[])];
  const videosOf = new Map<string, Video[]>();
  if (codes.length) {
    const { data: posts } = await sb.social().from("posts")
      .select("id, channel_id, published_at, kind, product_codes, permalink_url, thumbnail_url, views, message").overlaps("product_codes", codes).in("kind", ["video", "reel"]).order("published_at", { ascending: false });
    for (const h of list) {
      if ((h.status !== "developing" && h.status !== "done") || !h.product?.code) continue;
      videosOf.set(h.id, ((posts ?? []) as (Video & { product_codes: string[] })[]).filter((p) =>
        p.product_codes.includes(h.product!.code) && !!h.team_id && chTeam.get(p.channel_id) === h.team_id && p.published_at >= h.created_at));
    }
  }

  // Mẫu có thể giao (từ P3 trở đi, chưa dừng, chưa có phiếu đang mở) cho người được phân công
  const canCreate = user.role === "admin" || user.role === "rnd";
  const open = new Set(all.filter((h) => h.status !== "returned").map((h) => h.product_id));
  let products: { id: string; label: string; teamId: string | null }[] = [];
  if (canCreate) {
    const { data } = await sb.rnd().from("products").select("id, st_code, code, name, stage, team_id").in("stage", ["p3", "p4", "p5", "p6"]).is("killed_at", null).order("created_at", { ascending: false });
    products = (data ?? []).filter((p) => !open.has(p.id as string) && canAssignHandoff(user, (p.team_id as string | null) ?? null))
      .map((p) => ({ id: p.id as string, teamId: (p.team_id as string | null) ?? null,
        label: `${p.st_code ?? p.code ?? "—"} · ${p.name} · ${STAGE_LABELS[p.stage as Stage]?.slice(0, 2) ?? ""}` }));
  }
  const today = todayVN();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold">🎬 Đẩy mẫu ĐVKD</h1>
          <p className="max-w-2xl text-sm text-ink-2">
            Quản lý hoặc team R&amp;D giao mẫu (từ P3 trở đi) cho team khác lên video. Team nhận tiếp nhận hoặc từ chối (kèm lý do), lên video rồi báo hoàn thành.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {user.role === "admin" && <Link href="/sample-push/overview" className="rounded-lg border border-accent px-4 py-2 text-sm font-medium text-accent hover:bg-accent/10">📊 Tổng quan giao mẫu</Link>}
          {canCreate && products.length > 0 && <NewRequestForm products={products} teams={teams} />}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1 text-sm">
        {TABS.map((t) => {
          const n = all.filter((h) => tabOf(h) === t.id).length;
          return (
            <Link key={t.id} href={`/sample-push?tab=${t.id}`} title={t.hint}
              className={`rounded-md px-3 py-1.5 ${current === t.id ? "bg-accent text-white" : "text-ink-2 hover:bg-grid"}`}>
              {t.label} <span className="opacity-70">({n})</span>
            </Link>
          );
        })}
      </div>
      <p className="text-xs text-ink-muted">{TABS.find((t) => t.id === current)?.hint}.</p>

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-ink-2">Không có mẫu nào ở bước này.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Paged as="block" size={24} barClass="col-span-full" resetKey={String(tab ?? "")}>{list.map((h) => {
            const m = h.snapshot.metrics ?? {};
            const hasMetrics = Object.keys(m).length > 0;
            const img = h.product?.image_paths[0] ? images[h.product.image_paths[0]] : null;
            const stage = h.product?.stage as Stage | null | undefined;
            const late = !!h.deadline && h.deadline < today && h.status !== "done" && h.status !== "returned";
            const vids = videosOf.get(h.id);
            const canAssign = canAssignHandoff(user, h.product?.team_id ?? null);
            const canWork = canWorkHandoff(user, h.team_id);
            return (
              <article key={h.id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3">
                <div className="flex gap-3">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL ký tạm thời của Storage
                    <img src={img} alt="" className="h-16 w-16 flex-none rounded-lg object-cover" />
                  ) : <div className="flex h-16 w-16 flex-none items-center justify-center rounded-lg bg-page text-xl">💍</div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/rnd/${h.product_id}`} className="truncate font-semibold hover:underline">#{h.product?.code}</Link>
                      {h.result ? <ResultBadge result={h.result} size="xs" />
                        : stage && stageIndex(stage) >= 0 && <span className="rounded-md bg-grid px-2 py-0.5 text-2xs font-medium text-ink-2">{STAGE_LABELS[stage]}</span>}
                    </div>
                    <div className="truncate text-sm">{h.product?.name}</div>
                    <div className="truncate text-xs text-ink-muted">
                      {[h.product?.line, h.product?.category, h.product?.material, h.product?.stone].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                </div>

                {/* Giao cho ai · hạn · yêu cầu */}
                <div className="space-y-1 rounded-lg bg-page p-2 text-xs">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>Giao cho: {h.teamName ? <b className="text-accent">{h.teamName}</b> : <span className="text-warn-ink">chưa phân công</span>}</span>
                    {h.deadline && <span className={late ? "font-semibold text-bad" : "text-ink-2"}>Hạn {dm(h.deadline)}{late ? " · quá hạn" : ""}</span>}
                  </div>
                  {h.rnd_note ? <div className="text-ink-2">💬 Yêu cầu: {h.rnd_note}</div> : <div className="text-ink-muted">Chưa có yêu cầu cụ thể.</div>}
                  {h.status === "returned" && h.saobien_note && <div className="text-bad">✕ Lý do từ chối: {h.saobien_note}</div>}
                  {h.status !== "returned" && h.saobien_note && <div className="text-ink-2">📝 Team nhận: {h.saobien_note}</div>}
                </div>

                {hasMetrics && (
                  <div className="tabular grid grid-cols-3 gap-2 rounded-lg bg-page p-2 text-xs">
                    {([["Lượt xem", fmtInt(Number(m.views ?? 0))], ["Người xem", fmtInt(Number(m.viewers ?? 0))], ["SL bán", fmtInt(Number(m.qty_net ?? 0))],
                      ["Chuyển đổi", m.conversion == null ? "–" : `${Number(m.conversion).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`],
                      ["CTR", m.ctr == null ? "–" : `${Number(m.ctr).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`]] as const).map(([l, v]) => (
                      <div key={l}><div className="text-2xs uppercase text-ink-muted">{l}</div><div className="font-semibold">{v}</div></div>
                    ))}
                  </div>
                )}

                {h.source_url ? (
                  <a href={h.source_url} target="_blank" rel="noreferrer"
                    className="rounded-lg border border-accent px-3 py-2 text-center text-sm font-medium text-accent hover:bg-accent hover:text-white">
                    📁 Mở kho Source
                  </a>
                ) : <div className="rounded-lg border border-dashed border-line px-3 py-2 text-center text-xs text-ink-muted">Mẫu chưa có link kho Source</div>}

                {/* Video team đã lên cho mẫu (tab "Đã lên video" và "Danh sách video") */}
                {vids && (
                  <div>
                    <div className="mb-1 flex items-center gap-2 text-2xs font-bold uppercase tracking-wide text-ink-muted">
                      Video team đã lên <span className="rounded-md bg-accent/10 px-1.5 text-accent tabular-nums">{vids.length}</span>
                    </div>
                    {vids.length ? (
                      <ul className="space-y-1">
                        {vids.map((v) => (
                          <li key={v.id}>
                            <a href={v.permalink_url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md border border-line p-1.5 text-xs hover:border-accent">
                              <PostThumb src={v.thumbnail_url} className="h-10 w-10 flex-none rounded" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate">{v.message?.replace(/#[\p{L}\p{N}_]+/gu, "").trim() || "(không có nội dung)"}</span>
                                <span className="block truncate text-2xs text-ink-muted">{chName.get(v.channel_id) ?? "—"} · {dm(v.published_at)}</span>
                              </span>
                              <span className="flex-none tabular-nums font-semibold text-accent">{fmtInt(Number(v.views))}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="rounded-md bg-page px-2.5 py-2 text-xs text-ink-muted">Chưa có video nào gắn mã #{h.product?.code} ở Page của team {h.teamName ?? "nhận việc"} từ ngày giao.</p>}
                  </div>
                )}

                {/* Phân công / giao lại (team giao) · tiếp nhận, từ chối, lên video (team nhận) */}
                {canAssign && (tabOf(h) === "unassigned" || h.status === "returned") && (
                  <AssignForm id={h.id} teams={teams.filter((t) => t.id !== h.product?.team_id)} again={h.status === "returned"} />
                )}
                <HandoffActions id={h.id} status={h.status} canAct={canWork && !!h.team_id} />
                {!canWork && !!h.team_id && (h.status === "pending" || h.status === "received" || h.status === "developing") && (
                  <p className="rounded-md bg-page px-2.5 py-1.5 text-xs text-ink-2">⏳ Chờ team <b>{h.teamName}</b> {h.status === "pending" ? "tiếp nhận hoặc từ chối" : h.status === "received" ? "lên video" : "hoàn thành"} — chỉ thành viên team đó thao tác được.</p>
                )}

                <details className="text-xs text-ink-muted">
                  <summary className="cursor-pointer">
                    Tạo {dm(h.created_at)} bởi {h.creator?.full_name ?? "?"}{h.assignee && ` · phụ trách: ${h.assignee.full_name}`}
                  </summary>
                  <ul className="mt-1 space-y-0.5">
                    {[...(h.events ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((e) => (
                      <li key={e.id}>{dm(e.created_at)} · <b>{e.actor?.full_name ?? "?"}</b> {ACTION_TEXT[e.action] ?? e.action}{e.note && `: ${e.note}`}</li>
                    ))}
                  </ul>
                </details>
              </article>
            );
          })}</Paged>
        </div>
      )}
    </div>
  );
}
