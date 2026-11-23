import "server-only";
import { sb } from "@/lib/supabase/admin";
import { requireActionUser, type CurrentUser } from "@/lib/session";
import type { Role } from "@/lib/roles";

// Nhật ký hệ thống (core.system_logs, migration 073): ghi lại các thao tác CẬP NHẬT DỮ LIỆU — nhập file, đồng bộ, đổi cài đặt — để Quản lý xem ở Cài đặt → Nhật ký.
// Ghi nhật ký KHÔNG BAO GIỜ làm hỏng thao tác chính: lỗi (kể cả chưa chạy migration 073) chỉ in ra console.
export type Actor = { id: string; name: string } | null;
export const actorOf = (u: Pick<CurrentUser, "id" | "full_name" | "email">): Actor => ({ id: u.id, name: u.full_name || u.email });

// Tên thao tác hiện ở trang nhật ký (kind chưa có ở đây thì hiện nguyên mã)
export const LOG_KINDS: Record<string, string> = {
  import_inventory: "Nhập tồn kho", import_sales: "Nhập số bán", import_images: "Nhập ảnh / danh sách sản phẩm", import_receipts: "Nhập đơn nhập hàng",
  sync_videos: "Đồng bộ video từ API", sync_all: "Đồng bộ kênh và đơn hàng", refresh_summary: "Làm mới bảng tổng hợp SPU",
  settings_kpi: "Sửa KPI mặc định", settings_window: "Sửa cửa sổ test", settings_win: "Sửa quy tắc Win", settings_stock: "Sửa phân loại bán",
  settings_video: "Sửa KPI video", settings_commercial: "Sửa đánh giá thương mại hoá",
};

export async function logSystem(e: { kind: string; ok: boolean; summary: string; detail?: Record<string, unknown>; actor?: Actor }): Promise<void> {
  try {
    const { error } = await sb.core().from("system_logs").insert({
      kind: e.kind, ok: e.ok, summary: e.summary.slice(0, 500), detail: e.detail ?? null,
      actor_id: e.actor?.id ?? null, actor_name: e.actor?.name ?? null, source: e.actor ? "user" : "auto",
    });
    if (error) { if (!/system_logs|schema cache|does not exist/i.test(error.message)) console.error("[system-log]", error.message); return; }
    // Dọn dòng quá 180 ngày, thỉnh thoảng (không cần lịch riêng)
    if (Math.random() < 0.02) await sb.core().from("system_logs").delete().lt("at", new Date(Date.now() - 180 * 86_400_000).toISOString());
  } catch (err) { console.error("[system-log]", err); }
}

// Bọc một server action có kết quả dạng { ok, error }: kiểm quyền (như action gốc), chạy, ghi nhật ký thành công / lỗi rồi trả nguyên kết quả
export async function logged<R extends { ok?: boolean; error?: string }>(
  kind: string, roles: Role[], run: () => Promise<R>, summarize: (r: R) => string, detail?: (r: R) => Record<string, unknown>,
): Promise<R> {
  const actor = actorOf(await requireActionUser(roles));
  const t0 = Date.now();
  try {
    const r = await run();
    const ok = !r.error;
    await logSystem({ kind, ok, summary: ok ? summarize(r) : String(r.error), detail: { ms: Date.now() - t0, ...(ok && detail ? detail(r) : {}) }, actor });
    return r;
  } catch (e) {
    await logSystem({ kind, ok: false, summary: e instanceof Error ? e.message : String(e), detail: { ms: Date.now() - t0 }, actor });
    throw e;
  }
}
