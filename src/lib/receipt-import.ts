import "server-only";
import * as XLSX from "xlsx";

// Đọc file Sapo "Danh sách chi tiết đơn nhập hàng" (Excel / CSV) → các lô nhập kho: {mã đơn, SKU, ngày nhập, số lượng, nhà cung cấp}.
// Cột (không phân biệt hoa thường / dấu): Mã đơn nhập · Ngày nhập · Trạng thái nhập · Tên nhà cung cấp · Mã SKU · SL nhập. Chỉ dòng "Đã nhập" được tính; "Chưa nhập" bỏ qua.
export type ReceiptRow = { po: string; sku: string; seq: number; receivedOn: string; qty: number; supplier: string | null };
export type ParsedReceipts = { rows: ReceiptRow[]; pending: number; skipped: number; from: string | null; to: string | null; headers: string[]; missing: string[]; sheet: string };

const norm = (t: unknown) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ALIAS = {
  po: ["ma don nhap", "ma don", "so don nhap"],
  date: ["ngay nhap", "ngay nhap kho", "ngay nhan"],
  status: ["trang thai nhap", "trang thai"],
  supplier: ["ten nha cung cap", "nha cung cap", "ncc"],
  sku: ["ma sku", "sku", "ma phien ban", "ma hang"],
  qty: ["sl nhap", "so luong nhap", "so luong", "sl"],
} as const;
const find = (hs: string[], names: readonly string[]) => { for (const n of names) { const i = hs.indexOf(n); if (i >= 0) return i; } return -1; };

// Ngày: số seri Excel, ô ngày, "dd/mm/yyyy" hoặc "yyyy-mm-dd"; không đọc được → null
function toDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.round(Math.floor(v) - 25569) * 86400 * 1000).toISOString().slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export function parseReceipts(buf: Buffer): ParsedReceipts {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const empty: Pick<ParsedReceipts, "rows" | "pending" | "skipped" | "from" | "to"> = { rows: [], pending: 0, skipped: 0, from: null, to: null };
  for (const sheet of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, defval: "", raw: true });
    let h = -1, hs: string[] = [];
    for (let i = 0; i < Math.min(grid.length, 20); i++) {   // dòng tiêu đề: trong 20 dòng đầu, đủ cột mã đơn + SKU + số lượng + ngày
      const cand = (grid[i] ?? []).map(norm);
      if (find(cand, ALIAS.po) >= 0 && find(cand, ALIAS.sku) >= 0 && find(cand, ALIAS.qty) >= 0 && find(cand, ALIAS.date) >= 0) { h = i; hs = cand; break; }
    }
    if (h < 0) continue;
    const c = { po: find(hs, ALIAS.po), date: find(hs, ALIAS.date), status: find(hs, ALIAS.status), supplier: find(hs, ALIAS.supplier), sku: find(hs, ALIAS.sku), qty: find(hs, ALIAS.qty) };
    const seq = new Map<string, number>();
    const rows: ReceiptRow[] = [];
    let pending = 0, skipped = 0;
    for (const r of grid.slice(h + 1)) {
      const po = String(r[c.po] ?? "").trim(), sku = String(r[c.sku] ?? "").trim().toUpperCase();
      if (!po && !sku) continue;   // dòng trống / dòng tiêu đề nhóm
      const status = c.status >= 0 ? norm(r[c.status]) : "da nhap";
      if (/chua nhap|huy/.test(status)) { pending++; continue; }
      const date = toDate(r[c.date]), qty = Math.round(Number(String(r[c.qty] ?? "").replace(/[^\d.-]/g, "")));
      if (!po || !sku || !date || !Number.isFinite(qty) || qty <= 0) { skipped++; continue; }
      const k = `${po}|${sku}`, n = (seq.get(k) ?? 0) + 1;
      seq.set(k, n);
      rows.push({ po, sku, seq: n, receivedOn: date, qty, supplier: c.supplier >= 0 ? String(r[c.supplier] ?? "").trim().slice(0, 200) || null : null });
    }
    const dates = rows.map((x) => x.receivedOn).sort();
    return { rows, pending, skipped, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null, headers: hs.filter(Boolean), missing: [], sheet };
  }
  const first = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]] ?? {}, { header: 1, defval: "", raw: true }).slice(0, 8).flat().map(String).filter(Boolean);
  return { ...empty, headers: first, missing: ["Mã đơn nhập", "Ngày nhập", "Mã SKU", "SL nhập"], sheet: wb.SheetNames[0] ?? "" };
}
