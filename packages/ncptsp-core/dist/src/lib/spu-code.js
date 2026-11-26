"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSpuCode = exports.spuOf = exports.SPU_SHAPE = void 0;
exports.isNonProduct = isNonProduct;
exports.groupOfProduct = groupOfProduct;
// Tách mã SPU từ SKU — hàm thuần, dùng chung (nhập tồn kho, nhập số bán, gắn mã SPU, khai báo mã).
// SKU Sapo = mã SPU + đuôi biến thể cách nhau bởi "-": B0049-50-S-WH → B0049 · D401088-V → D401088 · MM03-1 → MM03 · mã không có "-" thì SPU = chính nó.
// Chỉ chuẩn hoá nhẹ (bỏ "#", cắt khoảng trắng đầu / cuối, chữ HOA); khoảng trắng GIỮA mã được giữ vì có SKU thật như "N600100 0".
exports.SPU_SHAPE = /^[A-Z]{1,4}[0-9]{3,}$/; // mã SPU thật (hàng thương mại); mã khác (MATRUNGGIANBAC, H002, MM03…) vẫn tách được nhưng không khớp dạng này
const spuOf = (sku) => String(sku ?? "").replace(/^#/, "").trim().toUpperCase().split("-")[0].trim();
exports.spuOf = spuOf;
const isSpuCode = (code) => exports.SPU_SHAPE.test(code);
exports.isSpuCode = isSpuCode;
const fold = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const KEYWORDS = [
    [/(^|\s)(set|combo|bo trang suc)(\s|$)/, "Set"], [/day chuyen/, "Dây chuyền"], [/nhan/, "Nhẫn"], [/lac tay|lac chan/, "Lắc tay"], [/vong co/, "Kiềng"], [/vong tay|vong chan|vong dau|(^|\s)vong(\s|$)/, "Vòng tay"],
    [/bong tai|khuyen tai|hoa tai/, "Bông tai"], [/kieng/, "Kiềng"], [/mat day|mat chuyen/, "Mặt dây"],
];
const PREFIX_GROUP = [
    [/^N[0-9]/, "Nhẫn"], [/^NM[0-9]/, "Nhẫn"], [/^NT[0-9]/, "Nhẫn"], [/^D[0-9]/, "Dây chuyền"], [/^DT[0-9]/, "Dây chuyền"], [/^L[0-9]/, "Lắc tay"], [/^LT[0-9]/, "Lắc tay"],
    [/^B[0-9]/, "Bông tai"], [/^BT[0-9]/, "Bông tai"], [/^K[0-9]/, "Kiềng"], [/^M[0-9]/, "Mặt dây"], [/^V[0-9]/, "Vòng tay"], [/^S[0-9]/, "Set"],
];
// Mã KHÔNG phải sản phẩm trang sức — loại khỏi mọi thống kê SPU: hộp, nước rửa bạc, khăn lau bạc, bộ đo ni, công cụ / dụng cụ, giấy đảm bảo vàng bạc, đánh sáng, mã trung gian (MATRUNGGIANBAC…).
// Nhận theo TÊN (cụm đặc trưng ở bất kỳ đâu; "hộp" chỉ khi mở đầu tên, sau các nhãn trong ngoặc như "(Dừng bán)") và theo mã trung gian.
const NON_PRODUCT_NAME = /nuoc rua bac|khan lau bac|bo do ni|cong cu|dung cu|giay dam bao|trung gian|(^|\s)danh sang(\s|$)/;
function isNonProduct(name, code) {
    if (/TRUNGGIAN/i.test(code))
        return true;
    const t = fold(String(name ?? "")).replace(/^(\s*[\(\[][^\)\]]*[\)\]])+\s*/, "").trim();
    return NON_PRODUCT_NAME.test(t) || /^hop(\s|$)/.test(t);
}
function groupOfProduct(name, code) {
    const t = fold(String(name ?? "")).replace(/^(\s*[\(\[][^\)\]]*[\)\]])+\s*/, "");
    let best = null;
    for (const [re, g] of KEYWORDS) {
        const m = re.exec(t);
        if (m && (best === null || m.index < best.at))
            best = { at: m.index, g };
    }
    if (best)
        return best.g;
    return PREFIX_GROUP.find(([re]) => re.test(code))?.[1] ?? "Khác";
}
