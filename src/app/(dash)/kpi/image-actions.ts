"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/session";
import { sb } from "@/lib/supabase/admin";
import { detectSplits, imageRows, parseProductImages, type ImageRow, type SplitGroup } from "@/lib/product-image-import";
import { loadSkuOverrides } from "@/lib/sku-overrides";
import { invalidateSpuRows } from "@/lib/spu-data";
import { logged } from "@/lib/system-log";

export type ImageImportState = {
  ok?: boolean; error?: string; file?: string; saved?: number; names?: number; spus?: number; withoutImage?: number; badLinks?: number; totalRows?: number;
  splits?: { code: string; newCode: string; skus: number }[]; splitWarning?: string;
};

const MAX_BYTES = 4 * 1024 * 1024;   // Vercel chỉ nhận thân yêu cầu tối đa ~4,5 MB; next.config đặt serverActions.bodySizeLimit tương ứng
const missingTable = (e: { message?: string } | null, name: string) => !!e && new RegExp(name).test(e.message ?? "") && /relation|schema cache|does not exist/i.test(e.message ?? "");

// Phần ghi chung cho cả hai đường nhập (file nhỏ đọc ở máy chủ; file lớn đọc ở trình duyệt):
//  1) Tách SPU bị gộp nhầm do đặt trùng mã (vd N400622 và N400622-5…9 là 2 sản phẩm khác nhau): nhóm "mã-số" thành SPU riêng = mã + "X",
//     ghi vào sales.sku_spu_overrides và đổi mã SPU của dữ liệu tồn kho / đơn hàng đã nhập.
//  2) Ảnh + tên: mỗi SPU một link ảnh và một tên; SPU đã có được cập nhật, SPU không có trong file giữ nguyên.
type Img = { rows: ImageRow[]; spus: number; withImage: number; withoutImage: number; withName: number };
async function persist(fileName: string, splits: SplitGroup[], makeRows: (overrides: Map<string, string>) => Img, meta: { totalRows: number; badLinks: number }): Promise<ImageImportState> {
  const db = sb.sales();
  const now = new Date().toISOString();
  const overrides = await loadSkuOverrides();
  let splitWarning: string | undefined;
  if (splits.length) {
    const rows = splits.flatMap((g) => g.skus.map((sku) => ({ sku, spu_code: g.newCode, reason: `${g.code} (${g.baseName.slice(0, 60)}) ≠ ${g.splitName.slice(0, 60)}`, updated_at: now })));
    const { error } = await db.from("sku_spu_overrides").upsert(rows, { onConflict: "sku" });
    if (error) {
      splitWarning = missingTable(error, "sku_spu_overrides") ? "Chưa chạy migration 050 trong Supabase nên chưa tách được SPU bị gộp nhầm" : `Không lưu được danh sách tách mã: ${error.message}`;
    } else {
      for (const r of rows) overrides.set(r.sku, r.spu_code);
      // Đổi mã SPU của dữ liệu đã nhập (tồn kho theo SKU, danh sách SKU, dòng đơn hàng) — các lần nhập sau tự áp bảng này
      for (const g of splits) {
        for (let i = 0; i < g.skus.length; i += 100) {
          const part = g.skus.slice(i, i + 100);
          for (const t of ["inventory_skus", "inventory_stock", "imported_order_lines"]) {
            const { error: e2 } = await db.from(t).update({ code: g.newCode }).in("sku", part);
            if (e2 && !missingTable(e2, t)) splitWarning = `Đã lưu danh sách tách mã nhưng chưa đổi được mã ở bảng ${t}: ${e2.message}`;
          }
        }
      }
    }
  }
  const img = makeRows(overrides);
  for (let i = 0; i < img.rows.length; i += 1000) {
    const { error } = await db.from("spu_images").upsert(
      img.rows.slice(i, i + 1000).map((r) => ({ code: r.code, image_url: r.url, name: r.name, sku: r.sku || null, updated_at: now })), { onConflict: "code" });
    if (error) return { error: missingTable(error, "spu_images") ? "Chưa chạy migration 049 trong Supabase (bảng ảnh sản phẩm chưa có)" : /name|image_url/.test(error.message) ? "Chưa chạy migration 054 trong Supabase (tên sản phẩm theo SPU)" : `Ghi ảnh lỗi: ${error.message}` };
  }
  invalidateSpuRows();
  for (const p of ["/kpi", "/spu", "/rnd/dashboard", "/posts"]) revalidatePath(p);
  return {
    ok: true, file: fileName, saved: img.withImage, names: img.withName, spus: img.spus, withoutImage: img.withoutImage, badLinks: meta.badLinks, totalRows: meta.totalRows,
    splits: splits.map((g) => ({ code: g.code, newCode: g.newCode, skus: g.skus.length })), splitWarning,
  };
}

