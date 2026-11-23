"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Ngăn trượt bên phải: bấm nền tối / nút ✕ / phím Esc → đóng (về đường dẫn không có ?spu=). Nội dung do máy chủ dựng.
export default function DrawerShell({ closeHref, title, children }: { closeHref: string; title: string; children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") router.push(closeHref, { scroll: false }); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [closeHref, router]);
  const close = () => router.push(closeHref, { scroll: false });
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Đóng" onClick={close} className="absolute inset-0 cursor-default bg-black/40" />
      <aside className="relative flex h-full w-full max-w-[540px] flex-col bg-surface shadow-2xl">
        <button type="button" onClick={close} aria-label="Đóng" className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-md text-ink-2 hover:bg-grid">✕</button>
        {children}
      </aside>
    </div>
  );
}
