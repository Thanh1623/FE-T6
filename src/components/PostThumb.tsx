"use client";

import { useState } from "react";

// Ảnh bìa bài đăng: link CDN hết hạn / bị chặn (TikTok hết hạn sau ~1 ngày) thì hiện khung ▶ thay vì icon ảnh vỡ
export default function PostThumb({ src, className }: { src: string | null; className: string }) {
  const [failed, setFailed] = useState(false);
  return src && !failed
    // eslint-disable-next-line @next/next/no-img-element -- ảnh bìa từ mạng xã hội, link có hạn
    ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`${className} object-cover`} />
    : <div className={`${className} flex items-center justify-center bg-gradient-to-b from-grid to-line text-xl text-ink-muted`} aria-hidden>▶</div>;
}
