"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/session";
import { sb } from "@/lib/supabase/admin";
import { parseReceipts } from "@/lib/receipt-import";
import { invalidateSpuRows } from "@/lib/spu-data";
import { logged } from "@/lib/system-log";

export type ReceiptImportState = { ok?: boolean; error?: string; file?: string; saved?: number; skus?: number; pending?: number; skipped?: number; from?: string | null; to?: string | null };

const MAX_BYTES = 4 * 1024 * 1024;   // Vercel chỉ nhận thân yêu cầu tối đa ~4,5 MB; next.config đặt serverActions.bodySizeLimit tương ứng

// Nhập file Sapo "Danh sách chi tiết đơn nhập hàng": các lô nhập kho → tính thời gian tồn theo FIFO (lib/spu-data). Dòng mới thêm, dòng cũ cập nhật theo (mã đơn, SKU, thứ tự); không xoá dòng nào. Chỉ Quản lý / R&D.
async function importReceiptsRaw(_: ReceiptImportState, form: FormData): Promise<ReceiptImportState> {
  const user = await requireActionUser(["admin", "rnd"]);
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Chọn file đơn nhập hàng (.xlsx, .xls hoặc .csv)" };
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return { error: "Chỉ nhận file .xlsx, .xls hoặc .csv" };
  if (file.size > MAX_BYTES) return { error: "File quá lớn (tối đa 4 MB) — xuất khoảng thời gian ngắn hơn hoặc lưu dạng .xlsx" };

  let parsed;
  try { parsed = parseReceipts(Buffer.from(await file.arrayBuffer())); }
  catch { return { error: "Không đọc được file — kiểm tra file có đúng định dạng Excel / CSV không" }; }
  if (parsed.missing.length) return { error: `Thiếu cột: ${parsed.missing.join(", ")}. Các ô tìm thấy ở đầu file: ${parsed.headers.slice(0, 12).join(", ") || "(không có)"}` };
  if (!parsed.rows.length) return { error: `Không có lô "Đã nhập" hợp lệ nào (${parsed.pending} dòng chưa nhập, ${parsed.skipped} dòng thiếu mã đơn / SKU / ngày / số lượng)` };

  const db = sb.sales();
  const missingTable = (e: { message?: string } | null) => !!e && /receipt_imports|stock_receipts/.test(e.message ?? "") && /relation|schema cache|does not exist/i.test(e.message ?? "");
  const { data: imp, error: e1 } = await db.from("receipt_imports").insert({
    file_name: file.name.slice(0, 200), row_count: parsed.rows.length, pending: parsed.pending, skipped: parsed.skipped, date_from: parsed.from, date_to: parsed.to, created_by: user.id,
  }).select("id").single();
  if (e1) return { error: missingTable(e1) ? "Chưa chạy migration 055 trong Supabase (bảng lô nhập kho chưa có)" : e1.message };

  const now = new Date().toISOString();
  for (let i = 0; i < parsed.rows.length; i += 1000) {
    const { error } = await db.from("stock_receipts").upsert(
      parsed.rows.slice(i, i + 1000).map((r) => ({ po: r.po, sku: r.sku, seq: r.seq, received_on: r.receivedOn, qty: r.qty, supplier: r.supplier, import_id: imp.id, updated_at: now })),
      { onConflict: "po,sku,seq" });
    if (error) return { error: `Ghi lô nhập kho lỗi: ${error.message}` };
  }
  invalidateSpuRows();   // thời gian tồn tính lại ngay (xoá bộ đệm các số liệu đã gom)
  for (const p of ["/spu", "/kpi", "/rnd/dashboard"]) revalidatePath(p);
  return { ok: true, file: file.name, saved: parsed.rows.length, skus: new Set(parsed.rows.map((r) => r.sku)).size, pending: parsed.pending, skipped: parsed.skipped, from: parsed.from, to: parsed.to };
}

export async function importReceipts(prev: ReceiptImportState, form: FormData): Promise<ReceiptImportState> {
  return logged("import_receipts", ["admin", "rnd"], () => importReceiptsRaw(prev, form),
    (r) => `${r.file ?? ""} · ${(r.saved ?? 0).toLocaleString("vi-VN")} lô nhập, ${(r.skus ?? 0).toLocaleString("vi-VN")} SKU${r.from ? `, ${r.from} → ${r.to}` : ""}`,
    (r) => ({ file: r.file, rows: r.saved, skus: r.skus, pending: r.pending, skipped: r.skipped, from: r.from, to: r.to }));
}
