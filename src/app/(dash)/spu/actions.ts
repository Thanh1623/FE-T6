"use server";

import { revalidatePath } from "next/cache";
import { gunzipSync } from "node:zlib";
import { requireActionUser } from "@/lib/session";
import { sb } from "@/lib/supabase/admin";
import { parseInventory, type ParsedInventory } from "@/lib/inventory-import";
import { parseSales } from "@/lib/sales-import";
import { saveStaffNames } from "@/lib/staff-teams";
import { invalidateSpuRows } from "@/lib/spu-data";
import { applyOverrides, loadSkuOverrides } from "@/lib/sku-overrides";
import { invalidateImportWindow } from "@/lib/daily-sales";
import { refreshTeamLines } from "@/lib/team-lines";
import { logged } from "@/lib/system-log";

export type ImportState = { ok?: boolean; error?: string; imported?: number; skipped?: number; warehouses?: number; file?: string; stock?: number; incoming?: number; spus?: number; wide?: boolean; skus?: number; hasCost?: boolean; hasPrice?: boolean };

const MAX_BYTES = 4 * 1024 * 1024;   // Vercel chỉ nhận thân yêu cầu tối đa ~4,5 MB; next.config đặt serverActions.bodySizeLimit tương ứng

// Nhập tồn kho từ file Excel / CSV: mỗi lần nhập là MỘT BẢN CHỤP tồn hiện tại — dòng trong file được thêm / cập nhật,
// dòng của lần nhập trước mà file mới không còn thì xoá (SPU đã hết khỏi kho). Chỉ Quản lý / R&D.
async function importInventoryRaw(_: ImportState, form: FormData): Promise<ImportState> {
  const user = await requireActionUser(["admin", "rnd"]);
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Chọn file tồn kho (.xlsx, .xls hoặc .csv)" };
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return { error: "Chỉ nhận file .xlsx, .xls hoặc .csv" };
  if (file.size > MAX_BYTES) return { error: "File quá lớn (tối đa 4 MB) — lưu file Excel dạng .xlsx (nén sẵn) hoặc chỉ giữ các kho có hàng" };

  let parsed;
  try { parsed = parseInventory(Buffer.from(await file.arrayBuffer())); }
  catch { return { error: "Không đọc được file — kiểm tra file có đúng định dạng Excel / CSV không" }; }
  if (parsed.missing.length) {
    return { error: `Thiếu cột bắt buộc: ${parsed.missing.join(", ")}. Các cột tìm thấy trong file: ${parsed.headers.join(", ") || "(không có)"}` };
  }
  if (!parsed.rows.length) return { error: `Không có dòng hợp lệ nào (đã bỏ qua ${parsed.skipped} dòng thiếu mã SPU, kho hoặc tồn không phải số)` };
  return saveInventory(parsed, file.name, user.id);
}

// Nhập tồn kho khi file quá lớn để gửi lên (file "Xuất danh sách sản phẩm" kèm tồn kho ~9 MB): TRÌNH DUYỆT đọc file, chỉ gửi dữ liệu gọn đã đọc (JSON) lên đây.
// Giới hạn: số dòng / SKU hợp lý để tránh gửi nhầm. Chỉ Quản lý / R&D.
// MỘT tham số duy nhất: Next giới hạn tổng độ dài chuỗi trong mảng tham số khi có ≥ 2 tham số ("Maximum array nesting exceeded") — chuỗi JSON vài MB phải đi một mình trong đối tượng
async function importInventoryParsedRaw({ fileName, payload }: { fileName: string; payload: string }): Promise<ImportState> {
  const user = await requireActionUser(["admin", "rnd"]);
  let parsed: ParsedInventory;
  try { parsed = JSON.parse(payload) as ParsedInventory; } catch { return { error: "Dữ liệu gửi lên không đọc được — thử lại" }; }
  if (!Array.isArray(parsed.rows) || !Array.isArray(parsed.skus) || parsed.skus.length > 60_000 || parsed.rows.length > 120_000) return { error: "Dữ liệu tồn kho không hợp lệ hoặc quá lớn" };
  const clean = (x: unknown) => String(x ?? "").trim().toUpperCase().slice(0, 100);
  const num = (x: unknown) => { const n = Math.round(Number(x)); return Number.isFinite(n) ? n : 0; };
  parsed = {
    ...parsed, format: parsed.format === "products" ? "products" : "wide", headers: [], missing: [], skipped: num(parsed.skipped),
    rows: parsed.rows.map((r) => ({ sku: clean(r.sku), code: clean(r.code), warehouse: String(r.warehouse ?? "").trim().slice(0, 100), stock: Math.max(0, num(r.stock)), lastIn: null, incoming: Math.max(0, num(r.incoming)), available: r.available === null || r.available === undefined ? null : num(r.available), inTransit: Math.max(0, num(r.inTransit)) }))
      .filter((r) => r.sku && r.code && r.warehouse),
    skus: parsed.skus.map((k) => ({ sku: clean(k.sku), code: clean(k.code), name: String(k.name ?? "").slice(0, 200), cost: k.cost ? num(k.cost) : null, price: k.price ? num(k.price) : null })).filter((k) => k.sku && k.code),
  };
  if (!parsed.rows.length) return { error: "Không có dòng tồn kho hợp lệ nào" };
  return saveInventory(parsed, fileName.slice(0, 200), user.id);
}

