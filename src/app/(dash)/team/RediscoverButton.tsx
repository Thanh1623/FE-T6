"use client";

import { useState, useTransition } from "react";
import { rediscoverChannels } from "./meta-actions";

export default function RediscoverButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button disabled={pending}
        onClick={() => start(async () => {
          setMsg(null);
          try {
            const r = await rediscoverChannels();
            setMsg(r.length ? r.map((x) => `${x.label}: ${x.ok ? x.message : `lỗi — ${x.message}`}`).join(" · ") : "Chưa cấu hình token nào");
          } catch (e) {
            setMsg(e instanceof Error ? e.message : "Lỗi");
          }
        })}
        className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:bg-grid disabled:opacity-60">
        {pending ? "Đang quét…" : "🔍 Quét lại danh sách kênh"}
      </button>
      {msg && <span className="text-sm text-ink-2">{msg}</span>}
    </div>
  );
}
