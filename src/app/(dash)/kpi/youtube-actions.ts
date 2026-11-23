"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/session";
import { sb } from "@/lib/supabase/admin";
import { TAG, bust } from "@/lib/cache-tags";
import { resolveChannel, youtubeConfigured } from "@/lib/youtube/api";
import { activeYouTube, syncYouTubeChannel } from "@/lib/sync/youtube";

export type YouTubeState = { ok?: boolean; error?: string; lines?: { text: string; ok: boolean }[] };

// Thêm kênh YouTube: mỗi dòng là ID kênh (UC…), @handle hoặc link kênh. Tên + số đăng ký lấy từ YouTube; gán team ở trang Quản lý team (Kênh & Page). Chỉ Quản lý / R&D.
export async function addYouTubeChannels(input: string): Promise<YouTubeState> {
  await requireActionUser(["admin", "rnd"]);
  if (!youtubeConfigured()) return { error: "Chưa cấu hình YOUTUBE_API_KEY (.env.local và Vercel)" };
  const items = [...new Set(String(input ?? "").split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean))].slice(0, 50);
  if (!items.length) return { error: "Nhập ít nhất một kênh (ID UC…, @handle hoặc link)" };
  const lines: { text: string; ok: boolean }[] = [];
  for (const it of items) {
    try {
      const c = await resolveChannel(it);
      const { error } = await sb.social().from("channels").upsert({
        id: `yt:${c.id}`, platform: "youtube", name: c.title, username: c.handle, followers_count: c.subscribers, is_active: true, updated_at: new Date().toISOString(),
      }, { ignoreDuplicates: false });
      if (error) throw new Error(error.message);
      lines.push({ ok: true, text: `✓ ${c.title}${c.handle ? ` (${c.handle})` : ""}${c.subscribers !== null ? ` · ${c.subscribers.toLocaleString("vi-VN")} người đăng ký` : ""}` });
    } catch (e) {
      lines.push({ ok: false, text: `✗ ${it}: ${e instanceof Error ? e.message : "lỗi"}` });
    }
  }
  bust(TAG.channels);
  revalidatePath("/team"); revalidatePath("/kpi");
  return { ok: lines.some((l) => l.ok), lines };
}

// Đồng bộ ngay mọi kênh YouTube (kênh mới nhập 400 ngày video; kênh cũ làm mới 30 ngày gần nhất), rồi tách hashtag / gắn mã SPU. Chỉ Quản lý / R&D.
export async function syncYouTubeNow(): Promise<YouTubeState> {
  await requireActionUser(["admin", "rnd"]);
  if (!youtubeConfigured()) return { error: "Chưa cấu hình YOUTUBE_API_KEY (.env.local và Vercel)" };
  const channels = await activeYouTube();
  if (!channels.length) return { error: "Chưa có kênh YouTube nào — thêm kênh trước" };
  const { extractHashtags, retagPosts } = await import("@/lib/sync");
  const lines: { text: string; ok: boolean }[] = [];
  for (const ch of channels) {
    try {
      const r = await syncYouTubeChannel(ch, 30, extractHashtags);
      await sb.social().from("channels").update({ last_synced_at: new Date().toISOString() }).eq("id", ch.id);
      lines.push({ ok: true, text: `✓ ${ch.name}: ${r.posts} video` });
    } catch (e) {
      lines.push({ ok: false, text: `✗ ${ch.name}: ${e instanceof Error ? e.message : "lỗi"}` });
    }
  }
  try { await retagPosts(); } catch (e) { lines.push({ ok: false, text: `✗ Tách hashtag: ${e instanceof Error ? e.message : "lỗi"}` }); }
  bust(TAG.sync, TAG.spuData);
  for (const p of ["/posts", "/spu", "/kpi", "/rnd/dashboard", "/team"]) revalidatePath(p);
  return { ok: lines.some((l) => l.ok), lines };
}