// Next.js giấu nội dung lỗi ném ra từ server action (trình duyệt chỉ thấy "Minified React error #441") → bắt và TRẢ lỗi để người dùng thấy nguyên nhân thật
async function saveInventory(parsed: ParsedInventory, fileName: string, userId: string): Promise<ImportState> {
  try { return await saveInventoryRows(parsed, fileName, userId); }
  catch (e) { console.error("[inventory]", e); return { error: `Lỗi khi lưu tồn kho: ${e instanceof Error ? e.message : String(e)}` }; }
}

// Chạy các lô ghi SONG SONG theo nhóm (file ~16.000 SKU ghi tuần tự ~25 lô dễ quá giới hạn thời gian của máy chủ); trả lỗi đầu tiên
async function inBatches<T>(items: T[], size: number, write: (part: T[]) => Promise<ImportState | null>): Promise<ImportState | null> {
  const parts: T[][] = [];
  for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
  for (let i = 0; i < parts.length; i += 4) {
    const res = await Promise.all(parts.slice(i, i + 4).map(write));
    const bad = res.find((r) => r);
    if (bad) return bad;
  }
  return null;
}

async function saveInventoryRows(parsed: ParsedInventory, fileName: string, userId: string): Promise<ImportState> {
  const overrides = await loadSkuOverrides();   // SPU bị gộp nhầm do đặt trùng mã đã được tách (Cài đặt → Ảnh sản phẩm)
  applyOverrides(parsed.rows, overrides); applyOverrides(parsed.skus, overrides);

  const db = sb.sales();
  const missingTable = (e: { code?: string } | null) => e?.code === "42P01" || e?.code === "PGRST205";
  const { data: imp, error: e1 } = await db.from("inventory_imports").insert({ file_name: fileName.slice(0, 200), row_count: parsed.rows.length, skipped: parsed.skipped, created_by: userId }).select("id").single();
  if (e1) return { error: missingTable(e1) ? "Chưa chạy migration 038 trong Supabase (bảng tồn kho chưa có)" : e1.message };

  const now = new Date().toISOString();
  const stockErr = await inBatches(parsed.rows, 1000, async (rows) => {
    const part = rows.map((r) => ({ sku: r.sku, code: r.code, warehouse: r.warehouse, stock: r.stock, incoming: r.incoming, available: r.available, in_transit: r.inTransit ?? 0, last_in_date: r.lastIn, import_id: imp.id, updated_at: now }));
    let { error } = await db.from("inventory_stock").upsert(part, { onConflict: "sku,warehouse" });
    // Chưa chạy migration 056 (cột in_transit "Đang giao dịch"): lưu không kèm
    if (error && /in_transit/.test(error.message)) ({ error } = await db.from("inventory_stock").upsert(part.map((r) => { const { in_transit: t0, ...rest } = r; void t0; return rest; }), { onConflict: "sku,warehouse" }));
    // Chưa chạy migration 051 (cột available): lưu không kèm — cột "Có thể bán" chưa có số
    if (error && /available/.test(error.message)) ({ error } = await db.from("inventory_stock").upsert(part.map((r) => { const { available: a0, ...rest } = r; void a0; return rest; }), { onConflict: "sku,warehouse" }));
    if (error) return { error: /incoming/.test(error.message) ? "Chưa chạy migration 042 trong Supabase (cột hàng đang về chưa có)" : `Ghi tồn kho lỗi: ${error.message}` };
    return null;
  });
  if (stockErr) return stockErr;
  // Danh sách TẤT CẢ SKU của file (kể cả SKU hết hàng ở mọi kho) — mỗi SKU kèm mã SPU
  const skuErr = await inBatches(parsed.skus, 1000, async (part) => {
    let { error } = await db.from("inventory_skus").upsert(part.map((k) => ({ sku: k.sku, code: k.code, name: k.name || null, ...(parsed.hasCost ? { cost_price: k.cost ?? null } : {}), ...(parsed.hasPrice ? { sale_price: k.price ?? null } : {}), import_id: imp.id, updated_at: now })), { onConflict: "sku" });
    // Chưa chạy migration 052 (cột cost_price / sale_price): lưu không kèm giá
    if (error && /cost_price|sale_price/.test(error.message)) ({ error } = await db.from("inventory_skus").upsert(part.map((k) => ({ sku: k.sku, code: k.code, name: k.name || null, import_id: imp.id, updated_at: now })), { onConflict: "sku" }));
    // Chưa chạy migration 044 (cột name): lưu không kèm tên — tên sản phẩm lấy từ danh mục Sapo
    if (error && /name/.test(error.message)) ({ error } = await db.from("inventory_skus").upsert(part.map((k) => ({ sku: k.sku, code: k.code, import_id: imp.id, updated_at: now })), { onConflict: "sku" }));
    if (error) return { error: /inventory_skus|sku/.test(error.message) ? "Chưa chạy migration 043 trong Supabase (tồn kho theo SKU chưa có)" : `Ghi danh sách SKU lỗi: ${error.message}` };
    return null;
  });
  if (skuErr) return skuErr;
  // Bản chụp mới thay bản cũ: bỏ dòng của các lần nhập trước không còn trong file
  const { error: e3 } = await db.from("inventory_stock").delete().or(`import_id.is.null,import_id.neq.${imp.id}`);
  if (e3) return { error: `Đã ghi tồn kho nhưng chưa dọn được dòng cũ: ${e3.message}` };
  await db.from("inventory_skus").delete().or(`import_id.is.null,import_id.neq.${imp.id}`);

  invalidateSpuRows();
  revalidatePath("/spu");
  return { ok: true, imported: parsed.rows.length, skipped: parsed.skipped, warehouses: new Set(parsed.rows.map((r) => r.warehouse)).size, file: fileName,
    stock: parsed.rows.reduce((n, r) => n + r.stock, 0), incoming: parsed.rows.reduce((n, r) => n + r.incoming, 0), spus: new Set(parsed.skus.map((k) => k.code)).size, skus: parsed.skus.length, wide: parsed.format === "wide" };
}

