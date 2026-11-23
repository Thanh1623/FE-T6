import "server-only";
import { unstable_cache } from "next/cache";
import { sb, fetchAll } from "@/lib/supabase/admin";
import { TAG } from "@/lib/cache-tags";
import { isSystemTestCode } from "@/lib/tags";
import { loadCodeLinks } from "@/lib/code-links";
import { profileNames, type CurrentUser } from "@/lib/session";
import type { Role } from "@/lib/roles";
import { DEFAULT_OPTIONS, DRAFT_ORDER, normOrderStatus, type RndOptions } from "@/lib/rnd-options";
import { RESULT_TO, STAGES, type Approval, type ProductGroup, type Stage, type TaskStatus } from "@/lib/pipeline-constants";

export type Team = { id: string; name: string; is_active: boolean };
export type Person = { id: string; full_name: string; role: Role; team_id: string | null; is_team_lead: boolean };

export type PipelineItem = {
  id: string; st_code: string | null; code: string | null; sapo_code: string | null; name: string;
  line: string | null; category: string | null; material: string | null; stone: string | null; size: string | null;
  description: string | null; image_paths: string[]; source_url: string | null;
  stage: Stage; stage_at: string | null; approval: Approval | null; approval_note: string | null;
  approved_by: string | null; approved_at: string | null; approved_qty: number | null;
  team_id: string | null; ref_url: string | null; ref_platform: string | null; ref_metrics: string | null;
  price_ref: number | null; product_group: ProductGroup | null; expected_cost: number | null; expected_price: number | null;
  win_qty: number | null; killed_at: string | null; kill_reason: string | null;
  created_by: string | null; created_at: string; updated_at: string;
  // migration 016: Source, Traffic / Duyệt Win / Theo dõi hiệu quả
  source_status?: string | null; traffic_owner?: string | null; customer_feedback?: string | null; ads_cost?: number | null;
  traffic_review?: string | null; traffic_note?: string | null; launch_date?: string | null;
  lifecycle_review?: string | null; lifecycle_note?: string | null;
  // migration 017: luồng Media
  entry_source?: "rnd" | "media" | null; media_review?: "accepted" | "dismissed" | null; media_review_at?: string | null;
};

// Ngày vào luồng R&D: mẫu sưu tầm = ngày tạo; mẫu đưa vào từ luồng Media = ngày team chấp nhận
export const entryDate = (p: Pick<PipelineItem, "created_at" | "entry_source" | "media_review_at">) =>
  p.entry_source === "media" && p.media_review_at ? p.media_review_at : p.created_at;
const inRange = (iso: string, from: string, to: string) => {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
  return d >= from && d <= to;
};
export { inRange as inVnRange };

export type DesignTask = {
  product_id: string; assignee_id: string | null; status: TaskStatus; file_url: string | null; image_paths: string[];
  note: string | null; review_note: string | null; reviewed_by: string | null; submitted_at: string | null; done_at: string | null;
  created_at: string; updated_at: string;
};
// Yêu cầu media (nhiều / mẫu) — migration 016
export type MediaRequest = {
  id: number; product_id: string; request_type: string; assignee_id: string | null; lead_id: string | null; deadline: string | null;
  status: "todo" | "doing" | "done"; drive_url: string | null; approval: "pending" | "pass" | "redo" | null; review_note: string | null;
  received_at: string; done_at: string | null; created_at: string;
};
export type SampleOrder = {
  id: number; product_id: string; supplier: string | null; status: string; ordered_at: string; expected_at: string | null;
  received_at: string | null; qty: number | null; unit: string | null; weight_chi: number | null; size: string | null; color: string | null;
  cost: number | null; cost_other?: number | null; price: number | null; note: string | null; created_by: string | null; created_at: string;
};

// Cache dùng chung (xoá khi sửa team — bust(TAG.teams))
const allTeams = unstable_cache(async () => {
  const { data, error } = await sb.core().from("teams").select("id, name, is_active").order("name");
  if (error) throw error;
  return data as Team[];
}, ["teams"], { tags: [TAG.teams], revalidate: 3600 });

export async function getTeams(activeOnly = false) {
  const all = await allTeams();
  return activeOnly ? all.filter((t) => t.is_active) : all;
}

