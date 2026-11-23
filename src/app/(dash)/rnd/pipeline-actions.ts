"use server";

import { attempt } from "@/lib/action-result";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canApprove, isRndEditor, requireActionUser, type CurrentUser } from "@/lib/session";
import { sb } from "@/lib/supabase/admin";
import {
  COLLECTION_FIELDS, CRAFT_VIDEO_TYPE, HAND_VIDEO_TYPE, MONEY_FIELDS, PRODUCT_GROUPS, stageIndex, type Stage,
} from "@/lib/pipeline-constants";
import { categoryOf } from "@/lib/tags";
import { retagPosts } from "@/lib/sync";
import { afterApproved, afterDesignPassed, requestCraftVideo, revalidateRnd } from "@/lib/rnd-flow";
import { evaluateAll } from "@/lib/eval/engine";
import { spuOf } from "@/lib/spu-code";
import { assertCanApprove } from "@/lib/rnd-score";

// Lệnh ghi DB lỗi thì ném lỗi (không để lỗi âm thầm rồi vẫn ghi nhật ký như đã thành công)
const ok = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); };

export type PState = { error?: string; ok?: boolean };

const now = () => new Date().toISOString();
const text = (form: FormData, k: string) => String(form.get(k) ?? "").trim() || null;
const money = (v: string | null) => (v === null ? null : Math.round(Number(v.replace(/[.,\s]/g, ""))));

function done(id: string) {
  revalidateRnd(id);
}

async function item(id: string) {
  const { data } = await sb.rnd().from("products").select("*").eq("id", id).maybeSingle();
  if (!data?.stage) throw new Error("Không tìm thấy mẫu trong quy trình R&D");
  return data as { id: string; stage: Stage; team_id: string | null; created_by: string | null; approval: string | null; code: string | null; killed_at: string | null; source_url: string | null; category: string | null };
}

async function log(productId: string, actorId: string, action: string, changes: Record<string, [unknown, unknown]> | null = null) {
  await sb.rnd().from("product_events").insert({ product_id: productId, actor_id: actorId, action, changes });
}

// Lên mốc mới (chỉ tiến, không lùi). Trả về true nếu có thay đổi.
async function reach(id: string, from: Stage, to: Stage, user: CurrentUser, note?: string) {
  if (stageIndex(to) <= stageIndex(from)) return false;
  ok(await sb.rnd().from("products").update({ stage: to, stage_at: now(), updated_by: user.id }).eq("id", id));
  await log(id, user.id, "stage_changed", { stage: [from, to], ...(note ? { note: [null, note] } : {}) });
  return true;
}

const canWork = (u: CurrentUser, p: { created_by: string | null }) => isRndEditor(u) || p.created_by === u.id;

