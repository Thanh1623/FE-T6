"use client";

import { useState } from "react";

// Ảnh bìa SPU; ảnh hết hạn hoặc lỗi thì để trống khung (như trang SPU)
export default function SpuImg({ src, alt }: { src: string | null; alt: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} />;
}
