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
exports.parseReceipts = parseReceipts;
require("server-only");
const XLSX = __importStar(require("xlsx"));
const norm = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ALIAS = {
    po: ["ma don nhap", "ma don", "so don nhap"],
    date: ["ngay nhap", "ngay nhap kho", "ngay nhan"],
    status: ["trang thai nhap", "trang thai"],
    supplier: ["ten nha cung cap", "nha cung cap", "ncc"],
    sku: ["ma sku", "sku", "ma phien ban", "ma hang"],
    qty: ["sl nhap", "so luong nhap", "so luong", "sl"],
};
const find = (hs, names) => { for (const n of names) {
    const i = hs.indexOf(n);
    if (i >= 0)
        return i;
} return -1; };
// Ngày: số seri Excel, ô ngày, "dd/mm/yyyy" hoặc "yyyy-mm-dd"; không đọc được → null
function toDate(v) {
    if (v === null || v === undefined || v === "")
        return null;
    if (typeof v === "number" && v > 20000 && v < 80000)
        return new Date(Math.round(Math.floor(v) - 25569) * 86400 * 1000).toISOString().slice(0, 10);
    if (v instanceof Date)
        return v.toISOString().slice(0, 10);
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m)
        return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
    if (m)
        return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return null;
}
function parseReceipts(buf) {
    const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
    const empty = { rows: [], pending: 0, skipped: 0, from: null, to: null };
    for (const sheet of wb.SheetNames) {
        const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: "", raw: true });
        let h = -1, hs = [];
        for (let i = 0; i < Math.min(grid.length, 20); i++) { // dòng tiêu đề: trong 20 dòng đầu, đủ cột mã đơn + SKU + số lượng + ngày
            const cand = (grid[i] ?? []).map(norm);
            if (find(cand, ALIAS.po) >= 0 && find(cand, ALIAS.sku) >= 0 && find(cand, ALIAS.qty) >= 0 && find(cand, ALIAS.date) >= 0) {
                h = i;
                hs = cand;
                break;
            }
        }
        if (h < 0)
            continue;
        const c = { po: find(hs, ALIAS.po), date: find(hs, ALIAS.date), status: find(hs, ALIAS.status), supplier: find(hs, ALIAS.supplier), sku: find(hs, ALIAS.sku), qty: find(hs, ALIAS.qty) };
        const seq = new Map();
        const rows = [];
        let pending = 0, skipped = 0;
        for (const r of grid.slice(h + 1)) {
            const po = String(r[c.po] ?? "").trim(), sku = String(r[c.sku] ?? "").trim().toUpperCase();
            if (!po && !sku)
                continue; // dòng trống / dòng tiêu đề nhóm
            const status = c.status >= 0 ? norm(r[c.status]) : "da nhap";
            if (/chua nhap|huy/.test(status)) {
                pending++;
                continue;
            }
            const date = toDate(r[c.date]), qty = Math.round(Number(String(r[c.qty] ?? "").replace(/[^\d.-]/g, "")));
            if (!po || !sku || !date || !Number.isFinite(qty) || qty <= 0) {
                skipped++;
                continue;
            }
            const k = `${po}|${sku}`, n = (seq.get(k) ?? 0) + 1;
            seq.set(k, n);
            rows.push({ po, sku, seq: n, receivedOn: date, qty, supplier: c.supplier >= 0 ? String(r[c.supplier] ?? "").trim().slice(0, 200) || null : null });
        }
        const dates = rows.map((x) => x.receivedOn).sort();
        return { rows, pending, skipped, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null, headers: hs.filter(Boolean), missing: [], sheet };
    }
    const first = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]] ?? {}, { header: 1, defval: "", raw: true }).slice(0, 8).flat().map(String).filter(Boolean);
    return { ...empty, headers: first, missing: ["Mã đơn nhập", "Ngày nhập", "Mã SKU", "SL nhập"], sheet: wb.SheetNames[0] ?? "" };
}
