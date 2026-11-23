import { orderMakeCost } from "@/lib/order-cost";
import { cloneElement } from "react";
import Paged from "@/components/Paged";
import { RESULT_TO, TASK_STATUS, drawLabel, stageIndex } from "@/lib/pipeline-constants";
import ResultBadge from "@/components/rnd/ResultBadge";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductImagesCard from "@/components/rnd/ProductImagesCard";
import { Chip } from "@/components/grid/Cells";
import type { Opt } from "@/lib/rnd-options";
import RndForm from "@/components/rnd/RndForm";
import { canApprove, canSeeProfit, isRndEditor, profileNames, requireUser } from "@/lib/session";
import { loadCodeLinks, lifecycleOf } from "@/lib/code-links";
import { isTestCode } from "@/lib/tags";
import LinkSpu from "../test-codes/LinkSpu";
import RndStats from "@/components/rnd/RndStats";
import InlineField from "@/components/rnd/InlineField";
import { InfoEditBar, InfoEditProvider } from "@/components/rnd/InfoEdit";
import CommercialPanel, { commercialHint } from "@/components/rnd/CommercialPanel";
import { evaluateCommercial } from "@/lib/commercial-eval";
import { saveCommercialInputs } from "../commercial-actions";
import ProductVideos from "@/components/rnd/ProductVideos";
import ProductChat from "@/components/rnd/ProductChat";
import { loadProductMessages } from "@/lib/product-chat";
import RndHero from "@/components/rnd/RndHero";
import TestPanel from "@/components/rnd/TestPanel";
import EvaluationPanel from "@/components/rnd/EvaluationPanel";
import DecisionPanel from "@/components/rnd/DecisionPanel";
import { ScorePanel } from "@/components/rnd/ScoreModal";
import ControlPanel from "@/components/pipeline/ControlPanel";
import CollectionForm from "@/components/pipeline/CollectionForm";
import SkuPanel from "@/components/pipeline/SkuPanel";
import Journey from "@/components/pipeline/Journey";
import { HANDOFF_STATUS, latestHandoff } from "@/lib/handoff";
import { sb } from "@/lib/supabase/admin";
import { getEvaluation } from "@/lib/eval/data";
import { listGoals, listSessions, listTemplates } from "@/lib/kpi";
import { getCardStats, getFieldSuggestions, getProductVideos, getRndHistory, getRndProduct, signImages } from "@/lib/rnd";
import { flagged, normOrderStatus } from "@/lib/rnd-options";
import { getPipelineDetail, getRndOptions, getTeams, type PipelineItem } from "@/lib/pipeline";
import { RND_FIELD_LABELS, RND_STATUS } from "@/lib/rnd-constants";
import {
  COLLECTION_LABELS, PRODUCT_GROUPS, STAGE_LABELS,
  type ProductGroup, type Stage,
} from "@/lib/pipeline-constants";
import { fmtDateTime, fmtInt, getAccounts, getProductInfo, todayVN } from "@/lib/data";
import { confirmResult, startTest, updateRndProduct } from "../actions";
import { updateCollection } from "../pipeline-actions";

const ACTIONS: Record<string, string> = {
  created: "tạo mẫu", updated: "sửa thông tin", status_changed: "đổi trạng thái",
  image_added: "thêm ảnh", image_removed: "xoá ảnh",
  age_changed: "đổi phân loại mới/cũ", result_confirmed: "xác nhận kết quả", handoff_created: "tạo phiếu đẩy mẫu ĐVKD", test_started: "bắt đầu test", test_ended: "kết thúc test", test_updated: "sửa phiên test", test_cancelled: "huỷ phiên test",
  scored: "chấm điểm mẫu", submitted: "gửi duyệt mẫu", approved: "duyệt mẫu", rejected: "không duyệt mẫu", killed: "dừng mẫu", restored: "mở lại mẫu",
  stage_changed: "chuyển mốc", design_assigned: "giao vẽ 3D", design_started: "bắt đầu vẽ 3D", design_submitted: "gửi duyệt 3D",
  design_passed: "duyệt 3D đạt", design_redo: "yêu cầu sửa 3D", sample_ordered: "đặt xưởng làm mẫu", sample_status: "cập nhật đơn mẫu",
  media_assigned: "giao quay source", media_started: "bắt đầu quay", media_submitted: "gửi duyệt source",
  media_passed: "duyệt source đạt", media_redo: "yêu cầu sửa source", sku_linked: "gắn mã SPU",
  restored_deleted: "khôi phục mẫu đã xoá", design_deleted: "xoá việc 3D", order_deleted: "xoá đơn đặt hàng", media_deleted: "xoá yêu cầu media",
};
const LABELS: Record<string, string> = {
  ...RND_FIELD_LABELS, ...COLLECTION_LABELS, stage: "Mốc", approval_note: "Ghi chú duyệt", kill_reason: "Lý do",
  review_note: "Nhận xét", supplier: "Xưởng", note: "Ghi chú", code: "Mã SPU",
};

