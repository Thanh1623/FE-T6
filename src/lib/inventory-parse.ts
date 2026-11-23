import { spuOf } from "@/lib/spu-code";

// Đọc file tồn kho (Excel .xlsx / .xls hoặc CSV) → các dòng {mã SPU, kho, tồn, ngày nhập gần nhất}.
// Định dạng cột chi tiết CHỜ FILE MẪU: tên cột nhận theo bảng bí danh bên dưới (không phân biệt hoa thường, bỏ dấu) — khi có file mẫu chỉ cần sửa bảng này.
// Mỗi dòng = 1 SKU × kho (giữ nguyên từng SKU); code = mã SPU suy từ SKU (phần trước dấu "-" đầu tiên) để gộp về SPU khi xem.
export type InventoryRow = { sku: string; code: string; warehouse: string; stock: number; lastIn: string | null; incoming: number; available: number | null; inTransit?: number };   // inTransit = "Đang giao dịch" (hàng đã bán, chưa giao xong); available = "Có thể bán" (có thể âm); null = file không có cột này
// format: "wide" = file "Quản lý kho phiên bản sản phẩm" xuất từ Sapo (mỗi dòng 1 SKU, mỗi kho 5 cột: Tồn kho · Có thể bán · Đang giao dịch · Đang về kho · Đang đóng gói);
//         "products" = file Sapo "Xuất danh sách sản phẩm" kèm tồn kho (cột "<Tên kho>_Tồn kho / _Có thể bán / _Đang giao dịch / _Đang về kho", có Giá, Giá vốn, tên, ảnh) — đầy đủ mọi SKU
//         "list" = bảng phẳng mỗi dòng 1 (mã SPU, kho)
export type ParsedInventory = { rows: InventoryRow[]; skus: { sku: string; code: string; name?: string; cost?: number | null; price?: number | null }[]; hasCost?: boolean; hasPrice?: boolean; skipped: number; headers: string[]; missing: string[]; sheet: string; format: "wide" | "products" | "list"; warehouses: string[] };

const norm = (t: unknown) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Cột → các tên có thể gặp trong file (đã chuẩn hoá: không dấu, chữ thường)
export const COLUMN_ALIASES = {
  code: ["ma spu", "spu", "ma sp", "ma san pham", "sku", "ma hang", "ma"],
  warehouse: ["kho", "ten kho", "kho hang", "ma kho", "dia diem", "dia diem kho"],
  stock: ["ton", "ton kho", "so luong ton", "sl ton", "ton cuoi", "ton hien tai", "so luong", "sl"],
  lastIn: ["ngay nhap", "ngay nhap kho", "ngay nhap gan nhat", "ngay nhap cuoi", "ngay ton"],
  incoming: ["dang ve", "dang ve kho", "hang dang ve"],
} as const;
export const COLUMN_LABELS = { code: "Mã SPU", warehouse: "Kho", stock: "Tồn", lastIn: "Ngày nhập gần nhất (tuỳ chọn)", incoming: "Đang về (tuỳ chọn)" } as const;
const REQUIRED = ["code", "warehouse", "stock"] as const;

// Ngày trong file: ô ngày của Excel (số seri), "dd/mm/yyyy", "yyyy-mm-dd"; không đọc được → bỏ trống (không làm hỏng cả dòng)
function toDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const vn = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (vn) return `${vn[3]}-${vn[2].padStart(2, "0")}-${vn[1].padStart(2, "0")}`;
  return null;
}