export type SalesImportState = {
  ok?: boolean; error?: string; file?: string; imported?: number; orders?: number; codes?: number; qty?: number; otherQty?: number; otherCodes?: number;
  from?: string | null; to?: string | null; gifts?: number; skippedInvalid?: number; cancelled?: number; refunds?: number;
  removedLines?: number; staffNames?: number; staffMatched?: number; staffUnmatched?: string[]; staffSaved?: boolean;
};

// Nhập số bán từ file "Danh sách chi tiết đơn hàng" (Sapo): mỗi dòng sản phẩm được thêm hoặc CẬP NHẬT theo (mã đơn, SKU, thứ tự) — nhập lại file trùng đơn không nhân đôi và dòng cũ của đơn không còn trong file (bỏ bớt sản phẩm) bị xoá,
// file của đợt khác không bị xoá. Lấy TẤT CẢ dòng (kể cả mã không phải SPU như MATRUNGGIANBAC của hàng chế tác, và quà tặng giá 0) để thống kê về sau; chỉ dòng thiếu mã đơn / ngày / SKU bị bỏ. Chỉ Quản lý / R&D.
async function importSalesRaw(_: SalesImportState, form: FormData): Promise<SalesImportState> {
  const user = await requireActionUser(["admin", "rnd"]);
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Chọn file chi tiết đơn hàng (.csv, .xlsx hoặc .xls)" };
  if (!/\.(xlsx|xls|csv|csv\.gz)$/i.test(file.name)) return { error: "Chỉ nhận file .csv, .xlsx hoặc .xls" };
  if (file.size > MAX_BYTES) return { error: "File quá lớn (tối đa 4 MB) — xuất theo từng ngày / từng tuần rồi nhập lần lượt (nhập nhiều file không bị trùng)" };

  let parsed;
  try {
    let buf = Buffer.from(await file.arrayBuffer());
    if (/\.gz$/i.test(file.name)) buf = gunzipSync(buf, { maxOutputLength: 80 * 1024 * 1024 });   // trình duyệt đã đọc Excel, tách theo đơn và nén gzip trước khi gửi
    parsed = parseSales(buf);
  }
  catch { return { error: "Không đọc được file — kiểm tra file có đúng định dạng CSV / Excel không" }; }
  if (parsed.missing.length) return { error: `Thiếu cột bắt buộc: ${parsed.missing.join(", ")}. Các cột tìm thấy trong file: ${parsed.headers.join(", ") || "(không có)"}` };
  if (!parsed.lines.length) return { error: `Không có dòng hợp lệ nào (${parsed.skippedInvalid} dòng thiếu mã đơn, ngày đặt hoặc mã SKU)` };
  applyOverrides(parsed.lines, await loadSkuOverrides());   // SPU bị gộp nhầm do đặt trùng mã đã được tách

  const db = sb.sales();
  const missingTable = (e: { code?: string } | null) => e?.code === "42P01" || e?.code === "PGRST205";
  const { data: imp, error: e1 } = await db.from("sales_imports").insert({
    file_name: file.name.slice(0, 200), row_count: parsed.lines.length, skipped: parsed.skippedInvalid, date_from: parsed.from, date_to: parsed.to, created_by: user.id,
  }).select("id").single();
  if (e1) return { error: missingTable(e1) ? "Chưa chạy migration 041 trong Supabase (bảng số bán chưa có)" : e1.message };

  const now = new Date().toISOString();
  const hasShip = parsed.lines.some((l) => l.shipStatus);   // file không có cột trạng thái giao hàng thì KHÔNG ghi ship_status (tránh xoá trạng thái đã lưu)
  const hasDelivered = parsed.lines.some((l) => l.deliveredAt);   // file không có cột ngày giao thì KHÔNG ghi delivered_at (tránh xoá ngày giao đã lưu)
  for (let i = 0; i < parsed.lines.length; i += 400) {
    const part = parsed.lines.slice(i, i + 400).map((l) => ({
      order_id: l.orderId, sku: l.sku, seq: l.seq, code: l.code, ordered_at: l.orderedAt, qty: l.qty, price: l.price,
      status: l.status, source: l.source, branch: l.branch, tags: l.tags, staff: l.staff, ...(hasDelivered ? { delivered_at: l.deliveredAt } : {}), ...(hasShip ? { ship_status: l.shipStatus, return_status: l.returnStatus, refund_status: l.refundStatus } : {}), import_id: imp.id, updated_at: now,
    }));
    // Database bận có thể làm một lô quá thời gian (statement timeout): thử lại tối đa 3 lần
    const write = async () => { let r = await db.from("imported_order_lines").upsert(part, { onConflict: "order_id,sku,seq" }); for (let a = 0; a < 3 && r.error && /timeout/i.test(r.error.message); a++) { await new Promise((x) => setTimeout(x, 1500 * (a + 1))); r = await db.from("imported_order_lines").upsert(part, { onConflict: "order_id,sku,seq" }); } return r; };
    let { error } = await write();
    // Chưa chạy migration 045 (cột tags / staff): lưu không kèm — chưa tính được số bán theo team
    // Thiếu cột nào (migration 045: tags / staff, 053: delivered_at, 087: ship_status) thì bỏ riêng cột đó rồi ghi lại
    for (const col of ["ship_status", "return_status", "refund_status", "delivered_at", "staff", "tags"] as const) {
      if (!error || !error.message.includes(col)) continue;
      for (const r of part) delete (r as Record<string, unknown>)[col];
      ({ error } = await write());
    }
    if (error) return { error: `Ghi số bán lỗi: ${error.message}` };
  }
  // Ghi nhớ các đơn chế tác (đang có mã trung gian MATRUNGGIAN…) để vẫn nhận ra khi đơn chế tác xong và dòng đơn đổi sang mã SPU thật (sales.craft_orders, migration 070). Chưa chạy migration thì bỏ qua, không làm hỏng lần nhập.
  {
    const craft = new Map<string, { order_id: string; kind: string; ordered_on: string; source: string }>();
    for (const l of parsed.lines) if (/^MATRUNGGIAN/i.test(l.sku) && !craft.has(l.orderId)) craft.set(l.orderId, { order_id: l.orderId, kind: /VANG/i.test(l.sku) ? "vang" : "bac", ordered_on: l.orderedAt.slice(0, 10), source: "import" });
    const rows = [...craft.values()];
    for (let i = 0; i < rows.length; i += 500) await db.from("craft_orders").upsert(rows.slice(i, i + 500), { onConflict: "order_id", ignoreDuplicates: true });
  }
  // Đơn đã có trong file thì file là bản mới nhất của đơn đó: dòng cũ của đơn không còn trong file (khách đổi ý, bỏ bớt sản phẩm) bị xoá.
  // Dòng còn trong file đã được ghi đè updated_at = now ở trên, nên dòng cũ hơn `now` của các đơn này chính là dòng đã bị bỏ.
  const orderIds = [...new Set(parsed.lines.map((l) => l.orderId))];
  // Mỗi lô thử lại tối đa 3 lần (database bận có thể làm một lô lỗi) và KHÔNG dừng ở lô lỗi đầu tiên: dòng cũ còn sót làm đơn bị tính trùng (vd HK114747: MATRUNGGIANVANG + D0001 sau khi chế tác xong)
  let removed = 0, failed = 0, lastErr = "";
  for (let i = 0; i < orderIds.length; i += 150) {
    const batch = orderIds.slice(i, i + 150);
    let done = false;
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      const { data, error } = await db.from("imported_order_lines").delete().in("order_id", batch).lt("updated_at", now).select("order_id");
      if (!error) { removed += data?.length ?? 0; done = true; }
      else { lastErr = error.message; if (attempt < 2) await new Promise((r) => setTimeout(r, 800 * (attempt + 1))); }
    }
    if (!done) failed += batch.length;
  }
  if (failed) return { error: `Đã ghi số bán nhưng chưa dọn được dòng cũ của ${failed} đơn (${lastErr}). Nhập lại đúng file này để dọn tiếp — không bị nhân đôi.` };
  // Nhập theo từng phần (trình duyệt chia file lớn): CHỈ phần cuối mới xoá bộ đệm / làm mới bảng tổng hợp, và KHÔNG gọi revalidatePath (nó dựng lại cả trang /spu ngay trong yêu cầu này → quá thời gian); trình duyệt tự làm mới trang sau phần cuối.
  const chunked = form.get("final") !== null, isFinal = form.get("final") !== "0";
  if (isFinal) { invalidateSpuRows(); invalidateImportWindow(); await refreshTeamLines().catch(() => null); }   // + dựng lại bảng tr_lines của QLHH (migration 093; lỗi / chưa có thì bỏ qua)   // khoảng ngày file đơn hàng phủ được đã đổi
  // Lưu tên nhân viên phụ trách của đơn kèm team suy được (sales.staff_teams) để chia số bán theo team; không làm hỏng lần nhập nếu lỗi
  const staff = await saveStaffNames(parsed.lines.map((l) => l.staff)).catch(() => null);
  if (!chunked) revalidatePath("/spu");
  return {
    staffNames: staff?.names, staffMatched: staff?.matched, staffUnmatched: staff?.unmatched.slice(0, 8), staffSaved: staff?.saved,
    ok: true, file: file.name, imported: parsed.lines.length, removedLines: removed, orders: parsed.orders, codes: parsed.codes, qty: parsed.qty, otherQty: parsed.otherQty, otherCodes: parsed.otherCodes,
    from: parsed.from, to: parsed.to, gifts: parsed.giftLines, refunds: parsed.refundLines, skippedInvalid: parsed.skippedInvalid, cancelled: parsed.cancelledLines,
  };
}

