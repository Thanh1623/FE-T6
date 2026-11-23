"use client";

import { useState, useTransition } from "react";
import { addYouTubeChannels, syncYouTubeNow, type YouTubeState } from "@/app/(dash)/kpi/youtube-actions";

type Row = { id: string; name: string; followers: number | null; lastSyncedAt: string | null; teamName: string | null };

// Cài đặt → Dữ liệu: kênh YouTube (lấy video công khai bằng YouTube Data API: tiêu đề, hashtag, thumbnail, view, like, comment)
export default function YouTubePanel({ configured, channels }: { configured: boolean; channels: Row[] }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<YouTubeState | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<YouTubeState>) => start(async () => setState(await fn()));
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "chưa đồng bộ");

  return (
    <div className="flex flex-col gap-3 text-sm">
      {!configured && (
        <p className="rounded-md bg-warn-bg px-3 py-2 text-warn-ink">
          ⚠ Chưa có <b>YOUTUBE_API_KEY</b>. Tạo khoá ở Google Cloud (bật YouTube Data API v3 → Credentials → API key) rồi thêm vào <code>.env.local</code> và Environment Variables của Vercel.
        </p>
      )}
      <p className="text-ink-2">
        Dán mỗi dòng một kênh: <b>ID kênh</b> (UC…), <b>@handle</b> hoặc <b>link kênh</b>. Hệ thống lấy video công khai: tiêu đề, hashtag (tiêu đề + mô tả + thẻ), ảnh bìa, lượt xem, like, comment.
        Sau khi thêm, vào <b>Quản lý team → Kênh &amp; Page</b> để gán team.
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={"@tenkenh\nhttps://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx"}
        className="w-full rounded-lg border border-line bg-page px-3 py-2 text-sm outline-none focus:border-accent" />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending || !text.trim()} onClick={() => run(async () => { const r = await addYouTubeChannels(text); if (r.ok) setText(""); return r; })}
          className="rounded-lg bg-accent px-4 py-2 font-medium text-white disabled:opacity-40">{pending ? "Đang xử lý…" : "Thêm kênh"}</button>
        <button type="button" disabled={pending || !channels.length} onClick={() => run(syncYouTubeNow)}
          className="rounded-lg border border-line px-4 py-2 font-medium disabled:opacity-40">{pending ? "Đang đồng bộ…" : "Đồng bộ video ngay"}</button>
      </div>
      {state?.error && <p className="rounded-md bg-warn-bg px-3 py-2 text-warn-ink">⛔ {state.error}</p>}
      {state?.lines && (
        <ul className="space-y-0.5 rounded-md bg-grid/50 px-3 py-2 text-xs">
          {state.lines.map((l, i) => <li key={i} className={l.ok ? "text-good" : "text-bad"}>{l.text}</li>)}
        </ul>
      )}
      <div>
        <div className="mb-1 text-xs font-semibold text-ink-2">Kênh YouTube hiện có ({channels.length})</div>
        {channels.length ? (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {channels.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                <span className="font-medium">▶ {c.name}</span>
                <span className="text-xs text-ink-muted">
                  {c.teamName ? `Team ${c.teamName}` : "chưa gán team"} · {c.followers !== null ? `${c.followers.toLocaleString("vi-VN")} đăng ký` : "ẩn số đăng ký"} · đồng bộ: {when(c.lastSyncedAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-ink-muted">Chưa có kênh nào.</p>}
      </div>
    </div>
  );
}
