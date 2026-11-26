"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.heavyRpc = heavyRpc;
exports.heavyQuery = heavyQuery;
// Giới hạn số truy vấn NẶNG chạy cùng lúc trong một máy chủ (mỗi instance Vercel).
// Vì sao: database bị giới hạn CPU; khi bộ đệm trống, /qlhn bắn ~17 hàm sales.tr_* và /spu bắn thêm spu_dash / spu_traffic_gain cùng lúc →
// chúng tranh CPU của nhau, mỗi cái vượt 8 giây ("canceling statement due to statement timeout", mã 57014) và cạn hàng chờ kết nối (PGRST003).
// Xếp hàng chạy 3 cái một lượt thì mỗi truy vấn nhanh lại, tổng thời gian không tăng, không còn lỗi hàng loạt.
const MAX = 3;
let running = 0;
const waiting = [];
const isTimeout = (e) => !!e && (e.code === "57014" || /statement timeout|canceling statement/i.test(e.message ?? ""));
// Gọi một truy vấn nặng (kết quả dạng { data, error } của supabase-js) có XẾP HÀNG (≤ MAX cùng lúc) và THỬ LẠI khi bị cắt vì quá thời gian 8 giây (database đang bận):
// trước đây một lần quá thời gian làm trang rơi sang đường tính trực tiếp rất nặng → càng làm database bận thêm (đã thấy ở nhật ký Supabase / Vercel 2026-11-09 11:19).
async function heavyRpc(fn, retries = 1, waitMs = 1500) {
    let res = await heavyQuery(async () => await fn());
    for (let a = 0; a < retries && isTimeout(res.error); a++) {
        await new Promise((r) => setTimeout(r, waitMs * (a + 1)));
        res = await heavyQuery(async () => await fn());
    }
    return res;
}
async function heavyQuery(fn) {
    // Chuyển giao suất chạy trực tiếp cho người đang chờ (không giảm rồi tăng lại bộ đếm) để không bao giờ vượt MAX do chen ngang giữa hai lượt
    if (running >= MAX)
        await new Promise((go) => waiting.push(go));
    else
        running++;
    try {
        return await fn();
    }
    finally {
        const next = waiting.shift();
        if (next)
            next();
        else
            running--;
    }
}
