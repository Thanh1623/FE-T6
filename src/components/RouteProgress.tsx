"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Thanh tiến trình trên cùng khi chuyển trang / đổi bộ lọc (như web Quản lý đặt hàng): chạy khi bấm liên kết nội bộ, chạy tới ~90% rồi đứng chờ,
// hoàn tất khi địa chỉ (đường dẫn + tham số) đã đổi. Không dùng thư viện ngoài. Các bộ lọc (router.push) gọi startRouteProgress() trước khi đổi địa chỉ.
export const startRouteProgress = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event("route-progress:start")); };
export default function RouteProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  const start = () => {
    stop();
    if (hide.current) { clearTimeout(hide.current); hide.current = null; }
    setVisible(true); setWidth(8);
    timer.current = setInterval(() => setWidth((w) => (w < 90 ? w + (90 - w) * 0.08 : w)), 200);
  };

  // Địa chỉ đã đổi = trang mới đã hiện → chạy nốt tới 100% rồi ẩn
  useEffect(() => {
    if (!timer.current) return;
    stop();
    setWidth(100);
    hide.current = setTimeout(() => { setVisible(false); setWidth(0); }, 250);
  }, [pathname, search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(href)) return;
      let url: URL;
      try { url = new URL(href, location.href); } catch { return; }
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;   // cùng địa chỉ: không có gì để chờ
      start();
    };
    const onPop = () => start();
    window.addEventListener("route-progress:start", onPop);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => { document.removeEventListener("click", onClick, true); window.removeEventListener("popstate", onPop); window.removeEventListener("route-progress:start", onPop); stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]" style={{ opacity: visible ? 1 : 0, transition: "opacity 200ms" }}>
      <div className="h-full bg-accent shadow-[0_0_8px_var(--accent)]" style={{ width: `${width}%`, transition: width === 100 ? "width 150ms ease-out" : "width 200ms linear" }} />
    </div>
  );
}