// Nhập danh sách sản phẩm (file Sapo "Xuất danh sách sản phẩm", file nhỏ ≤ 4 MB đọc ở máy chủ). Chỉ Quản lý / R&D.
async function importProductImagesRaw(_: ImageImportState, form: FormData): Promise<ImageImportState> {
  await requireActionUser(["admin", "rnd"]);
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Chọn file danh sách sản phẩm (.xlsx, .xls hoặc .csv)" };
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return { error: "Chỉ nhận file .xlsx, .xls hoặc .csv" };
  if (file.size > MAX_BYTES) return { error: "File quá lớn để gửi lên (tối đa 4 MB) — hãy chọn lại file: file lớn được đọc ngay trên máy bạn" };

  let parsed;
  try { parsed = parseProductImages(Buffer.from(await file.arrayBuffer())); }
  catch { return { error: "Không đọc được file — kiểm tra file có đúng định dạng Excel / CSV không" }; }
  if (parsed.missing.length) return { error: `Thiếu cột: ${parsed.missing.join(" · ")}. Các cột tìm thấy trong file: ${parsed.headers.join(", ") || "(không có)"}` };
  if (!parsed.items.some((i) => i.url)) return { error: `Không có dòng nào có link ảnh hợp lệ (đọc ${parsed.totalRows} dòng, ${parsed.badLinks} link không hợp lệ)` };
  return persist(file.name, detectSplits(parsed.items), (ov) => imageRows(parsed.items, ov), { totalRows: parsed.totalRows, badLinks: parsed.badLinks });
}

// File lớn (vd file "Xuất danh sách sản phẩm" kèm tồn kho ~9 MB): TRÌNH DUYỆT đọc file, tách SPU trùng mã và chọn ảnh / tên cho từng SPU, rồi chỉ gửi kết quả gọn (JSON) lên đây.
// MỘT tham số duy nhất: Next giới hạn tổng độ dài chuỗi trong mảng tham số khi có ≥ 2 tham số ("Maximum array nesting exceeded") — chuỗi JSON vài MB phải đi một mình trong đối tượng
async function importProductImagesParsedRaw({ fileName, payload }: { fileName: string; payload: string }): Promise<ImageImportState> {
  await requireActionUser(["admin", "rnd"]);
  let d: { rows: ImageRow[]; splits: SplitGroup[]; spus: number; withoutImage: number; totalRows: number; badLinks: number };
  try { d = JSON.parse(payload); } catch { return { error: "Dữ liệu gửi lên không đọc được — thử lại" }; }
  if (!Array.isArray(d.rows) || !Array.isArray(d.splits) || d.rows.length > 60_000 || d.splits.length > 5_000) return { error: "Dữ liệu không hợp lệ hoặc quá lớn" };
  const clean = (x: unknown, n: number) => String(x ?? "").trim().slice(0, n);
  const rows: ImageRow[] = d.rows.map((r) => ({ code: clean(r.code, 100).toUpperCase(), url: r.url && /^https?:\/\//i.test(String(r.url)) ? clean(r.url, 1000) : null, name: r.name ? clean(r.name, 300) : null, sku: clean(r.sku, 100) })).filter((r) => r.code && (r.url || r.name));
  const splits: SplitGroup[] = d.splits.map((g) => ({ code: clean(g.code, 100).toUpperCase(), newCode: clean(g.newCode, 100).toUpperCase(), skus: (g.skus ?? []).map((s) => clean(s, 100).toUpperCase()).filter(Boolean), baseName: clean(g.baseName, 200), splitName: clean(g.splitName, 200) }))
    .filter((g) => g.code && g.newCode === `${g.code}X` && g.skus.length);   // chỉ nhận đúng dạng tách mã + "X"
  const withImage = rows.filter((r) => r.url).length;
  return persist(fileName.slice(0, 200), splits, () => ({ rows, spus: Number(d.spus) || rows.length, withImage, withoutImage: Number(d.withoutImage) || 0, withName: rows.filter((r) => r.name).length }), { totalRows: Number(d.totalRows) || 0, badLinks: Number(d.badLinks) || 0 });
}

const sumImg = (r: ImageImportState) => `${r.file ?? ""} · ${(r.spus ?? 0).toLocaleString("vi-VN")} SPU, ${(r.saved ?? 0).toLocaleString("vi-VN")} có ảnh${r.splits?.length ? `, tách ${r.splits.length} SPU trùng mã` : ""}`;
const detImg = (r: ImageImportState) => ({ file: r.file, spus: r.spus, withImage: r.saved, names: r.names, withoutImage: r.withoutImage, badLinks: r.badLinks, splits: r.splits?.length ?? 0 });
export async function importProductImages(prev: ImageImportState, form: FormData): Promise<ImageImportState> {
  return logged("import_images", ["admin", "rnd"], () => importProductImagesRaw(prev, form), sumImg, detImg);
}
export async function importProductImagesParsed(arg: { fileName: string; payload: string }): Promise<ImageImportState> {
  return logged("import_images", ["admin", "rnd"], () => importProductImagesParsedRaw(arg), sumImg, detImg);
}
