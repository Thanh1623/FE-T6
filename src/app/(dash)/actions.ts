"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/session";
import { syncAll } from "@/lib/sync";
import { actorOf } from "@/lib/system-log";
import { getSalesByChannel } from "@/lib/data";

// Đồng bộ 3 ngày gần nhất + tự phát hiện Trang mới (Trang mới tự kéo 1 năm)
export async function syncNow() {
  const user = await requireActionUser(["admin", "rnd"]);
  // Bấm thủ công: ưu tiên các kênh lâu chưa cập nhật nhất, không bỏ qua vì "kênh còn mới"
  const results = await syncAll({ days: 3, postDays: 30, minAgeMin: 0, by: actorOf(user) });
  revalidatePath("/", "layout");
  return results;
}

export async function loadChannelBreakdown(code: string, from: string, to: string) {
  await requireActionUser();
  return getSalesByChannel(code, from, to);
}
