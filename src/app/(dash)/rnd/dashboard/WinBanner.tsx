import { WIN_NAME, WIN_VAR } from "@/lib/eval/rules";
import Link from "next/link";
import type { WinNotice } from "@/lib/rnd-dashboard";

// Banner thông báo mẫu Win: mẫu được duyệt WIN / WIN TRAFFIC gần đây + số mẫu hệ thống đề xuất Win đang chờ duyệt
const fmtDay = (iso: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" }).format(new Date(iso));

export default function WinBanner({ wins, pending, days }: { wins: WinNotice[]; pending: number; days: number }) {
  if (!wins.length && !pending) return null;
  return (
    <section className="rounded-lg border border-[color-mix(in_srgb,var(--res-win)_45%,transparent)] bg-[color-mix(in_srgb,var(--res-win)_8%,var(--surface))] p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="font-semibold">🏆 {wins.length ? `${wins.length} mẫu Win trong ${days} ngày qua` : "Chưa có mẫu Win mới"}</h2>
        {pending > 0 && (
          <Link href="/rnd/win" className="rounded-md bg-[var(--res-win)] px-2.5 py-0.5 text-xs font-medium text-white hover:opacity-90">
            {pending} mẫu hệ thống đề xuất Win đang chờ duyệt →
          </Link>
        )}
        <Link href="/rnd/commercial" className="ml-auto text-xs text-accent hover:underline">Thương mại hoá →</Link>
      </div>
      {wins.length > 0 && (
        <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {wins.map((w) => (
            <li key={w.id} className="flex-none">
              <Link href={`/rnd/${w.id}`} title={`${w.name} — duyệt ${fmtDay(w.decided_at)}${w.by ? ` bởi ${w.by}` : ""}`}
                className="flex w-64 items-center gap-2 rounded-lg border border-line bg-surface p-1.5 hover:border-accent">
                {w.image
                  // eslint-disable-next-line @next/next/no-img-element -- URL ký tạm thời của Storage
                  ? <img src={w.image} alt="" className="h-11 w-11 flex-none rounded-md object-cover" />
                  : <span className="flex h-11 w-11 flex-none items-center justify-center rounded-md bg-grid text-xl">💍</span>}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-2xs">
                    <span className="rounded-md px-1.5 py-px font-semibold text-white" style={{ background: `var(${WIN_VAR[w.result]})` }}>
                      {WIN_NAME[w.result]}
                    </span>
                    <span className="truncate text-ink-muted">{w.st_code}{w.code ? ` · #${w.code}` : ""}</span>
                  </span>
                  <span className="block truncate text-xs font-medium">{w.name}</span>
                  <span className="block truncate text-2xs text-ink-muted">{fmtDay(w.decided_at)}{w.by ? ` · ${w.by}` : ""}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
