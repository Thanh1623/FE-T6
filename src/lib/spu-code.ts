// Tách mã SPU từ SKU — hàm thuần, dùng chung (nhập tồn kho, nhập số bán, gắn mã SPU, khai báo mã).
// SKU Sapo = mã SPU + đuôi biến thể cách nhau bởi "-": B0049-50-S-WH → B0049 · D401088-V → D401088 · MM03-1 → MM03 · mã không có "-" thì SPU = chính nó.
// Chỉ chuẩn hoá nhẹ (bỏ "#", cắt khoảng trắng đầu / cuối, chữ HOA); khoảng trắng GIỮA mã được giữ vì có SKU thật như "N600100 0".
export const SPU_SHAPE = /^[A-Z]{1,4}[0-9]{3,}$/;   // mã SPU thật (hàng thương mại); mã khác (MATRUNGGIANBAC, H002, MM03…) vẫn tách được nhưng không khớp dạng này

export const spuOf = (sku: unknown) => String(sku ?? "").replace(/^#/, "").trim().toUpperCase().split("-")[0].trim();
export const isSpuCode = (code: string) => SPU_SHAPE.test(code);

// Nhóm hàng của 1 SPU: theo TÊN sản phẩm (từ khoá xuất hiện SỚM nhất trong tên, bỏ các nhãn trong ngoặc đầu tên như "(Dừng bán)", "(BHDB)");
// tên không khớp thì theo tiền tố mã (N, D, L, B, K, M, V, S và các tiền tố cũ DT, BT, LT, NM, NT); vẫn không khớp → "Khác" (hộp, khăn lau, đá rời, charm, mã trung gian…).
export type ProductGroup = "Nhẫn" | "Dây chuyền" | "Lắc tay" | "Bông tai" | "Kiềng" | "Mặt dây" | "Vòng tay" | "Set" | "Khác";
const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const KEYWORDS: [RegExp, ProductGroup][] = [
  [/(^|\s)(set|combo|bo trang suc)(\s|$)/, "Set"], [/day chuyen/, "Dây chuyền"], [/nhan/, "Nhẫn"], [/lac tay|lac chan/, "Lắc tay"], [/vong co/, "Kiềng"], [/vong tay|vong chan|vong dau|(^|\s)vong(\s|$)/, "Vòng tay"],
  [/bong tai|khuyen tai|hoa tai/, "Bông tai"], [/kieng/, "Kiềng"], [/mat day|mat chuyen/, "Mặt dây"],
];
const PREFIX_GROUP: [RegExp, ProductGroup][] = [
  [/^N[0-9]/, "Nhẫn"], [/^NM[0-9]/, "Nhẫn"], [/^NT[0-9]/, "Nhẫn"], [/^D[0-9]/, "Dây chuyền"], [/^DT[0-9]/, "Dây chuyền"], [/^L[0-9]/, "Lắc tay"], [/^LT[0-9]/, "Lắc tay"],
  [/^B[0-9]/, "Bông tai"], [/^BT[0-9]/, "Bông tai"], [/^K[0-9]/, "Kiềng"], [/^M[0-9]/, "Mặt dây"], [/^V[0-9]/, "Vòng tay"], [/^S[0-9]/, "Set"],
];
// Mã KHÔNG phải sản phẩm trang sức — loại khỏi mọi thống kê SPU: hộp, nước rửa bạc, khăn lau bạc, bộ đo ni, công cụ / dụng cụ, giấy đảm bảo vàng bạc, đánh sáng, mã trung gian (MATRUNGGIANBAC…).
// Nhận theo TÊN (cụm đặc trưng ở bất kỳ đâu; "hộp" chỉ khi mở đầu tên, sau các nhãn trong ngoặc như "(Dừng bán)") và theo mã trung gian.
const NON_PRODUCT_NAME = /nuoc rua bac|khan lau bac|bo do ni|cong cu|dung cu|giay dam bao|trung gian|(^|\s)danh sang(\s|$)/;
export function isNonProduct(name: string | null | undefined, code: string): boolean {
  if (/TRUNGGIAN/i.test(code)) return true;
  const t = fold(String(name ?? "")).replace(/^(\s*[\(\[][^\)\]]*[\)\]])+\s*/, "").trim();
  return NON_PRODUCT_NAME.test(t) || /^hop(\s|$)/.test(t);
}

export function groupOfProduct(name: string | null | undefined, code: string): ProductGroup {
  const t = fold(String(name ?? "")).replace(/^(\s*[\(\[][^\)\]]*[\)\]])+\s*/, "");
  let best: { at: number; g: ProductGroup } | null = null;
  for (const [re, g] of KEYWORDS) { const m = re.exec(t); if (m && (best === null || m.index < best.at)) best = { at: m.index, g }; }
  if (best) return best.g;
  return PREFIX_GROUP.find(([re]) => re.test(code))?.[1] ?? "Khác";
}
