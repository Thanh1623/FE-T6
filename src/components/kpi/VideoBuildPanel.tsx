"use client";

import { useState, useTransition } from "react";
import { buildVideoTable, compareVideoTable, type VideoBuildState } from "@/app/(dash)/kpi/video-build-actions";

// Bảng tổng hợp video dựng trong SQL (migration 089 + 090; docs/THIET-KE-LAM-MOI-VIDEO-TRONG-SQL.md): nguồn video của bảng tổng hợp SPU. Các nút dựng lại / đối chiếu.
export default function VideoBuildPanel() {
  const [state, setState] = useState<VideoBuildState | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState("");
  const run = (label: string, fn: () => Promise<VideoBuildState>) => start(async () => { setBusy(label); setState(null); setState(await fn()); setBusy(""); });
  const btn = "rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40";
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">
        Bảng gom sẵn <b>số video và lượt xem theo ngày × mã SPU × kênh</b>; bảng tổng hợp SPU (Theo dõi đẩy hàng, Dashboard) lấy video từ đây và hệ thống <b>tự nạp tăng dần</b> sau mỗi lần đồng bộ video.
        Các nút dưới chỉ dùng khi cần dựng lại từ đầu hoặc kiểm tra: <b>① Dựng đầy đủ</b> rồi <b>② Đối chiếu</b> (báo KHỚP là đúng).
      </p>
      {state?.error && <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-ink">⛔ {state.error}</p>}
      {state?.lines && (
        <div className={`rounded-md px-3 py-2 text-sm ${state.ok ? "bg-good/10 text-good" : "bg-warn-bg text-warn-ink"}`}>
          <b>{state.ok ? "✓" : "⚠"} {state.title}</b>
          <ul className="mt-1 list-inside list-disc text-xs">{state.lines.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => run("full", () => buildVideoTable("full"))} className={`${btn} bg-accent text-white`}>{pending && busy === "full" ? "Đang dựng…" : "① Dựng đầy đủ"}</button>
        <button type="button" disabled={pending} onClick={() => run("cmp", compareVideoTable)} className={`${btn} border border-line bg-surface text-ink-1 hover:bg-grid`}>{pending && busy === "cmp" ? "Đang đối chiếu…" : "② Đối chiếu với bảng cũ"}</button>
        <button type="button" disabled={pending} onClick={() => run("inc", () => buildVideoTable("inc"))} className={`${btn} border border-line bg-surface text-ink-2 hover:bg-grid`}>{pending && busy === "inc" ? "Đang nạp…" : "Nạp tăng dần"}</button>
      </div>
    </div>
  );
}