function show(field: string, v: unknown) {
  if (v === null || v === undefined || v === "") return "(trống)";
  if (field === "status") return RND_STATUS[v as keyof typeof RND_STATUS] ?? String(v);
  if (field === "stage") return STAGE_LABELS[v as Stage] ?? String(v);
  if (field === "product_group") return PRODUCT_GROUPS[v as ProductGroup] ?? String(v);
  if (typeof v === "number") return fmtInt(v);
  return String(v);
}

const daysSince = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)) : null);

// Ô thông tin ở tab Tổng quan: nhãn nhỏ phía trên, giá trị rõ phía dưới; chưa có dữ liệu → "Chưa có" mờ
function Info({ label, children, pills, options, edit }: { label: string; children?: React.ReactNode; pills?: string | null; options?: Opt[]; edit?: React.ReactElement<{ display?: React.ReactNode }> }) {
  const list = pills ? pills.split(/\s*,\s*/).filter(Boolean) : null;
  const has = list ? list.length > 0 : children !== null && children !== undefined && children !== "" && children !== "—";
  const body = !has ? <span className="text-ink-muted">Chưa có</span>
    : list ? <span className="flex flex-wrap gap-1">{list.map((x) => <Chip key={x} value={x} options={options} />)}</span>
    : <span className="font-medium">{children}</span>;
  return (
    <div className="min-w-0">
      <dt className="mb-0.5 text-2xs font-medium text-ink-muted">{label}</dt>
      {/* edit = ô nhập (chỉ hiện khi bấm Cập nhật); còn lại hiện giá trị như cũ */}
      <dd className="text-sm">{edit ? cloneElement(edit, { display: body }) : body}</dd>
    </div>
  );
}

// Link ngoài: hiện tên miền + đường dẫn rút gọn, mở tab mới
function ExtLink({ href }: { href: string }) {
  const text = href.replace(/^https?:\/\/(www\.)?/i, "");
  return (
    <a href={href} target="_blank" rel="noreferrer" title={href} className="block max-w-full truncate text-accent hover:underline">{text} ↗</a>
  );
}

// Nhóm thông tin có tiêu đề
function Group({ title, icon, children, compact = false }: { title: string; icon: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <section className={`rounded-xl border border-line bg-surface ${compact ? "p-3" : "p-4"}`}>
      <h2 className={`flex items-center gap-2 ${compact ? "mb-2 text-xs text-ink-2" : "mb-3 text-sm"}`}><span className="flex h-6 w-6 items-center justify-center rounded-md bg-grid text-xs">{icon}</span>{title}</h2>
      <dl className={`grid grid-cols-2 sm:grid-cols-3 ${compact ? "gap-x-4 gap-y-2" : "gap-x-6 gap-y-3.5"}`}>{children}</dl>
    </section>
  );
}

