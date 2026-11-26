"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SALES_LABELS = exports.SALES_ALIASES = void 0;
exports.parseSales = parseSales;
require("server-only");
const XLSX = __importStar(require("xlsx"));
const spu_code_1 = require("@/lib/spu-code");
const norm = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
exports.SALES_ALIASES = {
    orderId: ["ma don hang", "ma don", "so don hang"],
    date: ["ngay dat hang", "ngay dat", "ngay tao don", "ngay tao"],
    branch: ["chi nhanh", "kho", "kho xuat"],
    source: ["nguon", "kenh ban", "kenh"],
    status: ["trang thai don hang", "trang thai"],
    sku: ["ma sku", "sku", "ma san pham", "ma hang"],
    price: ["gia san pham", "don gia", "gia ban", "gia"],
    qty: ["so luong san pham", "so luong", "sl"],
    tags: ["tags", "tag"],
    staff: ["nhan vien phu trach", "nhan vien", "nguoi phu trach"],
    ship: ["trang thai giao hang", "trang thai van chuyen"],
    ret: ["trang thai tra hang"],
    refund: ["trang thai hoan tra"],
    delivered: ["ngay giao hang thanh cong", "ngay giao thanh cong", "ngay giao hang", "ngay giao"],
};
exports.SALES_LABELS = { orderId: "Mã đơn hàng", date: "Ngày đặt hàng", sku: "Mã SKU", qty: "Số lượng sản phẩm" };
const REQUIRED = ["orderId", "date", "sku", "qty"];
const money = (v) => {
    const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, ""));
    return Number.isFinite(n) ? Math.round(n) : 0;
};
// "26-10-2026 09:40" · "26/10/2026" · "2026-10-26 09:40" · số ngày của Excel → ISO giờ VN
function toIso(v) {
    if (v === null || v === undefined || v === "")
        return null;
    if (typeof v === "number" && v > 20000 && v < 80000) {
        const d = new Date(Math.round((v - 25569) * 86400 * 1000));
        return `${d.toISOString().slice(0, 10)}T${d.toISOString().slice(11, 16)}:00+07:00`;
    }
    const s = String(v).trim();
    const time = (m, i) => (m && m[i] ? `${m[i].padStart(2, "0")}:${(m[i + 1] ?? "00").padStart(2, "0")}` : "00:00");
    let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (m)
        return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T${time(m, 4)}:00+07:00`;
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (m)
        return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T${time(m, 4)}:00+07:00`;
    return null;
}
function parseSales(buf) {
    // .xlsx bắt đầu "PK", .xls cũ bắt đầu D0 CF; còn lại là CSV / văn bản (đọc UTF-8, bỏ BOM)
    const binary = (buf[0] === 0x50 && buf[1] === 0x4b) || (buf[0] === 0xd0 && buf[1] === 0xcf);
    const wb = binary ? XLSX.read(buf, { type: "buffer", cellDates: false }) : XLSX.read(new TextDecoder("utf-8").decode(buf).replace(/^﻿/, ""), { type: "string", cellDates: false });
    const sheet = wb.SheetNames[0];
    const empty = { lines: [], skippedInvalid: 0, giftLines: 0, refundLines: 0, otherQty: 0, otherCodes: 0, headers: [], missing: [...REQUIRED].map((k) => exports.SALES_LABELS[k]), orders: 0, codes: 0, from: null, to: null, qty: 0, cancelledLines: 0 };
    if (!sheet)
        return empty;
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: "", raw: false });
    // Hàng tiêu đề = hàng (trong 15 hàng đầu) nhận ra nhiều cột nhất
    const score = (r) => Object.values(exports.SALES_ALIASES).filter((al) => r.some((c) => al.includes(norm(c)))).length;
    let h = 0;
    for (let i = 0; i < Math.min(15, grid.length); i++)
        if (score(grid[i]) > score(grid[h]))
            h = i;
    const head = (grid[h] ?? []).map((c) => String(c ?? "").trim());
    const idx = (k) => head.findIndex((c) => exports.SALES_ALIASES[k].includes(norm(c)));
    const at = { orderId: idx("orderId"), date: idx("date"), branch: idx("branch"), source: idx("source"), status: idx("status"), sku: idx("sku"), price: idx("price"), qty: idx("qty"), tags: idx("tags"), staff: idx("staff"), delivered: idx("delivered"), ship: idx("ship"), ret: idx("ret"), refund: idx("refund") };
    const missing = REQUIRED.filter((k) => at[k] < 0).map((k) => exports.SALES_LABELS[k]);
    if (missing.length)
        return { ...empty, headers: head.filter(Boolean), missing };
    const lines = [];
    const seen = new Map(); // đơn|SKU → số lần đã gặp (thứ tự dòng cùng SKU trong đơn)
    let skippedInvalid = 0, cancelledLines = 0, giftLines = 0, refundLines = 0;
    const orders = new Set(), codes = new Set();
    for (const r of grid.slice(h + 1)) {
        const orderId = String(r[at.orderId] ?? "").trim();
        const sku = String(r[at.sku] ?? "").trim().toUpperCase();
        if (!orderId && !sku)
            continue; // dòng trống / dòng đệm cuối file
        const code = (0, spu_code_1.spuOf)(sku); // mã khác SPU (MATRUNGGIANBAC, H002…) vẫn được lưu
        const orderedAt = toIso(r[at.date]);
        const rawQty = Math.max(0, Math.round(Number(String(r[at.qty] ?? "0").replace(/[^\d.-]/g, "")) || 0));
        const price = at.price >= 0 ? money(r[at.price]) : 0;
        if (!orderId || !orderedAt || !sku) {
            skippedInvalid += 1;
            continue;
        } // thiếu mã đơn / ngày / SKU
        const status = at.status >= 0 ? String(r[at.status] ?? "").trim() || null : null;
        const cancelled = /da huy/.test(norm(status ?? ""));
        // Sapo xuất SL đã TRỪ HOÀN: đơn hoàn hết hàng có SL = 0 (và tiền = 0) dù đơn không bị huỷ. "Bán 30 ngày" KHÔNG trừ hoàn (như Lark) → dòng có giá, SL = 0, không phải đơn huỷ tính 1 sản phẩm
        const refunded = rawQty === 0 && price > 0 && !cancelled;
        const qty = refunded ? 1 : rawQty;
        if (refunded)
            refundLines += 1;
        if (at.price >= 0 && price === 0)
            giftLines += 1; // quà tặng / hàng tặng kèm (giá 0): vẫn lưu, số bán SPU loại ra theo giá 0
        const key = `${orderId}|${sku}`, seq = (seen.get(key) ?? 0) + 1;
        seen.set(key, seq);
        if (cancelled)
            cancelledLines += 1;
        lines.push({
            orderId, sku, seq, code, orderedAt, qty, price, status,
            source: at.source >= 0 ? String(r[at.source] ?? "").trim() || null : null,
            branch: at.branch >= 0 ? String(r[at.branch] ?? "").trim() || null : null,
            tags: at.tags >= 0 ? String(r[at.tags] ?? "").trim().slice(0, 1000) || null : null,
            staff: at.staff >= 0 ? String(r[at.staff] ?? "").trim().slice(0, 200) || null : null,
            returnStatus: at.ret >= 0 ? String(r[at.ret] ?? "").trim().slice(0, 60) || null : null,
            refundStatus: at.refund >= 0 ? String(r[at.refund] ?? "").trim().slice(0, 60) || null : null,
            shipStatus: at.ship >= 0 ? String(r[at.ship] ?? "").trim().slice(0, 60) || null : null,
            deliveredAt: at.delivered >= 0 ? toIso(r[at.delivered]) : null,
        });
        orders.add(orderId);
        codes.add(code);
    }
    const days = lines.map((l) => l.orderedAt.slice(0, 10)).sort();
    const cancelled = (l) => /da huy/.test(norm(l.status ?? ""));
    const counted = lines.filter((l) => !cancelled(l) && l.price > 0); // bán thật: không huỷ, không phải quà tặng
    const spuLines = counted.filter((l) => (0, spu_code_1.isSpuCode)(l.code)), otherLines = counted.filter((l) => !(0, spu_code_1.isSpuCode)(l.code));
    return {
        lines, skippedInvalid, giftLines, refundLines, headers: head.filter(Boolean), missing: [], orders: orders.size, codes: new Set(spuLines.map((l) => l.code)).size,
        from: days[0] ?? null, to: days[days.length - 1] ?? null, qty: spuLines.reduce((n, l) => n + l.qty, 0), cancelledLines,
        otherQty: otherLines.reduce((n, l) => n + l.qty, 0), otherCodes: new Set(otherLines.map((l) => l.code)).size,
    };
}
