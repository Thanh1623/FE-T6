"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadFirstDays = loadFirstDays;
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
// Số liệu N ngày đầu kể từ ngày đăng của từng video (sales.video_first_days, migration 063). Chưa chạy migration → trả rỗng (nơi gọi tự dùng số hiện tại).
async function loadFirstDays(ids, days) {
    const out = new Map();
    const uniq = [...new Set(ids.filter(Boolean))];
    const parts = [];
    for (let i = 0; i < uniq.length; i += 2500)
        parts.push(uniq.slice(i, i + 2500));
    for (let i = 0; i < parts.length; i += 4) {
        const res = await Promise.all(parts.slice(i, i + 4).map((c) => admin_1.sb.sales().rpc("video_first_days", { p: { ids: c, days } })));
        for (const { data, error } of res) {
            if (error || !Array.isArray(data))
                continue;
            for (const r of data)
                out.set(String(r.id), { views: Number(r.views) || 0, viewers: Number(r.viewers) || 0, exact: !!r.exact, unknown: !!r.unknown });
        }
    }
    return out;
}
