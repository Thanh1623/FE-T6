import "server-only";
import { pingRnd } from "@/lib/rnd-ping";
import { revalidatePath } from "next/cache";
import { sb } from "@/lib/supabase/admin";
import { canApprove, type CurrentUser } from "@/lib/session";
import { CRAFT_VIDEO_TYPE, HAND_VIDEO_TYPE, isCraftOnly, stageIndex, type Stage } from "@/lib/pipeline-constants";
import { draftStatuses, flagged } from "@/lib/rnd-options";
import { getRndOptions } from "@/lib/pipeline";
import { evaluateCommercial } from "@/lib/commercial-eval";

// Luật tự động của quy trình R&D (P0–P6): đổi trạng thái ở bảng này → bản ghi sang bảng sau.
//   Duyệt mẫu sưu tầm      → P1, tạo việc ở bảng Thiết kế 3D
//   Bấm "Bắt đầu sản xuất" → P2 (công đoạn: Vẽ 3D → đặt hàng → chốt đúc → hoàn thành)
//   Duyệt 3D = Đạt         → tạo đơn đặt hàng nháp (vẫn ở P2)
//   Đơn → "Hoàn thành"     → ghi ngày nhận, P3; tạo yêu cầu Media "Quay video trên tay"
//   Yêu cầu Media Đạt      → P4 (Đăng video); "đã lên video" tự nhận khi có bài gắn mã — xem eval/engine
//   Hệ thống đánh giá Win / Win traffic → P5 (quay source chế tác do người chọn tay)
//   Người duyệt thương mại hoá → P6; FAIL → dừng mẫu

const now = () => new Date().toISOString();
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());

export async function logEvent(productId: string, actorId: string | null, action: string, changes: Record<string, [unknown, unknown]> | null = null) {
  await sb.rnd().from("product_events").insert({ product_id: productId, actor_id: actorId, action, changes });
}

export async function logStatus(entity: string, entityId: string | number, value: string, actorId: string | null) {
  await sb.rnd().from("status_log").insert({ entity, entity_id: String(entityId), value, actor_id: actorId });
}

export function revalidateRnd(productId?: string) {
  pingRnd();   // báo các trình duyệt đang mở bảng R&D tải lại ở nền
  for (const p of ["/rnd", "/rnd/design-3d", "/rnd/orders", "/rnd/media", "/rnd/traffic", "/rnd/win", "/rnd/commercial", "/tasks"]) revalidatePath(p);
  if (productId) revalidatePath(`/rnd/${productId}`);
}

// Lên mốc (chỉ tiến). actor null = tự động.
export async function reachStage(productId: string, to: Stage, actorId: string | null, note?: string) {
  const { data: p } = await sb.rnd().from("products").select("stage").eq("id", productId).single();
  if (!p?.stage || stageIndex(to) <= stageIndex(p.stage as Stage)) return false;
  const { error } = await sb.rnd().from("products").update({ stage: to, stage_at: now() }).eq("id", productId);
  if (error) { console.error("reachStage:", error.message); return false; }   // không ghi nhật ký "đã lên mốc" khi chưa lên được
  await logEvent(productId, actorId, "stage_changed", { stage: [p.stage, to], ...(note ? { note: [null, note] } : {}) });
  return true;
}

export async function afterApproved(productId: string, actorId: string) {
  await reachStage(productId, "p1", actorId);
  const { data: t } = await sb.rnd().from("design_tasks").select("product_id").eq("product_id", productId).maybeSingle();
  if (!t) await sb.rnd().from("design_tasks").insert({ product_id: productId, status: "todo", created_by: null });
}

export async function afterDesignPassed(productId: string, actorId: string) {
  // 3D là một công đoạn của P2: không đổi mốc, chỉ tạo đơn đặt hàng nháp
  const { count } = await sb.rnd().from("sample_orders").select("*", { count: "exact", head: true }).eq("product_id", productId);
  if (!count) {
    const opts = await getRndOptions();
    const first = draftStatuses(opts.order_status)[0];   // đơn nháp "Chưa đặt": 3D đạt chỉ chuẩn bị đơn, chưa đặt xưởng
    const { data: o } = await sb.rnd().from("sample_orders")
      .insert({ product_id: productId, status: first, qty: 1, created_by: actorId }).select("id").single();
    if (o) await logStatus("order", o.id, first, actorId);
  }
}

