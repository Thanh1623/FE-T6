import Link from "next/link";
import { sb } from "@/lib/supabase/admin";
import { LOG_KINDS } from "@/lib/system-log";

// Nhật ký hệ thống (Cài đặt → Nhật ký, chỉ Quản lý): các thao tác cập nhật dữ liệu — nhập file, đồng bộ, đổi cài đặt — mới nhất ở trên. Ghi bởi lib/system-log.ts (migration 073).
const SIZE = 50;
const when = (iso: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
type Row = { id: number; at: string; kind: string; ok: boolean; summary: string; detail: Record<string, unknown> | null; actor_name: string | null; source: string };

export default async function SystemLog({ kind, page }: { kind: string; page: number }) {
  let q = sb.core().from("system_logs").select("id, at, kind, ok, summary, detail, actor_name, source", { count: "exact" }).order("at", { ascending: false }).range((page - 1) * SIZE, page * SIZE - 1);
  if (kind) q = q.eq("kind", kind);
  const { data, count, error } = await q;
  if (error) {
    return <p className="text-sm text-ink-2">Chưa có nhật ký: chạy tay <code>073_system_logs.sql</code> (thư mục supabase/migrations) trong Supabase SQL Editor rồi tải lại trang.</p>;
  }
  const rows = (data ?? []) as Row[], pages = Math.max(1, Math.ceil((count ?? 0) / SIZE));
  const href = (p: number, k = kind) => `/kpi?tab=log${k ? `&kind=${k}` : ""}${p > 1 ? `&page=${p}` : ""}`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5" aria-label="Lọc theo thao tác">
        {[["", "Tất cả"], ...Object.entries(LOG_KINDS)].map(([k, label]) => (
          <Link key={k || "all"} href={href(1, k)} className={`rounded-md border px-2.5 py-1 text-xs font-medium ${k === kind ? "border-accent bg-accent/10 text-accent" : "border-line text-ink-2 hover:border-accent hover:text-accent"}`}>{label}</Link>
        ))}
      </div>
      {rows.length === 0 ? <p className="text-sm text-ink-2">Chưa có thao tác nào được ghi lại{kind ? " ở nhóm này" : ""}.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="py-2 pr-3 font-semibold">Thời gian</th><th className="py-2 pr-3 font-semibold">Thao tác</th><th className="py-2 pr-3 font-semibold">Người thực hiện</th>
              <th className="py-2 pr-3 font-semibold">Kết quả</th><th className="py-2 font-semibold">Nội dung</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line align-top last:border-0">
                  <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-ink-2">{when(r.at)}</td>
                  <td className="py-2 pr-3 font-medium">{LOG_KINDS[r.kind] ?? r.kind}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-ink-2">{r.source === "auto" ? "Tự động" : r.actor_name ?? "—"}</td>
                  <td className="py-2 pr-3"><span className={`rounded-md px-2 py-0.5 text-2xs font-semibold ${r.ok ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`}>{r.ok ? "Thành công" : "Lỗi"}</span></td>
                  <td className="max-w-[560px] py-2 text-ink-1">
                    <span className="break-words">{r.summary}</span>
                    {r.detail && Object.keys(r.detail).length > 0 && (
                      <details className="mt-1 text-xs text-ink-muted"><summary className="cursor-pointer">Chi tiết</summary>
                        <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-grid/60 p-2">{JSON.stringify(r.detail, null, 1)}</pre></details>)}
                  </td>
                </tr>))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <nav className="flex items-center justify-between text-xs text-ink-2" aria-label="Phân trang">
          <span>{((page - 1) * SIZE + 1).toLocaleString("vi-VN")}–{Math.min(page * SIZE, count ?? 0).toLocaleString("vi-VN")} / {(count ?? 0).toLocaleString("vi-VN")}</span>
          <span className="flex items-center gap-1">
            {page > 1 && <Link href={href(page - 1)} className="rounded-md border border-line px-3 py-1 hover:bg-grid">‹ Trước</Link>}
            <span className="px-2 tabular-nums">Trang <b className="text-ink-1">{page}</b> / {pages}</span>
            {page < pages && <Link href={href(page + 1)} className="rounded-md border border-line px-3 py-1 hover:bg-grid">Sau ›</Link>}
          </span>
        </nav>
      )}
    </div>
  );
}
