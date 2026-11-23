import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { sb } from "@/lib/supabase/admin";
import { TAG, bust } from "@/lib/cache-tags";
import { exchangeCode, getUser, tiktokConfigured } from "@/lib/tiktok/api";

// GET /api/tiktok/callback?code=…&state=… — TikTok gọi lại sau khi chủ tài khoản đồng ý.
// Lưu kênh (platform tiktok, gán team) + access/refresh token (schema private). Dữ liệu về ở lần đồng bộ kế tiếp.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const done = (q: string) => {
    const res = NextResponse.redirect(new URL(`/team?${q}`, req.url));
    res.cookies.delete({ name: "tt_state", path: "/api/tiktok" });
    return res;
  };
  const fail = (msg: string) => done(`tiktok_error=${encodeURIComponent(msg)}`);

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (!tiktokConfigured()) return fail("Chưa cấu hình TikTok");
  if (url.searchParams.get("error")) return fail(`TikTok từ chối: ${url.searchParams.get("error_description") ?? url.searchParams.get("error")}`);

  const code = url.searchParams.get("code"), state = url.searchParams.get("state");
  // Giá trị cookie bị mã hoá URL (dấu "|" thành "%7C") → phải giải mã trước khi tách
  const cookieRaw = req.headers.get("cookie")?.match(/(?:^|;\s*)tt_state=([^;]+)/)?.[1] ?? "";
  let decoded = "";
  try { decoded = decodeURIComponent(cookieRaw); } catch { /* cookie hỏng → coi như không có */ }
  const [nonce, teamId, uid] = decoded.split("|");
  if (!code || !state) return fail("TikTok không trả mã xác nhận — thử kết nối lại");
  // Cookie chống giả mạo được đặt lúc bấm "Kết nối TikTok" — phải bấm và nhận callback trên CÙNG một địa chỉ web
  if (!nonce || !teamId) return fail(`Không thấy phiên kết nối (cookie) tại ${url.host}. Hãy bấm "Kết nối TikTok" ngay trên địa chỉ này và dùng đúng địa chỉ trong TIKTOK_REDIRECT_URI; không tải lại trang callback, không để quá 10 phút`);
  if (state !== nonce) return fail("Mã phiên không khớp — bấm Kết nối TikTok lại từ đầu");
  if (uid !== user.id) return fail("Tài khoản đăng nhập app đã thay đổi giữa chừng — đăng nhập lại rồi kết nối lại");

  try {
    const tok = await exchangeCode(code);
    const info = await getUser(tok.access_token);
    const channelId = `tt_${tok.open_id}`;
    const { data: existing } = await sb.social().from("channels").select("team_id").eq("id", channelId).maybeSingle();
    if (existing?.team_id && existing.team_id !== teamId) return fail("Tài khoản TikTok này đang thuộc team khác");

    const { error: cErr } = await sb.social().from("channels").upsert({
      id: channelId, platform: "tiktok", name: info.display_name ?? "TikTok", followers_count: info.follower_count ?? null,
      team_id: teamId, is_active: true, token_source: "user", last_seen_at: new Date().toISOString(),
    });
    if (cErr) throw cErr;
    const { error: tErr } = await sb.social().rpc("save_tiktok_token", {
      p_channel_id: channelId, p_open_id: tok.open_id, p_access: tok.access_token, p_refresh: tok.refresh_token,
      p_access_exp: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
      p_refresh_exp: new Date(Date.now() + tok.refresh_expires_in * 1000).toISOString(), p_scope: tok.scope,
    });
    if (tErr) throw tErr;
    bust(TAG.channels);
    return done(`tiktok_ok=${encodeURIComponent(info.display_name ?? "TikTok")}`);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Không kết nối được TikTok");
  }
}
