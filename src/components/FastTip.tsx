"use client";

import { useEffect, useRef, useState } from "react";

// Chú thích nhanh dùng chung toàn hệ thống: thay hộp chú thích mặc định của trình duyệt (hiện chậm ~1 giây, kiểu cũ) cho các phần tử CHỈ CÓ BIỂU TƯỢNG có title.
// Khi rê chuột / focus bàn phím vào phần tử: lấy title ra khỏi phần tử (để trình duyệt không hiện hộp riêng), hiện hộp tối bo nhẹ sau 350ms,
// rời đi thì trả title lại. Không cần sửa từng nơi dùng title.
export default function FastTip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; above: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const cur = useRef<{ el: HTMLElement; title: string } | null>(null);
  const timer = useRef(0);

  useEffect(() => {
    const restore = () => {
      clearTimeout(timer.current);
      const c = cur.current;
      if (c && !c.el.getAttribute("title")) c.el.setAttribute("title", c.title);
      cur.current = null;
      setTip(null);
    };
    const show = (target: EventTarget | null) => {
      const el = (target as Element | null)?.closest?.("[title]") as HTMLElement | null;
      if (!el || el === cur.current?.el) return;
      // Chỉ phần tử CHỈ CÓ BIỂU TƯỢNG (không chữ / số) mới cần chú thích; nút đã có chữ thì giữ nguyên, không hiện gì thêm
      if (/[\p{L}\p{N}]/u.test(el.textContent ?? "")) return;
      const title = el.getAttribute("title")?.trim();
      if (!title) return;
      restore();
      el.removeAttribute("title");
      cur.current = { el, title };
      timer.current = window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        setTip({ text: title, x: r.left + r.width / 2, y: r.bottom + 8, above: false });
        // đo lại sau khi hộp có nội dung để căn giữa / lật lên trên nếu hết chỗ phía dưới
        requestAnimationFrame(() => {
          const b = box.current?.getBoundingClientRect();
          if (!b) return;
          const half = b.width / 2;
          const x = Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8);
          const above = r.bottom + 8 + b.height > window.innerHeight - 8;
          setTip({ text: title, x, y: above ? r.top - 8 : r.bottom + 8, above });
        });
      }, 350);
    };
    const over = (e: MouseEvent) => show(e.target);
    const out = (e: MouseEvent) => { const c = cur.current; if (c && !c.el.contains(e.relatedTarget as Node | null)) restore(); };
    const focus = (e: FocusEvent) => show(e.target);
    document.addEventListener("mouseover", over);
    document.addEventListener("mouseout", out);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", restore);
    document.addEventListener("mousedown", restore);
    document.addEventListener("scroll", restore, true);
    return () => {
      restore();
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mouseout", out);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", restore);
      document.removeEventListener("mousedown", restore);
      document.removeEventListener("scroll", restore, true);
    };
  }, []);

  if (!tip) return null;
  return (
    <div ref={box} role="tooltip"
      style={{ left: 0, top: tip.y, transform: `translate(${tip.x}px, ${tip.above ? "-100%" : "0"}) translateX(-50%)` }}
      className="fast-tip pointer-events-none fixed z-[200] w-max max-w-[min(20rem,calc(100vw-16px))] rounded-md bg-ink-1 px-2.5 py-1.5 text-xs font-medium leading-snug text-surface shadow-lg ring-1 ring-black/10">
      {tip.text}
    </div>
  );
}
