"use server";

import { attempt, unwrap } from "@/lib/action-result";
import { canApprove, isRndEditor, requireActionUser, type CurrentUser } from "@/lib/session";
import { sb } from "@/lib/supabase/admin";
import { createUploadTicket, newImagePath } from "@/lib/media";
import {
  APPROVAL_FROM_LABEL, COMMERCIAL_NO, COMMERCIAL_YES, MEDIA_STATUS_FROM, PRODUCT_GROUPS, REVIEW_FROM, RND_TEAM_NAME, canDeleteProduct, type ProductGroup,
} from "@/lib/pipeline-constants";
import { draftStatuses, flagged, normOrderStatus, optionValues } from "@/lib/rnd-options";
import { getRndOptions } from "@/lib/pipeline";
import {
  afterApproved, afterDesignPassed, afterMediaChange, afterOrderStatus, decideResult, logEvent, logStatus, revalidateRnd,
} from "@/lib/rnd-flow";
import { killItem, linkSku, startProduction } from "./pipeline-actions";
import { evaluateAll } from "@/lib/eval/engine";
import { assertCanApprove } from "@/lib/rnd-score";
import { getEvaluation } from "@/lib/eval/data";
import { signUndo, verifyUndo } from "@/lib/undo-token";
import type { CellValue, ImageKind } from "@/components/grid/types";

// Lệnh ghi DB lỗi thì ném lỗi (không để lỗi âm thầm rồi vẫn ghi nhật ký như đã thành công)
const okw = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); };

// Lưu 1 ô của bộ bảng R&D. Mỗi bảng khai báo cột được sửa + ai được sửa; đổi trạng thái thì chạy luật tự động (lib/rnd-flow).
export type TableKey = "collection" | "approved" | "design" | "orders" | "media" | "traffic" | "win" | "effect";

const now = () => new Date().toISOString();
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