// File Sapo "Quản lý kho phiên bản sản phẩm": hàng trên cùng ghi tên kho (ô gộp, chỉ ở cột đầu của nhóm), hàng tiêu đề có các nhóm 5 cột lặp lại cho từng kho.
// Mỗi dòng = 1 SKU → gộp lên mã gốc (phần trước dấu "-" đầu tiên); lấy cả mã không phải SPU thuần. Kho "Chưa quản lý kho" (ô chữ) bỏ qua; tồn âm coi là 0; chỉ giữ (SPU, kho) còn tồn hoặc còn hàng đang về
// (không có trong file = hết hàng, đúng với cơ chế "bản chụp" của lần nhập).
function parseWide(grid: unknown[][], sheet: string): ParsedInventory | null {
  for (let i = 1; i < Math.min(15, grid.length); i++) {
    const head = (grid[i] ?? []).map(norm);
    const stockCols = head.flatMap((h, c) => (h === "ton kho" ? [c] : []));
    const skuCol = head.findIndex((h) => h === "sku" || h === "ma sku");
    const nameCol = head.findIndex((h) => h === "san pham" || h === "ten san pham");
    // Giá vốn / giá bán của SKU (nếu file có): lấy cột đầu tiên khớp
    const colOf = (names: string[]) => { for (const n of names) { const k = head.findIndex((h) => h === n); if (k >= 0) return k; } return -1; };
    const costCol = colOf(["gia von", "gia von trung binh", "gia nhap", "gia von hien tai"]), priceCol = colOf(["gia ban", "gia ban le", "gia ban le mac dinh", "gia ban buon"]);
    const money = (v: unknown) => { const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "")); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };   // tên sản phẩm của SKU: dùng để phân nhóm hàng
    if (stockCols.length < 2 || skuCol < 0) continue;
    const above = (grid[i - 1] ?? []).map((c) => String(c ?? "").trim());
    const groups = stockCols.map((c) => {
      let w = above[c];
      for (let k = c; !w && k > c - 5 && k >= 0; k--) w = above[k];   // tên kho nằm lệch trái (ô gộp)
      const inc = head.findIndex((h, k) => k >= c && k < c + 5 && h === "dang ve kho");
      const av = head.findIndex((h, k) => k >= c && k < c + 5 && h === "co the ban");   // cột "Có thể bán" của kho này
      return { c, inc, av, name: w || `Kho ${stockCols.indexOf(c) + 1}` };
    });
    const agg = new Map<string, InventoryRow>();
    const skus = new Map<string, { code: string; name: string; cost: number | null; price: number | null }>();   // TẤT CẢ SKU trong file (kể cả SKU hết hàng ở mọi kho) → mã SPU + tên
    let skipped = 0;
    for (const r of grid.slice(i + 1)) {
      const sku = String(r[skuCol] ?? "").trim().toUpperCase();
      if (!sku) continue;
      const code = spuOf(sku);   // gộp lên SPU: phần trước dấu "-" đầu tiên (kể cả mã không phải SPU thuần: hàng chế tác, phụ kiện)
      if (!code) { skipped += 1; continue; }
      if (!skus.has(sku)) skus.set(sku, { code, name: nameCol >= 0 ? String(r[nameCol] ?? "").trim().slice(0, 200) : "", cost: costCol >= 0 ? money(r[costCol]) : null, price: priceCol >= 0 ? money(r[priceCol]) : null });
      for (const g of groups) {
        const st = r[g.c], inc = g.inc >= 0 ? r[g.inc] : 0, avRaw = g.av >= 0 ? r[g.av] : null;
        const stock = typeof st === "number" ? Math.max(0, Math.round(st)) : 0;     // "Chưa quản lý kho" là chữ → 0
        const incoming = typeof inc === "number" ? Math.max(0, Math.round(inc)) : 0;
        const available = g.av >= 0 ? (typeof avRaw === "number" ? Math.round(avRaw) : 0) : null;   // giữ nguyên dấu: âm = đã bán vượt tồn
        if (!stock && !incoming && !available) continue;
        const k = `${sku}\u0000${g.name}`, cur = agg.get(k);
        if (cur) { cur.stock += stock; cur.incoming += incoming; if (available !== null) cur.available = (cur.available ?? 0) + available; } else agg.set(k, { sku, code, warehouse: g.name, stock, lastIn: null, incoming, available });
      }
    }
    return { rows: [...agg.values()], skus: [...skus].map(([sku, v]) => ({ sku, code: v.code, name: v.name, cost: v.cost, price: v.price })), hasCost: costCol >= 0, hasPrice: priceCol >= 0, skipped, headers: (grid[i] ?? []).map((c) => String(c ?? "").trim()).filter(Boolean).slice(0, 6), missing: [], sheet, format: "wide", warehouses: groups.map((g) => g.name) };
  }
  return null;
}

