"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser, type CurrentUser } from "@/lib/session";
import { TAG, bust } from "@/lib/cache-tags";
import { sb } from "@/lib/supabase/admin";
import { connectTeamPages } from "@/lib/sync";
import { inspectToken } from "@/lib/meta/token";
import { TT_NAME_PREFIX } from "@/lib/tiktok/name";
import { parseTags, resolveTags, saveTagChannels } from "@/lib/team-tags";

// Chọn / bỏ Page theo dõi của team. Mỗi Page thuộc đúng 1 team (không dùng chung → số liệu team không cộng trùng).
//   Trưởng team: chọn Page CHƯA có team; bỏ Page của chính team mình.
//   Quản lý: gán / gỡ bất kỳ Page nào (chọn team đích).
function leadTeam(u: CurrentUser, teamIdFromForm: string) {
  if (u.role === "admin") return teamIdFromForm || null;
  if (u.role === "rnd" && u.is_team_lead && u.team_id) return u.team_id;
  throw new Error("Chỉ trưởng team hoặc Quản lý được chọn Page");
}

export async function claimPage(formData: FormData) {
  const user = await requireActionUser(["admin", "rnd"]);
  const channelId = String(formData.get("channel_id") ?? "");
  const teamId = leadTeam(user, String(formData.get("team_id") ?? ""));
  if (!channelId || !teamId) throw new Error("Thiếu Page hoặc team");
  // Điều kiện team_id IS NULL làm việc "chọn" nguyên tử: 2 team bấm cùng lúc thì chỉ 1 team được
  const { data, error } = await sb.social().from("channels").update({ team_id: teamId })
    .eq("id", channelId).is("team_id", null).eq("is_active", true).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Page này đã thuộc team khác");
  done();
}

export async function releasePage(formData: FormData) {
  const user = await requireActionUser(["admin", "rnd"]);
  const channelId = String(formData.get("channel_id") ?? "");
  let q = sb.social().from("channels").update({ team_id: null }).eq("id", channelId);
  if (user.role !== "admin") {
    const teamId = leadTeam(user, "");
    q = q.eq("team_id", teamId!);   // chỉ bỏ được Page của team mình
  }
  const { error } = await q;
  if (error) throw new Error(error.message);
  done();
}

export type TagState = { ok?: boolean; added?: string[]; errors?: string[] };

// Thêm tag Sapo thủ công cho team (xem lib/team-tags): số bán của đơn mang tag đó được tính cho team.
//   Trưởng team: tag cho team mình · Quản lý: chọn team đích.
export async function addTeamTags(_: TagState, formData: FormData): Promise<TagState> {
  const user = await requireActionUser(["admin", "rnd"]);
  let teamId: string | null;
  try { teamId = leadTeam(user, String(formData.get("team_id") ?? "")); } catch (e) { return { errors: [(e as Error).message] }; }
  if (!teamId) return { errors: ["Chọn team để thêm tag"] };
  const { tags, bad } = parseTags(String(formData.get("tags") ?? ""));
  if (!tags.length) return { errors: bad.length ? [`Chưa hỗ trợ dạng tag: ${bad.join(", ")}. Dùng tiktok_business_<tên>, tiktok_business_id_<mã> hoặc page_id_<số>.`] : ["Dán ít nhất 1 tag"] };
  const { channels, errors } = await resolveTags(tags);
  const saved = await saveTagChannels(channels, teamId);
  done();
  return { ok: saved.added.length > 0, added: saved.added, errors: [...errors, ...saved.errors, ...bad.map((b) => `Bỏ qua (chưa hỗ trợ): ${b}`)] };
}

// Gỡ tag thủ công (xoá kênh tag). Trưởng team chỉ gỡ tag của team mình. Chỉ xoá kênh dạng tag (id "ttn:…"), không xoá Page thật.
export async function removeTeamTag(formData: FormData) {
  const user = await requireActionUser(["admin", "rnd"]);
  const id = String(formData.get("channel_id") ?? "");
  if (!id.startsWith(TT_NAME_PREFIX)) throw new Error("Không phải tag thủ công");
  let q = sb.social().from("channels").delete().eq("id", id);
  if (user.role !== "admin") q = q.eq("team_id", leadTeam(user, "")!);
  const { error } = await q;
  if (error) throw new Error(error.message);
  done();
}