export default async function RndDetailPage({ params, searchParams }: PageProps<"/rnd/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const { created, tab: tabParam } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const product = await getRndProduct(id);
  if (!product) notFound();
  const pi = product as unknown as PipelineItem;
  const inPipeline = !!pi.stage;

  const [history, signed, suggestions, stats, catalog, sessions, goals, templates, accounts, videos] = await Promise.all([
    getRndHistory(id), signImages(product.image_paths), getFieldSuggestions(),
    getCardStats([pi]), getProductInfo(product.code ? [product.sapo_code ?? product.code] : []),
    listSessions(id), listGoals(), listTemplates(), getAccounts(), !tabParam || tabParam === "overview" ? getProductVideos(pi) : Promise.resolve([]),
  ]);
  const [evaluation, handoff, { data: dec }] = await Promise.all([
    product.code ? getEvaluation(product.code) : null, latestHandoff(id),
    sb.rnd().from("current_decisions").select("result, suggested, note, decided_at, decided_by").eq("product_id", id).maybeSingle(),
  ]);
  const d = dec as { result: "win" | "win_traffic" | "win_sp" | "fail"; suggested: string | null; note: string | null; decided_at: string; decided_by: string | null } | null;
  // Đề xuất đổi sau khi duyệt → mẫu đã FAIL vẫn được duyệt lại (WIN sẽ mở lại mẫu)
  const drift = !!d && !!evaluation && evaluation.result !== "testing" && evaluation.result !== d.result && evaluation.result !== d.suggested;

  // Lịch sử mã: kết luận cũ của cùng mã trước khi mẫu này nhận mã (migration 017; chưa chạy thì bỏ qua)
  const { data: archived } = await sb.rnd().from("products").select("id, archived_code, created_at").eq("merged_into", id);
  const { data: oldDecs } = archived?.length
    ? await sb.rnd().from("decisions").select("id, result, note, decided_at, decided_by").in("product_id", archived.map((a) => a.id)).order("decided_at", { ascending: false })
    : { data: [] };
  const pageName = (pid: string) => accounts.find((a) => a.id === pid)?.name ?? pid;
  const pages = accounts.filter((a) => a.platform === "facebook").map(({ id: pid, name }) => ({ id: pid, name }));
  // Mẫu Media (mã SPU test): mã SPU thương mại đã gắn + so sánh giai đoạn test / thương mại
  const myLinks = product.code && isTestCode(product.code) ? (await loadCodeLinks()).filter((l) => l.product_id === id) : null;
  const lifecycles = myLinks ? await Promise.all(myLinks.map(lifecycleOf)) : [];
  const editor = isRndEditor(user);
  const chatP = loadProductMessages(id).catch(() => null);   // chat trao đổi: tải song song với các khối khác (null = chưa chạy migration 048)
  const viewer = user.role === "media";   // Media chỉ xem để lấy source: không giá vốn, không thao tác quy trình
  const approver = canApprove(user, pi.team_id ?? null);
  const salesCode = product.code ? (product.sapo_code ?? product.code).toUpperCase() : null;

  // Quy trình: việc 3D / mẫu / media + người liên quan
  const pipe = inPipeline ? await getPipelineDetail(id) : null;
  const [teams, options, designSigned] = inPipeline ? await Promise.all([
    getTeams(true), getRndOptions(), signImages(pipe!.design?.image_paths ?? []),
  ]) : [[], null, {} as Record<string, string>];
  const names = await profileNames([
    d?.decided_by, ...(oldDecs ?? []).map((x) => x.decided_by), pi.approved_by, pi.created_by, pipe?.design?.assignee_id, ...(pipe?.media ?? []).map((m) => m.assignee_id),
    ...(pipe?.samples ?? []).map((s) => s.created_by),
  ]);
  const nm = (x: string | null | undefined) => (x ? names.get(x) ?? null : null);
  const canWork = editor || pi.created_by === user.id;
  const opened = inPipeline && pi.stage !== "p0" && !pi.killed_at;

  // ---------- Bố cục: đầu trang 1 hàng · tab nội dung · cột phải chỉ để thao tác ----------
  // Đánh giá thương mại hoá: chỉ mẫu mới trong quy trình R&D (mẫu R&D + mẫu Media test đã vào R&D), từ P4 trở đi; số tiền → Quản lý / R&D / trưởng team
  const commercial = inPipeline && !viewer && (editor || canSeeProfit(user) || approver) && stageIndex(pi.stage) >= stageIndex("p4") ? await evaluateCommercial(id) : null;
  const TABS: [string, string][] = [["overview", "Tổng quan"]];
  if (commercial) TABS.push(["commercial", "Đánh giá TMH"]);
  if (inPipeline && !viewer) TABS.push(["journey", "Hành trình"]);
  if (product.code) TABS.push(["market", "Thị trường"]);
  if (!viewer) TABS.push(["form", inPipeline ? "Phiếu sưu tầm" : "Thông tin"], ["history", `Lịch sử (${history.length})`]);

  const tab = TABS.some(([k]) => k === tabParam) ? (tabParam as string) : "overview";
  const team = teams.find((t) => t.id === pi.team_id)?.name ?? null;
  const cover = product.image_paths.map((p) => signed[p]).find(Boolean);
  const money = (n: number | null | undefined) => (n ? `${fmtInt(n)}đ` : "—");
  // Chi phí SX mẫu = tổng Chi phí SX của các đơn đặt hàng (bỏ đơn đã huỷ); giá vốn là dữ liệu nhạy cảm → chỉ Quản lý / R&D thấy
  const showCost = editor || canSeeProfit(user);
  const cancelled = options ? flagged(options.order_status, "cancel") : [];
  const liveOrders = (pipe?.samples ?? []).filter((o) => !cancelled.includes(o.status));
  const sampleCost = liveOrders.reduce((t, o) => t + orderMakeCost(o), 0);   // đơn giá × số lượng
  const sampleOther = liveOrders.reduce((t, o) => t + (o.cost_other ?? 0), 0);
    const card = "rounded-lg border border-line bg-surface p-4";
  const hasActions = !viewer && (inPipeline || !!product.code);
  const chat = await chatP;
  const daysAt = daysSince(pi.stage_at);
  // File 3D = của việc vẽ 3D; Link source = kho Source của mẫu, chưa có thì link drive của yêu cầu media đã nhập
  // Màu nhãn Dòng SP / Chất liệu / Loại đá theo màu đã chọn trong trình đơn cấu hình (giống các bảng)
  const pickList = options ?? await getRndOptions();
  const link3d = pipe?.design?.file_url ?? null;
  // Sửa trực tiếp ngay trên trang (cùng quyền như sửa ở bảng): mẫu trong quy trình, người sưu tầm / R&D / Quản lý; Media chỉ xem
  const inline = inPipeline && !viewer && (editor || pi.created_by === user.id);
  const optList = (o: Opt[] | undefined) => (o ?? []).map((x) => ({ value: x.value }));
  const fld = (field: string, kind: "text" | "link" | "money" | "select" | "multi" | "textarea", value: string | number | null | undefined, extra: { options?: { value: string; label?: string }[]; table?: "collection" | "design"; placeholder?: string; display?: React.ReactNode } = {}) => (
    <InlineField field={field} kind={kind} value={value === null || value === undefined || value === "" ? null : String(value)}
      options={extra.options} table={extra.table} placeholder={extra.placeholder} display={extra.display} />
  );
  const linkSource = product.source_url ?? pipe?.media.find((m) => m.drive_url)?.drive_url ?? null;

  return (
    <div className="space-y-3">
      <RndHero cover={cover ?? null} name={product.name} code={product.code ?? null} stCode={pi.st_code ?? null} inPipeline={inPipeline}
        stage={pi.stage} killed={!!pi.killed_at} approval={pi.approval ?? null} team={team} group={pi.product_group ?? null}
        fromMedia={pi.entry_source === "media"} createdAt={pi.created_at} createdBy={nm(pi.created_by)} approvedAt={pi.approved_at ?? null}
        fromStage={viewer ? 3 : 0} daysAt={daysAt} refUrl={pi.ref_url ?? null} sourceUrl={product.source_url ?? null} />
      {created && <div className="rounded-md bg-warn-bg px-3 py-2 text-xs text-warn-ink">✓ Đã tạo mẫu{pi.st_code ? ` ${pi.st_code}` : ""}. Thêm ảnh ở tab Tổng quan.</div>}

      <div className="grid gap-3 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-3">
          {/* Tab */}
          <nav className="flex gap-0.5 overflow-x-auto border-b border-line text-sm">
            {TABS.map(([k, label]) => (
              <Link key={k} href={`/rnd/${id}${k === "overview" ? "" : `?tab=${k}`}`} scroll={false}
                className={`whitespace-nowrap border-b-2 px-3 py-1.5 ${tab === k ? "border-accent font-semibold text-accent" : "border-transparent text-ink-2 hover:text-ink-1"}`}>{label}</Link>
            ))}
          </nav>


          {tab === "overview" && (
            <>
              <InfoEditProvider productId={id} canEdit={inline}>
              <div className="grid gap-3 xl:grid-cols-[minmax(0,4fr)_minmax(0,6fr)]">
                <section className="rounded-xl border border-line bg-surface p-4">
                  <ProductImagesCard productId={id} editable={inPipeline ? canWork : editor}
                    images={product.image_paths.filter((p) => signed[p]).map((p) => ({ path: p, url: signed[p] }))}
                    images3d={(pipe?.design?.image_paths ?? []).filter((p) => designSigned?.[p]).map((p) => ({ path: p, url: designSigned![p] }))} />
                  {inPipeline && !viewer && (
                    <div className="mt-3 border-t border-line pt-3 text-xs">
                      <div className="mb-0.5 text-2xs font-medium text-ink-muted">Link source mẫu sưu tầm</div>
                      {inline ? fld("ref_url", "link", pi.ref_url, { display: pi.ref_url ? <ExtLink href={pi.ref_url} /> : <span className="text-ink-muted">Chưa có</span> }) : pi.ref_url ? <ExtLink href={pi.ref_url} /> : <span className="text-ink-muted">Chưa có</span>}
                    </div>
                  )}
                </section>
                <div className="min-w-0 space-y-3">
                  <InfoEditBar />
                  {inPipeline && pi.stage === "p0" && <ScorePanel productId={id} />}   {/* chấm điểm BM23 + đối chiếu các thành viên (chấm mù) */}
                  {/* Tiến độ hiện tại: đủ thông tin trạng thái mà thẻ Kanban đã lược bớt (người vẽ 3D, đơn đặt hàng, quay source, mã SPU, kết quả đánh giá) */}
                  {inPipeline && !viewer && (() => {
                    const d3 = pipe?.design ?? null, media = pipe?.media ?? [];
                    const mediaPassed = media.filter((m) => m.approval === "pass").length;
                    const rows: [string, React.ReactNode][] = [];
                    if (product.code) rows.push(["Mã SPU", <b key="c">#{product.code}</b>]);
                    if (d3) rows.push(["Vẽ 3D", `${TASK_STATUS[d3.status as keyof typeof TASK_STATUS] ?? d3.status}${nm(d3.assignee_id) ? ` · ${nm(d3.assignee_id)}` : ""}`]);
                    if (liveOrders.length) rows.push(["Đơn đặt hàng", <span key="o" className="block space-y-0.5">{liveOrders.map((o) => <span key={o.id} className="block">{normOrderStatus(o.status)}{o.supplier ? ` · ${o.supplier}` : ""}</span>)}</span>]);
                    if (media.length) rows.push(["Quay source", `${media.length} yêu cầu${mediaPassed ? ` · ${mediaPassed} đạt` : ""}`]);
                    if (evaluation) rows.push(["Kết quả đánh giá", <span key="e" className="inline-flex items-center gap-1.5"><ResultBadge result={evaluation.result} size="xs" /><span className="text-2xs text-ink-muted">ngày {evaluation.days_elapsed}</span></span>]);
                    return rows.length ? <Group title="Tiến độ hiện tại" icon="📍" compact>{rows.map(([l, v]) => <Info key={l} label={l}>{v}</Info>)}</Group> : null;
                  })()}
                  {/* HỒ SƠ ĐẦY ĐỦ theo công đoạn: mọi trường của các bảng Vẽ 3D / Đặt hàng / Quay chụp — để thẻ trong bảng có thể ẩn bớt trường mà trang này vẫn đủ thông tin */}
                  {inPipeline && !viewer && pipe && (() => {
                    const ymd = (v: string | null | undefined) => (v ? v.slice(0, 10).split("-").reverse().join("/") : null);
                    const dt = (v: string | null | undefined) => (v ? fmtDateTime(v) : null);
                    const link = (u: string | null | undefined) => (u && /^https?:/i.test(u) ? <ExtLink href={u} /> : null);
                    const d3 = pipe.design;
                    const draw = d3 ? drawLabel(d3.status) : null;
                    const rev = d3 ? (d3.status === "review" ? "Chờ duyệt" : d3.status === "done" ? "Đạt" : d3.status === "redo" ? "Sửa lại" : null) : null;
                    type MediaFull = (typeof pipe.media)[number] & { note?: string | null };
                    const mediaStatus = (m: MediaFull) => (m.status === "todo" ? "Chờ xử lý" : m.status === "doing" ? "Đang quay" : "Hoàn thành");
                    const approvalOf = (m: MediaFull) => (m.approval === "pass" ? "Đạt" : m.approval === "redo" ? "Sửa lại" : m.approval === "pending" ? "Chờ duyệt" : null);
                    if (!d3 && !pipe.samples.length && !pipe.media.length) return null;
                    return (
                      <>
                        {d3 && (
                          <Group title="Vẽ 3D" icon="🧊">
                            <Info label="Ngày tiếp nhận">{dt(d3.created_at)}</Info>
                            <Info label="Người vẽ">{nm(d3.assignee_id)}</Info>
                            <Info label="Trạng thái vẽ">{draw}</Info>
                            <Info label="Duyệt 3D">{rev}</Info>
                            <Info label="Ngày gửi duyệt">{dt(d3.submitted_at)}</Info>
                            <Info label="Ngày hoàn thành">{dt(d3.done_at)}</Info>
                            <Info label="Thời gian vẽ">{d3.done_at ? `${Math.max(0, Math.round((Date.parse(d3.done_at) - Date.parse(d3.created_at)) / 86_400_000))} ngày` : null}</Info>
                            <Info label="File 3D">{link(d3.file_url)}</Info>
                            <Info label="Nhận xét duyệt">{d3.review_note}</Info>
                            <div className="col-span-full"><dt className="mb-0.5 text-2xs font-medium text-ink-muted">Ghi chú</dt><dd className="whitespace-pre-line text-sm">{d3.note || <span className="text-ink-muted">Chưa có</span>}</dd></div>
                          </Group>
                        )}
                        {pipe.samples.map((o, n) => (
                          <Group key={o.id} title={`Đặt hàng${pipe.samples.length > 1 ? ` · đơn ${n + 1}` : ""}`} icon="📦">
                            <Info label="Xưởng">{o.supplier}</Info>
                            <Info label="Trạng thái">{normOrderStatus(o.status)}</Info>
                            <Info label="Ngày đặt">{ymd(o.ordered_at)}</Info>
                            <Info label="Dự kiến nhận">{ymd(o.expected_at)}</Info>
                            <Info label="Ngày nhận">{ymd(o.received_at)}</Info>
                            <Info label="Số lượng">{o.qty ? `${o.qty} ${o.unit ?? "cái"}` : null}</Info>
                            <Info label="Màu">{o.color}</Info>
                            <Info label="Size">{o.size}</Info>
                            <Info label="Trọng lượng">{o.weight_chi ? `${o.weight_chi} chỉ` : null}</Info>
                            {showCost && <Info label="Đơn giá (đ)">{o.cost ? money(o.cost) : null}</Info>}
                            {showCost && <Info label="Chi phí khác (đ)">{o.cost_other ? money(o.cost_other) : null}</Info>}
                            {showCost && <Info label="Giá bán (đ)">{o.price ? money(o.price) : null}</Info>}
                            <Info label="Người tạo đơn">{nm(o.created_by)}</Info>
                            <div className="col-span-full"><dt className="mb-0.5 text-2xs font-medium text-ink-muted">Ghi chú</dt><dd className="whitespace-pre-line text-sm">{o.note || <span className="text-ink-muted">Chưa có</span>}</dd></div>
                          </Group>
                        ))}
                        {(pipe.media as MediaFull[]).map((m, n) => (
                          <Group key={m.id} title={`Quay chụp${pipe.media.length > 1 ? ` · yêu cầu ${n + 1}` : ""}`} icon="🎬">
                            <Info label="Người thực hiện">{nm(m.assignee_id)}</Info>
                            <Info label="Trưởng nhóm">{nm(m.lead_id)}</Info>
                            <Info label="Ngày tiếp nhận">{dt(m.received_at)}</Info>
                            <Info label="Deadline">{ymd(m.deadline)}</Info>
                            <Info label="Trạng thái xử lý">{mediaStatus(m)}</Info>
                            <Info label="Ngày hoàn thành source">{dt(m.done_at)}</Info>
                            <Info label="Link drive">{link(m.drive_url)}</Info>
                            <div className="col-span-full"><dt className="mb-0.5 text-2xs font-medium text-ink-muted">Ghi chú</dt><dd className="whitespace-pre-line text-sm">{m.note || <span className="text-ink-muted">Chưa có</span>}</dd></div>
                          </Group>
                        ))}
                      </>
                    );
                  })()}
                  {/* Ưu tiên: thông tin sản phẩm + dữ liệu thị trường; phần còn lại gộp gọn ở cuối */}
                  <Group title="Sản phẩm" icon="💍">
                    <Info label="Dòng SP" pills={product.line} options={pickList.line} edit={inline ? fld("line", "multi", product.line, { options: optList(pickList.line) }) : undefined} />
                    <Info label="Chất liệu" pills={product.material} options={pickList.material} edit={inline ? fld("material", "select", product.material, { options: optList(pickList.material) }) : undefined} />
                    <Info label="Loại đá" pills={product.stone} options={pickList.stone} edit={inline ? fld("stone", "multi", product.stone, { options: optList(pickList.stone) }) : undefined} />
                    <Info label="Size" edit={inline ? fld("size", "text", product.size) : undefined}>{product.size}</Info>
                    {inPipeline && <Info label="Nhóm SP" edit={inline ? fld("product_group", "select", pi.product_group ? PRODUCT_GROUPS[pi.product_group] : null, { options: Object.values(PRODUCT_GROUPS).map((l) => ({ value: l })) }) : undefined}>{pi.product_group ? PRODUCT_GROUPS[pi.product_group] : null}</Info>}
                    {inPipeline && <Info label="Team" edit={inline ? fld("team_id", "select", pi.team_id, { options: teams.filter((t) => t.is_active || t.id === pi.team_id).map((t) => ({ value: t.id, label: t.name })) }) : undefined}>{team}</Info>}
                    {inPipeline && !viewer && <Info label="File 3D" edit={editor ? fld("file_url", "link", link3d, { table: "design" }) : undefined}>{link3d && <ExtLink href={link3d} />}</Info>}
                    {inPipeline && <Info label="Link source" edit={inline ? fld("source_url", "link", product.source_url ?? linkSource) : undefined}>{linkSource && (viewer ? <a href={`/api/rnd/source?product=${id}`} target="_blank" rel="noreferrer" className="inline-block rounded-md bg-accent px-2 py-1 text-xs font-medium text-white hover:opacity-90">⬇ Lấy source</a> : <ExtLink href={linkSource} />)}</Info>}
                    {inPipeline && showCost && (
                      <Info label="Chi phí SX mẫu">
                        {sampleCost > 0 ? <span className={inline ? "flex h-8 items-center" : undefined}><span className="font-extrabold text-bad">{money(sampleCost)}</span>{sampleOther > 0 && <span className="ml-1 text-2xs font-normal text-ink-muted">+ {money(sampleOther)} khác</span>}</span> : null}
                      </Info>
                    )}
                  </Group>
                  {myLinks && (
                    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
                      <h2 className="flex items-center gap-2 text-sm"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-grid text-xs">🔗</span>Mã SPU thương mại</h2>
                      <LinkSpu productId={id} links={myLinks.map((l) => ({ id: l.id, sku: l.sku_code, launch: l.launch_date }))} canEdit={editor} />
                      {lifecycles.map((lc) => (
                        <div key={lc.link.id} className="overflow-x-auto rounded-lg border border-line text-xs">
                          <table className="w-full min-w-max">
                            <thead className="bg-page/60 text-2xs uppercase tracking-wide text-ink-muted"><tr><th className="px-2.5 py-1.5 text-left">{lc.link.sku_code}</th><th className="px-2.5 py-1.5 text-right">Test ({lc.link.test_code})</th><th className="px-2.5 py-1.5 text-right">Thương mại</th><th className="px-2.5 py-1.5 text-right">Toàn chu kỳ</th></tr></thead>
                            <tbody className="divide-y divide-line tabular-nums">
                              {([["Video", lc.test.videos, lc.commercial.videos], ["Lượt xem", lc.test.views, lc.commercial.views], ["Người xem", lc.test.viewers, lc.commercial.viewers], ["SL bán thuần", 0, lc.commercial.qtySold - lc.commercial.qtyReturned]] as [string, number, number][]).map(([label, a, b]) => (
                                <tr key={label}><td className="px-2.5 py-1.5 text-ink-2">{label}</td><td className="px-2.5 py-1.5 text-right">{fmtInt(a)}</td><td className="px-2.5 py-1.5 text-right">{fmtInt(b)}</td><td className="px-2.5 py-1.5 text-right font-semibold">{fmtInt(a + b)}</td></tr>
                              ))}
                            </tbody>
                          </table>
                          <p className="border-t border-line px-2.5 py-1.5 text-2xs text-ink-muted">Test: bài đăng trước {lc.link.launch_date.split("-").reverse().join("/")} · Thương mại: từ ngày mở bán, số bán theo mã {lc.link.sku_code}</p>
                        </div>
                      ))}
                    </section>
                  )}
                  {product.code && (
                    <section className="rounded-xl border border-line bg-surface p-4">
                      <h2 className="mb-2 flex items-center gap-2 text-sm"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-grid text-xs">📊</span>Dữ liệu thị trường</h2>
                      <RndStats s={stats[product.code]} today={todayVN()} />
                    </section>
                  )}
                  {inPipeline && !viewer && (
                    <Group title="Thông tin khác" icon="🗂" compact>
                      <Info label="Nguồn" edit={inline ? fld("ref_platform", "select", pi.ref_platform, { options: optList(pickList.ref_platform) }) : undefined}>{pi.ref_platform}</Info>
                      <Info label="Chỉ số tham khảo" edit={inline ? fld("ref_metrics", "text", pi.ref_metrics) : undefined}>{pi.ref_metrics}</Info>
                      <Info label="Giá tham khảo (đ)" edit={inline ? fld("price_ref", "money", pi.price_ref) : undefined}>{pi.price_ref ? money(pi.price_ref) : null}</Info>
                      <Info label="Giá vốn dự kiến (đ)" edit={inline ? fld("expected_cost", "money", pi.expected_cost) : undefined}>{pi.expected_cost ? money(pi.expected_cost) : null}</Info>
                      <Info label="Giá bán dự kiến (đ)" edit={inline ? fld("expected_price", "money", pi.expected_price) : undefined}>{pi.expected_price ? money(pi.expected_price) : null}</Info>
                      <Info label="Biên dự kiến">{pi.expected_cost && pi.expected_price ? <span className={inline ? "flex h-8 items-center" : undefined}>{Math.round(((pi.expected_price - pi.expected_cost) / pi.expected_price) * 100)}%</span> : null}</Info>
                      {(product.description || inline) && (
                        <div className="col-span-full border-t border-line pt-2">
                          <dt className="mb-0.5 text-2xs font-medium text-ink-muted">Ghi chú</dt>
                          <dd className="whitespace-pre-line text-xs text-ink-2">{inline ? fld("description", "textarea", product.description, { display: product.description || <span className="text-ink-muted">Chưa có</span> }) : product.description}</dd>
                        </div>
                      )}
                    </Group>
                  )}
                </div>
              </div>
              </InfoEditProvider>
              {product.code && <ProductVideos videos={videos} spuCode={product.code}
                channelOf={(cid) => { const a = accounts.find((x) => x.id === cid); return { name: a?.name ?? cid, platform: a?.platform ?? null }; }} />}
            </>
          )}

          {tab === "journey" && inPipeline && pipe && (
            <>
              <Journey design={pipe.design} samples={pipe.samples} media={pipe.media} names={nm} options={options!}
                images3d={(pipe.design?.image_paths ?? []).map((p) => designSigned[p]).filter(Boolean)} />
              {opened && <SkuPanel id={id} code={product.code} canEdit={canWork} />}
            </>
          )}

          {tab === "commercial" && commercial && (
            <CommercialPanel ev={commercial} canEdit={editor || approver} saveAction={saveCommercialInputs.bind(null, id)}
              values={{ video_cost: (pi as unknown as { video_cost: number | null }).video_cost ?? null, ops_cost: (pi as unknown as { ops_cost: number | null }).ops_cost ?? null,
                lead_days: (pi as unknown as { lead_days: number | null }).lead_days ?? null, min_order_qty: (pi as unknown as { min_order_qty: number | null }).min_order_qty ?? null }} />
          )}

          {tab === "market" && product.code && (
            <div className="max-w-4xl space-y-3">
              <section className={card}>
                <h2 className="mb-2">Dữ liệu thị trường</h2>
                <RndStats s={stats[product.code]} today={todayVN()} />
                <div className="mt-2 text-xs text-ink-2">
                  Hashtag <b>#{product.code}</b> · số bán theo mã <b>{salesCode}</b> {catalog[salesCode!] ? "(có trên Sapo ✓)" : "(chưa có trên Sapo)"}
                </div>
              </section>
              {evaluation ? (
                <EvaluationPanel e={evaluation} productId={id} canEdit={editor} pageName={pageName} ageOverride={product.age_override ?? null} />
              ) : (
                <section className={`${card} border-dashed text-sm text-ink-2`}>
                  Chưa có đánh giá — đăng video kèm hashtag <b>#{product.code}</b>, hệ thống tự đánh giá ở lần đồng bộ tiếp theo.
                </section>
              )}
              {!viewer && <TestPanel sessions={sessions} goals={goals} templates={templates} pages={pages} productLine={product.line}
                canEdit={editor} canCancel={user.role === "admin"} today={todayVN()} startAction={startTest.bind(null, id)} />}
              {!!oldDecs?.length && (
                <section className={`${card} text-sm`}>
                  <h2 className="mb-1">Lịch sử mã #{archived![0].archived_code}</h2>
                  <p className="mb-2 text-xs text-ink-muted">Kết luận của mã này trước khi mẫu nhận mã — chỉ để tham khảo, không phải kết luận của mẫu này.</p>
                  <ul className="space-y-1">
                    {oldDecs.map((x) => (
                      <li key={x.id} className="text-ink-2">
                        <b className="text-ink-1">{RESULT_TO[x.result] ?? "FAIL"}</b>
                        {" · "}{nm(x.decided_by) ?? "?"} · {fmtDateTime(x.decided_at)}{x.note ? ` — ${x.note}` : ""}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {tab === "form" && (
            <section className={`${card} max-w-3xl`}>
              {inPipeline ? (
                <CollectionForm mode="edit" action={updateCollection.bind(null, id)} teams={teams} suggestions={suggestions}
                  readOnly={!canWork} values={pi} />
              ) : (
                <RndForm action={updateRndProduct.bind(null, id)} values={product} suggestions={suggestions}
                  readOnly={!editor} submitLabel="Lưu thay đổi" />
              )}
            </section>
          )}

          {tab === "history" && (
            <section className={`${card} max-w-3xl text-sm`}>
              <ol className="relative space-y-2.5 border-l border-line pl-4">
                <Paged as="item" size={20}>{history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-accent" />
                    <div className="text-ink-2">
                      <b className="text-ink-1">{h.actor?.full_name ?? "Hệ thống"}</b> {ACTIONS[h.action] ?? h.action}
                      <span className="text-xs text-ink-muted"> · {fmtDateTime(h.created_at)}</span>
                    </div>
                    {h.changes && (
                      <ul className="text-xs text-ink-muted">
                        {Object.entries(h.changes).map(([f, [a, b]]) => (
                          <li key={f}>{LABELS[f] ?? f}: {a === null && f !== "stage" ? show(f, b) : `${show(f, a)} → ${show(f, b)}`}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}</Paged>
                {!history.length && <li className="text-ink-muted">Chưa có lịch sử.</li>}
              </ol>
            </section>
          )}
        </div>

        {/* Cột phải: chat trao đổi (mọi người) ở trên cùng, bên dưới là Duyệt mẫu / Quyết định (người có quyền) */}
        <aside className="space-y-3 lg:self-start">
          {chat
            ? <ProductChat productId={id} me={user.id} isAdmin={user.role === "admin"} initial={chat} />
            : <div className="rounded-md bg-warn-bg px-3 py-2 text-xs text-warn-ink">Chưa chạy migration 048 (bảng chat trao đổi) trong Supabase.</div>}
          {hasActions && (<>
            {inPipeline && (
              <ControlPanel id={id} stage={pi.stage} approval={pi.approval} approvalNote={pi.approval_note}
                approvedBy={nm(pi.approved_by)} killed={!!pi.killed_at} killReason={pi.kill_reason}
                can={{ approve: approver, work: canWork, restore: user.role === "admin" }} />
            )}
            {inPipeline && pi.stage === "p6" && (
              <section className="rounded-lg border border-good/50 bg-surface p-4 text-sm">
                <h2>🏆 Đã duyệt thương mại hoá (P6)</h2>
                <p className="text-ink-2">{pi.win_qty ? `SL duyệt sản xuất: ${fmtInt(pi.win_qty)}` : "Chưa ghi SL sản xuất"}</p>
              </section>
            )}
            {product.code && (
              <DecisionPanel action={confirmResult.bind(null, id)} suggested={evaluation?.result ?? null}
                canEdit={inPipeline ? approver && (!pi.killed_at || drift) : approver} inPipeline={inPipeline}
                pendingCommercial={inPipeline && !pi.killed_at && pi.stage !== "p6" && stageIndex(pi.stage) >= stageIndex("p4")}
                hasSource={!!product.source_url}
                commercial={commercial ? { ...commercialHint(commercial.result), href: `/rnd/${id}?tab=commercial` } : null}
                confirmed={d ? { result: d.result, note: d.note, by: nm(d.decided_by), at: d.decided_at } : null}
                handoff={handoff ? { id: handoff.id, status: handoff.status, statusText: HANDOFF_STATUS[handoff.status] } : null} />
            )}
            {drift && (
              <div className="rounded-md bg-warn-bg px-3 py-2 text-xs text-warn-ink">
                ⚠ Đã duyệt {RESULT_TO[d!.result] ?? "FAIL"} nhưng hệ thống nay đề xuất khác — xem tab Thị trường và duyệt lại nếu cần.
              </div>
            )}
          </>)}
        </aside>
      </div>
    </div>
  );
}