// File Sapo "Xuất danh sách sản phẩm" có kèm tồn kho (78 cột): hàng tiêu đề ở dòng đầu; mỗi kho 4 cột "<Tên kho>_Tồn kho", "_Có thể bán", "_Đang giao dịch", "_Đang về kho"; kèm Giá, Giá vốn, tên sản phẩm (chỉ ở dòng đầu của mỗi sản phẩm).
// Lưu THEO TỪNG KHO (chi nhánh): mỗi (SKU, kho) một dòng với tồn, có thể bán, đang giao dịch, đang về. Kho "Chưa quản lý kho" (ô chữ) coi là 0.
function parseProducts(grid: unknown[][]): ParsedInventory | null {
  const raw = (grid[0] ?? []).map((c) => String(c ?? "").trim());
  const head = raw.map(norm);
  const skuCol = head.indexOf("ma sku");
  const groups = new Map<string, { stock: number; avail: number; trans: number; inc: number }>();
  raw.forEach((h, i) => {
    const m = h.match(/^(.*)_(Tồn kho|Có thể bán|Đang giao dịch|Đang về kho)$/);
    if (!m) return;
    const g = groups.get(m[1]) ?? { stock: -1, avail: -1, trans: -1, inc: -1 };
    if (m[2] === "Tồn kho") g.stock = i; else if (m[2] === "Có thể bán") g.avail = i; else if (m[2] === "Đang giao dịch") g.trans = i; else g.inc = i;
    groups.set(m[1], g);
  });
  if (skuCol < 0 || groups.size < 2) return null;
  const nameCol = head.indexOf("ten san pham"), pidCol = head.indexOf("id san pham"), priceCol = head.indexOf("gia"), costCol = head.indexOf("gia von");
  const money = (v: unknown) => { const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };   // "4,000,000" → 4000000
  const nameOf = new Map<string, string>();   // tên chỉ ghi ở dòng đầu của mỗi sản phẩm → điền cho các phiên bản còn lại theo Id sản phẩm
  for (const r of grid.slice(1)) { const pid = pidCol >= 0 ? String(r[pidCol] ?? "").trim() : ""; const n = nameCol >= 0 ? String(r[nameCol] ?? "").trim() : ""; if (pid && n && !nameOf.has(pid)) nameOf.set(pid, n); }
  const num = (v: unknown) => { if (typeof v === "number") return v; const t = String(v ?? "").trim(); return /^-?[\d.,]+$/.test(t) ? Number(t.replace(/,/g, "")) : null; };   // file lưu số dạng chữ ("14", "1,200"); "Chưa quản lý kho" → null
  const rows: InventoryRow[] = [];
  const skus = new Map<string, { code: string; name: string; cost: number | null; price: number | null }>();
  let skipped = 0;
  for (const r of grid.slice(1)) {
    const sku = String(r[skuCol] ?? "").trim().toUpperCase();
    if (!sku) continue;
    const code = spuOf(sku);
    if (!code) { skipped += 1; continue; }
    if (skus.has(sku)) continue;   // SKU trùng dòng: lấy dòng đầu
    const pid = pidCol >= 0 ? String(r[pidCol] ?? "").trim() : "";
    const name = (nameCol >= 0 && String(r[nameCol] ?? "").trim()) || (pid && nameOf.get(pid)) || "";
    skus.set(sku, { code, name: String(name).slice(0, 200), cost: costCol >= 0 ? money(r[costCol]) : null, price: priceCol >= 0 ? money(r[priceCol]) : null });
    for (const [wh, g] of groups) {
      const st = g.stock >= 0 ? num(r[g.stock]) : null, av = g.avail >= 0 ? num(r[g.avail]) : null, tr = g.trans >= 0 ? num(r[g.trans]) : null, inc = g.inc >= 0 ? num(r[g.inc]) : null;
      const stock = Math.max(0, Math.round(st ?? 0)), incoming = Math.max(0, Math.round(inc ?? 0)), inTransit = Math.max(0, Math.round(tr ?? 0)), available = av === null ? null : Math.round(av);
      if (!stock && !incoming && !inTransit && !available) continue;
      rows.push({ sku, code, warehouse: wh, stock, lastIn: null, incoming, available, inTransit });
    }
  }
  return { rows, skus: [...skus].map(([sku, v]) => ({ sku, code: v.code, name: v.name, cost: v.cost, price: v.price })), hasCost: costCol >= 0, hasPrice: priceCol >= 0, skipped, headers: raw.filter(Boolean).slice(0, 30), missing: [], sheet: "Sheet0", format: "products", warehouses: [...groups.keys()] };
}

