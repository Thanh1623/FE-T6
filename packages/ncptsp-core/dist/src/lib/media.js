"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCld = exports.cloudinaryOn = void 0;
exports.newImagePath = newImagePath;
exports.createUploadTicket = createUploadTicket;
exports.cloudinaryUrl = cloudinaryUrl;
exports.removeFiles = removeFiles;
require("server-only");
const cloudinary_1 = require("cloudinary");
const admin_1 = require("@/lib/supabase/admin");
const rnd_constants_1 = require("@/lib/rnd-constants");
// Kho ảnh/media: ảnh mới lên Cloudinary (loại "authenticated" = riêng tư, mọi link đều phải ký) khi server có CLOUDINARY_URL;
// ảnh cũ vẫn ở Supabase Storage (bucket private) cho tới khi chạy scripts/migrate-images-to-cloudinary.mjs.
// Phân biệt bằng tên file: file ở Cloudinary có tên bắt đầu "cld-". Đường dẫn trong DB (image_paths / photo_paths) giữ nguyên dạng cũ.
// Lưu ý: link ký "authenticated" của Cloudinary KHÔNG tự hết hạn (chỉ link hết hạn theo thời gian mới cần gói trả phí) — nhưng không đoán / giả được.
const cloudinaryOn = () => !!process.env.CLOUDINARY_URL;
exports.cloudinaryOn = cloudinaryOn;
const isCld = (path) => /(^|\/)cld-[^/]*$/.test(path);
exports.isCld = isCld;
const cfg = () => { cloudinary_1.v2.config({ secure: true }); return cloudinary_1.v2.config(); };
const extOf = (path) => (path.match(/\.([a-z0-9]+)$/i)?.[1] ?? "jpg").toLowerCase();
const publicId = (path) => path.replace(/\.[^./]+$/, "");
// Trình duyệt không hiển thị được heic/heif → Cloudinary đổi sang jpg
const deliverExt = (path) => { const e = extOf(path); return e === "heic" || e === "heif" ? "jpg" : e; };
// Tên file mới: ở Cloudinary thì thêm "cld-" đầu tên
function newImagePath(prefix, fileName) {
    const ext = (fileName.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    return `${prefix}${(0, exports.cloudinaryOn)() ? "cld-" : ""}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}
async function createUploadTicket(path) {
    if ((0, exports.isCld)(path)) {
        const c = cfg();
        const params = { public_id: publicId(path), type: "authenticated", timestamp: Math.round(Date.now() / 1000) };
        const signature = cloudinary_1.v2.utils.api_sign_request(params, c.api_secret);
        return { provider: "cloudinary", path, url: `https://api.cloudinary.com/v1_1/${c.cloud_name}/image/upload`, fields: { ...params, api_key: c.api_key, signature } };
    }
    const { data, error } = await (0, admin_1.supabaseAdmin)().storage.from(rnd_constants_1.RND_BUCKET).createSignedUploadUrl(path);
    if (error)
        throw new Error(error.message);
    return { provider: "supabase", path: data.path, token: data.token };
}
// Link xem ảnh Cloudinary (ký tại chỗ, không gọi mạng). thumb = ảnh vuông nhỏ cho bảng / thẻ; còn lại = ảnh lớn vừa phải.
function cloudinaryUrl(path, thumb = false) {
    cfg();
    return cloudinary_1.v2.url(publicId(path), {
        type: "authenticated", sign_url: true, secure: true, resource_type: "image", format: deliverExt(path),
        transformation: [thumb
                ? { width: 360, height: 360, crop: "fill", quality: "auto", fetch_format: "auto" }
                : { width: 2000, crop: "limit", quality: "auto", fetch_format: "auto" }],
    });
}
// Xoá file ở đúng kho của nó
async function removeFiles(paths) {
    const cld = paths.filter(exports.isCld), legacy = paths.filter((p) => !(0, exports.isCld)(p));
    if (legacy.length)
        await (0, admin_1.supabaseAdmin)().storage.from(rnd_constants_1.RND_BUCKET).remove(legacy);
    if (cld.length) {
        cfg();
        await cloudinary_1.v2.api.delete_resources(cld.map(publicId), { type: "authenticated", resource_type: "image", invalidate: true });
    }
}
