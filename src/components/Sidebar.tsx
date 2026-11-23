"use client";

import HoverLink from "@/components/HoverLink";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useState, type ReactNode } from "react";
import { SIDEBAR_KEY } from "@/lib/theme";

// Thu gọn / mở rộng sidebar (màn hình lớn); nhớ trong trình duyệt
function toggleMini() {
  const html = document.documentElement;
  const mini = html.getAttribute("data-sidebar") !== "mini";
  if (mini) html.setAttribute("data-sidebar", "mini"); else html.removeAttribute("data-sidebar");
  try { localStorage.setItem(SIDEBAR_KEY, mini ? "mini" : "full"); } catch { /* chế độ riêng tư */ }
}

import type { Role } from "@/lib/roles";

type Item = { href: string; label: string; icon: IconKey; roles?: Role[]; lead?: boolean; badge?: string; keepRange?: boolean; base?: string };   // base: tiền tố đường dẫn để tô sáng

// Biểu tượng nét mảnh hiện đại (đường vẽ kiểu Lucide, tô theo màu chữ) — thay cho emoji để đồng bộ và theo được chế độ sáng / tối
const ICONS = {
  dashboard: <><rect width="7" height="9" x="3" y="3" rx="1.5" /><rect width="7" height="5" x="14" y="3" rx="1.5" /><rect width="7" height="9" x="14" y="12" rx="1.5" /><rect width="7" height="5" x="3" y="16" rx="1.5" /></>,
  gem: <><path d="M8.6 15.6C7.1 14.4 6 12.6 6 10.5a6 6 0 0 1 12 0c0 2.1-1.1 3.9-2.6 5.1-.6.5-.9 1.1-.9 1.9h-5c0-.8-.3-1.4-.9-1.9Z" /><path d="M10 20.5h4" /><path d="M10.5 22.5h3" /><circle cx="12" cy="10.5" r="1.7" /><path d="M12 6.9v1.2M12 12.9v1.2M8.4 10.5h1.2M14.4 10.5h1.2M9.5 8l.9.9M13.6 12.1l.9.9M14.5 8l-.9.9M10.4 12.1l-.9.9" /><path d="M12 1v1.6M4.3 4.3l1.1 1.1M19.7 4.3l-1.1 1.1M1.5 10.5H3M21 10.5h1.5" /></>,   // bóng đèn ý tưởng + bánh răng = nghiên cứu & phát triển
  library: <><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></>,   // khung ảnh = thư viện ảnh / mẫu
  send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
  tag: <><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r=".6" fill="currentColor" /></>,
  tasks: <><path d="m9 11 3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  trend: <><path d="m22 7-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></>,
  post: <><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" /></>,
  target: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>,
  team: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  user: <><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
  settings: <><line x1="21" x2="14" y1="4" y2="4" /><line x1="10" x2="3" y1="4" y2="4" /><line x1="21" x2="12" y1="12" y2="12" /><line x1="8" x2="3" y1="12" y2="12" /><line x1="21" x2="16" y1="20" y2="20" /><line x1="12" x2="3" y1="20" y2="20" /><line x1="14" x2="14" y1="2" y2="6" /><line x1="8" x2="8" y1="10" y2="14" /><line x1="16" x2="16" y1="18" y2="22" /></>,
  layers: <><path d="m12 2 10 5-10 5L2 7Z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></>,
} satisfies Record<string, ReactNode>;
type IconKey = keyof typeof ICONS;
const Icon = ({ name, size = 18 }: { name: IconKey; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="flex-none">{ICONS[name]}</svg>
);

// Thiết kế 3D / Media chỉ cần phần việc R&D; các báo cáo hiệu quả dành cho văn phòng
const OFFICE: Role[] = ["admin", "rnd"];
// Media xem để lấy source: thư viện SP mới, đẩy mẫu, thống kê traffic (không có giá vốn / duyệt)
const WITH_MEDIA: Role[] = ["admin", "rnd", "media"];

// Menu chia nhóm; mục ẩn theo vai trò. keepRange: giữ khoảng ngày (range/from/to) khi chuyển giữa các trang báo cáo.
// badge: khoá số đếm (tải sau, không chặn trang)
const GROUPS: { title: string; items: Item[] }[] = [
  { title: "R&D", items: [
    { href: "/rnd/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/rnd", label: "R&D", icon: "gem", roles: OFFICE },
    { href: "/rnd/media", label: "R&D", icon: "gem", roles: ["media"], base: "/rnd" },   // Media chỉ xem các bảng P3–P6   // các bảng, Kanban, Thống kê, Cấu hình nằm ở thanh bảng bên trong
    { href: "/rnd-library", label: "Thư viện SP mới", icon: "library", keepRange: true, roles: WITH_MEDIA },
    { href: "/sample-push", label: "Đẩy mẫu ĐVKD", icon: "send", badge: "saobien", roles: WITH_MEDIA },
    { href: "/rnd/test-codes", label: "Mã SPU test", icon: "tag", roles: ["admin", "rnd", "media"] },   // cấp mã test không trùng (luồng Media)
    { href: "/tasks", label: "Việc của tôi", icon: "tasks", badge: "tasks" },
  ] },
  { title: "Thống kê", items: [
    { href: "/spu", label: "Theo dõi đẩy hàng", icon: "trend", roles: WITH_MEDIA },   // thay trang Traffic cũ: tồn kho × video × lượt xem × lượng bán theo SPU
    { href: "/posts", label: "Bài đăng", icon: "post", keepRange: true },   // MỌI vai trò xem được, và xem được bài của TẤT CẢ Page (không giới hạn theo team); trang Theo dõi SPU dẫn sang đây
  ] },
  { title: "Quản lý", items: [
    { href: "/qlhn", label: "QLHH", icon: "dashboard", roles: ["admin"], lead: true },   // báo cáo theo team: đơn hàng, giao hàng, thiếu hàng (Quản lý xem mọi team; Trưởng nhóm xem team của mình; giá vốn chỉ Quản lý)
    { href: "/team", label: "Team của tôi", icon: "team", roles: ["admin", "rnd"] },
    { href: "/users", label: "Người dùng", icon: "user", roles: ["admin"] },
  ] },
  { title: "Hệ thống", items: [
    { href: "/kpi", label: "Cài đặt", icon: "settings", roles: ["admin", "rnd"] },   // mục tiêu / KPI + ảnh sản phẩm — luôn ở cuối menu
  ] },
];

// Số việc đang chờ: layout truyền Promise → sidebar hiện ngay, số đếm hiện sau khi truy vấn xong
function Badge({ badges, k, active }: { badges: Promise<Record<string, number>>; k: string; active: boolean }) {
  const n = use(badges)[k];
  if (!n) return null;
  return (
    <>
      <span className={`mini-hide tabular rounded-md px-1.5 py-px text-2xs font-semibold ${active ? "bg-accent/20 text-accent" : "bg-warn-bg text-warn-ink"}`}
        title="Đang chờ xử lý">{n}</span>
      <span className="mini-only absolute right-1.5 top-1 h-2 w-2 rounded-full bg-[var(--res-testing)]" />
    </>
  );
}

export default function Sidebar({ role, teamLead = false, badges, footer }: {
  role: Role; teamLead?: boolean; badges: Promise<Record<string, number>>; footer: React.ReactNode;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  // Đóng ngăn kéo khi đổi trang (điện thoại)
  useEffect(() => { setOpen(false); }, [pathname]); // eslint-disable-line react-hooks/set-state-in-effect -- đồng bộ với điều hướng

  const keep = new URLSearchParams();
  for (const k of ["range", "from", "to", "team"]) { const v = sp.get(k); if (v) keep.set(k, v); }
  const qs = keep.size ? `?${keep}` : "";
  // Mục khớp dài nhất (vd /rnd/stats thắng /rnd)
  const matches = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const current = GROUPS.flatMap((g) => g.items).filter((i) => matches(i.base ?? i.href))
    .sort((x, y) => (y.base ?? y.href).length - (x.base ?? x.href).length)[0];
  const isActive = (href: string) => current?.href === href;

  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {GROUPS.map((g) => {
        const items = g.items.filter((i) => !i.roles || i.roles.includes(role) || (i.lead && teamLead))
          .map((i) => (i.href === "/team" && role === "admin" ? { ...i, label: "Quản lý team" } : i));   // Quản lý thấy cả các team, không chỉ "của tôi"
        if (!items.length) return null;
        return (
          <div key={g.title}>
            <div className="mini-hide mb-1.5 px-3 text-2xs font-bold uppercase tracking-[0.1em] text-[var(--side-title)]">{g.title}</div>
            <div className="mini-only mx-3 mb-1 border-t border-[var(--side-line)]" />
            <ul className="space-y-0.5">
              {items.map((i) => {
                const active = isActive(i.href);
                return (
                  <li key={i.href}>
                    <HoverLink href={i.keepRange ? `${i.href}${qs}` : i.href} aria-current={active ? "page" : undefined} title={i.label}
                      className={`mini-center group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all ${
                        active ? "bg-[var(--side-active)] font-semibold text-accent " : "text-ink-2 hover:bg-[var(--side-hover)] hover:text-ink-1"}`}>
                      {active && <span aria-hidden className="absolute -left-3 bottom-2.5 top-2.5 w-1 rounded-r-full bg-accent" />}
                      <span aria-hidden className={`flex w-5 flex-none items-center justify-center ${active ? "" : "text-ink-muted group-hover:text-ink-1"}`}><Icon name={i.icon} /></span>
                      <span className="mini-hide flex-1 truncate">{i.label}</span>
                      {i.badge && <Suspense><Badge badges={badges} k={i.badge} active={active} /></Suspense>}
                    </HoverLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  const brand = (
    <HoverLink href="/" className="mini-center flex items-center gap-3 px-4 py-3.5 font-semibold">
      <span aria-hidden className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-[#4f9bf0] to-[#2a78d6] text-white shadow-[0_2px_6px_rgba(42,120,214,.4)]"><Icon name="layers" size={19} /></span>
      <span className="mini-hide leading-tight"><span className="text-base font-bold tracking-tight">R&amp;D</span><span className="block text-xs font-normal text-ink-muted">Nghiên cứu và phát triển sản phẩm</span></span>
    </HoverLink>
  );

  return (
    <>
      {/* Thanh trên — chỉ trên màn hình nhỏ */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5 lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Mở menu" className="rounded-md px-2 py-1 text-lg hover:bg-grid">☰</button>
        <span className="flex items-center gap-2 font-semibold"><Icon name={current?.icon ?? "layers"} size={18} />{current ? (current.href === "/team" && role === "admin" ? "Quản lý team" : current.label) : "R&D"}</span>
      </div>

      {/* Lớp mờ phía sau ngăn kéo */}
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <aside className={`dash-side fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-[var(--side-line)] [background:var(--side-bg)] transition-[transform,width] lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between border-b border-[var(--side-line)]">
          {brand}
          <button onClick={() => setOpen(false)} aria-label="Đóng menu" className="mr-3 rounded-md px-2 py-1 hover:bg-grid lg:hidden">✕</button>
        </div>
        {nav}
        <div className="mini-hide space-y-2 border-t border-[var(--side-line)] px-4 py-2.5 text-sm">{footer}</div>
        <button onClick={toggleMini} title="Thu gọn / mở rộng menu"
          className="hidden items-center gap-2 border-t border-[var(--side-line)] px-5 py-1.5 text-xs text-ink-muted hover:bg-[var(--side-hover)] hover:text-ink-1 lg:flex mini-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mini-hide"><path d="m11 17-5-5 5-5" /><path d="m18 17-5-5 5-5" /></svg><span className="mini-hide">Thu gọn menu</span><span className="mini-only text-base">»</span>
        </button>
      </aside>
    </>
  );
}
