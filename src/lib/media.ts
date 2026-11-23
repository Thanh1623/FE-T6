import "server-only";
import { v2 as cloudinary } from "cloudinary";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { RND_BUCKET } from "@/lib/rnd-constants";
import type { UploadTicket } from "@/lib/media-upload";

// Kho ảnh/media: ảnh mới lên Cloudinary (loại "authenticated" = riêng tư, mọi link đều phải ký) khi server có CLOUDINARY_URL;
// ảnh cũ vẫn ở Supabase Storage (bucket private) cho tới khi chạy scripts/migrate-images-to-cloudinary.mjs.
// Phân biệt bằng tên file: file ở Cloudinary có tên bắt đầu "cld-". Đường dẫn trong DB (image_paths / photo_paths) giữ nguyên dạng cũ.
// Lưu ý: link ký "authenticated" của Cloudinary KHÔNG tự hết hạn (chỉ link hết hạn theo thời gian mới cần gói trả phí) — nhưng không đoán / giả được.

export const cloudinaryOn = () => !!process.env.CLOUDINARY_URL;
export const isCld = (path: string) => /(^|\/)cld-[^/]*$/.test(path);

const cfg = () => { cloudinary.config({ secure: true }); return cloudinary.config(); };
const extOf = (path: string) => (path.match(/\.([a-z0-9]+)$/i)?.[1] ?? "jpg").toLowerCase();
const publicId = (path: string) => path.replace(/\.[^./]+$/, "");
// Trình duyệt không hiển thị được heic/heif → Cloudinary đổi sang jpg
const deliverExt = (path: string) => { const e = extOf(path); return e === "heic" || e === "heif" ? "jpg" : e; };

// Tên file mới: ở Cloudinary thì thêm "cld-" đầu tên
export function newImagePath(prefix: string, fileName: string) {
  const ext = (fileName.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return `${prefix}${cloudinaryOn() ? "cld-" : ""}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

export async function createUploadTicket(path: string): Promise<UploadTicket> {
  if (isCld(path)) {
    const c = cfg();
    const params = { public_id: publicId(path), type: "authenticated", timestamp: Math.round(Date.now() / 1000) };
    const signature = cloudinary.utils.api_sign_request(params, c.api_secret!);
    return { provider: "cloudinary", path, url: `https://api.cloudinary.com/v1_1/${c.cloud_name}/image/upload`, fields: { ...params, api_key: c.api_key!, signature } };
  }
  const { data, error } = await supabaseAdmin().storage.from(RND_BUCKET).createSignedUploadUrl(path);
  if (error) throw new Error(error.message);
  return { provider: "supabase", path: data.path, token: data.token };
}

// Link xem ảnh Cloudinary (ký tại chỗ, không gọi mạng). thumb = ảnh vuông nhỏ cho bảng / thẻ; còn lại = ảnh lớn vừa phải.
export function cloudinaryUrl(path: string, thumb = false) {
  cfg();
  return cloudinary.url(publicId(path), {
    type: "authenticated", sign_url: true, secure: true, resource_type: "image", format: deliverExt(path),
    transformation: [thumb
      ? { width: 360, height: 360, crop: "fill", quality: "auto", fetch_format: "auto" }
      : { width: 2000, crop: "limit", quality: "auto", fetch_format: "auto" }],
  });
}

// Xoá file ở đúng kho của nó
export async function removeFiles(paths: string[]) {
  const cld = paths.filter(isCld), legacy = paths.filter((p) => !isCld(p));
  if (legacy.length) await supabaseAdmin().storage.from(RND_BUCKET).remove(legacy);
  if (cld.length) { cfg(); await cloudinary.api.delete_resources(cld.map(publicId), { type: "authenticated", resource_type: "image", invalidate: true }); }
}