// Mọi hồ sơ (gồm cả đã khoá — để hiện tên người cũ). Cache dùng chung (xoá khi sửa người dùng — bust(TAG.profiles))
export const getAllProfiles = unstable_cache(async () => {
  const { data, error } = await sb.core().from("profiles").select("id, full_name, role, is_active, team_id").order("full_name");
  if (error) throw error;
  return data as { id: string; full_name: string; role: string; is_active: boolean; team_id: string | null }[];
}, ["profiles-basic", "v2"], { tags: [TAG.profiles], revalidate: 3600 });

export async function getPeople(roles?: Role[]) {
  let q = sb.core().from("profiles").select("id, full_name, role, team_id, is_team_lead").eq("is_active", true).order("full_name");
  if (roles) q = q.in("role", roles);
  const { data, error } = await q;
  if (error) throw error;
  return data as Person[];
}

export type BoardCard = PipelineItem & {
  creator: string | null; design?: { status: TaskStatus; assignee: string | null } | null;
  media?: { total: number; passed: number } | null;          // số yêu cầu media / số đã Đạt
  sample?: { status: string; supplier: string | null } | null;
};

// Danh sách mẫu thuộc quy trình (có stage), kèm tình trạng việc 3D / mẫu / media
export async function listPipeline(f: { team?: string | null; mine?: string | null; killed?: boolean } = {}) {
  const eqs: Record<string, string> = {};
  if (f.team) eqs.team_id = f.team;
  if (f.mine) eqs.created_by = f.mine;
  const { data, error } = await sb.rnd().from("products").select("*").not("stage", "is", null).match(eqs)
    .filter("killed_at", f.killed ? "not.is" : "is", null).order("updated_at", { ascending: false });
  if (error) throw error;
  const items = data as PipelineItem[];
  const ids = items.map((i) => i.id);
  if (!ids.length) return [] as BoardCard[];

  const [{ data: design }, { data: media }, { data: samples }] = await Promise.all([
    sb.rnd().from("design_tasks").select("product_id, status, assignee_id").in("product_id", ids),
    sb.rnd().from("media_requests").select("product_id, approval").in("product_id", ids),
    sb.rnd().from("sample_orders").select("product_id, status, supplier, created_at").in("product_id", ids).order("created_at", { ascending: false }),
  ]);
  const names = await profileNames([
    ...items.map((i) => i.created_by), ...(design ?? []).map((d) => d.assignee_id),
  ]);
  const nm = (id: string | null) => (id ? names.get(id) ?? null : null);
  const dBy = new Map((design ?? []).map((d) => [d.product_id, { status: d.status as TaskStatus, assignee: nm(d.assignee_id) }]));
  const mBy = new Map<string, { total: number; passed: number }>();
  for (const m of media ?? []) {
    const c = mBy.get(m.product_id) ?? { total: 0, passed: 0 };
    c.total += 1; if (m.approval === "pass") c.passed += 1;
    mBy.set(m.product_id, c);
  }
  const sBy = new Map<string, { status: string; supplier: string | null }>();
  for (const s of samples ?? []) if (!sBy.has(s.product_id)) sBy.set(s.product_id, { status: normOrderStatus(s.status), supplier: s.supplier });

  return items.map((i) => ({
    ...i, creator: nm(i.created_by), design: dBy.get(i.id) ?? null, media: mBy.get(i.id) ?? null, sample: sBy.get(i.id) ?? null,
  }));
}

export async function getPipelineDetail(id: string) {
  const [{ data: design }, { data: media }, { data: samples }] = await Promise.all([
    sb.rnd().from("design_tasks").select("*").eq("product_id", id).maybeSingle(),
    sb.rnd().from("media_requests").select("*").eq("product_id", id).order("created_at"),
    sb.rnd().from("sample_orders").select("*").eq("product_id", id).order("created_at"),
  ]);
  return { design: (design as DesignTask | null) ?? null, media: (media ?? []) as MediaRequest[], samples: (samples ?? []) as SampleOrder[] };
}

// ---------- Việc của tôi ----------

export type QueueEntry = { id: string; st_code: string | null; code: string | null; name: string; what: string; when?: string | null; tone?: "warn" | "bad"; href?: string };

