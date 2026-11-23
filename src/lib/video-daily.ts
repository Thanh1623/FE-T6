import "server-only";
import { sb } from "@/lib/supabase/admin";

// Bảng tổng hợp video dựng trong SQL (migration 089; thiết kế: docs/THIET-KE-LAM-MOI-VIDEO-TRONG-SQL.md).
// Pha A–B: chỉ NẠP và ĐỐI CHIẾU — chưa trang nào đọc sales.video_daily. Mọi lỗi chỉ trả về, không ném (không làm hỏng lần làm mới bảng tổng hợp).
const missing = (e: { code?: string; message?: string } | null) => !!e && (e.code === "PGRST202" || e.code === "42883" || e.code === "42P01" || /could not find the function|does not exist/i.test(e.message ?? ""));
export type VideoRefresh = { ok: boolean; skipped?: boolean; error?: string; fact?: unknown; daily?: unknown; growth?: unknown; ms: number };

const dayStr = (d: Date) => d.toISOString().slice(0, 10);
const addDay = (s: string, n: number) => dayStr(new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000));

// Tăng dần (mặc định): chỉ bài có updated_at mới; full = dựng lại cả 360 ngày theo từng khoảng 60 ngày (mỗi lượt gọi < giới hạn 8 giây của kết nối)
export async function refreshVideoDaily(opts: { full?: boolean } = {}): Promise<VideoRefresh> {
  const t0 = Date.now();
  try {
    const db = sb.sales();
    let fact: unknown = null;
    if (opts.full) {
      const today = dayStr(new Date(Date.now() + 7 * 3_600_000));   // ngày VN
      const startedAt = new Date().toISOString();   // mốc cho các lần nạp tăng dần sau này (gửi kèm ở lượt cuối)
      const parts: unknown[] = [];
      for (let lo = -359; lo <= 0; lo += 60) {
        const last = lo + 60 > 0;
        const { data, error } = await db.rpc("refresh_video_fact", { p_from: addDay(today, lo), p_to: addDay(today, Math.min(lo + 60, 1)), ...(last ? { p_mark_at: startedAt } : {}) });
        if (error) return missing(error) ? { ok: false, skipped: true, error: "Chưa chạy migration 089", ms: Date.now() - t0 } : { ok: false, error: `refresh_video_fact: ${error.message}`, ms: Date.now() - t0 };
        parts.push(data);
      }
      fact = parts;
    } else {
      const { data, error } = await db.rpc("refresh_video_fact");
      if (error) return missing(error) ? { ok: false, skipped: true, error: "Chưa chạy migration 089", ms: Date.now() - t0 } : { ok: false, error: `refresh_video_fact: ${error.message}`, ms: Date.now() - t0 };
      fact = data;
      if ((data as { skipped?: boolean } | null)?.skipped) return { ok: false, skipped: true, error: "Chưa dựng đầy đủ lần đầu — bấm “Dựng đầy đủ” trước", fact, ms: Date.now() - t0 };
    }
    const d = await db.rpc("refresh_video_daily");
    if (d.error) return { ok: false, error: `refresh_video_daily: ${d.error.message}`, fact, ms: Date.now() - t0 };
    // Lượt xem tăng theo ngày (migration 101) → cột "Lượt xem" (tăng trong kỳ lọc) và "View 3N": lỗi / chưa chạy migration thì hai cột đó hiện "—", không làm hỏng lần làm mới
    const g = await db.rpc("refresh_video_views");
    return { ok: true, fact, daily: d.data, growth: g.error ? { error: g.error.message } : g.data, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
  }
}

// Đối chiếu video_daily với bảng cũ spu_video_daily (không ghi gì)
export async function checkVideoDaily() {
  const { data, error } = await sb.sales().rpc("video_parity");
  if (error) return { ok: false, error: missing(error) ? "Chưa chạy migration 089" : error.message };
  const p = data as { only_old: number; only_new: number; diff_videos: number };
  return { ok: p.only_old === 0 && p.only_new === 0 && p.diff_videos === 0, ...p };
}