// Đọc BẢNG TÍNH (đã chuyển thành lưới ô) → tồn kho. Dùng được cả ở trình duyệt (file lớn đọc ngay trên máy người dùng rồi chỉ gửi dữ liệu gọn) lẫn ở máy chủ.
export function parseInventoryGrid(grid: unknown[][], sheet: string): ParsedInventory {
  const prod = parseProducts(grid);
  if (prod) return prod;
  const wide = parseWide(grid, sheet);
  if (wide) return wide;

  // Hàng tiêu đề = hàng đầu tiên (trong 10 hàng đầu) nhận ra được nhiều cột nhất
  const score = (r: unknown[]) => Object.values(COLUMN_ALIASES).filter((al) => r.some((c) => (al as readonly string[]).includes(norm(c)))).length;
  let h = 0;
  for (let i = 0; i < Math.min(10, grid.length); i++) if (score(grid[i]) > score(grid[h])) h = i;
  const head = (grid[h] ?? []).map((c) => String(c ?? "").trim());
  const idx = (col: keyof typeof COLUMN_ALIASES) => head.findIndex((c) => (COLUMN_ALIASES[col] as readonly string[]).includes(norm(c)));
  const at = { code: idx("code"), warehouse: idx("warehouse"), stock: idx("stock"), lastIn: idx("lastIn"), incoming: idx("incoming") };
  const missing = REQUIRED.filter((c) => at[c] < 0).map((c) => COLUMN_LABELS[c]);
  if (missing.length) return { rows: [], skus: [], skipped: 0, headers: head.filter(Boolean), missing, sheet, format: "list", warehouses: [] };

  // Gộp theo (mã SPU, kho): cộng tồn các dòng trùng, lấy ngày nhập gần nhất
  const agg = new Map<string, InventoryRow>();
  let skipped = 0;
  for (const r of grid.slice(h + 1)) {
    if (!r.some((c) => c !== "" && c !== null)) continue;   // dòng trống
    const sku = String(r[at.code] ?? "").trim().toUpperCase();
    const code = spuOf(sku);
    const warehouse = String(r[at.warehouse] ?? "").trim();
    const n = typeof r[at.stock] === "number" ? (r[at.stock] as number) : Number(String(r[at.stock] ?? "").replace(/[.\s]/g, "").replace(",", "."));
    if (!sku || !code || !warehouse || !Number.isFinite(n) || n < 0) { skipped += 1; continue; }
    const lastIn = at.lastIn >= 0 ? toDate(r[at.lastIn]) : null;
    const inc = at.incoming >= 0 ? Math.max(0, Math.round(Number(String(r[at.incoming] ?? "").replace(/[.\s]/g, "").replace(",", ".")) || 0)) : 0;
    const k = `${sku}\u0000${warehouse}`, cur = agg.get(k);
    if (cur) { cur.stock += Math.round(n); cur.incoming += inc; if (lastIn && (!cur.lastIn || lastIn > cur.lastIn)) cur.lastIn = lastIn; }
    else agg.set(k, { sku, code, warehouse, stock: Math.round(n), lastIn, incoming: inc, available: null });
  }
  return { rows: [...agg.values()], skus: [...new Map([...agg.values()].map((r) => [r.sku, r.code])).entries()].map(([sku, code]) => ({ sku, code })), skipped, headers: head.filter(Boolean), missing: [], sheet, format: "list", warehouses: [...new Set([...agg.values()].map((r) => r.warehouse))] };
}
