"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActionUser } from "@/lib/session";
import { decideResult } from "@/lib/rnd-flow";
import { sb } from "@/lib/supabase/admin";
import { RND_FIELDS, RND_STATUS } from "@/lib/rnd";
import { createUploadTicket, newImagePath, removeFiles } from "@/lib/media";
import { parseRules } from "@/lib/kpi-constants";
import { evaluateAll } from "@/lib/eval/engine";
import { retagPosts } from "@/lib/sync";
import { categoryOf } from "@/lib/tags";

// Mã mới/đổi mã → bài đăng gắn mã đó được nhận diện + chấm lại ngay (không chờ đồng bộ)
async function refreshTagsAndEval() {
  try { await retagPosts(); await evaluateAll(); } catch (e) { console.error("refreshTagsAndEval:", e); }
}

const EDITORS = ["admin", "rnd"] as const;

export type FormState = { error?: string; ok?: boolean };

function readForm(form: FormData) {
  const v: Record<string, string | null> = {};
  for (const f of RND_FIELDS) {
    const raw = String(form.get(f) ?? "").trim();
    v[f] = raw === "" ? null : raw;
  }
  // Mã dùng làm hashtag: chữ HOA, bỏ '#' và khoảng trắng
  if (v.code) v.code = v.code.replace(/^#/, "").replace(/\s+/g, "").toUpperCase();
  // SPU = mã Sapo (không còn nhập "Mã Sapo" riêng → tránh 1 mẫu có 2 mã sinh mẫu trùng)
  v.sapo_code = null;
  return v;
}

function validate(v: Record<string, string | null>): string | null {
  if (!v.code) return "Thiếu mã mẫu";
  if (!/^[A-Z]{1,4}[0-9]{3,}$/.test(v.code)) return "Mã mẫu phải là 1–4 chữ cái + ít nhất 3 số, VD RD001 hoặc D0123 (Facebook cắt hashtag ở dấu '-')";
  if (!v.name) return "Thiếu tên mẫu";
  if (v.status && !(v.status in RND_STATUS)) return "Trạng thái không hợp lệ";
  if (v.source_url && !/^https?:\/\//i.test(v.source_url)) return "Link Source phải bắt đầu bằng http:// hoặc https://";
  return null;
}

async function logHistory(productId: string, actorId: string, action: string, changes: Record<string, [unknown, unknown]> | null) {
  await sb.rnd().from("product_events").insert({ product_id: productId, actor_id: actorId, action, changes });
}

export async function createRndProduct(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireActionUser([...EDITORS]);
  const v = readForm(form);
  const err = validate(v);
  if (err) return { error: err };

  // Loại để trống → suy từ chữ cái đầu của mã (M mặt dây, D dây chuyền…)
  if (!v.category) {
    const { data: pref } = await sb.core().from("settings").select("value").eq("key", "category_prefix").maybeSingle();
    v.category = categoryOf(v.code!, (pref?.value as Record<string, string>) ?? {});
  }
  const { data, error } = await sb.rnd().from("products")
    .insert({ ...v, status: v.status ?? "researching", created_by: user.id, updated_by: user.id })
    .select("id").single();
  if (error) return { error: error.code === "23505" ? `Mã ${v.code} đã tồn tại` : error.message };

  await logHistory(data.id, user.id, "created", null);
  await refreshTagsAndEval();
  revalidatePath("/rnd");
  redirect(`/rnd/${data.id}?created=1`);
}

export async function updateRndProduct(id: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireActionUser([...EDITORS]);
  const v = readForm(form);
  const err = validate(v);
  if (err) return { error: err };

  const { data: old } = await sb.rnd().from("products").select("*").eq("id", id).maybeSingle();
  if (!old) return { error: "Không tìm thấy mẫu" };

  const changes: Record<string, [unknown, unknown]> = {};
  for (const f of RND_FIELDS) if ((old[f] ?? null) !== (v[f] ?? null)) changes[f] = [old[f] ?? null, v[f] ?? null];
  if (!Object.keys(changes).length) return { ok: true };

  const { error } = await sb.rnd().from("products")
    .update({ ...v, updated_by: user.id, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.code === "23505" ? `Mã ${v.code} đã tồn tại` : error.message };

  await logHistory(id, user.id, "status" in changes && Object.keys(changes).length === 1 ? "status_changed" : "updated", changes);
  if ("code" in changes || "sapo_code" in changes) await refreshTagsAndEval();
  revalidatePath("/rnd");
  revalidatePath(`/rnd/${id}`);
  return { ok: true };
}

// ---------- Ảnh: trình duyệt tải thẳng lên Storage bằng "vé" server cấp ----------

export async function createImageUpload(productId: string, fileName: string) {
  await requireActionUser([...EDITORS]);
  return createUploadTicket(newImagePath(`${productId}/`, fileName));
}

export async function attachImage(productId: string, path: string) {
  const user = await requireActionUser([...EDITORS]);
  if (!path.startsWith(`${productId}/`)) throw new Error("Đường dẫn ảnh không hợp lệ");
  const { data } = await sb.rnd().from("products").select("image_paths").eq("id", productId).single();
  const { error } = await sb.rnd().from("products")
    .update({ image_paths: [...(data?.image_paths ?? []), path], updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", productId);
  if (error) throw new Error(error.message);
  await logHistory(productId, user.id, "image_added", null);
  revalidatePath(`/rnd/${productId}`);
  revalidatePath("/rnd");
}

export async function removeImage(productId: string, path: string) {
  const user = await requireActionUser([...EDITORS]);
  const { data } = await sb.rnd().from("products").select("image_paths").eq("id", productId).single();
  await sb.rnd().from("products")
    .update({ image_paths: (data?.image_paths ?? []).filter((p: string) => p !== path), updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", productId);
  await removeFiles([path]).catch((e) => console.error("removeImage:", e));
  await logHistory(productId, user.id, "image_removed", null);
  revalidatePath(`/rnd/${productId}`);
  revalidatePath("/rnd");
}

// ---------- Phiên test ----------

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function startTest(productId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireActionUser([...EDITORS]);
  const goal = String(form.get("goal_code") ?? "");
  const start = String(form.get("start_date") ?? ""), end = String(form.get("end_date") ?? "");
  if (!goal) return { error: "Chọn mục tiêu test" };
  if (!isDate(start) || !isDate(end)) return { error: "Ngày bắt đầu/kết thúc không hợp lệ" };
  if (end < start) return { error: "Ngày kết thúc phải sau ngày bắt đầu" };

  let raw: unknown;
  try { raw = JSON.parse(String(form.get("rules") ?? "[]")); } catch { return { error: "Điều kiện KPI không hợp lệ" }; }
  const rules = parseRules(raw);
  if (typeof rules === "string") return { error: rules };
  const minDays = Math.round(Number(form.get("min_days"))), minViews = Math.round(Number(form.get("min_views")));
  if (!(minDays >= 0) || !(minViews >= 0)) return { error: "Điều kiện đủ dữ liệu không hợp lệ" };

  const scope = String(form.get("sales_scope") ?? "all");
  const pageIds = form.getAll("page_ids").map(String).filter(Boolean);
  const channels = form.getAll("channels").map(String).filter(Boolean);
  if (scope === "pages" && !pageIds.length) return { error: "Chọn ít nhất 1 Trang cho phạm vi \"Chỉ đơn từ Trang test\"" };
  if (scope === "channels" && !channels.length) return { error: "Chọn ít nhất 1 kênh bán" };
  if (!["all", "pages", "channels"].includes(scope)) return { error: "Phạm vi số bán không hợp lệ" };

  const templateId = String(form.get("template_id") ?? "") || null;
  const { error } = await sb.rnd().from("test_sessions").insert({
    product_id: productId, goal_code: goal, template_id: templateId, campaign: String(form.get("campaign") ?? "").trim() || null,
    start_date: start, end_date: end, sales_scope: scope,
    page_ids: scope === "pages" ? pageIds : [], channels: scope === "channels" ? channels : [],
    rules, match: form.get("match") === "any" ? "any" : "all", min_days: minDays, min_views: minViews,
    note: String(form.get("note") ?? "").trim() || null, created_by: user.id,
  });
  if (error) return { error: error.code === "23505" ? "Mẫu này đang có phiên test chạy — kết thúc phiên cũ trước" : error.message };

  await sb.rnd().from("products").update({ status: "testing", updated_by: user.id, updated_at: new Date().toISOString() }).eq("id", productId);
  await logHistory(productId, user.id, "test_started", { goal: [null, goal], dates: [null, `${start} → ${end}`] });
  revalidatePath(`/rnd/${productId}`);
  revalidatePath("/rnd");
  return { ok: true };
}

export async function endTest(sessionId: string) {
  const user = await requireActionUser([...EDITORS]);
  const { data: s, error } = await sb.rnd().from("test_sessions")
    .update({ status: "ended", ended_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", sessionId).eq("status", "running").select("product_id").single();
  if (error) throw new Error("Không kết thúc được phiên (có thể đã kết thúc trước đó)");
  await sb.rnd().from("products").update({ status: "ended", updated_by: user.id, updated_at: new Date().toISOString() }).eq("id", s.product_id);
  await logHistory(s.product_id, user.id, "test_ended", null);
  revalidatePath(`/rnd/${s.product_id}`);
  revalidatePath("/rnd");
}

// Sửa ngày kết thúc / ghi chú của phiên (KPI đã chụp lại thì không sửa ở đây)
export async function updateSession(sessionId: string, patch: { end_date?: string; note?: string }) {
  const user = await requireActionUser([...EDITORS]);
  const { data: old } = await sb.rnd().from("test_sessions").select("product_id, start_date, end_date, note").eq("id", sessionId).single();
  if (!old) throw new Error("Không tìm thấy phiên test");
  if (patch.end_date !== undefined && (!isDate(patch.end_date) || patch.end_date < old.start_date)) throw new Error("Ngày kết thúc không hợp lệ");
  const { error } = await sb.rnd().from("test_sessions").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", sessionId);
  if (error) throw new Error(error.message);
  const changes: Record<string, [unknown, unknown]> = {};
  if (patch.end_date !== undefined && patch.end_date !== old.end_date) changes.end_date = [old.end_date, patch.end_date];
  if (patch.note !== undefined && patch.note !== old.note) changes.note = [old.note, patch.note];
  if (Object.keys(changes).length) await logHistory(old.product_id, user.id, "test_updated", changes);
  revalidatePath(`/rnd/${old.product_id}`);
}

// Huỷ phiên tạo nhầm (chỉ Quản lý, chỉ khi chưa có kết quả xác nhận)
export async function cancelSession(sessionId: string) {
  const user = await requireActionUser(["admin"]);
  const { data: s } = await sb.rnd().from("test_sessions").select("product_id, status").eq("id", sessionId).single();
  if (!s) throw new Error("Không tìm thấy phiên test");
  const { count: decided } = await sb.rnd().from("decisions").select("*", { count: "exact", head: true }).eq("session_id", sessionId);
  if (decided) throw new Error("Phiên đã có kết quả xác nhận — không thể huỷ");
  await sb.rnd().from("test_sessions").delete().eq("id", sessionId);
  // Không còn phiên nào → mẫu về "Đang nghiên cứu"
  const { count } = await sb.rnd().from("test_sessions").select("*", { count: "exact", head: true }).eq("product_id", s.product_id);
  if (!count) await sb.rnd().from("products").update({ status: "researching", updated_by: user.id, updated_at: new Date().toISOString() }).eq("id", s.product_id);
  await logHistory(s.product_id, user.id, "test_cancelled", null);
  revalidatePath(`/rnd/${s.product_id}`);
  revalidatePath("/rnd");
}

// R&D sửa phân loại mới/cũ (null = để hệ thống tự phân loại), rồi chấm lại ngay
export async function setAgeOverride(productId: string, age: "new" | "old" | null) {
  const user = await requireActionUser([...EDITORS]);
  const { data: old } = await sb.rnd().from("products").select("age_override").eq("id", productId).single();
  await sb.rnd().from("products").update({ age_override: age, updated_by: user.id, updated_at: new Date().toISOString() }).eq("id", productId);
  await logHistory(productId, user.id, "age_changed", { age_override: [old?.age_override ?? null, age] });
  await evaluateAll();
  revalidatePath(`/rnd/${productId}`);
  revalidatePath("/");
}

// ---------- Xác nhận kết quả + chuyển Sao Biển ----------

// Duyệt Win (P5): Quản lý hoặc trưởng team của mẫu — logic chung ở lib/rnd-flow (dùng cả cho bảng Duyệt SP Win)
export async function confirmResult(productId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireActionUser();
  const result = String(form.get("result") ?? "");
  if (!["win", "win_traffic", "win_sp", "fail"].includes(result)) return { error: "Chọn kết quả" };
  const qtyRaw = String(form.get("win_qty") ?? "").trim();
  const err = await decideResult(productId, user, {
    result: result as "win" | "win_traffic" | "win_sp" | "fail",
    note: String(form.get("note") ?? "").trim() || null,
    winQty: qtyRaw ? Math.round(Number(qtyRaw)) : undefined,
    handoff: form.get("handoff") === "1",
    handoffNote: String(form.get("handoff_note") ?? "").trim() || null,
    toCommercial: form.get("commercial") === "1" && result !== "fail",   // duyệt thương mại hoá ở trang mẫu: sang thẳng P6
  });
  return err ? { error: err } : { ok: true };
}
