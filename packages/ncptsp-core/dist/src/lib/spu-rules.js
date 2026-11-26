"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SPU_RULES_KEY = void 0;
exports.mergeSpuRules = mergeSpuRules;
exports.loadSpuRules = loadSpuRules;
exports.loadVideoWinRules = loadVideoWinRules;
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
const kpi_constants_1 = require("@/lib/kpi-constants");
const spu_tracking_1 = require("@/lib/spu-tracking");
// Ngưỡng phân loại SPU. Quản lý chỉnh ở trang KPI:
//   • SP Ngôi sao: điều kiện KPI riêng + số ngày thống kê (core.settings 'spu_rules')
//   • SP Win = SPU đạt KPI Bán hàng · Win Traffic = SPU đạt KPI Traffic — lấy thẳng từ 2 bộ KPI mặc định (kpi_templates), tính trong cửa sổ test
//   • Bán chậm / tồn xấu: ngưỡng tồn kho (cùng settings)
// Thiếu hoặc sai kiểu → dùng mặc định trong lib/spu-tracking.
exports.SPU_RULES_KEY = "spu_rules";
const num = (v, d, min = 0) => (typeof v === "number" && Number.isFinite(v) && v >= min ? v : d);
// Ngưỡng phân loại bán theo SL bán 30 ngày: bán chậm khi dưới slowBelow, bán thường khi dưới normalBelow, bán chạy từ normalBelow trở lên (normalBelow phải lớn hơn slowBelow)
function salesRules(v) {
    const d = spu_tracking_1.DEFAULT_SPU_RULES.sales;
    const slowBelow = Math.max(1, Math.round(num(v?.slowBelow, d.slowBelow)));
    const normalBelow = Math.round(num(v?.normalBelow, d.normalBelow));
    return normalBelow > slowBelow ? { slowBelow, normalBelow } : d;
}
// Quy tắc Win theo biên bản họp (trang KPI): số nguyên dương; thiếu hoặc sai kiểu → dùng mặc định
function winRules(v) {
    const d = spu_tracking_1.DEFAULT_SPU_RULES.win;
    const t = (v?.traffic ?? {}), o = (v?.order ?? {});
    const int = (x, def, min, max = 1_000_000_000) => Math.min(max, Math.max(min, Math.round(num(x, def, min))));
    return {
        traffic: { days: int(t?.days, d.traffic.days, 1, 30), views: int(t?.views, d.traffic.views, 1), comments: int(t?.comments, d.traffic.comments, 0) },
        order: { days: int(o?.days, d.order.days, 1, 30), qty: int(o?.qty, d.order.qty, 1) },
    };
}
function mergeSpuRules(saved) {
    const s = (saved ?? {});
    const d = spu_tracking_1.DEFAULT_SPU_RULES;
    const videoRules = (0, kpi_constants_1.parseRules)(s.video?.rules);
    return {
        ...d,
        sales: salesRules(s.sales),
        win: winRules(s.win),
        video: { rules: typeof videoRules === "string" ? d.video.rules : videoRules, match: s.video?.match === "any" ? "any" : "all" },
    };
}
async function loadSpuRules() {
    const { data } = await admin_1.sb.core().from("settings").select("value").eq("key", exports.SPU_RULES_KEY).maybeSingle();
    return mergeSpuRules(data?.value);
}
// Tiêu chí Video Win đang dùng (đã chỉnh hoặc mặc định) — chấm từng video ở mọi nơi hiện nhãn "đạt KPI"
async function loadVideoWinRules() {
    const { data } = await admin_1.sb.core().from("settings").select("value").eq("key", exports.SPU_RULES_KEY).maybeSingle();
    return mergeSpuRules(data?.value).video;
}
