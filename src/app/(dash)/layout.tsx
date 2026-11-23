import Link from "next/link";
import { Suspense } from "react";
import { roleLabel, requireUser } from "@/lib/session";
import Sidebar from "@/components/Sidebar";
import RouteProgress from "@/components/RouteProgress";
import SyncButton from "@/components/SyncButton";
import ThemeToggle from "@/components/ThemeToggle";
import { logout } from "@/app/login/actions";
import { sb } from "@/lib/supabase/admin";
import { fmtDate, fmtDateTime, getAccounts, getLatestSyncLogs } from "@/lib/data";
import { TOKEN_LABELS, tokenStatuses, type TokenSource } from "@/lib/meta/token";
import { getTeams, myQueueCount } from "@/lib/pipeline";
import FastTip from "@/components/FastTip";
import { loadApiStale } from "@/lib/api-stale";

// Nút "Đồng bộ ngay" (server action syncNow) chạy theo giới hạn thời gian của TRANG đang mở: mặc định quá ngắn so với một lần đồng bộ → máy chủ cắt giữa chừng và trình duyệt báo "An unexpected response was received from the server". Cùng mức với các cron đồng bộ.
export const maxDuration = 300;

export default async function DashLayout({ children }: LayoutProps<"/">) {
  // Người dùng + nhật ký đồng bộ + danh sách kênh + token tải SONG SONG (trước đây chờ người dùng xong mới tải các phần còn lại)
  const [user, logs, accounts, tokens, allTeams, apiStale] = await Promise.all([requireUser(), getLatestSyncLogs(), getAccounts(), tokenStatuses(), getTeams(), loadApiStale().catch(() => null)]);
  const isStaff = user.role === "admin" || user.role === "rnd";
  // Số việc chờ (sidebar) tải song song, KHÔNG chặn trang — sidebar nhận Promise và hiện số khi có
  const badges = Promise.all([
    myQueueCount(user),
    // Việc giao chờ tiếp nhận: người thuộc team nhận thấy số của team mình, Quản lý thấy tất cả (chưa chạy migration 033 → đếm chung như cũ)
    (async () => {
      const base = () => sb.rnd().from("handoffs").select("*", { count: "exact", head: true }).eq("status", "pending");
      if (user.role === "admin" || !user.team_id) return base();
      const r = await base().eq("team_id", user.team_id);
      return r.error ? base() : r;
    })(),
  ]).then(([tasks, { count }]) => ({ tasks, saobien: count ?? 0 }), () => ({}));

  const myTeam = user.team_id ? allTeams.find((t) => t.id === user.team_id)?.name ?? null : null;
  const syncLogs = logs.filter((l) => l.job === "channel" || l.job === "sales");
  const errors = logs.filter((l) => l.status === "error");
  const last = syncLogs.map((l) => l.finished_at).filter(Boolean).sort().at(-1);
  const jobNames: Record<string, string> = {
    sales: "Số bán (Qlydonhang)",
    catalog: "Danh mục sản phẩm",
    retag: "Tách hashtag",
    old_posts: "Làm mới bài cũ gắn mã",
    evaluate: "Đánh giá tự động",
    setup: "Danh sách Trang",
    videos_api: "Video từ API",
  };
  const nameOf = (id: string | null, job?: string) =>
    id?.startsWith("token:") ? `Danh sách Trang (${TOKEN_LABELS[id.slice(6) as TokenSource]})`
    : id ? accounts.find((a) => a.id === id)?.name ?? id
    : (job && jobNames[job]) ?? "Hệ thống";
  // Cảnh báo token: lỗi / sắp hết hạn / thiếu quyền. Token cá nhân sắp hết hạn chỉ đáng lo khi chưa có Người dùng hệ thống.
  const hasSystem = tokens.some((t) => t.source === "system" && t.valid);
  const tokenWarnings = tokens.flatMap((t) => {
    const label = TOKEN_LABELS[t.source];
    if (!t.valid) return [`${label} đã hết hạn hoặc bị thu hồi${t.error ? ` (${t.error})` : ""}.`];
    const w: string[] = [];
    if (t.daysLeft !== null && t.daysLeft <= 14 && !(t.source === "user" && hasSystem))
      w.push(`${label} hết hạn sau ${t.daysLeft} ngày (${fmtDate(t.expiresAt!)}).`);
    if (t.missing.length) w.push(`${label} thiếu quyền: ${t.missing.join(", ")}.`);
    return w;
  });

  const footer = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-none items-center gap-1.5 whitespace-nowrap text-xs text-ink-muted" title="Thời điểm đồng bộ dữ liệu gần nhất"><span aria-hidden className={`h-1.5 w-1.5 rounded-full ${last ? "bg-good" : "bg-ink-muted"}`} />{last ? fmtDateTime(last) : "Chưa đồng bộ"}</div>
        {isStaff && <SyncButton />}
      </div>
      <ThemeToggle />
      <div className="flex items-center justify-between gap-2 text-sm">
        <Link href="/account" className="flex min-w-0 items-center gap-2.5 hover:text-ink-1" title="Tài khoản · đổi mật khẩu">
          <span aria-hidden className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
            {user.full_name.trim().split(/\s+/).slice(-2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium leading-tight">{user.full_name}</span>
            <span className="block truncate text-2xs text-ink-muted">{roleLabel(user.role, myTeam)}</span>
          </span>
        </Link>
        <form action={logout}>
          <button title="Đăng xuất" aria-label="Đăng xuất" className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-grid hover:text-bad">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
          </button>
        </form>
      </div>
    </>
  );

  return (
    <div className="min-h-screen">
      <Suspense><RouteProgress /></Suspense>
      <FastTip />
      <Suspense>
        <Sidebar role={user.role} teamLead={user.is_team_lead && !!user.team_id} badges={badges} footer={footer} />
      </Suspense>

      <main className="dash-main transition-[padding]">
        <div className="w-full px-4 pb-1 pt-4 lg:px-6">
          {isStaff && tokenWarnings.length > 0 && (
            <div className="mb-4 rounded-lg bg-warn-bg px-4 py-3 text-sm text-warn-ink">
              {tokenWarnings.map((w) => <div key={w}>⚠️ {w}</div>)}
              <div className="mt-1">
                Các kênh đã thêm vẫn đồng bộ bình thường (Page Token không hết hạn), nhưng app sẽ không tự phát hiện kênh mới.{" "}
                {user.role === "admin" && <Link href="/team?tab=connect" className="font-medium underline">Xem Kết nối nguồn →</Link>}
              </div>
            </div>
          )}

          {isStaff && apiStale && (
            <details className="mb-2 rounded-md bg-warn-bg px-3 py-1.5 text-xs text-warn-ink">
              <summary className="cursor-pointer">
                ⚠️ {apiStale.channels.length} kênh Facebook có trong API video nhưng API đã đứng yên hơn {apiStale.days} ngày — dữ liệu các kênh này không được cập nhật (bấm để xem)
              </summary>
              <ul className="mt-1 list-disc pl-5">
                {apiStale.channels.map((c) => (
                  <li key={c.id}>{c.name}: API cập nhật lần cuối {c.days} ngày trước{c.direct ? " · vẫn đồng bộ trực tiếp qua Meta" : " · chưa có đồng bộ trực tiếp nên số liệu đang đứng yên"}</li>
                ))}
              </ul>
              <div className="mt-1 text-ink-muted">
                Chỉ tính kênh còn đăng bài trong {apiStale.activeDays} ngày gần đây{apiStale.quiet ? ` (đã bỏ qua ${apiStale.quiet} kênh đứng yên nhưng lâu không đăng bài, coi như đã ngừng)` : ""}. Cần người vận hành API kiểm tra việc quét các kênh trên; kênh đã ngừng hẳn thì tắt ở trang Team.
              </div>
            </details>
          )}

          {isStaff && errors.length > 0 && (
            <details className="mb-2 rounded-md border border-bad/40 px-3 py-1.5 text-xs">
              <summary className="cursor-pointer text-bad">⛔ Lần đồng bộ gần nhất có {errors.length} lỗi — bấm để xem</summary>
              <ul className="mt-1 list-disc pl-5 text-ink-2">
                {errors.map((e) => (
                  <li key={`${e.job}${e.channel_id}`}>{nameOf(e.channel_id, e.job)}: {e.message}</li>
                ))}
              </ul>
            </details>
          )}

          {children}
        </div>
      </main>
    </div>
  );
}