export async function myQueue(u: CurrentUser) {
  type Group = { title: string; items: QueueEntry[]; passive?: boolean };   // passive = chỉ để theo dõi (đang chờ người khác), không tính vào số việc cần làm
  const products = async (ids: string[]) => {
    if (!ids.length) return new Map<string, PipelineItem>();
    const { data } = await sb.rnd().from("products").select("*").in("id", ids);
    return new Map((data as PipelineItem[]).map((p) => [p.id, p]));
  };
  const entry = (p: PipelineItem | undefined, what: string, when?: string | null, tone?: QueueEntry["tone"]): QueueEntry[] =>
    p && !p.killed_at ? [{ id: p.id, st_code: p.st_code, code: p.code, name: p.name, what, when, tone }] : [];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const group = (title: string, items: QueueEntry[], passive = false): Group[] => (items.length ? [{ title, items, ...(passive ? { passive } : {}) }] : []);
  const isLead = u.role === "admin" || u.is_team_lead, isRnd = u.role === "admin" || u.role === "rnd";
  // Trưởng team: mẫu của team mình + mẫu chưa gắn team
  const scoped = () => {
    const q = sb.rnd().from("products").select("*");
    const mine = [u.team_id, u.team2_id].filter(Boolean).map((t) => `team_id.eq.${t}`);   // team chính + team 2
    return u.role === "admin" ? q : q.or([...mine, "team_id.is.null"].join(","));
  };

  // Các nhóm việc độc lập → chạy SONG SONG (mỗi truy vấn ~100ms; chạy nối tiếp từng mất ~1,7s mỗi lần tải trang)

  // Người được giao vẽ 3D / quay source
  const assigned = async (): Promise<Group[]> => {
    const [{ data: myDesign }, { data: myMedia }] = await Promise.all([
      sb.rnd().from("design_tasks").select("product_id, status, review_note").eq("assignee_id", u.id).in("status", ["todo", "doing", "redo"]),
      sb.rnd().from("media_requests").select("product_id, request_type, status, deadline, approval, review_note").eq("assignee_id", u.id).neq("status", "done"),
    ]);
    const own = await products([...(myDesign ?? []), ...(myMedia ?? [])].map((t) => t.product_id));
    return [
      ...group("Vẽ 3D được giao", (myDesign ?? []).flatMap((t) => entry(own.get(t.product_id),
        t.status === "redo" ? `Sửa lại 3D: ${t.review_note ?? ""}` : t.status === "doing" ? "Đang vẽ 3D" : "Vẽ 3D", null, t.status === "redo" ? "warn" : undefined))),
      ...group("Yêu cầu quay video được giao (bảng Hoàn thành mẫu)", (myMedia ?? []).flatMap((t) => entry(own.get(t.product_id),
        t.approval === "redo" ? `Sửa lại ${t.request_type}: ${t.review_note ?? ""}` : `${t.status === "doing" ? "Đang làm" : "Cần làm"}: ${t.request_type}`,
        t.deadline, t.deadline && t.deadline < today ? "bad" : t.approval === "redo" ? "warn" : undefined))),
    ];
  };

  // Duyệt mẫu sưu tầm: Quản lý / trưởng team
  const pending = async (): Promise<Group[]> => {
    if (!isLead) return [];
    const { data: pend } = await scoped().eq("approval", "pending").is("killed_at", null);
    return group("Chờ bạn duyệt mẫu", (pend as PipelineItem[] ?? []).flatMap((p) => entry(p, "Duyệt mẫu sưu tầm", p.updated_at)));
  };

  // P4 đã có đề xuất của hệ thống nhưng chưa xác nhận + đề xuất đổi sau khi đã duyệt
  // (gồm cả mẫu đã FAIL/kill — VD video trong cửa sổ test viral muộn). Gộp 1 lượt đọc P4/P5.
  const results = async (): Promise<Group[]> => {
    if (!isLead) return [];
    const { data } = await scoped().in("stage", ["p4", "p5"]);
    const all = (data as PipelineItem[] ?? []);
    const withCode = all.filter((p) => p.code);
    const [{ data: decs }, { data: evs }] = withCode.length ? await Promise.all([
      sb.rnd().from("current_decisions").select("product_id, result, suggested").in("product_id", withCode.map((p) => p.id)),
      sb.rnd().from("evaluations").select("code, result").in("code", withCode.map((p) => p.code!)),
    ]) : [{ data: [] }, { data: [] }];
    const res = new Map((evs ?? []).map((e) => [e.code as string, e.result as string]));
    const label = (r: string) => RESULT_TO[r] ?? "FAIL";
    const decided = new Set((decs ?? []).map((d) => d.product_id as string));
    const ready = all.filter((p) => !p.killed_at).flatMap((p) => {
      const r = p.code ? res.get(p.code) : undefined;
      if (p.stage === "p5") return decided.has(p.id) ? [] : entry(p, `Hệ thống đánh giá ${label(r ?? "win")} — duyệt thương mại hoá (P6)`);
      return p.stage === "p4" && r && r !== "testing" ? entry(p, `Hệ thống đề xuất ${label(r)} — xác nhận kết quả`) : [];
    });
    const drifted = withCode.flatMap((p): QueueEntry[] => {
      const d = decs?.find((x) => x.product_id === p.id), e = evs?.find((x) => x.code === p.code);
      if (!d || !e || e.result === "testing" || e.result === d.result || e.result === d.suggested) return [];
      return [{ id: p.id, st_code: p.st_code, code: p.code, name: p.name, tone: "warn",
        what: `Đã duyệt ${label(d.result)}, hệ thống nay đề xuất ${label(e.result)} — xem lại ở bảng Win` }];
    });
    return [...group("Chờ bạn duyệt kết quả / thương mại hoá", ready), ...group("Đề xuất đổi sau kết luận", drifted)];
  };

  // Luồng Media: mẫu Media tự test (không qua R&D, mẫu mới) đạt WIN, team chưa quyết định → báo Quản lý / R&D / trưởng team
  const mediaWins = async (): Promise<Group[]> => {
    if (!(isRnd || u.is_team_lead)) return [];
    const { data: wins } = await sb.rnd().from("evaluations")
      .select("code, result, product_id, product:products(name, stage, media_review, created_by)")
      .in("result", ["win", "win_traffic", "win_sp"]).eq("age", "new").not("product_id", "is", null);
    type W = { code: string; result: string; product_id: string; product: { name: string; stage: string | null; media_review: string | null; created_by: string | null } | null };
    return group("🔔 Media test WIN — chờ team xem xét", ((wins ?? []) as unknown as W[]).filter((w) => w.product && !w.product.stage && !w.product.media_review && isSystemTestCode(w.code, w.product.created_by))   // chỉ mã test TẠO TRÊN HỆ THỐNG (có người tạo); mã đồ da TX… / hồ sơ tự sinh không tính
      .map((w): QueueEntry => ({ id: w.product_id, st_code: null, code: w.code, name: w.product!.name,
        what: `Media test ${RESULT_TO[w.result] ?? w.result} — xem xét đưa vào quy trình R&D (Dashboard › Luồng Media)` })));
  };

  // Luồng Media: mã test do CHÍNH MÌNH tạo (Media / R&D / Quản lý) — việc của người tạo mã ở từng bước
  //   chưa đăng video → đăng video gắn #mã · WIN → chờ R&D xem xét (theo dõi) · đã được đưa vào R&D → theo dõi điểm vào
  const myTestCodes = async (): Promise<Group[]> => {
    const { data: ps } = await sb.rnd().from("products").select("id, code, name, stage, created_at, media_review, media_review_at, killed_at, created_by").eq("created_by", u.id).like("code", "T%").is("killed_at", null).order("created_at", { ascending: false }).limit(300);
    const mine = (ps ?? []).filter((p) => isSystemTestCode(p.code as string, p.created_by as string | null));
    if (!mine.length) return [];
    const [{ data: evs }, links] = await Promise.all([
      sb.rnd().from("evaluations").select("code, result, metrics").in("code", mine.map((p) => p.code as string)),
      loadCodeLinks(),
    ]);
    const ev = new Map((evs ?? []).map((e) => [e.code as string, e as { result: string; metrics: { videos?: number } | null }]));
    const linked = new Set(links.map((l) => l.product_id));
    const row = (p: (typeof mine)[number], what: string, when?: string | null, tone?: QueueEntry["tone"]): QueueEntry => ({ id: p.id as string, st_code: null, code: p.code as string, name: p.name as string, what, when, tone });
    const noVideo = mine.filter((p) => !p.stage && !p.media_review && !Number(ev.get(p.code as string)?.metrics?.videos ?? 0));
    const winWait = mine.filter((p) => !p.stage && !p.media_review && ["win", "win_traffic", "win_sp"].includes(ev.get(p.code as string)?.result ?? ""));
    const taken = mine.filter((p) => p.stage && p.media_review === "accepted");
    return [
      ...group("Mã test chưa đăng video", noVideo.map((p) => row(p, `Đăng video gắn #${p.code} để hệ thống bắt đầu chấm KPI`, p.created_at))),
      ...group("Mã test đã WIN — chờ R&D xem xét", winWait.map((p) => row(p, `Media test ${RESULT_TO[ev.get(p.code as string)!.result] ?? "WIN"} — R&D / trưởng team đang xem xét đưa vào quy trình`)), true),
      ...group("Mã test đã được đưa vào R&D", taken.map((p) => row(p, `R&D đã nhận (${p.stage === "p4" ? "vào thẳng P4" : "làm lại từ P1"})${linked.has(p.id as string) ? "" : " · chờ gắn mã SPU khi mở bán"}`, p.media_review_at as string | null)), true),
    ];
  };

  // R&D / Quản lý: mẫu Media đã đưa vào quy trình nhưng chưa gắn mã SPU thương mại + ngày mở bán (gắn ở trang Mã SPU test)
  const linkSku = async (): Promise<Group[]> => {
    if (!isRnd) return [];
    const { data: ps } = await sb.rnd().from("products").select("id, code, name, stage, media_review_at, created_by").eq("media_review", "accepted").like("code", "T%").is("killed_at", null).limit(500);
    const taken = (ps ?? []).filter((p) => p.stage && isSystemTestCode(p.code as string, p.created_by as string | null));
    if (!taken.length) return [];
    const linked = new Set((await loadCodeLinks()).map((l) => l.product_id));
    return group("Gắn mã SPU + ngày mở bán (mẫu từ luồng Media)", taken.filter((p) => !linked.has(p.id as string)).map((p): QueueEntry => ({
      id: p.id as string, st_code: null, code: p.code as string, name: p.name as string, when: p.media_review_at as string | null, href: "/rnd/test-codes",
      what: "Khi mở bán: gắn mã SPU Sapo + ngày mở bán (trang Mã SPU test)" })));
  };

  // R&D / Quản lý: duyệt 3D, duyệt source
  const reviews = async (): Promise<Group[]> => {
    if (!isRnd) return [];
    const [{ data: dReview }, { data: mReview }] = await Promise.all([
      sb.rnd().from("design_tasks").select("product_id, submitted_at").eq("status", "review"),
      sb.rnd().from("media_requests").select("product_id, done_at").eq("approval", "pending"),
    ]);
    const rv = await products([...(dReview ?? []), ...(mReview ?? [])].map((t) => t.product_id));
    return group("Chờ duyệt 3D / source", [
      ...(dReview ?? []).flatMap((t) => entry(rv.get(t.product_id), "Duyệt bản 3D", t.submitted_at)),
      ...(mReview ?? []).flatMap((t) => entry(rv.get(t.product_id), "Duyệt source media", t.done_at)),
    ]);
  };

  // Quản lý: mọi mẫu đang chờ bước kế tiếp; R&D: mẫu mình sưu tầm
  const nextSteps = async (): Promise<Group[]> => {
    if (!isRnd) return [];
    const [{ data: stuck }, { data: d }, { data: m }] = await Promise.all([
      sb.rnd().from("products").select("*").in("stage", ["p1", "p2", "p3", "p4"]).is("killed_at", null)
        .match(u.role === "admin" ? {} : { created_by: u.id }),
      // Bản ghi do luật tự động tạo ra nhưng chưa ai nhận (chưa giao người vẽ / người phụ trách media)
      sb.rnd().from("design_tasks").select("product_id").is("assignee_id", null).neq("status", "done"),
      sb.rnd().from("media_requests").select("product_id").is("assignee_id", null).neq("status", "done"),
    ]);
    const noDesigner = new Set((d ?? []).map((x) => x.product_id)), noMedia = new Set((m ?? []).map((x) => x.product_id));
    return group("Cần làm bước tiếp theo", (stuck as PipelineItem[] ?? []).flatMap((p) =>
      p.stage === "p1" ? entry(p, "Bấm “Bắt đầu sản xuất” (trang mẫu)", p.stage_at)
      : p.stage === "p2" && noDesigner.has(p.id) ? entry(p, "Giao người vẽ 3D (bảng Sản xuất mẫu)", p.stage_at)
      : p.stage === "p3" && noMedia.has(p.id) ? entry(p, "Giao người quay video trên tay (bảng Hoàn thành mẫu)", p.stage_at)
      : (p.stage === "p3" || p.stage === "p4") && !p.code ? entry(p, "Gắn mã SPU trước khi đăng video (bảng Hoàn thành mẫu)", p.stage_at)
      : []));
  };

  const drafts = async (): Promise<Group[]> => {
    if (!isRnd) return [];
    const { data: rejected } = await sb.rnd().from("products").select("*").eq("created_by", u.id).in("approval", ["draft", "rejected"]).is("killed_at", null);
    return group("Mẫu sưu tầm của bạn", (rejected as PipelineItem[] ?? []).flatMap((p) =>
      entry(p, p.approval === "rejected" ? `Không duyệt: ${p.approval_note ?? ""}` : "Nháp — chưa gửi duyệt", p.updated_at, p.approval === "rejected" ? "warn" : undefined)));
  };

  // Thứ tự nhóm giữ như cũ
  const canTest = u.role === "admin" || u.role === "rnd" || u.role === "media";
  return (await Promise.all([assigned(), pending(), results(), mediaWins(), reviews(), nextSteps(), linkSku(), canTest ? myTestCodes() : [], drafts()])).flat();
}

