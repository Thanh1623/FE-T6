"use client";

import { useState, useTransition } from "react";
import { cancelSession, endTest, updateSession } from "@/app/(dash)/rnd/actions";

// Nút thao tác trên phiên đang chạy: đổi ngày kết thúc, kết thúc test, huỷ (Quản lý)
export default function SessionControls({ id, endDate, startDate, canEdit, canCancel }: {
  id: string; endDate: string; startDate: string; canEdit: boolean; canCancel: boolean;
}) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(endDate);
  const run = (fn: () => Promise<unknown>) => start(async () => {
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Lỗi"); }
  });

  if (!canEdit) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 text-sm ${busy ? "opacity-60" : ""}`}>
      <label className="flex items-center gap-1.5 text-ink-2">
        Kết thúc dự kiến
        <input type="date" value={date} min={startDate} onChange={(e) => setDate(e.target.value)}
          className="rounded border border-line bg-page px-2 py-1" />
      </label>
      {date !== endDate && (
        <button disabled={busy} onClick={() => run(() => updateSession(id, { end_date: date }))}
          className="rounded-lg border border-line px-3 py-1 hover:bg-grid">Lưu ngày</button>
      )}
      <button disabled={busy}
        onClick={() => { if (confirm("Kết thúc phiên test này? Sau đó R&D xác nhận kết quả.")) run(() => endTest(id)); }}
        className="rounded-lg bg-ink-1 px-3 py-1 text-page hover:opacity-90">■ Kết thúc test</button>
      {canCancel && (
        <button disabled={busy}
          onClick={() => { if (confirm("Huỷ phiên test (tạo nhầm)? Phiên sẽ bị xoá.")) run(() => cancelSession(id)); }}
          className="text-bad hover:underline">Huỷ phiên</button>
      )}
      {error && <span className="w-full text-bad">⛔ {error}</span>}
    </div>
  );
}
