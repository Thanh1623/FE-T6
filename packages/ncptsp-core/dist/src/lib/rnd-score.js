"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canSeeScore = exports.SCORE_KEY = void 0;
exports.loadScoreCfg = loadScoreCfg;
exports.loadCards = loadCards;
exports.rowScoreFor = rowScoreFor;
exports.assertCanApprove = assertCanApprove;
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
const session_1 = require("@/lib/session");
const rnd_score_calc_1 = require("@/lib/rnd-score-calc");
// Phần máy chủ của bảng chấm điểm mẫu sưu tầm (thiết kế + luật: src/lib/rnd-score-calc.ts, migration 065).
// CHẤM MÙ: điểm của người khác chỉ trả cho người ĐÃ CHẤM mẫu đó, và cho Quản lý / trưởng team (người duyệt).
exports.SCORE_KEY = "rnd_scorecard"; // core.settings
async function loadScoreCfg() {
    const { data } = await admin_1.sb.core().from("settings").select("value").eq("key", exports.SCORE_KEY).maybeSingle();
    return (0, rnd_score_calc_1.mergeScoreCfg)(data?.value);
}
// null = chưa chạy migration 065 (chưa có bảng) → tính năng chấm điểm tắt, mọi thứ chạy như cũ
async function loadCards(productIds) {
    let q = admin_1.sb.rnd().from("scorecards").select("product_id, scorer_id, scores, notes, fatal, total, updated_at");
    if (productIds)
        q = q.in("product_id", productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data, error } = await q;
    if (error)
        return null;
    return (data ?? []);
}
// Người này được thấy điểm của mẫu không?
const canSeeScore = (user, teamId, cards) => (0, session_1.canApprove)(user, teamId) || cards.some((c) => c.scorer_id === user.id);
exports.canSeeScore = canSeeScore;
// Tóm tắt cho dòng bảng / thẻ: số người đã chấm (công khai), bạn đã chấm chưa, đạt hay không (chỉ khi được thấy)
function rowScoreFor(user, teamId, cards, cfg) {
    const mine = cards.some((c) => c.scorer_id === user.id);
    const seen = (0, exports.canSeeScore)(user, teamId, cards);
    const all = (0, rnd_score_calc_1.combine)(cards, cfg);
    return {
        score: seen && all ? all.total : null,
        row: {
            n: cards.length, mine, min: cfg.minScorers, passed: seen && all && cards.length >= cfg.minScorers ? all.passed : null,
            bypass: user.role === "admin",
            block: seen && !!all && cards.length >= cfg.minScorers && !all.passed && user.role !== "admin",
        },
    };
}
// Cổng duyệt (dùng ở mọi đường duyệt): đủ số người chấm; mẫu "Không đạt" chỉ Quản lý (admin) được duyệt
async function assertCanApprove(productId, user) {
    const [cfg, cards] = await Promise.all([loadScoreCfg(), loadCards([productId])]);
    if (!cards)
        return; // chưa chạy migration 065: không chặn
    if (!cards.some((c) => c.scorer_id === user.id) && user.role !== "admin")
        throw new Error("Bạn cần chấm điểm mẫu này trước khi duyệt"); // người chưa chấm không duyệt được (Quản lý ngoại lệ)
    if (cards.length < cfg.minScorers)
        throw new Error(`Cần ít nhất ${cfg.minScorers} người chấm điểm trước khi duyệt (hiện ${cards.length}/${cfg.minScorers})`);
    const all = (0, rnd_score_calc_1.combine)(cards, cfg);
    if (!all.passed && user.role !== "admin")
        throw new Error("Mẫu chưa đạt bảng chấm điểm — chỉ Quản lý được duyệt"); // không nêu lý do / điểm: giữ chấm mù với người chưa chấm
}
