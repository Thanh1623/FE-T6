"use server";

import { requireActionUser } from "@/lib/session";
import { checkVideoDaily, refreshVideoDaily } from "@/lib/video-daily";

// Bảng tổng hợp video dựng trong SQL (migration 089): nút thay cho việc gọi /api/cron/spu-summary?video=… và ?check=3. Chỉ Quản lý.
export type VideoBuildState = { ok?: boolean; error?: string; title?: string; lines?: string[] };

const fmt = (n: unknown) => (typeof n === "number" ? n.toLocaleString("vi-VN") : String(n ?? "—"));

export async function buildVideoTable(mode: "full" | "inc"): Promise<VideoBuildState> {
  await requireActionUser(["admin"]);
  const r = await refreshVideoDaily({ full: mode === "full" });
  if (!r.ok) return { error: r.error ?? "Lỗi không rõ" };
  const daily = r.daily as { rows?: number } | null;
  const fact = (Array.isArray(r.fact) ? r.fact.at(-1) : r.fact) as { rows?: number; upserted?: number } | null;
  return { ok: true, title: mode === "full" ? "Đã dựng đầy đủ" : "Đã nạp tăng dần", lines: [`Bảng bài video: ${fmt(fact?.rows)} dòng`, `Bảng theo ngày: ${fmt(daily?.rows)} dòng`, `Mất ${(r.ms / 1000).toFixed(1)} giây`] };
}

export async function compareVideoTable(): Promise<VideoBuildState> {
  await requireActionUser(["admin"]);
  const c = await checkVideoDaily() as { ok: boolean; error?: string; only_old?: number; only_new?: number; diff_rows?: number; diff_videos?: number; old_rows?: number; new_rows_in_summary?: number; old_videos?: number; new_videos_in_summary?: number; extra_codes_rows?: number };
  if (c.error) return { error: c.error };
  return {
    ok: c.ok, title: c.ok ? "KHỚP với bảng cũ" : "CÓ LỆCH so với bảng cũ",
    lines: [
      `Dòng: cũ ${fmt(c.old_rows)} · mới (trong danh sách SPU) ${fmt(c.new_rows_in_summary)}`,
      `Video: cũ ${fmt(c.old_videos)} · mới ${fmt(c.new_videos_in_summary)}`,
      `Chỉ có ở bảng cũ: ${fmt(c.only_old)} · chỉ có ở bảng mới: ${fmt(c.only_new)} · lệch số video: ${fmt(c.diff_videos)} · lệch lượt xem: ${fmt(c.diff_rows)}`,
      `Dòng của mã ngoài danh sách SPU (mã test, R&D…, không phải lỗi): ${fmt(c.extra_codes_rows)}`,
    ],
  };
}
