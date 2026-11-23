"use client";

// Cửa sổ xem ảnh — chép cơ chế từ app đặt hàng (my-jewelry-dashboard/components/ui/ImageLightbox.tsx):
// khung nổi KHÔNG phủ nền (trang phía dưới vẫn bấm được), kéo header để dời khung, kéo viền/góc đổi cỡ,
// lăn chuột / nhấp đúp để zoom, kéo ảnh khi đã zoom để xem vùng khác, xoay, thu nhỏ, phóng to, mở tab riêng,
// dải ảnh nhỏ bên dưới, ← → lật ảnh, Esc đóng. Màu theo giao diện của app (có chế độ tối).
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

export type LightboxImage = { url: string; alt?: string; thumb?: string };   // thumb: ảnh nhỏ cho dải chọn ảnh

const LIGHTBOX_OPEN = "lightbox:open";   // sự kiện toàn trang: một cửa sổ ảnh vừa mở
const DEFAULT_SCALE = 1;
const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const DOUBLE_CLICK_SCALE = 2.5;
const MIN_WIN_W = 260;
const MIN_WIN_H = 200;

type ResizeDir = { x: -1 | 0 | 1; y: -1 | 0 | 1 };

// Icon SVG gọn (thay lucide-react)
const I = {
  x: "M6 6l12 12M18 6L6 18", left: "M15 6l-6 6 6 6", right: "M9 6l6 6-6 6", rotate: "M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5",
  minus: "M5 12h14", max: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5", min: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
  ext: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  zin: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M11 8v6M8 11h6", zout: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6",
};
const Icon = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
const iconBtn = "flex h-7 w-7 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-grid disabled:opacity-30 disabled:hover:bg-transparent";

