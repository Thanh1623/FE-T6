"use client";

import HoverLink from "@/components/HoverLink";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRndStore } from "./rnd-store";
import { wsKeyOf } from "@/lib/rnd-workspace-types";

// Thanh bảng của R&D (giống danh sách bảng trong Lark Base). Bảng nghiệp vụ theo thứ tự luồng, sau đó là các trang tổng hợp.
const TABLES: { href: string; label: string; p: string; also?: string[] }[] = [
  { href: "/rnd", label: "Sưu tầm", p: "P0" },
  { href: "/rnd/approved", label: "Đã duyệt", p: "P1" },
  { href: "/rnd/design-3d", label: "Sản xuất mẫu", p: "P2", also: ["/rnd/orders"] },   // gộp Thiết kế 3D + Theo dõi đặt hàng
  { href: "/rnd/media", label: "Hoàn thành mẫu", p: "P3" },
  { href: "/rnd/traffic", label: "Đăng video", p: "P4" },
  { href: "/rnd/win", label: "Win", p: "P5" },
  { href: "/rnd/commercial", label: "Thương mại hoá", p: "P6" },
];
// Màu nhãn từng bước P0–P6: cùng bộ màu với thẻ P ở Dashboard R&D (series dùng chung, có bản tối)
const P_COLOR: Record<string, string> = { P0: "--series-1", P1: "--series-7", P2: "--series-5", P3: "--series-2", P4: "--series-4", P5: "--series-3", P6: "--series-6" };
const VIEWS = [
  { href: "/rnd/kanban", label: "Kanban" },
  { href: "/rnd/stats", label: "Thống kê" },
  { href: "/rnd/settings", label: "Cấu hình" },
];

export default function RndTabs({ counts: serverCounts, role }: { counts: Record<string, number>; role?: string }) {
  const path = usePathname();
  const store = useRndStore();
  const counts = store?.counts ?? serverCounts;   // kho làm mới ở nền → số luôn mới
  // Đang ở 1 bảng R&D và bấm sang bảng R&D khác: chỉ đổi URL (không gọi máy chủ) — không gian R&D hiện bảng có sẵn
  // Chỉ hiện ở các bảng R&D (P0–P6) và các trang tổng hợp có trong thanh (Kanban, Thống kê, Mã SPU test, Cấu hình).
  // Trang khác (Dashboard, danh sách theo mốc, trang chi tiết mẫu, tạo mẫu…) không cần thanh này.
  const onBar = [...TABLES.flatMap((t) => [t.href, ...(t.also ?? [])]), ...VIEWS.map((v) => v.href)]
    .some((h) => (h === "/rnd" ? path === "/rnd" : path === h || path.startsWith(`${h}/`)));
  if (!onBar) return null;
  const instant = (href: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;   // mở tab mới: để trình duyệt xử lý
    if (!wsKeyOf(path) || !wsKeyOf(href) || !store?.tables[wsKeyOf(href)!]) return;
    e.preventDefault();
    if (href !== path) window.history.pushState(null, "", href);
  };
  const active = (href: string, also: string[] = []) => (href === "/rnd" ? path === "/rnd" : [href, ...also].some((h) => path === h || path.startsWith(`${h}/`)));
  const countOf = (t: { href: string; also?: string[] }) => [t.href, ...(t.also ?? [])].reduce((n, h) => n + (counts[h] ?? 0), 0);
  // Phương án 3: thanh bảng dạng NÚT PHÂN ĐOẠN (khối xám, mục đang chọn nổi trắng) — khác hẳn chip trạng thái của bảng bên dưới
  const cls = (on: boolean) =>
    `flex min-w-0 items-center justify-start gap-1 whitespace-nowrap rounded-md px-2 py-1.5 text-sm transition ${on ? "bg-surface font-semibold text-ink-1 shadow-sm" : "text-ink-2 hover:bg-surface/60 hover:text-ink-1"}`;
  const viewCls = (on: boolean) => `whitespace-nowrap rounded-md px-2 py-1.5 text-sm ${on ? "bg-accent/10 font-semibold text-accent" : "text-ink-2 hover:bg-grid hover:text-ink-1"}`;
  // Media: Sưu tầm (P0, thêm mẫu được) + từ Hoàn thành mẫu (P3) trở đi
  const media = role === "media";
  const tables = media ? TABLES.filter((t) => ["/rnd", "/rnd/media", "/rnd/traffic", "/rnd/win", "/rnd/commercial"].includes(t.href)) : TABLES;
  const views = media ? [] : VIEWS;   // Media: không có trang tổng hợp nào trên thanh (Mã SPU test mở ở menu bên trái)
  return (
    <nav className="-mx-4 no-scrollbar flex items-center gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      {/* Các tab RỘNG BẰNG NHAU: lưới n cột 1fr, chiếm hết chỗ còn lại cạnh Kanban/Thống kê/Cấu hình; tên dài quá thì cắt "…" (đủ tên ở chú thích) */}
      <div className="grid min-w-[44rem] flex-1 gap-0.5 rounded-md border border-line bg-grid p-1" style={{ gridTemplateColumns: `repeat(${tables.length}, minmax(0, 1fr))` }}>
        {tables.map((t) => {
          const on = active(t.href, t.also), n = countOf(t);
          return (
            // prefetch tắt: bảng đã có sẵn trong kho của không gian R&D — tải trước sẽ bắt máy chủ dựng lại cả bảng vô ích
            <Link key={t.href} href={t.href} prefetch={false} onClick={instant(t.href)} className={cls(on)} aria-current={on ? "page" : undefined}>
              <span className="flex h-5 min-w-6 flex-none items-center justify-center rounded-md px-1 text-2xs font-bold text-white" style={{ background: `var(${P_COLOR[t.p] ?? "--accent"})`, opacity: on ? 1 : 0.8 }}>{t.p}</span>
              <span className="min-w-0 truncate">{t.label}</span>
              {n ? <span className={`tabular flex-none text-xs ${on ? "text-accent" : "text-ink-muted"}`}>{n}</span> : null}
            </Link>
          );
        })}
      </div>
      {views.length > 0 && <span className="ml-auto flex flex-none items-center gap-0.5">{views.map((t) => <HoverLink key={t.href} href={t.href} className={viewCls(active(t.href))}>{t.label}</HoverLink>)}</span>}
    </nav>
  );
}
