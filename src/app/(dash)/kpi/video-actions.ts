"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/session";
import { runApiVideoSync, type VideoSyncResult } from "@/lib/sync/api-videos";
import { actorOf } from "@/lib/system-log";

export type VideoSyncState = { ok?: boolean; error?: string; results?: VideoSyncResult[] };

// Đồng bộ video từ API ngay (không chờ lịch hằng ngày): đọc toàn bộ, chỉ ghi video mới / đột biến. Chỉ Quản lý / R&D.
export async function syncVideosNow(): Promise<VideoSyncState> {
  const user = await requireActionUser(["admin", "rnd"]);
  const r = await runApiVideoSync(undefined, actorOf(user));
  for (const p of ["/kpi", "/spu", "/posts", "/rnd/dashboard"]) revalidatePath(p);
  return r.ok ? { ok: true, results: r.results } : { error: r.error, results: r.results };
}
