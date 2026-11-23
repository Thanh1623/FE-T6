"use client";

import { Children, useState } from "react";

// Cột Kanban chỉ hiện `step` thẻ đầu; bấm "Hiển thị thêm" mở rộng thêm `step` thẻ nữa (cột có hàng trăm thẻ vẫn gọn, trang nhẹ).
export default function ShowMore({ children, step = 20 }: { children: React.ReactNode; step?: number }) {
  const [shown, setShown] = useState(step);
  const cards = Children.toArray(children);
  const left = cards.length - shown;
  return (
    <>
      {cards.slice(0, shown)}
      {left > 0 && (
        <button type="button" onClick={() => setShown((n) => n + step)}
          className="rounded-lg border border-dashed border-line bg-surface px-2 py-2 text-xs font-medium text-ink-2 transition-colors hover:border-accent hover:text-accent">
          Hiển thị thêm {Math.min(step, left)} thẻ <span className="text-ink-muted">(còn {left})</span>
        </button>
      )}
    </>
  );
}