export async function afterOrderStatus(orderId: number, status: string, actorId: string) {
  const opts = await getRndOptions();
  const { data: o } = await sb.rnd().from("sample_orders").select("product_id, received_at").eq("id", orderId).single();
  if (!o) return;
  await logStatus("order", orderId, status, actorId);

  if (flagged(opts.order_status, "done").includes(status)) {
    if (!o.received_at) await sb.rnd().from("sample_orders").update({ received_at: today() }).eq("id", orderId);
    await reachStage(o.product_id, "p3", actorId);
    // Đã có yêu cầu quay trên tay nào (kể cả đã sửa thành nhiều loại "Quay video trên tay, Chụp sản phẩm") thì không tạo thêm
    const { data: existing } = await sb.rnd().from("media_requests").select("request_type").eq("product_id", o.product_id);
    if (!(existing ?? []).some((r) => !isCraftOnly(r.request_type))) await sb.rnd().from("media_requests").insert({ product_id: o.product_id, request_type: HAND_VIDEO_TYPE, created_by: null });
  }
}

// Video trên tay (P3) đạt → P4. Yêu cầu "Quay chế tác" chọn tay ở P5 không ảnh hưởng mốc.
export async function afterMediaChange(productId: string, actorId: string) {
  const { data: reqs } = await sb.rnd().from("media_requests").select("approval, status, drive_url, request_type").eq("product_id", productId);
  const hand0 = (reqs ?? []).filter((r) => !isCraftOnly(r.request_type));
  const hand = hand0.length ? hand0 : (reqs ?? []);   // chỉ có yêu cầu "Quay chế tác" (nhập tay) thì coi đó là source của mẫu — cùng luật với cột Giai đoạn hiện tại
  if (!hand.length || hand.some((r) => r.approval !== "pass" && r.status !== "done")) return;   // không còn bước Duyệt source: báo Hoàn thành là xong
  const { data: p } = await sb.rnd().from("products").select("source_url").eq("id", productId).single();
  const drive = hand.find((r) => r.drive_url)?.drive_url;
  if (drive && !p?.source_url) await sb.rnd().from("products").update({ source_url: drive }).eq("id", productId);
  await reachStage(productId, "p4", actorId);
}

// P5: người chọn tay mẫu Win cần quay source chế tác
export async function requestCraftVideo(productId: string, actorId: string) {
  const { count } = await sb.rnd().from("media_requests").select("*", { count: "exact", head: true }).eq("product_id", productId).eq("request_type", CRAFT_VIDEO_TYPE);
  if (count) return false;
  await sb.rnd().from("media_requests").insert({ product_id: productId, request_type: CRAFT_VIDEO_TYPE, created_by: actorId });
  await logEvent(productId, actorId, "craft_video_requested");
  return true;
}