export async function myQueueCount(u: CurrentUser) {
  try {
    return (await myQueue(u)).reduce((n, g) => n + (g.passive ? 0 : g.items.length), 0);
  } catch {
    return 0;   // chưa chạy migration 015
  }
}

// ---------- Thống kê theo người / team (sheet "Thống kê") ----------

export type StatRow = {
  key: string; name: string; team: string | null;
  total: number; reached: Record<Stage, number>; killed: number;
  groups: Record<ProductGroup, number>; sampleDays: number | null;   // TB ngày từ duyệt → nhận mẫu
};

export async function pipelineStats(from: string, to: string) {
  const { data, error } = await sb.rnd().from("products")
    .select("id, created_by, team_id, stage, product_group, killed_at, approved_at, created_at, entry_source, media_review_at")
    .not("stage", "is", null);
  if (error) throw error;
  const items = (data as PipelineItem[]).filter((p) => inRange(entryDate(p), from, to)) as Pick<PipelineItem, "id" | "created_by" | "team_id" | "stage" | "product_group" | "killed_at" | "approved_at" | "created_at">[];
  const ids = items.map((i) => i.id);
  const { data: samples } = ids.length
    ? await sb.rnd().from("sample_orders").select("product_id, received_at").in("product_id", ids).not("received_at", "is", null)
    : { data: [] };
  const received = new Map<string, string>();
  for (const s of samples ?? []) if (!received.has(s.product_id) || s.received_at < received.get(s.product_id)!) received.set(s.product_id, s.received_at);

  const [names, teams] = await Promise.all([profileNames(items.map((i) => i.created_by)), getTeams()]);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const order: Stage[] = [...STAGES];
  const blank = (key: string, name: string, team: string | null): StatRow & { _days: number[] } => ({
    key, name, team, total: 0, killed: 0, sampleDays: null, _days: [],
    reached: Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>,
    groups: { gmv: 0, traffic: 0, profit: 0, return: 0 },
  });
  const people = new Map<string, ReturnType<typeof blank>>(), byTeam = new Map<string, ReturnType<typeof blank>>();
  for (const i of items) {
    const tName = i.team_id ? teamName.get(i.team_id) ?? null : null;
    const rows = [
      // nhân viên tách theo từng team (1 người có thể sưu tầm cho nhiều team)
      people.get(`${i.team_id ?? "-"}|${i.created_by ?? "?"}`)
        ?? blank(`${i.team_id ?? "-"}|${i.created_by ?? "?"}`, i.created_by ? names.get(i.created_by) ?? "?" : "?", tName ?? "Chưa gắn team"),
      byTeam.get(i.team_id ?? "-") ?? blank(i.team_id ?? "-", tName ?? "Chưa gắn team", null),
    ];
    people.set(rows[0].key, rows[0]);
    byTeam.set(rows[1].key, rows[1]);
    const idx = order.indexOf(i.stage);
    const days = i.approved_at && received.get(i.id)
      ? Math.max(0, Math.round((Date.parse(received.get(i.id)!) - Date.parse(i.approved_at.slice(0, 10))) / 86_400_000)) : null;
    for (const r of rows) {
      r.total += 1;
      for (let k = 1; k <= idx; k++) r.reached[order[k]] += 1;   // đã đạt mốc P0..Px
      if (i.killed_at) r.killed += 1;
      if (i.product_group) r.groups[i.product_group] += 1;
      if (days !== null) r._days.push(days);
    }
  }
  const finish = (m: Map<string, ReturnType<typeof blank>>) => [...m.values()]
    .map(({ _days, ...r }) => ({ ...r, sampleDays: _days.length ? _days.reduce((a, b) => a + b, 0) / _days.length : null }))
    .sort((a, b) => b.total - a.total);
  return { people: finish(people), teams: finish(byTeam), total: items.length };
}

