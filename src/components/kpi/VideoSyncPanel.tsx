"use client";

import { useState, useTransition } from "react";
import { syncVideosNow, type VideoSyncState } from "@/app/(dash)/kpi/video-actions";

// Nút "Đồng bộ ngay" video từ API (Cài đặt). Đồng bộ tự động chạy mỗi ngày; nút này dùng khi cần số mới ngay.
export default function VideoSyncPanel({ lastAt, lastMessage }: { lastAt: string | null; lastMessage: string | null }) {
  const [state, setState] = useState<VideoSyncState | null>(null);
  const [pending, start] = useTransition();
  const fmt = (n: number) => n.toLocaleString("vi-VN");

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">
        Mỗi ngày hệ thống đọc <b>toàn bộ</b> video Facebook và TikTok từ API thống kê video (hiện khoảng 66.000 video Facebook của 117 Page và 38.700 video TikTok của 77 tài khoản) nhưng <b>chỉ ghi phần cần thiết</b>:
        video mới có mã SP, video đang đăng (45 ngày) khi số liệu đổi, <b>video cũ bỗng nổi</b> (tăng từ 1.000 lượt xem và trên 20%) và video có link ảnh bìa sắp hết hạn.
        Page / tài khoản chưa có trong app được tạo mới (chưa gắn team) — vào Quản lý team để gắn. Link ảnh bìa TikTok hết hạn rất nhanh nên thường hiện khung ▶.
      </p>
      <p className="text-xs text-ink-muted">
        {lastAt ? <>Lần chạy gần nhất: <b className="text-ink-1">{new Date(lastAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</b>{lastMessage ? ` — ${lastMessage}` : ""}</> : "Chưa chạy lần nào."}
      </p>
      {state?.error && <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-ink">⛔ {state.error}</p>}
      {state?.results?.map((r) => (
        <p key={r.platform} className="rounded-md bg-good/10 px-3 py-2 text-sm text-good">
          ✓ <b>{r.platform === "facebook" ? "Facebook" : "TikTok"}</b>: đọc <b>{fmt(r.read)}</b> video (API có {fmt(r.apiTotal)}), có mã SP trong cửa sổ lưu: {fmt(r.candidates)}. Đã ghi <b>{fmt(r.written)}</b>:
          mới {fmt(r.created)}, đang đăng {fmt(r.recent)}, viral {fmt(r.viral)}, làm mới ảnh {fmt(r.thumbs)}
          {r.newChannels ? <> · tạo <b>{fmt(r.newChannels)}</b> kênh mới</> : null}{r.skippedInactive ? <> · bỏ {fmt(r.skippedInactive)} video của kênh đã tắt</> : null} · {r.seconds} giây.
        </p>
      ))}
      <div>
        <button type="button" disabled={pending} onClick={() => start(async () => setState(await syncVideosNow()))}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{pending ? "Đang đồng bộ (1–3 phút)…" : "Đồng bộ video ngay"}</button>
      </div>
    </div>
  );
}
