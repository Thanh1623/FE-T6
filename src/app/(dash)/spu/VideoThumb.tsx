"use client";

import { useState } from "react";

// Ảnh bìa video: link Facebook hết hạn / bị chặn thì hiện khung ▶ thay vì ô trống
export default function VideoThumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  return src && !failed
    // eslint-disable-next-line @next/next/no-img-element -- ảnh bìa video từ mạng xã hội
    ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="h-16 w-12 flex-none rounded-md bg-grid object-cover" />
    : <span className="flex h-16 w-12 flex-none items-center justify-center rounded-md bg-gradient-to-b from-grid to-line text-lg" aria-hidden>▶</span>;
}
