"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseProductGrids = parseProductGrids;
exports.detectSplits = detectSplits;
exports.imageRows = imageRows;
const spu_code_1 = require("@/lib/spu-code");
const norm = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const SKU_ALIASES = ["ma sku", "sku", "ma phien ban", "ma hang", "ma spu", "spu", "ma sp", "ma san pham", "ma"];
const VARIANT_IMG = ["anh phien ban", "hinh phien ban", "image variant"];
const MAIN_IMG = ["anh dai dien", "anh", "hinh anh", "link anh", "url anh", "anh san pham", "image", "image url", "image src", "hinh"];
const PRODUCT_ID = ["id san pham", "product id", "id sp"];
const PRODUCT_NAME = ["ten san pham", "ten sp", "san pham", "title", "name"];
const findCol = (headers, aliases) => {
    for (const a of aliases) {
        const i = headers.indexOf(a);
        if (i >= 0)
            return i;
    }
    return -1;
};
function parseProductGrids(sheets) {
    for (const { name: sheet, grid } of sheets) {
        let h = -1, headers = [];
        for (let i = 0; i < Math.min(grid.length, 15); i++) { // dòng tiêu đề: trong 15 dòng đầu, có cột mã và cột ảnh
            const hs = (grid[i] ?? []).map(norm);
            if (findCol(hs, SKU_ALIASES) >= 0 && (findCol(hs, VARIANT_IMG) >= 0 || findCol(hs, MAIN_IMG) >= 0)) {
                h = i;
                headers = hs;
                break;
            }
        }
        if (h < 0)
            continue;
        const cSku = findCol(headers, SKU_ALIASES), cVar = findCol(headers, VARIANT_IMG), cMain = findCol(headers, MAIN_IMG);
        const cId = findCol(headers, PRODUCT_ID), cName = findCol(headers, PRODUCT_NAME);
        const items = [];
        const nameOfProduct = new Map(); // file Sapo chỉ ghi tên ở dòng đầu của mỗi sản phẩm
        let total = 0, bad = 0, lastName = "";
        for (const row of grid.slice(h + 1)) {
            const sku = String(row[cSku] ?? "").trim();
            if (!sku)
                continue;
            total++;
            const pid = cId >= 0 ? String(row[cId] ?? "").trim() : "";
            const nm = cName >= 0 ? String(row[cName] ?? "").trim() : "";
            if (nm) {
                lastName = nm;
                if (pid)
                    nameOfProduct.set(pid, nm);
            }
            const raw = String((cVar >= 0 ? row[cVar] : "") || "").trim() || (cMain >= 0 ? String(row[cMain] ?? "").trim() : "");
            let url = raw;
            if (url && (!/^https?:\/\//i.test(url) || url.length > 1000)) {
                bad++;
                url = "";
            }
            items.push({ sku, productId: pid, name: nm || (pid ? nameOfProduct.get(pid) ?? "" : lastName), url });
        }
        // Tên dòng tiếp theo của sản phẩm có thể xuất hiện sau dòng đầu → điền lại theo mã sản phẩm
        for (const it of items)
            if (!it.name && it.productId)
                it.name = nameOfProduct.get(it.productId) ?? "";
        return { items, totalRows: total, badLinks: bad, hasProductId: cId >= 0, headers: headers.filter(Boolean), missing: [], sheet };
    }
    const first = sheets[0]?.grid[0] ?? [];
    return { items: [], totalRows: 0, badLinks: 0, hasProductId: false, headers: first.map(String).filter(Boolean), missing: ["Mã SKU / Mã SPU", "Ảnh đại diện hoặc Ảnh phiên bản (link ảnh)"], sheet: sheets[0]?.name ?? "" };
}
// So sánh 2 tên có cùng sản phẩm không: bỏ nhãn đầu "(BHDB)", "(Dừng bán)", "(CHẾ TÁC)"…, bỏ số (size, kích thước), mã HK… và chất liệu "S925" rồi lấy tỉ lệ từ trùng so với tên NGẮN hơn.
// Trùng trên 50% → cùng một mẫu (vd "Nhẫn 1 hàng đá full - new" và "… - new - 7"); ít trùng → sản phẩm khác (vd "Nhẫn trái tim hở" và "Nhẫn tàng hình S925 đính đá CZ xanh lá")
const words = (n) => new Set(norm(n.replace(/^(\s*[(\[][^)\]]*[)\]])+\s*/, "")).split(" ").filter((w) => w && !/^\d+(mm|li|cm|k)?$/.test(w) && !/^(hk|3d)\d+$/.test(w) && w !== "s925"));
const sameProduct = (a, b) => {
    const x = words(a), y = words(b);
    if (!x.size || !y.size)
        return true; // thiếu tên → không đủ căn cứ để tách
    let hit = 0;
    for (const w of x)
        if (y.has(w))
            hit++;
    return hit / Math.min(x.size, y.size) > 0.5;
};
function detectSplits(items) {
    const byCode = new Map();
    for (const it of items) {
        const c = (0, spu_code_1.spuOf)(it.sku);
        if (c)
            (byCode.get(c) ?? byCode.set(c, []).get(c)).push(it);
    }
    const out = [];
    for (const [code, list] of byCode) {
        const base = list.filter((i) => i.sku.toUpperCase() === code);
        const num = list.filter((i) => new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d{1,2}$`, "i").test(i.sku));
        if (!base.length || !num.length)
            continue;
        const baseIds = new Set(base.map((i) => i.productId).filter(Boolean));
        if (!baseIds.size || num.some((i) => !i.productId || baseIds.has(i.productId)))
            continue; // cùng sản phẩm Sapo (hoặc thiếu mã sản phẩm) → không tách
        const baseName = base[0].name, splitName = num[0].name;
        if (sameProduct(baseName, splitName))
            continue; // tên giống nhau → coi là cùng một mẫu
        out.push({ code, newCode: `${code}X`, skus: num.map((i) => i.sku.toUpperCase()), baseName, splitName });
    }
    return out;
}
// Thứ tự ưu tiên khi chọn SKU đại diện của SPU (lấy tên + ảnh): SKU gốc (mã = SPU) → "-00…" → SKU chuẩn "-NN-S-WH" (từng size) → SKU CHẾ TÁC theo đơn ("-C001", hoặc tên có "(CHẾ TÁC)") cuối cùng,
// vì SKU chế tác là đơn riêng lẻ của khách, tên / ảnh không đại diện cho mẫu (vd N0001: "-05…-09" là nhẫn Moissanite 6.5li, "-C001…" là các đơn chế tác).
const skuRank = (sku, code, name) => /-C\d+/.test(sku) || /^\s*[(\[]\s*che\s*tac/i.test(norm(name)) ? 3 : sku === code ? 0 : /-00(-|$)/.test(sku) ? 1 : 2;
// Mỗi SPU một ảnh: ưu tiên SKU gốc (mã = SPU, rồi "-00…"), sau đó SKU đầu tiên có ảnh. Mã SPU theo bảng thay thế (SKU đã tách) trước, mặc định cắt theo dấu "-"
function imageRows(items, overrides) {
    const best = new Map();
    const bestName = new Map(); // tên sản phẩm Sapo của SKU gốc (cùng thứ tự ưu tiên với ảnh)
    const spus = new Set();
    for (const it of items) {
        const code = overrides.get(it.sku.toUpperCase()) ?? (0, spu_code_1.spuOf)(it.sku);
        if (!code)
            continue;
        spus.add(code);
        const up = it.sku.toUpperCase();
        const rank = skuRank(up, code, it.name);
        if (it.name) {
            const n = bestName.get(code);
            if (!n || rank < n.rank)
                bestName.set(code, { name: it.name.trim().slice(0, 300), rank });
        }
        if (!it.url)
            continue;
        const cur = best.get(code);
        if (!cur || rank < cur.rank)
            best.set(code, { url: it.url, sku: it.sku, rank });
    }
    const rows = [...spus].flatMap((code) => {
        const img = best.get(code), nm = bestName.get(code);
        return img || nm ? [{ code, url: img?.url ?? null, name: nm?.name ?? null, sku: img?.sku ?? "" }] : [];
    });
    const withImage = rows.filter((r) => r.url).length;
    return { rows, spus: spus.size, withImage, withoutImage: spus.size - withImage, withName: rows.filter((r) => r.name).length };
}
