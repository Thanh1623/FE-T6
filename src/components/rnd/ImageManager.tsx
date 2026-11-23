"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { attachImage, createImageUpload, removeImage } from "@/app/(dash)/rnd/actions";
import { putFile } from "@/lib/media-upload";
import { compressImage } from "@/lib/image-compress";
import { ImageLightbox } from "@/components/ui/ImageLightbox";

// Ảnh 3D / ảnh chụp SP sửa trong bộ bảng R&D (components/grid); ở đây chỉ còn ảnh mẫu
const ACTIONS = { product: { create: createImageUpload, attach: attachImage, remove: removeImage } };

export default function ImageManager({ productId, images, editable, kind = "product", featured = false }: {
  productId: string; images: { path: string; url: string }[]; editable: boolean; kind?: keyof typeof ACTIONS;
  featured?: boolean;   // ảnh đầu tiên hiện lớn hết bề ngang, các ảnh còn lại là ảnh nhỏ bên dưới
}) {
  const { create: createImageUpload, attach: attachImage, remove: removeImage } = ACTIONS[kind];
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [box, setBox] = useState<number | null>(null);
  const [sel, setSel] = useState(0);   // chế độ featured: ảnh đang hiện lớn (bấm ảnh nhỏ để đổi)
  const cur = Math.min(sel, Math.max(0, images.length - 1));
  const order = images.map((_, i) => i).sort((a, b) => (featured ? Number(b === cur) - Number(a === cur) : 0) || a - b);   // ảnh đang chọn lên đầu (hiện lớn), còn lại giữ thứ tự
  const [, start] = useTransition();

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    for (const [i, orig] of [...files].entries()) {
      if (orig.size > 40 * 1024 * 1024) { setError(`${orig.name}: ảnh lớn hơn 40MB`); continue; }
      setBusy(`Đang tải ảnh ${i + 1}/${files.length}…`);
      const file = await compressImage(orig);   // thu nhỏ + WebP trước khi tải (tiết kiệm dung lượng kho)
      if (file.size > 10 * 1024 * 1024) { setError(`${orig.name}: ảnh lớn hơn 10MB sau khi nén`); continue; }
      try {
        const ticket = await createImageUpload(productId, file.name);
        await putFile(ticket, file);
        await attachImage(productId, ticket.path);
      } catch (e) {
        setError(`${file.name}: ${e instanceof Error ? e.message : "lỗi tải lên"}`);
      }
    }
    setBusy(null);
    start(() => router.refresh());
  }

  return (
    <div>
      <div className={`grid gap-2 ${featured ? "grid-cols-4" : "grid-cols-3 sm:grid-cols-4"}`}>
        {order.map((i) => { const img = images[i]; return (
          <div key={img.path} className={`group relative overflow-hidden rounded-lg border border-line bg-page ${featured && i === cur ? "col-span-full aspect-square max-h-[300px] rounded-xl" : "aspect-square"}`}>
            <a href={img.url} target="_blank" rel="noreferrer" onClick={(e) => { e.preventDefault(); if (featured && i !== cur) setSel(i); else setBox(i); }} className={`block h-full w-full ${featured && i !== cur ? "cursor-pointer" : "cursor-zoom-in"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- URL ký tạm thời của Storage */}
              <img src={img.url} alt="" className="h-full w-full object-cover" />
            </a>
            {editable && (
              <button
                title="Xoá ảnh"
                onClick={() => { if (confirm("Xoá ảnh này?")) start(async () => { await removeImage(productId, img.path); router.refresh(); }); }}
                className="absolute right-1 top-1 hidden rounded-md bg-black/60 px-1.5 text-sm text-white group-hover:block"
              >✕</button>
            )}
          </div>
        ); })}
        {editable && (
          <label className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-line text-sm text-ink-2 hover:border-accent hover:text-accent ${featured && !images.length ? "col-span-full aspect-square max-h-[300px]" : "aspect-square"}`}>
            <span className="text-2xl">＋</span>
            <span>Thêm ảnh</span>
            <input type="file" accept="image/*" multiple className="hidden" disabled={!!busy}
              onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </label>
        )}
      </div>
      {!images.length && !editable && <p className="text-sm text-ink-muted">Chưa có ảnh.</p>}
      {busy && <p className="mt-2 text-sm text-ink-2">{busy}</p>}
      {error && <p className="mt-2 text-sm text-bad">⛔ {error}</p>}
      {box !== null && <ImageLightbox images={images.map((im, i) => ({ url: im.url, alt: `Ảnh mẫu ${i + 1}` }))} startIndex={box} onClose={() => setBox(null)} />}
    </div>
  );
}