export function ImageLightbox({ images, startIndex = 0, onClose }: { images: LightboxImage[]; startIndex?: number; onClose: () => void }) {
  const [current, setCurrent] = useState(Math.min(startIndex, images.length - 1));
  // windowOffset = vị trí cả khung (kéo khi CHƯA zoom); panOffset = vị trí ảnh trong khung (kéo khi ĐÃ zoom)
  const [windowOffset, setWindowOffset] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [rotation, setRotation] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [customSize, setCustomSize] = useState<{ w: number; h: number } | null>(null);   // null = co theo ảnh
  const dragStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0, offX: 0, offY: 0, dir: { x: 0, y: 0 } as ResizeDir });
  const imgRef = useRef<HTMLImageElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Chỉ MỘT cửa sổ ảnh mở cùng lúc: cửa sổ mới mở sẽ báo cho các cửa sổ khác tự đóng (mỗi ô ảnh trong bảng có cửa sổ riêng nên không tự biết nhau)
  const winId = useRef(Symbol("lightbox"));
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const me = winId.current;
    const onOther = (e: Event) => { if ((e as CustomEvent<symbol>).detail !== me) closeRef.current(); };
    window.addEventListener(LIGHTBOX_OPEN, onOther);
    window.dispatchEvent(new CustomEvent<symbol>(LIGHTBOX_OPEN, { detail: me }));
    return () => window.removeEventListener(LIGHTBOX_OPEN, onOther);
  }, []);

  const resetView = () => { setPanOffset({ x: 0, y: 0 }); setScale(DEFAULT_SCALE); setRotation(0); };
  const prev = useCallback(() => { setCurrent((i) => (i - 1 + images.length) % images.length); resetView(); }, [images.length]);
  const next = useCallback(() => { setCurrent((i) => (i + 1) % images.length); resetView(); }, [images.length]);
  const zoomBy = (f: number) => setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * f)));
  const toggleMaximize = () => { setMaximized((m) => !m); setCustomSize(null); setWindowOffset({ x: 0, y: 0 }); };

  // Kéo trên ẢNH: chưa zoom → dời khung; đã zoom → xem vùng khác của ảnh
  function onImagePointerDown(e: ReactPointerEvent<HTMLImageElement>) {
    e.stopPropagation();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    offsetStart.current = scale > DEFAULT_SCALE ? panOffset : windowOffset;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onImagePointerMove(e: ReactPointerEvent<HTMLImageElement>) {
    if (!dragging) return;
    const n = { x: offsetStart.current.x + (e.clientX - dragStart.current.x), y: offsetStart.current.y + (e.clientY - dragStart.current.y) };
    if (scale > DEFAULT_SCALE) setPanOffset(n); else setWindowOffset(n);
  }
  function onPointerUp(e: ReactPointerEvent<HTMLElement>) { setDragging(false); e.currentTarget.releasePointerCapture(e.pointerId); }

  // Kéo HEADER: luôn dời cả khung (kể cả khi đang zoom)
  function onHeaderPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    offsetStart.current = windowOffset;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onHeaderPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setWindowOffset({ x: offsetStart.current.x + (e.clientX - dragStart.current.x), y: offsetStart.current.y + (e.clientY - dragStart.current.y) });
  }

  // Kéo viền/góc đổi cỡ khung; bù offset để cạnh đối diện đứng yên
  function onResizePointerDown(dir: ResizeDir, e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    const rect = cardRef.current!.getBoundingClientRect();
    resizeStart.current = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height, offX: windowOffset.x, offY: windowOffset.y, dir };
    setMaximized(false);
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onResizePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const { x, y, w, h, offX, offY, dir } = resizeStart.current;
    const newW = dir.x === 0 ? w : Math.min(window.innerWidth, Math.max(MIN_WIN_W, w + dir.x * (e.clientX - x)));
    const newH = dir.y === 0 ? h : Math.min(window.innerHeight, Math.max(MIN_WIN_H, h + dir.y * (e.clientY - y)));
    setCustomSize({ w: newW, h: newH });
    setWindowOffset({ x: offX + (dir.x * (newW - w)) / 2, y: offY + (dir.y * (newH - h)) / 2 });
  }

  // Nhấp đúp: zoom 2,5× / về mặc định
  function onImageDoubleClick(e: ReactMouseEvent<HTMLImageElement>) {
    e.stopPropagation();
    setPanOffset({ x: 0, y: 0 });
    setScale((s) => (s > DEFAULT_SCALE + 0.01 ? DEFAULT_SCALE : DOUBLE_CLICK_SCALE));
  }

  // Lăn chuột để zoom (listener native passive:false để chặn cuộn trang)
  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); e.stopPropagation(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15); };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [current, minimized]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "ArrowLeft" && scale === DEFAULT_SCALE) prev();
      if (e.key === "ArrowRight" && scale === DEFAULT_SCALE) next();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, prev, next, scale]);

  if (!images.length) return null;
  const img = images[current];
  const edge = (dir: ResizeDir, cls: string) => (
    <div onPointerDown={(e) => onResizePointerDown(dir, e)} onPointerMove={onResizePointerMove} onPointerUp={onPointerUp}
      className={`absolute z-20 ${cls}`} style={{ touchAction: "none" }} />
  );

  // Portal ra body + chặn sự kiện nổi lên (vd bấm trong cửa sổ không mở thẻ phía sau)
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center"
      onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <div ref={cardRef}
        className={`pointer-events-auto relative flex select-none flex-col items-center rounded-lg border border-line bg-surface p-1.5 shadow-2xl ${
          customSize ? "" : maximized ? "h-screen w-screen max-w-none" : "mx-16 max-w-5xl"}`}
        style={{ transform: `translate(${windowOffset.x}px, ${windowOffset.y}px)`, ...(customSize ? { width: customSize.w, height: customSize.h } : {}) }}>
        {!minimized && (
          <>
            {edge({ x: 0, y: -1 }, "-top-1 left-2 right-2 h-2 cursor-ns-resize")}
            {edge({ x: 0, y: 1 }, "-bottom-1 left-2 right-2 h-2 cursor-ns-resize")}
            {edge({ x: -1, y: 0 }, "-left-1 top-2 bottom-2 w-2 cursor-ew-resize")}
            {edge({ x: 1, y: 0 }, "-right-1 top-2 bottom-2 w-2 cursor-ew-resize")}
            {edge({ x: -1, y: -1 }, "-top-1 -left-1 h-3 w-3 cursor-nwse-resize")}
            {edge({ x: 1, y: -1 }, "-top-1 -right-1 h-3 w-3 cursor-nesw-resize")}
            {edge({ x: -1, y: 1 }, "-bottom-1 -left-1 h-3 w-3 cursor-nesw-resize")}
            {edge({ x: 1, y: 1 }, "-bottom-1 -right-1 h-3 w-3 cursor-nwse-resize")}
          </>
        )}

        {/* Header: kéo để dời khung · số ảnh · xoay / mở tab riêng / thu nhỏ / phóng to / đóng */}
        <div onPointerDown={onHeaderPointerDown} onPointerMove={onHeaderPointerMove} onPointerUp={onPointerUp}
          style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
          className="flex h-8 w-full items-center justify-between gap-3 px-1">
          <span className="truncate text-xs text-ink-muted">
            {images.length > 1 ? `${current + 1} / ${images.length}` : ""}{img.alt ? `${images.length > 1 ? " · " : ""}${img.alt}` : ""}
          </span>
          <div className="flex flex-none items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
            <button onClick={() => setRotation((r) => (r + 90) % 360)} title="Xoay ảnh" className={iconBtn}><Icon d={I.rotate} /></button>
            <button onClick={() => window.open(img.url, "_blank", "noopener,noreferrer")} title="Mở cửa sổ riêng (kéo được sang màn hình khác)" className={iconBtn}><Icon d={I.ext} /></button>
            <button onClick={() => setMinimized((m) => !m)} title={minimized ? "Mở lại" : "Thu nhỏ"} className={iconBtn}><Icon d={I.minus} /></button>
            <button onClick={toggleMaximize} title={maximized ? "Khôi phục kích thước" : "Phóng to"} className={iconBtn}><Icon d={maximized ? I.min : I.max} size={14} /></button>
            <button onClick={onClose} title="Đóng (Esc)" className={`${iconBtn} hover:text-bad`}><Icon d={I.x} /></button>
          </div>
        </div>

        {!minimized && (
          <>
            {/* Chuyển ảnh + zoom */}
            <div className="mb-1 flex h-8 w-full items-center justify-center gap-1 border-t border-line px-1">
              {images.length > 1 && (
                <>
                  <button onClick={prev} title="Ảnh trước (←)" className={iconBtn}><Icon d={I.left} /></button>
                  <button onClick={next} title="Ảnh sau (→)" className={iconBtn}><Icon d={I.right} /></button>
                  <div className="mx-1 h-4 w-px bg-line" />
                </>
              )}
              <button onClick={() => zoomBy(1 / 1.25)} disabled={scale <= MIN_SCALE + 0.01} title="Thu nhỏ" className={iconBtn}><Icon d={I.zout} /></button>
              <span className="w-11 text-center text-xs tabular text-ink-2">{Math.round(scale * 100)}%</span>
              <button onClick={() => zoomBy(1.25)} disabled={scale >= MAX_SCALE} title="Phóng to" className={iconBtn}><Icon d={I.zin} /></button>
            </div>

            {/* Ảnh: khung cắt co theo ảnh; phóng to / tự đổi cỡ thì khung nở theo cửa sổ */}
            <div className={`relative flex items-center justify-center overflow-hidden ${customSize || maximized ? "min-h-0 w-full flex-1" : "w-fit"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- URL ký tạm thời của Storage */}
              <img ref={imgRef} src={img.url} alt={img.alt ?? ""} draggable={false}
                onPointerDown={onImagePointerDown} onPointerMove={onImagePointerMove} onPointerUp={onPointerUp} onDoubleClick={onImageDoubleClick}
                style={{
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px) rotate(${rotation}deg) scale(${scale})`,
                  cursor: dragging ? "grabbing" : scale > DEFAULT_SCALE ? "move" : "grab", touchAction: "none",
                  maxHeight: customSize || maximized ? "100%" : "70vh", maxWidth: customSize || maximized ? "100%" : "70vh",
                }}
                className="block select-none object-contain" />
            </div>

            {/* Dải ảnh nhỏ */}
            {images.length > 1 && (
              <div className="mt-2 flex max-w-full flex-wrap justify-center gap-2">
                {images.map((x, i) => (
                  <button key={`${x.url}${i}`} onClick={() => { setCurrent(i); resetView(); }} title={x.alt}
                    className={`h-11 w-11 overflow-hidden rounded-lg border-2 transition-colors ${i === current ? "border-accent" : "border-transparent opacity-50 hover:opacity-80"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL ký tạm thời của Storage */}
                    <img src={x.thumb ?? x.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
