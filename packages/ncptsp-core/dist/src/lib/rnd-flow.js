"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logEvent = logEvent;
exports.logStatus = logStatus;
exports.revalidateRnd = revalidateRnd;
exports.reachStage = reachStage;
exports.afterApproved = afterApproved;
exports.afterDesignPassed = afterDesignPassed;
exports.afterOrderStatus = afterOrderStatus;
exports.afterMediaChange = afterMediaChange;
exports.requestCraftVideo = requestCraftVideo;
exports.decideResult = decideResult;
require("server-only");
const rnd_ping_1 = require("@/lib/rnd-ping");
const cache_1 = require("next/cache");
const admin_1 = require("@/lib/supabase/admin");
const session_1 = require("@/lib/session");
const pipeline_constants_1 = require("@/lib/pipeline-constants");
const rnd_options_1 = require("@/lib/rnd-options");
const pipeline_1 = require("@/lib/pipeline");
const commercial_eval_1 = require("@/lib/commercial-eval");
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
async function logEvent(productId, actorId, action, changes = null) {
    await admin_1.sb.rnd().from("product_events").insert({ product_id: productId, actor_id: actorId, action, changes });
}
async function logStatus(entity, entityId, value, actorId) {
    await admin_1.sb.rnd().from("status_log").insert({ entity, entity_id: String(entityId), value, actor_id: actorId });
}
function revalidateRnd(productId) {
    (0, rnd_ping_1.pingRnd)(); // báo các trình duyệt đang mở bảng R&D tải lại ở nền
    for (const p of ["/rnd", "/rnd/design-3d", "/rnd/orders", "/rnd/media", "/rnd/traffic", "/rnd/win", "/rnd/commercial", "/tasks"])
        (0, cache_1.revalidatePath)(p);
    if (productId)
        (0, cache_1.revalidatePath)(`/rnd/${productId}`);
}
// Lên mốc (chỉ tiến). actor null = tự động.
async function reachStage(productId, to, actorId, note) {
    const { data: p } = await admin_1.sb.rnd().from("products").select("stage").eq("id", productId).single();
    if (!p?.stage || (0, pipeline_constants_1.stageIndex)(to) <= (0, pipeline_constants_1.stageIndex)(p.stage))
        return false;
    const { error } = await admin_1.sb.rnd().from("products").update({ stage: to, stage_at: now() }).eq("id", productId);
    if (error) {
        console.error("reachStage:", error.message);
        return false;
    } // không ghi nhật ký "đã lên mốc" khi chưa lên được
    await logEvent(productId, actorId, "stage_changed", { stage: [p.stage, to], ...(note ? { note: [null, note] } : {}) });
    return true;
}
async function afterApproved(productId, actorId) {
    await reachStage(productId, "p1", actorId);
    const { data: t } = await admin_1.sb.rnd().from("design_tasks").select("product_id").eq("product_id", productId).maybeSingle();
    if (!t)
        await admin_1.sb.rnd().from("design_tasks").insert({ product_id: productId, status: "todo", created_by: null });
}
async function afterDesignPassed(productId, actorId) {
    // 3D là một công đoạn của P2: không đổi mốc, chỉ tạo đơn đặt hàng nháp
    const { count } = await admin_1.sb.rnd().from("sample_orders").select("*", { count: "exact", head: true }).eq("product_id", productId);
    if (!count) {
        const opts = await (0, pipeline_1.getRndOptions)();
        const first = (0, rnd_options_1.draftStatuses)(opts.order_status)[0]; // đơn nháp "Chưa đặt": 3D đạt chỉ chuẩn bị đơn, chưa đặt xưởng
        const { data: o } = await admin_1.sb.rnd().from("sample_orders")
            .insert({ product_id: productId, status: first, qty: 1, created_by: actorId }).select("id").single();
        if (o)
            await logStatus("order", o.id, first, actorId);
    }
}
async function afterOrderStatus(orderId, status, actorId) {
    const opts = await (0, pipeline_1.getRndOptions)();
    const { data: o } = await admin_1.sb.rnd().from("sample_orders").select("product_id, received_at").eq("id", orderId).single();
    if (!o)
        return;
    await logStatus("order", orderId, status, actorId);
    if ((0, rnd_options_1.flagged)(opts.order_status, "done").includes(status)) {
        if (!o.received_at)
            await admin_1.sb.rnd().from("sample_orders").update({ received_at: today() }).eq("id", orderId);
        await reachStage(o.product_id, "p3", actorId);
        // Đã có yêu cầu quay trên tay nào (kể cả đã sửa thành nhiều loại "Quay video trên tay, Chụp sản phẩm") thì không tạo thêm
        const { data: existing } = await admin_1.sb.rnd().from("media_requests").select("request_type").eq("product_id", o.product_id);
        if (!(existing ?? []).some((r) => !(0, pipeline_constants_1.isCraftOnly)(r.request_type)))
            await admin_1.sb.rnd().from("media_requests").insert({ product_id: o.product_id, request_type: pipeline_constants_1.HAND_VIDEO_TYPE, created_by: null });
    }
}
// Video trên tay (P3) đạt → P4. Yêu cầu "Quay chế tác" chọn tay ở P5 không ảnh hưởng mốc.
async function afterMediaChange(productId, actorId) {
    const { data: reqs } = await admin_1.sb.rnd().from("media_requests").select("approval, status, drive_url, request_type").eq("product_id", productId);
    const hand0 = (reqs ?? []).filter((r) => !(0, pipeline_constants_1.isCraftOnly)(r.request_type));
    const hand = hand0.length ? hand0 : (reqs ?? []); // chỉ có yêu cầu "Quay chế tác" (nhập tay) thì coi đó là source của mẫu — cùng luật với cột Giai đoạn hiện tại
    if (!hand.length || hand.some((r) => r.approval !== "pass" && r.status !== "done"))
        return; // không còn bước Duyệt source: báo Hoàn thành là xong
    const { data: p } = await admin_1.sb.rnd().from("products").select("source_url").eq("id", productId).single();
    const drive = hand.find((r) => r.drive_url)?.drive_url;
    if (drive && !p?.source_url)
        await admin_1.sb.rnd().from("products").update({ source_url: drive }).eq("id", productId);
    await reachStage(productId, "p4", actorId);
}
// P5: người chọn tay mẫu Win cần quay source chế tác
async function requestCraftVideo(productId, actorId) {
    const { count } = await admin_1.sb.rnd().from("media_requests").select("*", { count: "exact", head: true }).eq("product_id", productId).eq("request_type", pipeline_constants_1.CRAFT_VIDEO_TYPE);
    if (count)
        return false;
    await admin_1.sb.rnd().from("media_requests").insert({ product_id: productId, request_type: pipeline_constants_1.CRAFT_VIDEO_TYPE, created_by: actorId });
    await logEvent(productId, actorId, "craft_video_requested");
    return true;
}
// Xác nhận kết quả test (dùng chung cho khung Duyệt kết quả và bảng Duyệt SP Win). Trả lỗi dạng chuỗi.
async function decideResult(productId, user, input) {
    const { result, note } = input;
    const [{ data: product }, { data: prev }] = await Promise.all([
        admin_1.sb.rnd().from("products").select("*").eq("id", productId).single(),
        admin_1.sb.rnd().from("current_decisions").select("result").eq("product_id", productId).maybeSingle(),
    ]);
    if (!product)
        return "Không tìm thấy mẫu";
    if (!(0, session_1.canApprove)(user, product.team_id ?? null))
        return "Chỉ Quản lý hoặc trưởng team của mẫu được duyệt kết quả";
    if (input.winQty !== undefined && input.winQty !== null && !(input.winQty > 0))
        return "SL duyệt sản xuất phải lớn hơn 0";
    const { data: ev } = product.code ? await admin_1.sb.rnd().from("evaluations").select("*").eq("code", product.code).maybeSingle() : { data: null };
    const suggested = ev?.result ?? null;
    if (suggested && suggested !== "testing" && suggested !== result && !note) {
        return `Hệ thống đề xuất ${suggested.toUpperCase().replace("_", " ")} — ghi lý do khi chọn khác`;
    }
    // Đánh giá thương mại hoá (mẫu mới trong quy trình R&D, duyệt từ P4 trở đi): quyết định ngược gợi ý của hệ thống phải có lý do; lỗi tính toán không chặn việc duyệt
    const stageNow = product.stage;
    const commercialEval = stageNow && (0, pipeline_constants_1.stageIndex)(stageNow) >= (0, pipeline_constants_1.stageIndex)("p4") ? await (0, commercial_eval_1.evaluateCommercial)(productId).catch(() => null) : null;
    if (commercialEval && !note) {
        const s = commercialEval.result.suggestion;
        if (s === "reject" && result !== "fail")
            return "Đánh giá thương mại hoá: chưa nên duyệt — ghi lý do khi vẫn duyệt";
        if (s === "approve" && result === "fail")
            return "Đánh giá thương mại hoá: nên duyệt — ghi lý do khi không duyệt";
    }
    if (input.handoff) {
        if (result === "fail")
            return "Mẫu FAIL không đẩy mẫu ĐVKD";
        if (!product.source_url)
            return "Thiếu link kho Source trước khi tạo phiếu đẩy mẫu ĐVKD";
    }
    const snapshot = ev ? {
        suggested, source: ev.source, window: [ev.first_post_date, ev.window_end], days_elapsed: ev.days_elapsed,
        age: ev.age, metrics: ev.metrics, checks: ev.checks, sales_status: ev.sales_status, traffic_status: ev.traffic_status,
    } : { suggested: null };
    const at = now();
    const { data: decision, error } = await admin_1.sb.rnd().from("decisions").insert({
        product_id: productId, session_id: ev?.session_id ?? null, result, suggested, note, snapshot, decided_by: user.id,
    }).select("id").single();
    if (error)
        return error.message;
    // Quy trình: P5 do hệ thống tự lên khi đánh giá Win; duyệt Win ở P5 = quyết định thương mại hoá → P6.
    // Mẫu chưa tới P5 (vd mẫu nhận từ luồng Media) được duyệt Win → P5. FAIL → dừng mẫu (giữ mốc đã đạt).
    const target = input.toCommercial || (product.stage && (0, pipeline_constants_1.stageIndex)(product.stage) >= (0, pipeline_constants_1.stageIndex)("p5")) ? "p6" : "p5";
    const pipeline = product.stage
        ? result === "fail"
            ? { killed_at: at, kill_reason: `FAIL sau test${note ? `: ${note}` : ""}` }
            : { stage: target, stage_at: at, killed_at: null, kill_reason: null,
                ...(input.winQty !== undefined ? { win_qty: input.winQty } : {}), ...(product.launch_date ? {} : { launch_date: today() }) }
        : {};
    const { error: pErr } = await admin_1.sb.rnd().from("products").update({ status: "ended", updated_by: user.id, ...pipeline }).eq("id", productId);
    if (pErr)
        return `Đã lưu kết luận nhưng chưa cập nhật được mẫu: ${pErr.message}`;
    if (product.stage && result !== "fail" && product.killed_at)
        await logEvent(productId, user.id, "restored", { kill_reason: [product.kill_reason, null] });
    if (product.stage && result !== "fail" && product.stage !== target)
        await logEvent(productId, user.id, "stage_changed", { stage: [product.stage, target] });
    // Lưu ảnh chụp chỉ số lúc duyệt (bảng có sau migration 039)
    if (commercialEval) {
        const { error: crErr } = await admin_1.sb.rnd().from("commercial_reviews").insert({
            product_id: productId, decided_by: user.id, decision: result === "fail" ? "reject" : "approve", suggestion: commercialEval.result.suggestion,
            approved_qty: input.winQty ?? null, note: note ?? null, snapshot: { input: commercialEval.input, result: commercialEval.result, rules: commercialEval.rules, salesCodes: commercialEval.salesCodes },
        });
        if (crErr && crErr.code !== "42P01" && crErr.code !== "PGRST205")
            console.error("commercial_reviews:", crErr.message);
    }
    if (ev?.session_id)
        await admin_1.sb.rnd().from("test_sessions").update({ status: "ended", ended_at: at }).eq("id", ev.session_id).eq("status", "running");
    await logEvent(productId, user.id, "result_confirmed", { result: [prev?.result ?? null, result] });
    if (input.handoff) {
        const { data: h, error: hErr } = await admin_1.sb.rnd().from("handoffs").insert({
            product_id: productId, decision_id: decision.id, result, snapshot, source_url: product.source_url, rnd_note: input.handoffNote ?? null, created_by: user.id,
        }).select("id").single();
        if (hErr)
            return hErr.code === "23505" ? "Mẫu này đã có phiếu đẩy mẫu ĐVKD đang xử lý" : hErr.message;
        await admin_1.sb.rnd().from("handoff_events").insert({ handoff_id: h.id, actor_id: user.id, action: "created", note: input.handoffNote ?? null });
        await logEvent(productId, user.id, "handoff_created");
        (0, cache_1.revalidatePath)("/sample-push");
    }
    revalidateRnd(productId);
    (0, cache_1.revalidatePath)("/");
    return null;
}
