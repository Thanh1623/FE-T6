"use client";

import { useState, useTransition } from "react";
import { syncNow } from "@/app/(dash)/actions";

export default function SyncButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex min-w-0 flex-1 items-center">
      <button
        title={pending ? "Đang đồng bộ…" : msg ?? "Đồng bộ dữ liệu ngay"} aria-label="Đồng bộ ngay"
        disabled={pending}
        onClick={() => start(async () => {
          setMsg(null);
          try {
            const r = await syncNow();
            const failed = r.filter((x) => !x.ok);
            const batch = r.find((x) => x.account === "Đồng bộ theo lô")?.message;
            setMsg(failed.length ? `Lỗi: ${failed.map((f) => f.account).join(", ")}${batch ? ` · ${batch}` : ""}` : batch ? `✓ ${batch}` : "Đã đồng bộ ✓");
          } catch (e) {
            setMsg(e instanceof Error ? e.message : "Lỗi đồng bộ");
          }
        })}
        className={`flex h-9 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-surface px-3 text-sm font-medium hover:bg-grid disabled:opacity-60 ${msg?.startsWith("Lỗi") ? "text-bad" : msg ? "text-good" : ""}`}
      >
        <span aria-hidden className={pending ? "inline-block animate-spin" : ""}>{pending ? "↻" : msg ? (msg.startsWith("Lỗi") ? "!" : "✓") : "↻"}</span>{pending ? "Đang chạy" : "Đồng bộ"}
      </button>
    </div>
  );
}
