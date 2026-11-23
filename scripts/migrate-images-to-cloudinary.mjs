// Chuyển ảnh cũ từ Supabase Storage (bucket rnd-images) sang Cloudinary (loại "authenticated" = riêng tư).
//   Xem trước (không đổi gì):   node scripts/migrate-images-to-cloudinary.mjs
//   Chuyển thật:                node scripts/migrate-images-to-cloudinary.mjs --run
//   Xoá bản cũ ở Supabase sau khi đã chuyển và kiểm tra:   node scripts/migrate-images-to-cloudinary.mjs --run --delete-old
// Cần CLOUDINARY_URL trong .env.local. Chạy lại nhiều lần được: ảnh đã chuyển (tên "cld-…") bị bỏ qua.
// Thứ tự an toàn cho từng ảnh: tải từ Supabase → đẩy lên Cloudinary → ghi đường dẫn mới vào DB → (chỉ khi --delete-old) xoá bản cũ.
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
if (!env.CLOUDINARY_URL) throw new Error("Thiếu CLOUDINARY_URL trong .env.local");
process.env.CLOUDINARY_URL = env.CLOUDINARY_URL;   // phải đặt TRƯỚC khi nạp thư viện (nó đọc biến này lúc nạp)
const { v2: cloudinary } = await import("cloudinary");
cloudinary.config({ secure: true });

const RUN = process.argv.includes("--run"), DELETE_OLD = process.argv.includes("--delete-old");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const rnd = () => db.schema("rnd");
const BUCKET = "rnd-images";
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const isCld = (p) => /(^|\/)cld-[^/]*$/.test(p);
const newPath = (p) => p.replace(/([^/]+)$/, "cld-$1");
const publicId = (p) => p.replace(/\.[^./]+$/, "");

// [bảng, cột ảnh, cột khoá để cập nhật]
const TARGETS = [["products", "image_paths", "id"], ["design_tasks", "image_paths", "product_id"], ["media_requests", "photo_paths", "id"]];

let moved = 0, skipped = 0, failed = 0, deleted = 0;
for (const [table, col, key] of TARGETS) {
  const rows = must(await rnd().from(table).select(`${key}, ${col}`));
  for (const row of rows) {
    const paths = row[col] ?? [];
    if (!paths.some((p) => !isCld(p))) { skipped += paths.length; continue; }
    const next = [], toDelete = [];
    for (const p of paths) {
      if (isCld(p)) { next.push(p); skipped++; continue; }
      if (!RUN) { console.log(`[xem trước] ${table} ${p} → ${newPath(p)}`); next.push(p); continue; }
      try {
        const { data: blob, error } = await db.storage.from(BUCKET).download(p);
        if (error) throw new Error(`tải từ Supabase: ${error.message}`);
        const buf = Buffer.from(await blob.arrayBuffer());
        await new Promise((resolve, reject) => cloudinary.uploader.upload_stream(
          { public_id: publicId(newPath(p)), type: "authenticated", resource_type: "image", overwrite: false },
          (e, r) => (e ? reject(new Error(e.message)) : resolve(r))).end(buf));
        next.push(newPath(p)); toDelete.push(p); moved++;
      } catch (e) { console.error(`LỖI ${p}: ${e.message}`); next.push(p); failed++; }
    }
    if (RUN && toDelete.length) {
      must(await rnd().from(table).update({ [col]: next }).eq(key, row[key]));   // đường dẫn mới vào DB trước khi xoá bản cũ
      if (DELETE_OLD) { must(await db.storage.from(BUCKET).remove(toDelete)); deleted += toDelete.length; }
    }
  }
}
console.log(RUN ? { chuyen: moved, boQua: skipped, loi: failed, xoaBanCu: deleted } : "Xem trước xong. Thêm --run để chuyển thật.");
