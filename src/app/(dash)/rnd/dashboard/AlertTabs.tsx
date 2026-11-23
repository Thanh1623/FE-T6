"use client";

import { useState } from "react";

// Cảnh báo tiềm năng gom trong MỘT khung: thanh tab (kèm số lượng) + danh sách của tab đang chọn.
// Nội dung từng tab do máy chủ dựng sẵn; ở đây chỉ chuyển tab.
export type AlertTab = { key: string; label: string; count: number; hint: string; content: React.ReactNode };

export default function AlertTabs({ tabs }: { tabs: AlertTab[] }) {
  const [cur, setCur] = useState(tabs[0]?.key);
  const tab = tabs.find((t) => t.key === cur) ?? tabs[0];
  return (
    <div className="rounded-lg border border-line bg-surface">
      <div role="tablist" className="flex gap-0.5 overflow-x-auto border-b border-line px-2 pt-2">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === tab.key} onClick={() => setCur(t.key)} title={t.hint}
            className={`flex flex-none items-center gap-1.5 whitespace-nowrap rounded-t-md border-b-2 px-2.5 py-1.5 text-xs font-semibold ${t.key === tab.key ? "border-accent bg-accent/10 text-accent" : "border-transparent text-ink-2 hover:bg-grid"}`}>
            {t.label}
            <span className={`rounded-md px-1.5 text-2xs font-bold tabular-nums ${t.key === tab.key ? "bg-accent text-white" : "bg-grid text-ink-2"}`}>{t.count}</span>
          </button>
        ))}
      </div>
      <div className="p-2.5">{tab.content}</div>
    </div>
  );
}