function done() {
  bust(TAG.channels);
  revalidatePath("/team");
  revalidatePath("/", "layout");
}

export type ConnectState = { ok?: boolean; error?: string; connected?: { platform: string; name: string }[]; skipped?: string[]; warning?: string };

// Trưởng team (hoặc Quản lý) dán token Facebook cá nhân → kết nối mọi Trang người đó quản trị vào team.
// Token cá nhân chỉ dùng để đọc danh sách Trang + lấy Page Token, KHÔNG được lưu hay ghi log.
export async function connectPages(_: ConnectState, formData: FormData): Promise<ConnectState> {
  const user = await requireActionUser(["admin", "rnd"]);
  let teamId: string | null;
  try { teamId = leadTeam(user, String(formData.get("team_id") ?? "")); } catch (e) { return { error: (e as Error).message }; }
  if (!teamId) return { error: "Chọn team để gán Page" };
  const token = String(formData.get("token") ?? "").trim();
  if (token.length < 60 || /\s/.test(token)) return { error: "Token không hợp lệ — copy nguyên chuỗi dài bắt đầu bằng EA… (không có khoảng trắng)" };

  const st = await inspectToken("user", token);
  if (!st.valid) return { error: `Token không dùng được: ${st.error ?? "đã hết hạn hoặc bị thu hồi"}. Tạo token mới theo hướng dẫn.` };
  if (!st.scopes.includes("pages_show_list")) return { error: "Token thiếu quyền pages_show_list — khi tạo token phải tick quyền này (xem hướng dẫn)." };

  try {
    const r = await connectTeamPages(token, teamId);
    if (!r.connected.length && !r.skipped.length) return { error: `Tài khoản ${st.owner ?? ""} không quản trị Trang nào (hoặc chưa tick chọn Trang ở bước cấp quyền).`.trim() };
    const { data: teams } = await sb.core().from("teams").select("id, name");
    const tName = new Map((teams ?? []).map((t) => [t.id as string, t.name as string]));
    revalidatePath("/team"); revalidatePath("/", "layout");
    return {
      ok: true, connected: r.connected,
      skipped: r.skipped.map((s) => `${s.name} (đang thuộc team ${tName.get(s.teamId) ?? "khác"})`),
      warning: st.missing.length ? `Token thiếu quyền: ${st.missing.join(", ")} — số liệu có thể không đầy đủ (vd read_insights để lấy traffic).` : undefined,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Không kết nối được — thử lại hoặc tạo token mới" };
  }
}

// Quản lý TẮT kênh (kênh đã xoá / không dùng nữa): ngừng đồng bộ, ẩn khỏi danh sách kênh và mọi thống kê dùng kênh đang hoạt động.
// Bài đăng cũ vẫn giữ trong hệ thống (không xoá dữ liệu). Bật lại: liên hệ kỹ thuật (đặt is_active = true).
export async function deactivateChannel(formData: FormData) {
  await requireActionUser(["admin"]);
  const channelId = String(formData.get("channel_id") ?? "");
  if (!channelId) throw new Error("Thiếu kênh");
  const { error } = await sb.social().from("channels").update({ is_active: false, is_rnd: false, updated_at: new Date().toISOString() }).eq("id", channelId);
  if (error) throw new Error(error.message);
  bust(TAG.channels, TAG.sync, TAG.spuData);
  for (const p of ["/team", "/rnd-library", "/posts", "/spu", "/kpi"]) revalidatePath(p);
}

// Quản lý đánh dấu Page / kênh là Page R&D (video sản phẩm hiện ở trang "Thư viện SP mới" cho mọi team)
export async function setRndPage(formData: FormData) {
  await requireActionUser(["admin"]);
  const channelId = String(formData.get("channel_id") ?? "");
  const on = String(formData.get("on") ?? "") === "1";
  const { error } = await sb.social().from("channels").update({ is_rnd: on }).eq("id", channelId);
  if (error) throw new Error(error.code === "42703" || error.code === "PGRST204" ? "Chưa chạy migration 022 trong Supabase" : error.message);
  bust(TAG.channels);
  revalidatePath("/team");
  revalidatePath("/rnd-library");
}