// Xác nhận kết quả test (dùng chung cho khung Duyệt kết quả và bảng Duyệt SP Win). Trả lỗi dạng chuỗi.
export async function decideResult(productId: string, user: CurrentUser, input: {
  result: "win" | "win_traffic" | "win_sp" | "fail"; note: string | null; winQty?: number | null; handoff?: boolean; handoffNote?: string | null;
  toCommercial?: boolean;   // duyệt "Thương mại hoá" ở bảng Win: sang thẳng P6 dù mẫu còn ở P4 (hệ thống chưa kịp tự lên P5)
}): Promise<string | null> {
  const { result, note } = input;
  const [{ data: product }, { data: prev }] = await Promise.all([
    sb.rnd().from("products").select("*").eq("id", productId).single(),
    sb.rnd().from("current_decisions").select("result").eq("product_id", productId).maybeSingle(),
  ]);
  if (!product) return "Không tìm thấy mẫu";
  if (!canApprove(user, product.team_id ?? null)) return "Chỉ Quản lý hoặc trưởng team của mẫu được duyệt kết quả";
  if (input.winQty !== undefined && input.winQty !== null && !(input.winQty > 0)) return "SL duyệt sản xuất phải lớn hơn 0";
  const { data: ev } = product.code ? await sb.rnd().from("evaluations").select("*").eq("code", product.code).maybeSingle() : { data: null };
  const suggested = ev?.result ?? null;
  if (suggested && suggested !== "testing" && suggested !== result && !note) {
    return `Hệ thống đề xuất ${suggested.toUpperCase().replace("_", " ")} — ghi lý do khi chọn khác`;
  }
  // Đánh giá thương mại hoá (mẫu mới trong quy trình R&D, duyệt từ P4 trở đi): quyết định ngược gợi ý của hệ thống phải có lý do; lỗi tính toán không chặn việc duyệt
  const stageNow = product.stage as Stage | null;
  const commercialEval = stageNow && stageIndex(stageNow) >= stageIndex("p4") ? await evaluateCommercial(productId).catch(() => null) : null;
  if (commercialEval && !note) {
    const s = commercialEval.result.suggestion;
    if (s === "reject" && result !== "fail") return "Đánh giá thương mại hoá: chưa nên duyệt — ghi lý do khi vẫn duyệt";
    if (s === "approve" && result === "fail") return "Đánh giá thương mại hoá: nên duyệt — ghi lý do khi không duyệt";
  }
  if (input.handoff) {
    if (result === "fail") return "Mẫu FAIL không đẩy mẫu ĐVKD";
    if (!product.source_url) return "Thiếu link kho Source trước khi tạo phiếu đẩy mẫu ĐVKD";
  }
  const snapshot = ev ? {
    suggested, source: ev.source, window: [ev.first_post_date, ev.window_end], days_elapsed: ev.days_elapsed,
    age: ev.age, metrics: ev.metrics, checks: ev.checks, sales_status: ev.sales_status, traffic_status: ev.traffic_status,
  } : { suggested: null };
  const at = now();
  const { data: decision, error } = await sb.rnd().from("decisions").insert({
    product_id: productId, session_id: ev?.session_id ?? null, result, suggested, note, snapshot, decided_by: user.id,
  }).select("id").single();
  if (error) return error.message;

  // Quy trình: P5 do hệ thống tự lên khi đánh giá Win; duyệt Win ở P5 = quyết định thương mại hoá → P6.
  // Mẫu chưa tới P5 (vd mẫu nhận từ luồng Media) được duyệt Win → P5. FAIL → dừng mẫu (giữ mốc đã đạt).
  const target: Stage = input.toCommercial || (product.stage && stageIndex(product.stage as Stage) >= stageIndex("p5")) ? "p6" : "p5";
  const pipeline = product.stage
    ? result === "fail"
      ? { killed_at: at, kill_reason: `FAIL sau test${note ? `: ${note}` : ""}` }
      : { stage: target, stage_at: at, killed_at: null, kill_reason: null,
          ...(input.winQty !== undefined ? { win_qty: input.winQty } : {}), ...(product.launch_date ? {} : { launch_date: today() }) }
    : {};
  const { error: pErr } = await sb.rnd().from("products").update({ status: "ended", updated_by: user.id, ...pipeline }).eq("id", productId);
  if (pErr) return `Đã lưu kết luận nhưng chưa cập nhật được mẫu: ${pErr.message}`;
  if (product.stage && result !== "fail" && product.killed_at) await logEvent(productId, user.id, "restored", { kill_reason: [product.kill_reason, null] });
  if (product.stage && result !== "fail" && product.stage !== target) await logEvent(productId, user.id, "stage_changed", { stage: [product.stage, target] });
  // Lưu ảnh chụp chỉ số lúc duyệt (bảng có sau migration 039)
  if (commercialEval) {
    const { error: crErr } = await sb.rnd().from("commercial_reviews").insert({
      product_id: productId, decided_by: user.id, decision: result === "fail" ? "reject" : "approve", suggestion: commercialEval.result.suggestion,
      approved_qty: input.winQty ?? null, note: note ?? null, snapshot: { input: commercialEval.input, result: commercialEval.result, rules: commercialEval.rules, salesCodes: commercialEval.salesCodes },
    });
    if (crErr && crErr.code !== "42P01" && crErr.code !== "PGRST205") console.error("commercial_reviews:", crErr.message);
  }
  if (ev?.session_id) await sb.rnd().from("test_sessions").update({ status: "ended", ended_at: at }).eq("id", ev.session_id).eq("status", "running");
  await logEvent(productId, user.id, "result_confirmed", { result: [prev?.result ?? null, result] });

  if (input.handoff) {
    const { data: h, error: hErr } = await sb.rnd().from("handoffs").insert({
      product_id: productId, decision_id: decision.id, result, snapshot, source_url: product.source_url, rnd_note: input.handoffNote ?? null, created_by: user.id,
    }).select("id").single();
    if (hErr) return hErr.code === "23505" ? "Mẫu này đã có phiếu đẩy mẫu ĐVKD đang xử lý" : hErr.message;
    await sb.rnd().from("handoff_events").insert({ handoff_id: h.id, actor_id: user.id, action: "created", note: input.handoffNote ?? null });
    await logEvent(productId, user.id, "handoff_created");
    revalidatePath("/sample-push");
  }
  revalidateRnd(productId);
  revalidatePath("/");
  return null;
}
