"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/session";
import { TAG, bust } from "@/lib/cache-tags";
import { sb } from "@/lib/supabase/admin";
import { setupChannels } from "@/lib/sync";
import { TOKEN_LABELS, metaTokens } from "@/lib/meta/token";

// Chỉ quét lại danh sách kênh qua từng token (không kéo số liệu) — dùng ngay sau khi giao thêm Page trong Business Manager.
// Kênh mới được kéo số liệu ở lần "Đồng bộ ngay" / cron kế tiếp.
export async function rediscoverChannels() {
  await requireActionUser(["admin"]);
  const out: { label: string; ok: boolean; message: string }[] = [];
  for (const t of metaTokens()) {
    try {
      const ch = await setupChannels(t.token, t.source);
      out.push({ label: TOKEN_LABELS[t.source], ok: true, message: `${ch.length} kênh` });
    } catch (e) {
      out.push({ label: TOKEN_LABELS[t.source], ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  }
  revalidatePath("/", "layout");
  return out;
}

// Gán Page cho team (mỗi Page thuộc 1 team) — dùng cho số liệu "Page của team" ở bảng Traffic / Duyệt Win
export async function setChannelTeam(channelId: string, teamId: string | null) {
  await requireActionUser(["admin"]);
  const { error } = await sb.social().from("channels").update({ team_id: teamId || null }).eq("id", channelId);
  if (error) throw new Error(error.message);
  bust(TAG.channels);
  revalidatePath("/team");
  revalidatePath("/rnd/traffic");
  revalidatePath("/rnd/win");
}
