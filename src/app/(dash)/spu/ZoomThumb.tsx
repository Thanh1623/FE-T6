"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { ImageLightbox } from "@/components/ui/ImageLightbox";

// MỘT cửa sổ xem ảnh duy nhất cho cả bảng: bấm ảnh khác thì thay ảnh trong chính cửa sổ đó (đóng cửa sổ cũ, mở cửa sổ mới), không bao giờ có hai cửa sổ cùng lúc.
// ZoomViewer bọc quanh bảng và giữ state "ảnh đang xem"; ZoomThumb chỉ báo cho ZoomViewer biết ảnh nào được bấm.
type Img = { url: string; alt: string };
const OpenCtx = createContext<(img: Img) => void>(() => {});

export function ZoomViewer({ children }: { children: ReactNode }) {
  const [img, setImg] = useState<Img | null>(null);
  return (
    <OpenCtx.Provider value={setImg}>
      {children}
      {/* key = đường dẫn ảnh: đổi ảnh → dựng lại cửa sổ với ảnh mới (đặt lại phóng to / xoay), giữ nguyên thiết kế cửa sổ cũ */}
      {img && <ImageLightbox key={img.url} images={[{ url: img.url, alt: img.alt }]} onClose={() => setImg(null)} />}
    </OpenCtx.Provider>
  );
}

// Ảnh sản phẩm nhỏ trong bảng; bấm vào mở / thay ảnh lớn ở cửa sổ xem ảnh chung (kéo, zoom, xoay)
export default function ZoomThumb({ src, alt }: { src: string; alt: string }) {
  const open = useContext(OpenCtx);
  return (
    <button type="button" onClick={() => open({ url: src, alt })} title="Bấm để xem ảnh lớn" aria-label={`Xem ảnh lớn ${alt}`} className="flex-none cursor-zoom-in rounded-md outline-offset-2 hover:opacity-85">
      {/* eslint-disable-next-line @next/next/no-img-element -- ảnh catalog Sapo */}
      <img src={src} alt="" loading="lazy" className="h-10 w-10 rounded-md bg-grid object-cover" />
    </button>
  );
}
