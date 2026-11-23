"use server";

import { revalidatePath } from "next/cache";
import { attempt } from "@/lib/action-result";
import { TAG, bust } from "@/lib/cache-tags";
import { requireActionUser } from "@/lib/session";
import { sb } from "@/lib/supabase/admin";
import { canAssignHandoff, canWorkHandoff } from "@/lib/handoff";
import { stageIndex, type Stage } from "@/lib/pipeline-constants";

type Status = "pending" | "received" | "developing" | "done" | "returned";

// Luật chuyển trạng thái: chỉ đi tới, "từ chối" được từ mọi bước chưa xong
const NEXT: Record<Status, Status[]> = {
  pending: ["received", "returned"],
  received: ["developing", "done", "returned"],
  developing: ["done", "returned"],
  done: [],
  returned: [],
};

const MULTI_HINT = "Chưa chạy migration 034 trong Supabase (cho phép giao 1 mẫu cho nhiều team). Hiện chỉ giao được cho 1 team mỗi lần";
const MIGRATION_HINT = "Chưa chạy migration 033 trong Supabase (thêm cột team_id / deadline cho phiếu giao việc)";
const missingCol = (e: { code?: string; message?: string }) => e.code === "42703" || e.code === "PGRST204" || /team_id|deadline/.test(e.message ?? "");
const refresh = (productId?: string) => { bust(TAG.handoffs); revalidatePath("/sample-push"); revalidatePath("/sample-push/overview"); if (productId) revalidatePath(`/rnd/${productId}`); };
const cleanDate = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

// Team Sao Biển được giao tiếp nhận / từ chối / làm tiếp / hoàn thành (hoặc Quản lý). Từ chối bắt buộc ghi lý do.
async function moveHandoffImpl(id: string, to: Status, note?: string) {
  const user = await requireActionUser(["rnd", "admin"]);
  const db = sb.rnd();
  const { data: h } = await db.from("handoffs").select("*").eq("id", id).single();
  if (!h) throw new Error("Không tìm thấy phiếu giao việc");
  if (!canWorkHandoff(user, h.team_id ?? null)) throw new Error(h.team_id ? "Chỉ thành viên team được giao mới thao tác phiếu này (Quản lý không thao tác thay team)" : "Phiếu chưa được phân công cho team nào");
  if (!NEXT[h.status as Status].includes(to)) throw new Error("Không chuyển được sang trạng thái này");
  if (to === "returned" && !note?.trim()) throw new Error("Ghi lý do từ chối");

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: to, updated_at: now };
  if (to === "received") { patch.received_at = now; patch.assignee_id = h.assignee_id ?? user.id; }
  if (to === "done") patch.done_at = now;
  if (note?.trim()) patch.saobien_note = note.trim();
  const { error } = await db.from("handoffs").update(patch).eq("id", id).eq("status", h.status); // chống bấm trùng
  if (error) throw new Error(error.message);
  await db.from("handoff_events").insert({ handoff_id: id, actor_id: user.id, action: to, note: note?.trim() || null });
  refresh(h.product_id);
}

// R&D huỷ giao việc khi team Sao Biển chưa tiếp nhận
async function cancelHandoffImpl(id: string) {
  const user = await requireActionUser(["rnd", "admin"]);
  const db = sb.rnd();
  const { data: h } = await db.from("handoffs").select("status, product_id").eq("id", id).single();
  if (!h) throw new Error("Không tìm thấy phiếu giao việc");
  if (h.status !== "pending") throw new Error("Team Sao Biển đã tiếp nhận — không huỷ được, hãy trao đổi với team đó");
  await db.from("handoff_events").insert({ handoff_id: id, actor_id: user.id, action: "cancelled" });
  await db.from("handoffs").update({ status: "returned", saobien_note: "R&D huỷ giao việc", updated_at: new Date().toISOString() }).eq("id", id);
  refresh(h.product_id);
}

// Danh sách team nhận hợp lệ: team còn hoạt động, KHÁC team yêu cầu (mẫu thuộc team nào thì không giao lại cho chính team đó)
async function validTeams(teamIds: string[], ownTeam: string | null) {
  const ids = [...new Set(teamIds.filter(Boolean))].filter((t) => t !== ownTeam);
  if (!ids.length) throw new Error("Chọn ít nhất 1 team nhận việc (khác team yêu cầu)");
  const { data } = await sb.core().from("teams").select("id, name").in("id", ids).eq("is_active", true);
  if (!data?.length) throw new Error("Chọn team nhận việc");
  return data as { id: string; name: string }[];
}

