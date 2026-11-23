"use client";

import { useState } from "react";
import ImageManager from "@/components/rnd/ImageManager";
import { ImageLightbox } from "@/components/ui/ImageLightbox";

type Img = { path: string; url: string };

// Khung ảnh của mẫu: đã có Ảnh 3D thì hiện Ảnh 3D trước (chỉ xem — người vẽ thêm / xoá ở bảng 3D), bấm chuyển sang Ảnh mẫu (sưu tầm, sửa được)
export default function ProductImagesCard({ productId, images, images3d, editable }: { productId: string; images: Img[]; images3d: Img[]; editable: boolean }) {
  const has3d = images3d.length > 0;
  const [tab, setTab] = useState<"3d" | "sample">(has3d ? "3d" : "sample");
  const [box, setBox] = useState<number | null>(null);
  const [sel, setSel] = useState(0);   // ảnh 3D đang hiện lớn (bấm ảnh nhỏ để đổi)
  const cur = Math.min(sel, Math.max(0, images3d.length - 1));
  const order = images3d.map((_, i) => i).sort((a, b) => Number(b === cur) - Number(a === cur) || a - b);
  const show = has3d ? tab : "sample";
  const tabCls = (on: boolean) => `rounded px-2 py-0.5 text-xs font-medium ${on ? "bg-surface shadow-sm" : "text-ink-2 hover:text-ink-1"}`;
  return (
    <>
      <h2 className="mb-3 flex items-center gap-2 text-sm">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-grid text-xs">🖼</span>
        {has3d ? (
          <span className="flex gap-0.5 rounded-md bg-grid p-0.5" role="tablist" aria-label="Loại ảnh">
            <button type="button" role="tab" aria-selected={show === "3d"} onClick={() => setTab("3d")} className={tabCls(show === "3d")}>Ảnh 3D <span className="text-ink-muted">{images3d.length}</span></button>
            <button type="button" role="tab" aria-selected={show === "sample"} onClick={() => setTab("sample")} className={tabCls(show === "sample")}>Ảnh mẫu <span className="text-ink-muted">{images.length}</span></button>
          </span>
        ) : <>Ảnh mẫu <span className="text-xs font-normal text-ink-muted">{images.length}</span></>}
      </h2>
      {show === "3d" ? (
        <div className="grid grid-cols-4 gap-2">
          {order.map((i) => { const img = images3d[i]; const big = i === cur; return (
            <button key={img.path} type="button" onClick={() => (big ? setBox(i) : setSel(i))} title={big ? "Xem ảnh lớn" : "Bấm để xem ảnh này"}
              className={`overflow-hidden border border-line bg-page ${big ? "col-span-full aspect-square max-h-[300px] cursor-zoom-in rounded-xl" : "aspect-square cursor-pointer rounded-lg hover:border-accent"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- URL ký tạm thời của kho ảnh */}
              <img src={img.url} alt="" className="h-full w-full object-cover" />
            </button>
          ); })}
        </div>
      ) : <ImageManager productId={productId} editable={editable} featured images={images} />}
      {box !== null && <ImageLightbox images={images3d.map((im, i) => ({ url: im.url, alt: `Ảnh 3D ${i + 1}` }))} startIndex={box} onClose={() => setBox(null)} />}
    </>
  );
}
