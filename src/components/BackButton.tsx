"use client";

import { useRouter } from "next/navigation";

// Nút quay lại trang trước (đúng bảng / bộ lọc người dùng vừa rời); không có lịch sử (mở thẳng từ link) thì về `fallback`
export default function BackButton({ fallback, label = "Quay lại", iconOnly = false }: { fallback: string; label?: string; iconOnly?: boolean }) {
  const router = useRouter();
  return (
    <button type="button" onClick={() => { if (window.history.length > 1) router.back(); else router.push(fallback); }}
      title={label} aria-label={label}
      className={`group inline-flex flex-none items-center gap-1.5 rounded-md border border-line bg-surface py-1 text-xs ${iconOnly ? "px-1" : "pl-1.5 pr-3"} font-medium text-ink-2 shadow-sm transition hover:border-accent hover:text-accent`}>
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-grid text-sm leading-none transition group-hover:bg-accent group-hover:text-white" aria-hidden>‹</span>
      {!iconOnly && label}
    </button>
  );
}
