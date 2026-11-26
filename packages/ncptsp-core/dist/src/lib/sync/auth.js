"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAuthorized = isAuthorized;
require("server-only");
const node_crypto_1 = require("node:crypto");
// Vercel Cron gửi header "Authorization: Bearer <CRON_SECRET>".
// So sánh thời gian cố định (chống dò từng ký tự qua độ trễ); thiếu CRON_SECRET → từ chối mọi yêu cầu.
function isAuthorized(req) {
    const secret = process.env.CRON_SECRET;
    if (!secret)
        return false;
    const got = Buffer.from(req.headers.get("authorization") ?? "");
    const want = Buffer.from(`Bearer ${secret}`);
    return got.length === want.length && (0, node_crypto_1.timingSafeEqual)(got, want);
}
