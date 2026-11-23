import Link from "next/link";
import { todayVN } from "@/lib/data";

// Banner đầu trang Dashboard (thay cho thanh bảng R&D — các bảng mở từ nút bên phải / menu "R&D")
export default function DashboardHero({ name }: { name: string }) {
  const [y, m, d] = todayVN().split("-");
  return (
    <section className="relative overflow-hidden rounded-xl px-5 py-4 text-white"
      style={{ background: "linear-gradient(120deg, var(--accent) 0%, var(--series-5) 100%)" }}>
      {/* Hoạ tiết trang trí */}
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 right-32 h-40 w-40 rounded-full bg-white/10" />
      <div className="relative flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-white/80">Xin chào, {name} · {d}/{m}/{y}</div>
          <h1 className="mt-0.5 text-lg font-semibold text-white">📊 Dashboard R&amp;D</h1>
          <p className="mt-0.5 text-xs text-white/85">P0 Sưu tầm → P1 Duyệt → P2 Sản xuất mẫu → P3 Hoàn thành mẫu → P4 Đăng video → P5 Win → P6 Thương mại hoá</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/rnd" prefetch={false} className="rounded-lg bg-white px-3 py-1.5 font-medium text-accent shadow-sm hover:bg-white/90">Mở bảng R&amp;D →</Link>
          <Link href="/tasks" prefetch={false} className="rounded-lg border border-white/60 px-3 py-1.5 font-medium text-white hover:bg-white/15">Việc của tôi</Link>
        </div>
      </div>
    </section>
  );
}
