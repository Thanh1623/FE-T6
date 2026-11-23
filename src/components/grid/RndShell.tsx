"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { wsKeyOf } from "@/lib/rnd-workspace-types";

// Khung trang R&D. Chỉ 7 trang BẢNG mới bỏ lề dưới (-mb-10) để bảng kéo sát đáy màn hình;
// Dashboard / Thống kê / Kanban / Cấu hình / chi tiết mẫu giữ lề dưới, nếu không phần cuối trang bị cắt.
// Trang bảng cao đúng bằng màn hình (bảng tự đo chỗ còn lại) → ẩn thanh cuộn NGOÀI CÙNG, chỉ bảng cuộn bên trong.
// Cờ gắn ở đây (khung này KHÔNG bị dựng lại khi chuyển P0 ↔ P1…) nên không còn thanh cuộn chớp lúc chuyển tab.
export default function RndShell({ children }: { children: React.ReactNode }) {
  const table = !!wsKeyOf(usePathname());
  useEffect(() => {
    const root = document.documentElement;
    if (table) root.setAttribute("data-fit", "");
    else root.removeAttribute("data-fit");
  }, [table]);
  useEffect(() => () => document.documentElement.removeAttribute("data-fit"), []);
  return <div className={`space-y-2 ${table ? "-mb-10" : ""}`}>{children}</div>;
}