function readCollection(form: FormData) {
  const v: Record<string, string | number | null> = {};
  for (const f of COLLECTION_FIELDS) v[f] = text(form, f);
  for (const f of MONEY_FIELDS) {
    const n = money(v[f] as string | null);
    if (n !== null && !(n >= 0)) return { error: "Giá phải là số" } as const;
    v[f] = n;
  }
  if (!v.name) return { error: "Thiếu tên sản phẩm" } as const;
  if (v.product_group && !(String(v.product_group) in PRODUCT_GROUPS)) return { error: "Nhóm SP không hợp lệ" } as const;
  if (v.ref_url && !/^https?:\/\//i.test(String(v.ref_url))) return { error: "Link tham khảo phải bắt đầu bằng http(s)://" } as const;
  return { v } as const;
}

// ---------- Sưu tầm ----------

export async function createCollection(_: PState, form: FormData): Promise<PState> {
  const user = await requireActionUser(["admin", "rnd"]);
  const r = readCollection(form);
  if ("error" in r) return { error: r.error };
  const submit = form.get("intent") === "submit";
  const { data, error } = await sb.rnd().from("products").insert({
    ...r.v, team_id: r.v.team_id ?? user.team_id, stage: "p0", stage_at: now(), entry_source: "rnd",
    approval: submit ? "pending" : "draft", status: "researching", origin: "manual", created_by: user.id, updated_by: user.id,
  }).select("id").single();
  if (error) return { error: error.message };
  await log(data.id, user.id, submit ? "submitted" : "created");
  revalidatePath("/rnd");
  revalidatePath("/tasks");
  redirect(`/rnd/${data.id}?created=1`);
}

export async function updateCollection(id: string, _: PState, form: FormData): Promise<PState> {
  const user = await requireActionUser();
  const p = await item(id);
  if (!canWork(user, p)) return { error: "Bạn không có quyền sửa mẫu này" };
  const r = readCollection(form);
  if ("error" in r) return { error: r.error };
  const { data: old } = await sb.rnd().from("products").select("*").eq("id", id).single();
  const changes: Record<string, [unknown, unknown]> = {};
  for (const f of COLLECTION_FIELDS) if ((old[f] ?? null) !== (r.v[f] ?? null)) changes[f] = [old[f] ?? null, r.v[f] ?? null];
  if (!Object.keys(changes).length) return { ok: true };
  const { error } = await sb.rnd().from("products").update({ ...r.v, updated_by: user.id }).eq("id", id);
  if (error) return { error: error.message };
  await log(id, user.id, "updated", changes);
  done(id);
  return { ok: true };
}

async function submitForApprovalImpl(id: string) {
  const user = await requireActionUser();
  const p = await item(id);
  if (!canWork(user, p)) throw new Error("Bạn không có quyền gửi duyệt mẫu này");
  if (p.stage !== "p0") throw new Error("Mẫu đã qua bước duyệt");
  ok(await sb.rnd().from("products").update({ approval: "pending", approval_note: null, updated_by: user.id }).eq("id", id));
  await log(id, user.id, "submitted");
  done(id);
}

async function decideApprovalImpl(id: string, approve: boolean, note: string) {
  const user = await requireActionUser();
  const p = await item(id);
  if (!canApprove(user, p.team_id)) throw new Error("Chỉ Quản lý hoặc trưởng team của mẫu được duyệt");
  if (p.stage !== "p0" || p.approval !== "pending") throw new Error("Mẫu không ở trạng thái chờ duyệt");
  if (!approve && !note.trim()) throw new Error("Ghi lý do không duyệt");
  if (approve) await assertCanApprove(id, user);   // phải đủ người chấm điểm; mẫu không đạt chỉ Quản lý duyệt
  ok(await sb.rnd().from("products").update({
    approval: approve ? "approved" : "rejected", approval_note: note.trim() || null,
    approved_by: user.id, approved_at: now(), updated_by: user.id,
  }).eq("id", id));
  await log(id, user.id, approve ? "approved" : "rejected", note.trim() ? { approval_note: [null, note.trim()] } : null);
  if (approve) await afterApproved(id, user.id);
  done(id);
}

// Dừng mẫu (kill) — giữ mốc đã đạt để thống kê; Quản lý mở lại được
async function killItemImpl(id: string, reason: string) {
  const user = await requireActionUser();
  const p = await item(id);
  if (!isRndEditor(user) && !canApprove(user, p.team_id)) throw new Error("Bạn không có quyền dừng mẫu");
  if (!reason.trim()) throw new Error("Ghi lý do dừng");
  ok(await sb.rnd().from("products").update({ killed_at: now(), kill_reason: reason.trim(), status: "ended", updated_by: user.id }).eq("id", id));
  await log(id, user.id, "killed", { kill_reason: [null, reason.trim()] });
  done(id);
}

async function restoreItemImpl(id: string) {
  const user = await requireActionUser(["admin"]);
  ok(await sb.rnd().from("products").update({ killed_at: null, kill_reason: null, updated_by: user.id }).eq("id", id));
  await log(id, user.id, "restored");
  done(id);
}

// Bắt đầu sản xuất mẫu: P1 → P2 do R&D chủ động chọn mẫu nào đi làm trước (công đoạn đầu: Vẽ 3D)
async function startProductionImpl(id: string) {
  const user = await requireActionUser();
  const p = await item(id);
  if (!canWork(user, p) && !canApprove(user, p.team_id)) throw new Error("Bạn không có quyền");
  if (p.killed_at) throw new Error("Mẫu đã dừng");
  if (p.stage !== "p1") throw new Error("Chỉ mẫu đã duyệt (P1) mới bắt đầu sản xuất");
  await reach(id, p.stage, "p2", user, "Bắt đầu sản xuất mẫu");
  done(id);
}

// Chọn tay mẫu Win (P5) cần quay source chế tác → tạo yêu cầu ở bảng Media
async function requestCraftVideoImpl(id: string) {
  const user = await requireActionUser(["admin", "rnd"]);
  const p = await item(id);
  if (stageIndex(p.stage) < stageIndex("p5")) throw new Error("Chỉ mẫu Win (P5) mới chọn quay source chế tác");
  if (!(await requestCraftVideo(id, user.id))) throw new Error("Mẫu này đã có yêu cầu quay chế tác");
  done(id);
}

// Bỏ qua công đoạn (vd mẫu mua sẵn không cần 3D / đặt xưởng). Chỉ tới P3 — P4 do video trên tay đạt, P5 do hệ thống đánh giá.
//   → P2: bỏ qua vẽ 3D, tạo luôn đơn đặt hàng · → P3: bỏ qua sản xuất, tạo yêu cầu quay video trên tay
async function skipToImpl(id: string, to: Stage, note: string) {
  const user = await requireActionUser();
  const p = await item(id);
  if (!canApprove(user, p.team_id) && !isRndEditor(user)) throw new Error("Bạn không có quyền");
  if (!["p2", "p3"].includes(to)) throw new Error("Chỉ bỏ qua được tới P3");
  if (p.stage === "p0") throw new Error("Mẫu cần được duyệt trước");
  if (!note.trim()) throw new Error("Ghi lý do bỏ qua bước");
  await reach(id, p.stage, to, user, `Bỏ qua: ${note.trim()}`);
  // Mẫu vẫn cần có mặt ở bảng kế tiếp
  if (to === "p2") await afterDesignPassed(id, user.id);
  if (to === "p3") {
    const { count } = await sb.rnd().from("media_requests").select("*", { count: "exact", head: true }).eq("product_id", id).neq("request_type", CRAFT_VIDEO_TYPE);
    if (!count) await sb.rnd().from("media_requests").insert({ product_id: id, request_type: HAND_VIDEO_TYPE, created_by: user.id });
  }
  done(id);
}

// ---------- Gắn SPU (mã hashtag) ----------

async function linkSkuImpl(id: string, rawCode: string) {
  const user = await requireActionUser();
  const p = await item(id);
  if (!canWork(user, p)) throw new Error("Bạn không có quyền");
  // SPU = mã Sapo phần trước '-' (dán cả D0123-00-S-WH vẫn được)
  const code = spuOf(rawCode).replace(/\s+/g, "");
  if (!/^[A-Z]{1,4}[0-9]{3,}$/.test(code)) throw new Error("Mã SPU phải là 1–4 chữ cái + ít nhất 3 số, VD N0123 (Facebook cắt hashtag ở dấu '-')");
  if (code !== p.code) {
    const { error } = await sb.rnd().rpc("link_code", { p_id: id, p_code: code });
    if (error) throw new Error(error.message);
  }
  const patch: Record<string, unknown> = { sapo_code: null, updated_by: user.id };
  if (!p.category) {
    const { data: pref } = await sb.core().from("settings").select("value").eq("key", "category_prefix").maybeSingle();
    patch.category = categoryOf(code, (pref?.value as Record<string, string>) ?? {}) || null;
  }
  ok(await sb.rnd().from("products").update(patch).eq("id", id));
  await log(id, user.id, "sku_linked", { code: [p.code, code] });
  // Bài đã đăng có mã này → nhận diện + chấm ngay (và tự lên P4 nếu đã có video)
  try { await retagPosts(); await evaluateAll(); } catch (e) { console.error("linkSku eval:", e); }
  done(id);
}

// ---------- Hàm gọi từ trình duyệt: trả lỗi thay vì ném (xem lib/action-result) ----------

export async function submitForApproval(id: string) {
  return attempt(() => submitForApprovalImpl(id));
}

export async function decideApproval(id: string, approve: boolean, note: string) {
  return attempt(() => decideApprovalImpl(id, approve, note));
}

export async function killItem(id: string, reason: string) {
  return attempt(() => killItemImpl(id, reason));
}

export async function restoreItem(id: string) {
  return attempt(() => restoreItemImpl(id));
}

export async function startProduction(id: string) {
  return attempt(() => startProductionImpl(id));
}

export async function requestCraft(id: string) {
  return attempt(() => requestCraftVideoImpl(id));
}

export async function skipTo(id: string, to: Stage, note: string) {
  return attempt(() => skipToImpl(id, to, note));
}

export async function linkSku(id: string, rawCode: string) {
  return attempt(() => linkSkuImpl(id, rawCode));
}
