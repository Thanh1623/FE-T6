import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getCurrentUser } from "@/lib/session";
import { authorizeUrl, tiktokConfigured } from "@/lib/tiktok/api";

// GET /api/tiktok/connect[?team=<id>] — bắt đầu đăng nhập TikTok (Login Kit) cho 1 tài khoản của team.
// Trưởng team: gán vào team của mình. Quản lý: chọn team qua ?team=.
export async function GET(req: Request) {
  const back = (msg: string) => NextResponse.redirect(new URL(`/team?tiktok_error=${encodeURIComponent(msg)}`, req.url));
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (!tiktokConfigured()) return back("Chưa cấu hình TikTok (thiếu TIKTOK_CLIENT_KEY / SECRET / REDIRECT_URI)");

  const teamParam = new URL(req.url).searchParams.get("team") ?? "";
  const teamId = user.role === "admin" ? teamParam : user.role === "rnd" && user.is_team_lead ? user.team_id : null;
  if (!teamId) return back(user.role === "admin" ? "Quản lý cần chọn team nhận kênh TikTok" : "Chỉ trưởng team hoặc Quản lý được kết nối TikTok");

  const nonce = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(nonce));
  // Cookie chống giả mạo yêu cầu (CSRF): callback phải khớp nonce + đúng người đang đăng nhập
  // secure chỉ khi chạy HTTPS (bản thật); thử trên http://localhost thì bỏ cờ này, nếu không một số trình duyệt không lưu cookie
  res.cookies.set("tt_state", `${nonce}|${teamId}|${user.id}`, { httpOnly: true, secure: new URL(req.url).protocol === "https:", sameSite: "lax", path: "/api/tiktok", maxAge: 600 });
  return res;
}