// ---------- Danh sách lựa chọn (Cấu hình) ----------

// Cache dùng chung (xoá khi lưu Cấu hình — bust(TAG.rndOptions))
const rndOptionsRaw = unstable_cache(async () => {
  const { data } = await sb.core().from("settings").select("value").eq("key", "rnd_options").maybeSingle();
  return (data?.value as object) ?? {};
}, ["rnd-options"], { tags: [TAG.rndOptions], revalidate: 3600 });

export async function getRndOptions(): Promise<RndOptions> {
  const o = { ...DEFAULT_OPTIONS, ...(await rndOptionsRaw()) };
  // Cấu hình cũ chưa có đơn nháp: "Đặt hàng" (trạng thái đầu, chưa đặt xưởng) đọc thành "Chưa đặt"; chưa có thì thêm vào đầu danh sách
  // Tên cũ → tên mới (Chốt đúc → Đã đặt hàng, Hoàn thành → Hoàn thành mẫu) cho tới khi chạy migration 096
  const hadDraft = o.order_status.some((x) => x.flag === "draft");
  const list = o.order_status.map((x) => (!hadDraft && x.value === "Đặt hàng" ? { value: DRAFT_ORDER, color: 18, flag: "draft" as const } : { ...x, value: normOrderStatus(x.value) }));
  o.order_status = list.some((x) => x.flag === "draft") ? list : [{ value: DRAFT_ORDER, color: 18, flag: "draft" as const }, ...list];
  return o;
}

// ---------- P4: mẫu đã lên video ở kênh nào (kênh đã liên kết = social.channels đang hoạt động) ----------

export type ChannelCoverage = { channels: { id: string; name: string; platform: string }[]; posted: Map<string, Set<string>> };

export async function channelCoverage(codes: string[]): Promise<ChannelCoverage> {
  const { data: chans } = await sb.social().from("channels").select("id, name, platform").eq("is_active", true).order("platform").order("name");
  const channels = (chans ?? []) as ChannelCoverage["channels"];
  const posted = new Map<string, Set<string>>();
  if (!codes.length) return { channels, posted };
  const posts = await fetchAll<{ channel_id: string; product_codes: string[] }>((a, b) =>
    sb.social().from("posts").select("channel_id, product_codes").overlaps("product_codes", codes).order("id").range(a, b));
  for (const p of posts) for (const c of p.product_codes) if (codes.includes(c)) posted.set(c, (posted.get(c) ?? new Set()).add(p.channel_id));
  return { channels, posted };
}