// Phân công (hoặc giao lại sau khi bị từ chối) một phiếu cho MỘT HOẶC NHIỀU team: team đầu tiên nhận chính phiếu này,
// mỗi team còn lại có thêm 1 phiếu riêng (cùng mẫu, cùng yêu cầu, cùng hạn). Team nào đã có phiếu đang mở cho mẫu thì bỏ qua.
async function assignHandoffImpl(id: string, teamIds: string[], deadline: string | null, note: string) {
  const user = await requireActionUser(["rnd", "admin"]);
  const db = sb.rnd();
  const { data: h } = await db.from("handoffs").select("*, product:products(team_id)").eq("id", id).single();
  if (!h) throw new Error("Không tìm thấy phiếu giao việc");
  const productTeam = (h.product as { team_id: string | null } | null)?.team_id ?? null;
  if (!canAssignHandoff(user, productTeam)) throw new Error("Chỉ Quản lý hoặc team yêu cầu được phân công");
  if (h.status === "received" || h.status === "developing" || h.status === "done") throw new Error("Team được giao đã tiếp nhận — không đổi team được");
  const teams = await validTeams(teamIds, productTeam);

  const { data: openRows } = await db.from("handoffs").select("team_id").eq("product_id", h.product_id).neq("status", "returned").neq("id", id);
  const taken = new Set((openRows ?? []).map((r) => r.team_id as string | null));
  const todo = teams.filter((t) => !taken.has(t.id));
  if (!todo.length) throw new Error("Các team đã chọn đều đang có phiếu giao việc cho mẫu này");

  const now = new Date().toISOString(), dl = cleanDate(deadline), nt = note.trim();
  const [first, ...others] = todo;
  // Tạo phiếu cho các team còn lại TRƯỚC, rồi mới cập nhật phiếu gốc: nếu DB từ chối (vd chưa chạy migration 034) thì chưa có gì thay đổi
  const created: string[] = [];
  for (const t of others) {
    const { data: c, error: e2 } = await db.from("handoffs").insert({
      product_id: h.product_id, decision_id: h.decision_id ?? null, result: h.result ?? null, snapshot: h.snapshot ?? {}, source_url: h.source_url ?? null,
      rnd_note: nt || h.rnd_note || null, status: "pending", team_id: t.id, deadline: dl, created_by: user.id,
    }).select("id").single();
    if (e2) {
      if (created.length) await db.from("handoffs").delete().in("id", created);   // hoàn tác các phiếu vừa tạo
      throw new Error(e2.code === "23505" ? MULTI_HINT : e2.message);
    }
    created.push(c.id);
    await db.from("handoff_events").insert({ handoff_id: c.id, actor_id: user.id, action: "assigned", note: `${t.name}${nt ? ` — ${nt}` : ""}` });
  }
  const { error } = await db.from("handoffs").update({
    team_id: first.id, deadline: dl, status: "pending", assignee_id: null, received_at: null, updated_at: now, ...(nt ? { rnd_note: nt } : {}),
  }).eq("id", id);
  if (error) {
    if (created.length) await db.from("handoffs").delete().in("id", created);
    throw new Error(missingCol(error) ? MIGRATION_HINT : error.message);
  }
  await db.from("handoff_events").insert({ handoff_id: id, actor_id: user.id, action: "assigned", note: `${first.name}${nt ? ` — ${nt}` : ""}` });
  refresh(h.product_id);
}

// Giao một mẫu lên video từ P3 trở đi (chưa cần Win) cho một hoặc nhiều team: mỗi team 1 phiếu.
async function createVideoRequestImpl(productId: string, teamIds: string[], deadline: string | null, note: string) {
  const user = await requireActionUser(["rnd", "admin"]);
  const db = sb.rnd();
  const { data: p } = await db.from("products").select("id, code, stage, team_id, source_url, killed_at").eq("id", productId).single();
  if (!p) throw new Error("Không tìm thấy mẫu");
  if (!canAssignHandoff(user, p.team_id ?? null)) throw new Error("Chỉ Quản lý hoặc team sở hữu mẫu được giao việc");
  if (!p.stage || stageIndex(p.stage as Stage) < stageIndex("p3")) throw new Error("Chỉ giao lên video từ P3 (Hoàn thành mẫu) trở đi");
  if (p.killed_at) throw new Error("Mẫu đã dừng");
  const teams = await validTeams(teamIds, p.team_id ?? null);
  const { data: openRows } = await db.from("handoffs").select("team_id").eq("product_id", productId).neq("status", "returned");
  const taken = new Set((openRows ?? []).map((r) => r.team_id as string | null));
  const todo = teams.filter((t) => !taken.has(t.id));
  if (!todo.length) throw new Error("Các team đã chọn đều đang có phiếu giao việc cho mẫu này");

  const nt = note.trim(), dl = cleanDate(deadline);
  for (const t of todo) {
    const { data: h, error } = await db.from("handoffs").insert({
      product_id: productId, result: null, snapshot: {}, source_url: p.source_url ?? null, rnd_note: nt || null,
      status: "pending", team_id: t.id, deadline: dl, created_by: user.id,
    }).select("id").single();
    if (error) throw new Error(error.code === "23505" ? MULTI_HINT : missingCol(error) || /null value in column/.test(error.message) ? MIGRATION_HINT : error.message);
    await db.from("handoff_events").insert({ handoff_id: h.id, actor_id: user.id, action: "created", note: `giao cho ${t.name}${nt ? ` — ${nt}` : ""}` });
  }
  refresh(productId);
}

// ---------- Hàm gọi từ trình duyệt: trả lỗi thay vì ném (xem lib/action-result — Next giấu nội dung lỗi ném ra từ server action) ----------

export async function moveHandoff(id: string, to: Status, note?: string) {
  return attempt(() => moveHandoffImpl(id, to, note));
}
export async function cancelHandoff(id: string) {
  return attempt(() => cancelHandoffImpl(id));
}
export async function assignHandoff(id: string, teamIds: string[], deadline: string | null, note: string) {
  return attempt(() => assignHandoffImpl(id, teamIds, deadline, note));
}
export async function createVideoRequest(productId: string, teamIds: string[], deadline: string | null, note: string) {
  return attempt(() => createVideoRequestImpl(productId, teamIds, deadline, note));
}
