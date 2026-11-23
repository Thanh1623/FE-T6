import "server-only";
import { timingSafeEqual } from "node:crypto";

// Vercel Cron gửi header "Authorization: Bearer <CRON_SECRET>".
// So sánh thời gian cố định (chống dò từng ký tự qua độ trễ); thiếu CRON_SECRET → từ chối mọi yêu cầu.
export function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