// Chuẩn hoá giá trị theo loại
const asText = (v: CellValue) => (v === null || v === undefined ? null : Array.isArray(v) ? (v as string[]).join(", ") || null : String(v).trim() || null);
function asNum(v: CellValue, label: string, int = false) {
  const t = asText(v);
  if (t === null) return null;
  const n = Number(t.replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} phải là số không âm`);
  return int ? Math.round(n) : n;
}
function asDate(v: CellValue, label: string) {
  const t = asText(v);
  if (t !== null && !isDate(t.slice(0, 10))) throw new Error(`${label}: ngày không hợp lệ`);
  return t ? t.slice(0, 10) : null;
}
// Ngày (YYYY-MM-DD) hoặc ngày-giờ (YYYY-MM-DDTHH:mm) giờ VN → timestamp. Chỉ có ngày thì giữ giờ cũ (không có: 9h).
function asStamp(v: CellValue, label: string, old: string | null, required = false) {
  const t = asText(v);
  if (!t) { if (required) throw new Error(`${label} không được trống`); return null; }
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(t);
  if (!m) throw new Error(`${label}: ngày không hợp lệ`);
  const oldTime = old
    ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(old))
    : "09:00";
  const iso = `${m[1]}T${m[2] ?? oldTime}:00+07:00`;
  if (Number.isNaN(Date.parse(iso))) throw new Error(`${label}: ngày không hợp lệ`);
  if (Date.parse(iso) > Date.now() + 86_400_000) throw new Error(`${label}: không được ở tương lai`);
  return new Date(iso).toISOString();
}
function asLink(v: CellValue) {
  const t = asText(v);
  if (t && !/^https?:\/\/|^\\\\/i.test(t)) throw new Error("Link phải bắt đầu bằng http(s):// (hoặc \\\\ đường dẫn NAS)");
  return t;
}
async function asOption(v: CellValue, key: keyof Awaited<ReturnType<typeof getRndOptions>>, label: string) {
  const vals = optionValues((await getRndOptions())[key]);
  const list = Array.isArray(v) ? (v as string[]) : asText(v) ? [asText(v)!] : [];
  const bad = list.find((x) => !vals.includes(x));
  if (bad) throw new Error(`${label}: "${bad}" không có trong danh sách (thêm ở Cấu hình)`);
  return list.length ? list.join(", ") : null;
}
async function asPerson(v: CellValue) {
  const t = asText(v);
  if (!t) return null;
  const { data } = await sb.core().from("profiles").select("id").eq("id", t).eq("is_active", true).maybeSingle();
  if (!data) throw new Error("Người dùng không hợp lệ");
  return t;
}

async function product(id: string) {
  const { data } = await sb.rnd().from("products").select("*").eq("id", id).maybeSingle();
  if (!data?.stage) throw new Error("Không tìm thấy mẫu trong quy trình R&D");
  return data;
}
const canWork = (u: CurrentUser, p: { created_by: string | null }) => isRndEditor(u) || p.created_by === u.id;
const deny = (): never => { throw new Error("Bạn không có quyền sửa ô này"); };

async function updateProduct(id: string, user: CurrentUser, patch: Record<string, unknown>, field: string, old: unknown) {
  const { error } = await sb.rnd().from("products").update({ ...patch, updated_by: user.id }).eq("id", id);
  if (error) throw new Error(error.message);
  const nv = Object.values(patch)[0];
  if ((old ?? null) !== (nv ?? null)) await logEvent(id, user.id, "updated", { [field]: [old ?? null, nv ?? null] });
}

// ---------- Sưu tầm ----------
const COLLECTION_TEXT = ["name", "ref_metrics", "size", "description"] as const;   // size / description: sửa trực tiếp ở trang chi tiết mẫu
const COLLECTION_OPT: Record<string, Parameters<typeof asOption>[1]> = {
  ref_platform: "ref_platform", source_status: "source_status", line: "line", material: "material", stone: "stone",
};
const COLLECTION_MONEY: Record<string, string> = { price_ref: "Giá tham khảo", expected_cost: "Giá vốn dự kiến", expected_price: "Giá bán dự kiến" };

async function saveCollection(user: CurrentUser, id: string, key: string, v: CellValue) {
  const p = await product(id);
  // Lý do từ chối mẫu (bảng hỏi rồi lưu vào đây, sau đó thử lại thao tác Từ chối)
  if (key === "approval_note") {
    if (!canApprove(user, p.team_id)) throw new Error("Chỉ Quản lý hoặc trưởng team của mẫu được ghi lý do");
    if (p.stage !== "p0" || p.approval === "approved") throw new Error("Mẫu đã duyệt — không ghi lý do từ chối nữa");
    okw(await sb.rnd().from("products").update({ approval_note: asText(v), updated_by: user.id }).eq("id", id));
    return;
  }
  if (key === "approval") {
    const to = APPROVAL_FROM_LABEL[asText(v) ?? ""];
    if (!to) throw new Error("Trạng thái duyệt không hợp lệ");
    if (to === p.approval) return;
    if (p.approval === "approved") throw new Error("Mẫu đã duyệt — không thể từ chối hoặc đổi trạng thái duyệt");
    if (to === "approved" || to === "rejected") {
      if (!canApprove(user, p.team_id)) throw new Error("Chỉ Quản lý hoặc trưởng team của mẫu được duyệt");
      if (p.stage !== "p0") throw new Error("Mẫu đã qua bước duyệt");
      if (to === "approved") await assertCanApprove(id, user);   // phải đủ người chấm điểm; mẫu không đạt chỉ Quản lý duyệt (từ chối thì luôn được)
      if (to === "rejected" && !String(p.approval_note ?? "").trim()) throw new Error("Cần ghi lý do từ chối mẫu");   // thiếu lý do: bảng hỏi rồi lưu vào Ghi chú duyệt và thử lại
      okw(await sb.rnd().from("products").update({ approval: to, approved_by: user.id, approved_at: now(), updated_by: user.id }).eq("id", id));
      await logEvent(id, user.id, to);
      if (to === "approved") await afterApproved(id, user.id);
      return;
    }
    // Bản nháp ↔ Chờ duyệt: người tạo / R&D, chỉ khi chưa duyệt
    if (!canWork(user, p)) deny();
    if (p.stage !== "p0") throw new Error("Mẫu đã duyệt — không đổi về nháp / chờ duyệt được");
    okw(await sb.rnd().from("products").update({ approval: to, updated_by: user.id, ...(to === "pending" ? { approval_note: null } : {}) }).eq("id", id));   // gửi duyệt lại: xoá lý do từ chối cũ
    await logEvent(id, user.id, to === "pending" ? "submitted" : "updated", { approval: [p.approval, to] });
    return;
  }
  if (key === "kill_reason") {
    if (!canWork(user, p) && !canApprove(user, p.team_id)) deny();
    const reason = await asOption(v, "kill_reason", "Lý do kill");
    if (!reason && p.killed_at && user.role !== "admin") throw new Error("Chỉ Quản lý mở lại mẫu đã kill");
    okw(await sb.rnd().from("products").update({ kill_reason: reason, killed_at: reason ? p.killed_at ?? now() : null, updated_by: user.id }).eq("id", id));
    await logEvent(id, user.id, reason ? "killed" : "restored", { kill_reason: [p.kill_reason, reason] });
    return;
  }
  if (key === "approved_at") {
    if (!canApprove(user, p.team_id) && !isRndEditor(user)) deny();
    if (!p.approved_at) throw new Error("Mẫu chưa được duyệt");
    return updateProduct(id, user, { approved_at: asStamp(v, "Ngày duyệt", p.approved_at, true) }, key, p.approved_at);
  }
  if (!canWork(user, p)) deny();
  if (key === "created_at") {
    // Ngày ST = mốc bắt đầu tính traffic của mẫu (trafficFrom) → chấm lại
    await updateProduct(id, user, { created_at: asStamp(v, "Ngày ST", p.created_at, true) }, key, p.created_at);
    if (p.code) { try { await evaluateAll(); } catch (e) { console.error("evaluate after created_at:", e); } }
    return;
  }
  if ((COLLECTION_TEXT as readonly string[]).includes(key)) {
    const t = asText(v);
    if (key === "name" && !t) throw new Error("Tên SP không được trống");
    return updateProduct(id, user, { [key]: t }, key, p[key]);
  }
  if (key === "ref_url") return updateProduct(id, user, { ref_url: asLink(v) }, key, p.ref_url);
  if (key === "source_url") return updateProduct(id, user, { source_url: asLink(v) }, key, p.source_url);   // kho Source của mẫu (sửa ở trang chi tiết)
  if (key in COLLECTION_OPT) return updateProduct(id, user, { [key]: await asOption(v, COLLECTION_OPT[key], key) }, key, p[key]);
  if (key in COLLECTION_MONEY) return updateProduct(id, user, { [key]: asNum(v, COLLECTION_MONEY[key], true) }, key, p[key]);
  if (key === "product_group") {
    const t = asText(v);
    const code = t ? (Object.entries(PRODUCT_GROUPS) as [ProductGroup, string][]).find(([, l]) => l === t)?.[0] : null;
    if (t && !code) throw new Error("Nhóm SP không hợp lệ");
    return updateProduct(id, user, { product_group: code ?? null }, key, p.product_group);
  }
  if (key === "team_id") {
    const t = asText(v);
    if (t) { const { data } = await sb.core().from("teams").select("id").eq("id", t).maybeSingle(); if (!data) throw new Error("Team không hợp lệ"); }
    return updateProduct(id, user, { team_id: t }, key, p.team_id);
  }
  deny();
}

// ---------- Thiết kế 3D ----------
async function saveDesign(user: CurrentUser, id: string, key: string, v: CellValue) {
  const p = await product(id);
  const { data: t } = await sb.rnd().from("design_tasks").select("*").eq("product_id", id).maybeSingle();
  if (!t) throw new Error("Mẫu chưa có việc 3D");
  const isAssignee = t.assignee_id === user.id;
  const reviewer = isRndEditor(user) || canApprove(user, p.team_id);
  const set = async (patch: Record<string, unknown>) => {
    const { error } = await sb.rnd().from("design_tasks").update(patch).eq("product_id", id);
    if (error) throw new Error(error.message);
  };
  if (key === "assignee_id") { if (!canWork(user, p)) deny(); await set({ assignee_id: await asPerson(v) }); return logEvent(id, user.id, "design_assigned"); }
  if (key === "draw_status") {
    if (!isAssignee && !isRndEditor(user)) deny();
    const s = asText(v);
    if (s === "Hoàn thành") throw new Error("“Hoàn thành” tự chuyển khi Duyệt 3D = Đạt — người vẽ chọn “Đã vẽ” để nộp duyệt");
    const status = s === "Đã vẽ" ? "review" : s === "Đang vẽ" ? "doing" : s === "Chưa vẽ" ? "todo" : null;
    if (!status) throw new Error("Trạng thái vẽ không hợp lệ");
    if (t.status === "done") throw new Error("3D đã được duyệt Đạt");
    if (status === "review" && !t.file_url && !t.image_paths.length) throw new Error("Thêm Ảnh 3D hoặc File 3D trước khi chọn “Đã vẽ”");
    await set({ status, ...(status === "review" ? { submitted_at: now(), ...(t.status === "redo" ? { review_note: null } : {}) } : {}) });   // nộp lại sau khi bị yêu cầu sửa: xoá lý do cũ
    await logStatus("design", id, s!, user.id);
    return logEvent(id, user.id, status === "review" ? "design_submitted" : "design_started");
  }
  if (key === "review") {
    if (!reviewer) throw new Error("Chỉ R&D / Quản lý / trưởng team duyệt 3D");
    const r = REVIEW_FROM[asText(v) ?? ""];
    if (!r) throw new Error("Giá trị duyệt không hợp lệ");
    const status = r === "pass" ? "done" : r === "redo" ? "redo" : "review";
    if (r === "pass" && t.status !== "review" && t.status !== "done" && !t.file_url && !t.image_paths.length) throw new Error("Chưa có Ảnh 3D / File 3D để duyệt");
    if (r === "redo" && !String(t.review_note ?? "").trim()) throw new Error("Cần ghi lý do yêu cầu sửa lại 3D");   // thiếu lý do: bảng hỏi rồi lưu vào Nhận xét duyệt và thử lại
    await set({ status, reviewed_by: user.id, ...(r === "pass" ? { done_at: now() } : {}) });
    await logStatus("design", id, asText(v)!, user.id);
    await logEvent(id, user.id, r === "pass" ? "design_passed" : r === "redo" ? "design_redo" : "updated");
    if (r === "pass") await afterDesignPassed(id, user.id);
    return;
  }
  if (key === "file_url") { if (!isAssignee && !isRndEditor(user)) deny(); return set({ file_url: asLink(v) }); }
  if (key === "received") { if (!isRndEditor(user)) deny(); return set({ created_at: asStamp(v, "Ngày tiếp nhận", t.created_at, true) }); }
  if (key === "done_at") { if (!isRndEditor(user)) deny(); return set({ done_at: asStamp(v, "Ngày hoàn thành 3D", t.done_at) }); }
  if (key === "note") { if (!isAssignee && !reviewer) deny(); return set({ note: asText(v) }); }
  if (key === "review_note") { if (!reviewer) deny(); return set({ review_note: asText(v) }); }
  deny();
}

// ---------- Theo dõi đặt hàng ----------
// Chuyển đơn sang trạng thái "Hoàn thành" (trạng thái gắn cờ done trong Cấu hình) bắt buộc đã nhập Chi phí SX (giá vốn)
async function assertCostForDone(status: string, cost: unknown) {
  const done = flagged((await getRndOptions()).order_status, "done");
  if (done.includes(status) && !(Number(cost) > 0)) throw new Error(`Nhập Chi phí SX (giá vốn) trước khi chuyển sang “${status}”`);
}

async function saveOrder(user: CurrentUser, rowId: string, key: string, v: CellValue) {
  if (!isRndEditor(user)) deny();
  const id = Number(rowId);
  const { data: o } = await sb.rnd().from("sample_orders").select("*").eq("id", id).maybeSingle();
  if (!o) throw new Error("Không tìm thấy đơn");
  const set = async (patch: Record<string, unknown>) => {
    const { error } = await sb.rnd().from("sample_orders").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  };
  switch (key) {
    case "status": {
      const s = await asOption(v, "order_status", "Trạng thái");
      if (!s) throw new Error("Chọn trạng thái");
      if (s === o.status) return;
      await assertCostForDone(s, o.cost);
      // Đơn nháp → đã đặt: bắt buộc chọn NCC (xưởng) và ghi ngày đặt = hôm nay (ngày đặt trước đó chỉ là ngày tạo nháp)
      const opts = await getRndOptions(), wasDraft = draftStatuses(opts.order_status).includes(normOrderStatus(o.status));
      const placing = wasDraft && !draftStatuses(opts.order_status).includes(s) && !flagged(opts.order_status, "cancel").includes(s);
      if (placing && !o.supplier) throw new Error("Chọn NCC (xưởng) trước khi chuyển sang “" + s + "” (đã đặt hàng)");
      await set({ status: s, ...(placing ? { ordered_at: new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10) } : {}) });
      await logEvent(o.product_id, user.id, "sample_status", { status: [o.status, s] });
      return afterOrderStatus(id, s, user.id);
    }
    case "ordered_at": case "expected_at": case "received_at": return set({ [key]: asDate(v, "Ngày") ?? (key === "ordered_at" ? o.ordered_at : null) });
    case "qty": return set({ qty: asNum(v, "Số lượng", true) });
    case "weight_chi": return set({ weight_chi: asNum(v, "Trọng lượng") });
    case "cost": case "cost_other": case "price": return set({ [key]: asNum(v, "Số tiền", true) });
    case "unit": return set({ unit: await asOption(v, "unit", "Đơn vị tính") });
    case "supplier": return set({ supplier: await asOption(v, "supplier", "NCC") });
    case "color": return set({ color: await asOption(v, "color", "Màu sắc") });
    case "size": case "note": return set({ [key]: asText(v) });
  }
  deny();
}

// ---------- Media ----------
async function saveMedia(user: CurrentUser, rowId: string, key: string, v: CellValue) {
  const id = Number(rowId);
  const { data: m } = await sb.rnd().from("media_requests").select("*").eq("id", id).maybeSingle();
  if (!m) throw new Error("Không tìm thấy yêu cầu media");
  const p = await product(m.product_id);
  const editor = isRndEditor(user), lead = m.lead_id === user.id, mine = m.assignee_id === user.id;
  const reviewer = editor || canApprove(user, p.team_id) || lead;
  const set = async (patch: Record<string, unknown>) => {
    const { error } = await sb.rnd().from("media_requests").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  };
  switch (key) {
    case "code": { if (!editor && !lead) deny(); const c = asText(v); if (!c) throw new Error("Nhập mã SPU"); unwrap(await linkSku(m.product_id, c)); return; }
    case "request_type": if (!editor && !lead) deny(); return set({ request_type: (await asOption(v, "media_type", "Yêu cầu nội dung")) ?? m.request_type });
    case "deadline": if (!editor && !lead) deny(); return set({ deadline: asDate(v, "Deadline") });
    case "assignee_id": {
      if (!editor && !lead) deny();
      const who = await asPerson(v);
      if (who) {
        const [{ data: prof }, { data: team }] = await Promise.all([sb.core().from("profiles").select("team_id").eq("id", who).maybeSingle(), sb.core().from("teams").select("id").eq("name", RND_TEAM_NAME).maybeSingle()]);
        if (!team || prof?.team_id !== team.id) throw new Error("Người phụ trách phải là thành viên team PT Sản Phẩm");
      }
      return set({ assignee_id: who });
    }
    case "lead_id": if (!editor) deny(); return set({ lead_id: await asPerson(v) });
    case "note": if (!editor && !lead && !mine) deny(); return set({ note: asText(v) });
    case "drive_url": if (!editor && !lead && !mine) deny(); return set({ drive_url: asLink(v) });
    case "status": {
      if (!editor && !lead && !mine) deny();
      const s = MEDIA_STATUS_FROM[asText(v) ?? ""];
      if (!s) throw new Error("Trạng thái không hợp lệ");
      if (s === "done" && !m.drive_url && !(await product(m.product_id)).source_url) throw new Error("Nhập Link drive file media trước khi báo Hoàn thành");   // kho Source của mẫu cũng được tính
      // Không còn bước Duyệt source: Hoàn thành = source đạt (tự ghi "Đạt" để các báo cáo cũ vẫn đúng), rồi mẫu tự sang P4
      await set({ status: s, ...(s === "done" ? { done_at: now(), approval: "pass", review_note: null } : { approval: null }) });
      await logStatus("media", id, asText(v)!, user.id);
      await logEvent(m.product_id, user.id, s === "done" ? "media_passed" : "media_started");
      if (s === "done") await afterMediaChange(m.product_id, user.id);
      return;
    }
    case "approval": {
      if (!reviewer) throw new Error("Chỉ R&D / Quản lý / trưởng team / trưởng nhóm media duyệt source");
      const r = REVIEW_FROM[asText(v) ?? ""];
      if (!r) throw new Error("Giá trị duyệt không hợp lệ");
      // Có link ở yêu cầu media HOẶC kho Source của mẫu (ô "Link source" ở trang chi tiết) là đủ để duyệt
      if (r === "pass" && !m.drive_url && !(await product(m.product_id)).source_url) throw new Error("Chưa có link source để duyệt");
      // Yêu cầu sửa lại phải có lý do (ô "Nhận xét duyệt"): thiếu thì báo "lý do" để bảng hỏi rồi lưu vào Nhận xét duyệt và thử lại
      if (r === "redo" && !String(m.review_note ?? "").trim()) throw new Error("Cần ghi lý do yêu cầu sửa lại source");
      await set({ approval: r, reviewed_by: user.id, ...(r === "redo" ? { status: "doing" } : {}), ...(r === "pass" && !m.done_at ? { done_at: now() } : {}) });
      await logEvent(m.product_id, user.id, r === "pass" ? "media_passed" : r === "redo" ? "media_redo" : "updated");
      return afterMediaChange(m.product_id, user.id);
    }
    case "review_note": if (!reviewer) deny(); return set({ review_note: asText(v) });
    case "received_at": if (!editor && !lead) deny(); return set({ received_at: asStamp(v, "Ngày tiếp nhận", m.received_at, true) });
    case "done_at": if (!editor && !lead) deny(); return set({ done_at: asStamp(v, "Ngày hoàn thành Source", m.done_at) });
  }
  deny();
}

// ---------- Traffic / Duyệt Win / Theo dõi hiệu quả ----------
async function saveProductTail(table: "traffic" | "win" | "effect", user: CurrentUser, id: string, key: string, v: CellValue) {
  const p = await product(id);
  const owner = p.traffic_owner === user.id;
  const editor = isRndEditor(user) || owner;
  if (table === "win" && key === "decision") {
    const pick = asText(v) ?? "";
    if (pick !== COMMERCIAL_YES && pick !== COMMERCIAL_NO) throw new Error("Chọn Thương mại hoá / Không thương mại hoá");
    // Thương mại hoá = chốt đúng mức Win hệ thống đang đề xuất (WIN / WIN TRAFFIC); không = dừng mẫu (FAIL)
    const sug = p.code ? (await getEvaluation(p.code))?.result : null;
    const r: "win" | "win_traffic" | "fail" = pick === COMMERCIAL_NO ? "fail" : sug === "win_traffic" ? "win_traffic" : "win";
    const err = await decideResult(id, user, { result: r, note: p.traffic_note ?? null, handoff: r !== "fail" && !!p.source_url, toCommercial: r !== "fail" });
    if (err) throw new Error(err.includes("ghi lý do") ? `${err} (ở cột Ghi chú duyệt)` : err);
    return;
  }
  if (key === "win_qty") { if (!canApprove(user, p.team_id)) deny(); return updateProduct(id, user, { win_qty: asNum(v, "SL sản xuất", true) }, key, p.win_qty); }
  if (!editor) deny();
  switch (key) {
    case "traffic_owner": return updateProduct(id, user, { traffic_owner: await asPerson(v) }, key, p.traffic_owner);
    case "customer_feedback": case "traffic_note": case "lifecycle_note": return updateProduct(id, user, { [key]: asText(v) }, key, p[key]);
    case "ads_cost": case "expected_cost": case "expected_price": return updateProduct(id, user, { [key]: asNum(v, "Số tiền", true) }, key, p[key]);
    case "traffic_review": case "lifecycle_review": return updateProduct(id, user, { [key]: await asOption(v, "review", "Đánh giá") }, key, p[key]);
    case "launch_date": return updateProduct(id, user, { launch_date: asDate(v, "Ngày mở bán") }, key, p.launch_date);
  }
  deny();
}

// Cột của bản ghi mẫu hiện ở các bảng sau (khoá ở bảng đó → trường của mẫu)
const PRODUCT_PASS: Record<string, string> = {
  name: "name", ref_url: "ref_url", material: "material", stone: "stone", line: "line", team: "team_id", group: "product_group",
};
async function productIdOf(table: TableKey, rowId: string) {
  if (table === "orders") return (await sb.rnd().from("sample_orders").select("product_id").eq("id", Number(rowId)).single()).data?.product_id as string;
  if (table === "media") return (await sb.rnd().from("media_requests").select("product_id").eq("id", Number(rowId)).single()).data?.product_id as string;
  return rowId;
}

async function saveCellImpl(table: TableKey, rowId: string, key: string, value: CellValue) {
  const user = await requireActionUser();
  if (table !== "collection" && (key in PRODUCT_PASS || key === "file_3d")) {
    const pid = await productIdOf(table, rowId);
    if (!pid) throw new Error("Không tìm thấy mẫu");
    if (key === "file_3d") await saveDesign(user, pid, "file_url", value);   // File 3D ở bảng Đặt hàng = file của việc 3D
    else await saveCollection(user, pid, PRODUCT_PASS[key], value);
    revalidateRnd(pid);
    return;
  }
  if (table === "collection") await saveCollection(user, rowId, key, value);
  else if (table === "approved") {
    if (key !== "start") throw new Error("Cột này không sửa được ở bảng Đã duyệt");
    const to = asText(value);
    if (to !== "Bắt đầu sản xuất" && to !== "Hủy") throw new Error("Chỉ chọn được “Bắt đầu sản xuất” hoặc “Hủy”");
    const r = to === "Hủy" ? await killItem(rowId, "Hủy ở bước Đã duyệt (chờ sản xuất)") : await startProduction(rowId);
    if ("error" in r) throw new Error(r.error);
  } else if (table === "design") await saveDesign(user, rowId, key, value);
  else if (table === "orders") await saveOrder(user, rowId, key, value);
  else if (table === "media") await saveMedia(user, rowId, key, value);
  else await saveProductTail(table, user, rowId, key, value);
  revalidateRnd();
}

// ---------- Thêm bản ghi ----------
async function addRowImpl(table: TableKey, values: Record<string, CellValue>) {
  const user = await requireActionUser();
  let newId: string | number | null = null;   // id bản ghi vừa tạo — client dùng để tải ảnh chọn ở dòng thêm
  if (table === "collection") {
    // Ai cũng thêm được mẫu sưu tầm. Người không phải R&D / Quản lý (Media…): chỉ ảnh, link, tên, nguồn, chỉ số, dòng SP, nhóm SP —
    // bỏ giá / chất liệu / loại đá / trạng thái duyệt dù có gửi lên; Media mặc định "Đã có source"
    const full = isRndEditor(user);
    if (!full) {
      values = { ...values, price_ref: null, material: null, stone: null, expected_cost: null, expected_price: null, approval: "Bản nháp", created_at: null,
        source_status: user.role === "media" ? "Đã có source" : "Chưa có", team_id: null };
    }
    const name = asText(values.name);
    if (!name) throw new Error("Nhập Tên SP");
    // Trường bắt buộc khi thêm mẫu sưu tầm (Team + Ngày ST tự động; Source mặc định "Chưa có")
    const need: [string, string][] = [["ref_url", "Link video/sản phẩm"], ["line", "Dòng SP"], ["product_group", "Nhóm SP"], ...(full ? [["material", "Chất liệu"], ["stone", "Loại đá"]] as [string, string][] : [])];
    const lacking = need.filter(([k]) => !asText(values[k] ?? null)).map(([, l]) => l);
    if (lacking.length) throw new Error(`Nhập đủ các trường bắt buộc: ${lacking.join(", ")}`);
    const group = asText(values.product_group);
    const groupCode = group ? (Object.entries(PRODUCT_GROUPS) as [ProductGroup, string][]).find(([, l]) => l === group)?.[0] ?? null : null;
    const approval = APPROVAL_FROM_LABEL[asText(values.approval) ?? "Bản nháp"] ?? "draft";
    if (approval === "approved" || approval === "rejected") throw new Error("Bản ghi mới chỉ là Bản nháp hoặc Chờ duyệt");
    const { data, error } = await sb.rnd().from("products").insert({
      name, ref_url: asLink(values.ref_url ?? null), ref_platform: await asOption(values.ref_platform ?? null, "ref_platform", "Nguồn"),
      ref_metrics: asText(values.ref_metrics ?? null), price_ref: asNum(values.price_ref ?? null, "Giá tham khảo", true),
      source_status: (await asOption(values.source_status ?? null, "source_status", "Source")) ?? "Chưa có",
      line: await asOption(values.line ?? null, "line", "Dòng SP"), material: await asOption(values.material ?? null, "material", "Chất liệu"),
      stone: await asOption(values.stone ?? null, "stone", "Loại đá"), product_group: groupCode,
      expected_cost: asNum(values.expected_cost ?? null, "Giá vốn", true), expected_price: asNum(values.expected_price ?? null, "Giá bán", true),
      // Mẫu do R&D thêm thuộc team R&D (PT Sản Phẩm; chọn team khác ở form thì theo form). Mẫu do vai trò khác thêm (Media…) KHÔNG gắn team: ở lại P0 (Bản nháp), không tự vào luồng P1–P2;
      // team R&D thấy mẫu đẹp thì chọn "Đã duyệt" → P1 (chưa gắn team nên trưởng team R&D nào cũng duyệt được)
      team_id: full ? asText(values.team_id ?? null) ?? (await sb.core().from("teams").select("id").eq("name", RND_TEAM_NAME).maybeSingle()).data?.id ?? user.team_id : null,
      ...(asText(values.created_at ?? null) ? { created_at: asStamp(values.created_at ?? null, "Ngày ST", null) } : {}),   // Ngày ST: không nhập → giờ hiện tại
      stage: "p0", stage_at: now(), approval, status: "researching", origin: "manual", entry_source: "rnd", created_by: user.id, updated_by: user.id,
    }).select("id").single();
    if (error) throw new Error(error.message);
    await logEvent(data.id, user.id, approval === "pending" ? "submitted" : "created");
    newId = data.id;
  } else if (table === "orders") {
    if (!isRndEditor(user)) deny();
    const pid = asText(values.product_id ?? values.st_code ?? null);   // ô "Mã ST" ở dòng thêm = chọn mẫu
    if (!pid) throw new Error("Chọn mẫu (Mã ST)");
    const p = await product(pid);
    if (p.stage === "p0") throw new Error("Mẫu chưa được duyệt");
    const opts = await getRndOptions();
    const status = (await asOption(values.status ?? null, "order_status", "Trạng thái")) ?? opts.order_status.find((x) => x.flag !== "draft" && x.flag !== "cancel")?.value ?? "Đã đặt hàng";   // thêm tay = đơn đã đặt xưởng (đơn nháp do hệ thống tự tạo khi 3D đạt)
    await assertCostForDone(status, asNum(values.cost ?? null, "Chi phí SX", true));
    const { data, error } = await sb.rnd().from("sample_orders").insert({
      product_id: pid, status, supplier: await asOption(values.supplier ?? null, "supplier", "NCC"),
      qty: asNum(values.qty ?? null, "Số lượng", true) ?? 1, unit: await asOption(values.unit ?? null, "unit", "ĐVT"),
      color: await asOption(values.color ?? null, "color", "Màu sắc"), expected_at: asDate(values.expected_at ?? null, "Ngày dự kiến"),
      cost: asNum(values.cost ?? null, "Chi phí SX", true), cost_other: asNum(values.cost_other ?? null, "Chi phí khác", true),
      price: asNum(values.price ?? null, "Giá bán", true), weight_chi: asNum(values.weight_chi ?? null, "Trọng lượng"),
      size: asText(values.size ?? null), note: asText(values.note ?? null), created_by: user.id,
      ...(asText(values.ordered_at ?? null) ? { ordered_at: asDate(values.ordered_at ?? null, "Ngày đặt hàng") } : {}),   // không nhập → hôm nay (mặc định DB)
    }).select("id").single();
    if (error) throw new Error(error.message);
    newId = data.id;
    await logStatus("order", data.id, status, user.id);
    await logEvent(pid, user.id, "sample_ordered");
    await afterOrderStatus(data.id, status, user.id);
  } else if (table === "media") {
    const pid = asText(values.product_id ?? values.st_code ?? null);   // ô "Mã ST" ở dòng thêm = chọn mẫu
    if (!pid) throw new Error("Chọn mẫu (Mã ST)");
    const p = await product(pid);
    if (!isRndEditor(user) && !canApprove(user, p.team_id) && user.role !== "media") deny();
    if (p.stage === "p0") throw new Error("Mẫu chưa được duyệt");
    const type = (await asOption(values.request_type ?? null, "media_type", "Yêu cầu nội dung")) ?? "Quay sản phẩm";
    const { data, error } = await sb.rnd().from("media_requests").insert({
      product_id: pid, request_type: type, deadline: asDate(values.deadline ?? null, "Deadline"),
      assignee_id: await asPerson(values.assignee_id ?? null), lead_id: await asPerson(values.lead_id ?? null),
      drive_url: asLink(values.drive_url ?? null), note: asText(values.note ?? null), created_by: user.id,
      ...(asText(values.received_at ?? null) ? { received_at: asStamp(values.received_at ?? null, "Ngày tiếp nhận", null) } : {}),
    }).select("id").single();
    if (error) throw new Error(error.message);
    newId = data.id;
    await logEvent(pid, user.id, "media_assigned", { request_type: [null, type] });
  } else deny();
  revalidateRnd();
  return newId;
}

// ---------- Xoá bản ghi ----------
// Quyền xoá (rnd-tables.ts đặt cờ del giống hệt để hiện ô tick):
//   Sưu tầm: Quản lý xoá mọi mẫu; R&D / người sưu tầm chỉ xoá mẫu CHƯA DUYỆT (đã duyệt → dùng Lý do kill)
//   3D / Đặt hàng: R&D, Quản lý · Media: R&D, Quản lý, trưởng nhóm media của yêu cầu
// File ảnh của dòng bị xoá được GIỮ trong kho (không xoá file) để còn hoàn tác; file không còn dòng nào trỏ tới sẽ dọn sau.
type Row = Record<string, unknown>;
// Ảnh chụp dữ liệu các dòng bị xoá (kèm dòng con) — ký bằng lib/undo-token rồi gửi trình duyệt cầm hộ để hoàn tác
type Snap = { table: TableKey; products?: Row[]; design?: Row[]; orders?: Row[]; media?: Row[]; log?: Row[]; events?: Row[] };
const MAX_SNAP_CHARS = 300_000;

async function logRows(entity: string | string[], ids: (string | number)[]) {
  if (!ids.length) return [] as Row[];
  const q = sb.rnd().from("status_log").select("*").in("entity_id", ids.map(String));
  const { data } = await (Array.isArray(entity) ? q.in("entity", entity) : q.eq("entity", entity));
  return (data ?? []) as Row[];
}

async function deleteRowsImpl(table: TableKey, rowIds: string[]) {
  const user = await requireActionUser();
  if (!rowIds.length) return { restore: null as string | null, note: null as string | null };
  if (rowIds.length > 200) throw new Error("Xoá tối đa 200 bản ghi mỗi lần");
  const touched = new Set<string>();
  let snap: Snap | null = null;
  let note: string | null = null;

  if (table === "collection") {
    const { data: ps } = await sb.rnd().from("products").select("*").in("id", rowIds).not("stage", "is", null);
    if ((ps ?? []).length !== rowIds.length) throw new Error("Có bản ghi không còn tồn tại — tải lại trang");
    const bad = ps!.filter((p) => !canDeleteProduct(user, p)).map((p) => p.st_code ?? p.name);
    if (bad.length) throw new Error(`Không xoá được ${bad.join(", ")}: mẫu đã duyệt chỉ Quản lý xoá (hoặc dùng cột Lý do kill)`);
    const ids = ps!.map((p) => p.id as string);
    const [{ data: d }, { data: o }, { data: m }, { data: ev }, dec, hand, sess] = await Promise.all([
      sb.rnd().from("design_tasks").select("*").in("product_id", ids),
      sb.rnd().from("sample_orders").select("*").in("product_id", ids),
      sb.rnd().from("media_requests").select("*").in("product_id", ids),
      sb.rnd().from("product_events").select("*").in("product_id", ids),
      sb.rnd().from("decisions").select("id", { count: "exact", head: true }).in("product_id", ids),
      sb.rnd().from("handoffs").select("id", { count: "exact", head: true }).in("product_id", ids),
      sb.rnd().from("test_sessions").select("id", { count: "exact", head: true }).in("product_id", ids),
    ]);
    if (dec.count || hand.count || sess.count) note = "Mẫu đã có kết luận / phiên test / đẩy mẫu ĐVKD nên không hoàn tác được việc xoá này";
    else {
      const log = [...await logRows("order", (o ?? []).map((x) => x.id)), ...await logRows("media", (m ?? []).map((x) => x.id)), ...await logRows(["design", "product"], ids)];
      snap = { table, products: ps as Row[], design: (d ?? []) as Row[], orders: (o ?? []) as Row[], media: (m ?? []) as Row[], log, events: (ev ?? []) as Row[] };
    }
    // Bảng con (3D, đơn, media, kết luận, lịch sử…) tự xoá theo khoá ngoại (on delete cascade)
    const { error } = await sb.rnd().from("products").delete().in("id", ids);
    if (error) throw new Error(error.message);
    await Promise.all([
      sb.rnd().from("status_log").delete().eq("entity", "order").in("entity_id", (o ?? []).map((x) => String(x.id))),
      sb.rnd().from("status_log").delete().eq("entity", "media").in("entity_id", (m ?? []).map((x) => String(x.id))),
      sb.rnd().from("status_log").delete().in("entity", ["design", "product"]).in("entity_id", ids),
    ]);
    if (!snap && !note) note = "Không hoàn tác được";
  } else if (table === "design") {
    if (!isRndEditor(user)) deny();
    const { data: d } = await sb.rnd().from("design_tasks").select("*").in("product_id", rowIds);
    snap = { table, design: (d ?? []) as Row[], log: await logRows("design", rowIds) };
    const { error } = await sb.rnd().from("design_tasks").delete().in("product_id", rowIds);
    if (error) throw new Error(error.message);
    await sb.rnd().from("status_log").delete().eq("entity", "design").in("entity_id", rowIds);
    for (const x of d ?? []) { await logEvent(x.product_id, user.id, "design_deleted"); touched.add(x.product_id); }
  } else if (table === "orders") {
    if (!isRndEditor(user)) deny();
    const ids = rowIds.map(Number);
    const { data: o } = await sb.rnd().from("sample_orders").select("*").in("id", ids);
    snap = { table, orders: (o ?? []) as Row[], log: await logRows("order", rowIds) };
    const { error } = await sb.rnd().from("sample_orders").delete().in("id", ids);
    if (error) throw new Error(error.message);
    await sb.rnd().from("status_log").delete().eq("entity", "order").in("entity_id", rowIds);
    for (const x of o ?? []) { await logEvent(x.product_id, user.id, "order_deleted", { order: [x.id, null] }); touched.add(x.product_id); }
  } else if (table === "media") {
    const ids = rowIds.map(Number);
    const { data: ms } = await sb.rnd().from("media_requests").select("*").in("id", ids);
    if (!isRndEditor(user) && (ms ?? []).some((x) => x.lead_id !== user.id)) deny();
    snap = { table, media: (ms ?? []) as Row[], log: await logRows("media", rowIds) };
    const { error } = await sb.rnd().from("media_requests").delete().in("id", ids);
    if (error) throw new Error(error.message);
    await sb.rnd().from("status_log").delete().eq("entity", "media").in("entity_id", rowIds);
    for (const x of ms ?? []) { await logEvent(x.product_id, user.id, "media_deleted", { request_type: [x.request_type, null] }); touched.add(x.product_id); }
    // Yêu cầu còn lại đều Đạt → mẫu sang Traffic
    for (const pid of touched) await afterMediaChange(pid, user.id);
  } else deny();

  for (const pid of touched) revalidateRnd(pid);
  revalidateRnd();
  if (snap && JSON.stringify(snap).length > MAX_SNAP_CHARS) { snap = null; note = "Dữ liệu quá lớn nên không hoàn tác được việc xoá này"; }
  return { restore: snap ? signUndo(user.id, snap) : null, note };
}

// Hoàn tác việc xoá: ghi lại các dòng từ ảnh chụp đã ký. Đơn / yêu cầu media có id tự tăng → nhận id mới, trả bảng đổi id để trình duyệt cập nhật.
async function restoreRowsImpl(table: TableKey, token: string) {
  const user = await requireActionUser();
  const snap = verifyUndo<Snap>(token, user.id);
  if (snap.table !== table) throw new Error("Dữ liệu hoàn tác không thuộc bảng này");

  // Cùng quyền như lúc xoá
  if (table === "collection") { if (!(snap.products ?? []).every((p) => canDeleteProduct(user, p as { id: string; stage: string | null; created_by: string | null }))) deny(); }
  else if (table === "media") { if (!isRndEditor(user) && !(snap.media ?? []).every((m) => m.lead_id === user.id)) deny(); }
  else if (!isRndEditor(user)) deny();

  const fail = (e: { message: string; code?: string }) => {
    throw new Error(e.code === "23503" ? "Không khôi phục được: mẫu liên quan đã bị xoá" : e.code === "23505" ? "Không khôi phục được: đã có bản ghi trùng mã" : e.message);
  };
  const idMap: Record<string, string> = {};
  const orderMap: Record<string, string> = {}, mediaMap: Record<string, string> = {};
  // Chèn từng dòng bỏ cột id tự tăng; ghi lại id cũ → id mới
  const insertAuto = async (tbl: string, rows: Row[], store: Record<string, string>, tweak?: (r: Row) => Row) => {
    for (const r of rows) {
      const { id, ...rest } = r;
      const { data, error } = await sb.rnd().from(tbl).insert(tweak ? tweak(rest) : rest).select("id").single();
      if (error) fail(error);
      store[String(id)] = String(data!.id);
    }
  };
  const insertPlain = async (tbl: string, rows: Row[]) => {
    if (!rows.length) return;
    const { error } = await sb.rnd().from(tbl).insert(rows);
    if (error) fail(error);
  };
  const noId = (rows: Row[]) => rows.map(({ id: _id, ...rest }) => rest);   // eslint-disable-line @typescript-eslint/no-unused-vars

  await insertPlain("products", snap.products ?? []);
  await insertPlain("design_tasks", snap.design ?? []);
  await insertAuto("sample_orders", snap.orders ?? [], orderMap);
  // Yêu cầu media: nối lại đơn nếu đơn vừa được khôi phục / còn tồn tại, không thì bỏ liên kết
  const keepOrders = new Set<string>();
  const ref = (snap.media ?? []).map((m) => m.sample_order_id).filter((x): x is number => typeof x === "number" && !orderMap[String(x)]);
  if (ref.length) { const { data } = await sb.rnd().from("sample_orders").select("id").in("id", ref); for (const x of data ?? []) keepOrders.add(String(x.id)); }
  await insertAuto("media_requests", snap.media ?? [], mediaMap, (r) => {
    const so = r.sample_order_id == null ? null : String(r.sample_order_id);
    return { ...r, sample_order_id: so && orderMap[so] ? Number(orderMap[so]) : so && keepOrders.has(so) ? Number(so) : null };
  });
  const log = (snap.log ?? []).map((l) => {
    const e = String(l.entity_id);
    return { ...l, entity_id: l.entity === "order" ? orderMap[e] ?? e : l.entity === "media" ? mediaMap[e] ?? e : e };
  });
  await insertPlain("status_log", noId(log));
  await insertPlain("product_events", noId(snap.events ?? []));

  Object.assign(idMap, table === "orders" ? orderMap : table === "media" ? mediaMap : {});
  for (const x of snap.products ?? []) await logEvent(String(x.id), user.id, "restored_deleted");
  revalidateRnd();
  return { map: idMap };
}

// ---------- Ảnh trong ô (ảnh mẫu / ảnh 3D / ảnh chụp SP) ----------
async function imageTarget(kind: ImageKind, rowId: string, user: CurrentUser) {
  if (kind === "product") {
    const p = await product(rowId);
    if (!canWork(user, p)) deny();
    return { table: "products", col: "image_paths", match: { id: rowId }, prefix: `${rowId}/`, current: p.image_paths as string[] };
  }
  if (kind === "design") {
    const { data: t } = await sb.rnd().from("design_tasks").select("assignee_id, image_paths").eq("product_id", rowId).maybeSingle();
    if (!t || (t.assignee_id !== user.id && !isRndEditor(user))) deny();
    return { table: "design_tasks", col: "image_paths", match: { product_id: rowId }, prefix: `${rowId}/3d/`, current: t!.image_paths as string[] };
  }
  const { data: m } = await sb.rnd().from("media_requests").select("product_id, assignee_id, lead_id, photo_paths").eq("id", Number(rowId)).maybeSingle();
  if (!m || (m.assignee_id !== user.id && m.lead_id !== user.id && !isRndEditor(user))) deny();
  return { table: "media_requests", col: "photo_paths", match: { id: Number(rowId) }, prefix: `${m!.product_id}/media-${rowId}/`, current: m!.photo_paths as string[] };
}

async function createGridUploadImpl(kind: ImageKind, rowId: string, fileName: string) {
  const user = await requireActionUser();
  const t = await imageTarget(kind, rowId, user);
  return createUploadTicket(newImagePath(t.prefix, fileName));
}

async function attachGridImageImpl(kind: ImageKind, rowId: string, path: string) {
  const user = await requireActionUser();
  const t = await imageTarget(kind, rowId, user);
  if (!path.startsWith(t.prefix)) throw new Error("Đường dẫn ảnh không hợp lệ");
  await sb.rnd().from(t.table).update({ [t.col]: [...t.current, path] }).match(t.match);
  revalidateRnd();
}

async function removeGridImageImpl(kind: ImageKind, rowId: string, path: string) {
  const user = await requireActionUser();
  const t = await imageTarget(kind, rowId, user);
  // Chỉ gỡ khỏi danh sách; file vẫn giữ trong kho để hoàn tác (file không còn ai trỏ tới sẽ dọn sau)
  await sb.rnd().from(t.table).update({ [t.col]: t.current.filter((x) => x !== path) }).match(t.match);
  revalidateRnd();
}

// Đặt lại toàn bộ danh sách ảnh của 1 ô (hoàn tác / làm lại thao tác ảnh). Chỉ nhận đường dẫn thuộc đúng ô này.
async function setGridImagesImpl(kind: ImageKind, rowId: string, paths: string[]) {
  const user = await requireActionUser();
  const t = await imageTarget(kind, rowId, user);
  if (paths.length > 100 || paths.some((p) => typeof p !== "string" || !p.startsWith(t.prefix) || p.includes(".."))) throw new Error("Đường dẫn ảnh không hợp lệ");
  await sb.rnd().from(t.table).update({ [t.col]: paths }).match(t.match);
  revalidateRnd();
}

// ---------- Hàm gọi từ trình duyệt: trả lỗi thay vì ném (xem lib/action-result) ----------

export async function saveCell(table: TableKey, rowId: string, key: string, value: CellValue) {
  return attempt(() => saveCellImpl(table, rowId, key, value));
}

export async function addRow(table: TableKey, values: Record<string, CellValue>) {
  return attempt(() => addRowImpl(table, values));
}

export async function deleteRows(table: TableKey, rowIds: string[]) {
  return attempt(() => deleteRowsImpl(table, rowIds));
}

export async function restoreRows(table: TableKey, token: string) {
  return attempt(() => restoreRowsImpl(table, token));
}

export async function setGridImages(kind: ImageKind, rowId: string, paths: string[]) {
  return attempt(() => setGridImagesImpl(kind, rowId, paths));
}

export async function createGridUpload(kind: ImageKind, rowId: string, fileName: string) {
  return attempt(() => createGridUploadImpl(kind, rowId, fileName));
}

export async function attachGridImage(kind: ImageKind, rowId: string, path: string) {
  return attempt(() => attachGridImageImpl(kind, rowId, path));
}

export async function removeGridImage(kind: ImageKind, rowId: string, path: string) {
  return attempt(() => removeGridImageImpl(kind, rowId, path));
}