// ===== Ghi nhật ký hệ thống (Cài đặt → Nhật ký) cho các thao tác nhập dữ liệu =====
const n0 = (x: number | undefined) => (x ?? 0).toLocaleString("vi-VN");
const sumInv = (r: ImportState) => `${r.file ?? ""} · ${n0(r.imported)} dòng, ${n0(r.spus)} SPU, ${n0(r.skus)} SKU, ${n0(r.warehouses)} kho`;
const detInv = (r: ImportState) => ({ file: r.file, rows: r.imported, spus: r.spus, skus: r.skus, warehouses: r.warehouses, skipped: r.skipped, stock: r.stock, incoming: r.incoming });
const sumSales = (r: SalesImportState) => `${r.file ?? ""} · ${n0(r.imported)} dòng, ${n0(r.orders)} đơn, ${n0(r.qty)} sản phẩm${r.from ? `, ${r.from} → ${r.to}` : ""}`;
const detSales = (r: SalesImportState) => ({ file: r.file, rows: r.imported, orders: r.orders, qty: r.qty, from: r.from, to: r.to, removedLines: r.removedLines, cancelled: r.cancelled, refunds: r.refunds });

export async function importInventory(prev: ImportState, form: FormData): Promise<ImportState> {
  return logged("import_inventory", ["admin", "rnd"], () => importInventoryRaw(prev, form), sumInv, detInv);
}
export async function importInventoryParsed(arg: { fileName: string; payload: string }): Promise<ImportState> {
  return logged("import_inventory", ["admin", "rnd"], () => importInventoryParsedRaw(arg), sumInv, detInv);
}
export async function importSales(prev: SalesImportState, form: FormData): Promise<SalesImportState> {
  return logged("import_sales", ["admin", "rnd"], () => importSalesRaw(prev, form), sumSales, detSales);
}
