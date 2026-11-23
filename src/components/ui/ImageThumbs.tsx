"use client";

import { useState } from "react";
import { ImageLightbox } from "./ImageLightbox";

// Dãy ảnh nhỏ, bấm mở cửa sổ ảnh (dùng trong server component)
export default function ImageThumbs({ urls, label, size = 56, max = 6 }: { urls: string[]; label: string; size?: number; max?: number }) {
  const [box, setBox] = useState<number | null>(null);
  return (
    <div className="flex flex-wrap gap-1.5">
      {urls.slice(0, max).map((u, i) => (
        <button key={u} type="button" onClick={() => setBox(i)} className="cursor-zoom-in overflow-hidden rounded-md" title="Xem ảnh lớn">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL ký tạm thời của Storage */}
          <img src={u} alt="" style={{ width: size, height: size }} className="object-cover" />
        </button>
      ))}
      {urls.length > max && <span className="self-center text-xs text-ink-muted">+{urls.length - max}</span>}
      {box !== null && <ImageLightbox images={urls.map((url, i) => ({ url, alt: `${label} ${i + 1}` }))} startIndex={box} onClose={() => setBox(null)} />}
    </div>
  );
}
