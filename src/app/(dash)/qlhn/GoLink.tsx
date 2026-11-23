"use client";

import type { ReactNode } from "react";

// Liên kết nội bộ: mở tab "Bảng chi tiết" rồi cuộn tới bảng `to` (Tabs lắng nghe sự kiện này); `to="dashboard"` quay về tab Dashboard.
// `filter`: chọn sẵn nút lọc của bảng đó (vd bấm ô "SPU win" thì bảng SPU win và SP test mở ở nhóm Win).
export default function GoLink({ to, className, children, title, filter }: { to: string; className?: string; children: ReactNode; title?: string; filter?: string }) {
  return (
    <a href={`#${to}`} className={className} title={title} onClick={(e) => {
      e.preventDefault();
      if (filter) window.dispatchEvent(new CustomEvent("qlhn-filter", { detail: { id: to, f: filter } }));
      window.dispatchEvent(new CustomEvent("qlhn-go", { detail: to }));
    }}>{children}</a>
  );
}
