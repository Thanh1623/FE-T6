"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signUndo = signUndo;
exports.verifyUndo = verifyUndo;
require("server-only");
const node_crypto_1 = require("node:crypto");
// Ảnh chụp dữ liệu để HOÀN TÁC thao tác xoá: server giữ nguyên nội dung các dòng đã xoá, ký bằng HMAC rồi gửi cho trình duyệt cầm hộ.
// Khi hoàn tác, trình duyệt gửi lại — server kiểm chữ ký (đúng người, còn hạn) rồi mới ghi lại vào DB, nên trình duyệt
// KHÔNG thể tự bịa dữ liệu để chèn vào bảng. Không cần bảng riêng; mất khi tải lại trang hoặc quá hạn.
const TTL_MS = 2 * 60 * 60 * 1000;
const key = () => {
    const k = process.env.SUPABASE_SECRET_KEY;
    if (!k)
        throw new Error("Thiếu SUPABASE_SECRET_KEY");
    return `undo:${k}`;
};
const mac = (body) => (0, node_crypto_1.createHmac)("sha256", key()).update(body).digest("base64url");
function signUndo(userId, payload) {
    const body = Buffer.from(JSON.stringify({ u: userId, exp: Date.now() + TTL_MS, p: payload })).toString("base64url");
    return `${body}.${mac(body)}`;
}
function verifyUndo(token, userId) {
    const [body, sig] = String(token).split(".");
    const want = body ? mac(body) : "";
    if (!body || !sig || sig.length !== want.length || !(0, node_crypto_1.timingSafeEqual)(Buffer.from(sig), Buffer.from(want)))
        throw new Error("Dữ liệu hoàn tác không hợp lệ");
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (data.u !== userId)
        throw new Error("Chỉ người đã xoá mới hoàn tác được");
    if (Date.now() > data.exp)
        throw new Error("Đã quá hạn hoàn tác (2 giờ)");
    return data.p;
}
