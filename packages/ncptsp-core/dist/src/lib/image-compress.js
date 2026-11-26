"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compressImage = compressImage;
// Nén ảnh ngay trên trình duyệt trước khi tải lên: thu nhỏ về tối đa 1600px và lưu WebP (thường 150–400KB thay vì 2–8MB ảnh điện thoại).
// Giữ nguyên ảnh gốc khi: đã nhỏ sẵn, là GIF/SVG, trình duyệt không đọc được (vd HEIC ngoài Safari), hoặc nén xong lại không nhỏ hơn.
const MAX_SIDE = 1600;
const QUALITY = 0.82;
const SKIP_UNDER = 300 * 1024;
async function compressImage(file) {
    if (!file.type.startsWith("image/") || /gif|svg/.test(file.type) || file.size <= SKIP_UNDER)
        return file;
    try {
        const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); // xoay đúng chiều theo EXIF
        const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
        const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            bmp.close();
            return file;
        }
        ctx.drawImage(bmp, 0, 0, w, h);
        bmp.close();
        const blob = await new Promise((res) => canvas.toBlob(res, "image/webp", QUALITY));
        if (!blob || blob.type !== "image/webp" || blob.size >= file.size)
            return file;
        const base = (file.name || "anh").replace(/\.[^./]+$/, "") || "anh";
        return new File([blob], `${base}.webp`, { type: "image/webp", lastModified: Date.now() });
    }
    catch {
        return file;
    }
}
