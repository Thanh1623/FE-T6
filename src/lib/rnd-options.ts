// Danh sách lựa chọn của các ô chọn trong bộ bảng R&D (giống "trường chọn" của Lark).
// Lưu ở core.settings key "rnd_options"; thiếu key nào thì dùng mặc định dưới đây. Dùng chung server + client.

export type OptionFlag = "done" | "media" | "cancel" | "draft";

// Màu nhãn (giống Lark): 1–10 nền đậm chữ trắng, 11–18 nền nhạt chữ đậm. Số cũ 1–8 vẫn dùng được.
export const CHIP_COLORS: Record<number, { bg: string; fg: string; name: string }> = {
  1: { bg: "#1456F0", fg: "#FFFFFF", name: "Xanh dương" },
  2: { bg: "#2EA121", fg: "#FFFFFF", name: "Xanh lá" },
  3: { bg: "#ED6D0C", fg: "#FFFFFF", name: "Cam" },
  4: { bg: "#7F3BF5", fg: "#FFFFFF", name: "Tím" },
  5: { bg: "#F54A45", fg: "#FFFFFF", name: "Đỏ" },
  6: { bg: "#B42318", fg: "#FFFFFF", name: "Đỏ sẫm" },
  7: { bg: "#D83B95", fg: "#FFFFFF", name: "Hồng" },
  8: { bg: "#8F959E", fg: "#FFFFFF", name: "Xám" },
  9: { bg: "#0E9F9F", fg: "#FFFFFF", name: "Xanh ngọc" },
  10: { bg: "#C99400", fg: "#FFFFFF", name: "Vàng" },
  11: { bg: "#C2EFF0", fg: "#0B5C61", name: "Ngọc nhạt" },
  12: { bg: "#DCE5FB", fg: "#1D3A82", name: "Xanh nhạt" },
  13: { bg: "#D6F2D2", fg: "#1D6A17", name: "Lá nhạt" },
  14: { bg: "#FDE6CC", fg: "#8A4508", name: "Cam nhạt" },
  15: { bg: "#E9DEFD", fg: "#4A1F96", name: "Tím nhạt" },
  16: { bg: "#FBDCDC", fg: "#9F1D1A", name: "Đỏ nhạt" },
  17: { bg: "#F8EDC4", fg: "#6E5200", name: "Vàng nhạt" },
  18: { bg: "#E8E9EB", fg: "#3A3F47", name: "Xám nhạt" },
};
export const chipColor = (n?: number) => CHIP_COLORS[n ?? 18] ?? CHIP_COLORS[18];
export type Opt = { value: string; color?: number; flag?: OptionFlag };   // color = số màu trong CHIP_COLORS

export const OPTION_KEYS = {
  line: "Dòng SP",
  material: "Chất liệu",
  stone: "Loại đá",
  color: "Màu sắc (xi)",
  unit: "Đơn vị tính",
  supplier: "Nhà cung cấp / xưởng",
  ref_platform: "Nguồn tham khảo",
  source_status: "Source",
  order_status: "Trạng thái đặt hàng / sản xuất",
  media_type: "Yêu cầu nội dung (media)",
  kill_reason: "Lý do kill",
  review: "Đánh giá hiệu quả",
} as const;
export type OptionKey = keyof typeof OPTION_KEYS;
export type RndOptions = Record<OptionKey, Opt[]>;

// Màu xen kẽ đậm / nhạt cho danh sách dài (dễ phân biệt)
const CYCLE = [1, 13, 3, 15, 9, 16, 4, 12, 7, 14, 2, 17];
const o = (values: string[]) => values.map((value, i) => ({ value, color: CYCLE[i % CYCLE.length] }));

export const DEFAULT_OPTIONS: RndOptions = {
  line: o(["Nhẫn", "Dây chuyền", "Lắc", "Mặt dây", "Bông tai", "Kiềng", "Charm"]),
  material: o(["Bạc S925", "Bạc S999", "Vàng 10K", "Vàng 14K", "Vàng 18K"]),
  stone: o(["Moissanite", "CZ", "Sapphire", "Ruby", "Aquamarine", "Ngọc trai", "Thạch anh", "Không đá"]),
  color: o(["Xi vàng trắng", "Xi vàng vàng", "Xi vàng hồng"]),
  unit: o(["Chiếc", "Đôi", "Bộ"]),
  supplier: o(["ENSHIDO"]),
  ref_platform: o(["Instagram", "Facebook", "TikTok", "Douyin", "Pinterest", "Etsy", "Shopee", "Website", "Khác"]),
  source_status: [{ value: "Chưa có", color: 18 }, { value: "Đã có source", color: 2 }],
  order_status: [
    { value: "Chưa đặt", color: 18, flag: "draft" }, { value: "Đã đặt hàng", color: 4 },   // đã có sẵn 3D nên đặt xưởng = chốt đúc luôn (tên cũ "Chốt đúc")
    { value: "Hoàn thành mẫu", color: 1, flag: "done" },
    { value: "Huỷ", color: 8, flag: "cancel" },
  ],
  media_type: o(["Quay video trên tay", "Quay chế tác", "Quay sản phẩm", "Chụp sản phẩm", "Quay review"]),
  kill_reason: o(["Trùng mẫu", "Giá vốn cao", "Khó sản xuất", "3D không đạt", "Không có nguồn đá", "Traffic thấp", "Khác"]),
  review: [{ value: "Tốt", color: 2 }, { value: "Trung bình", color: 3 }, { value: "Kém", color: 5 }],
};

export const optionValues = (opts: Opt[]) => opts.map((x) => x.value);
// Đơn NHÁP: hệ thống tự tạo khi 3D đạt — chưa đặt xưởng. Đặt xưởng thật (có NCC) = "Đã đặt hàng" (cũ: "Chốt đúc" — đã có 3D sẵn nên đặt hàng là chốt đúc luôn)
export const DRAFT_ORDER = "Chưa đặt";
// Tên cũ → tên mới (cho tới khi chạy migration 096): "Đặt hàng" chính là đơn nháp → "Chưa đặt"; "Chốt đúc" → "Đã đặt hàng"; "Hoàn thành" → "Hoàn thành mẫu"
export const PLACED_ORDER = "Đã đặt hàng";
export const normOrderStatus = (s: string) => (s === "Đặt hàng" ? DRAFT_ORDER : s === "Chốt đúc" ? PLACED_ORDER : s === "Hoàn thành" ? "Hoàn thành mẫu" : s);
export const draftStatuses = (opts: Opt[]) => { const d = flagged(opts, "draft"); return d.length ? d : [DRAFT_ORDER]; };
export const flagged = (opts: Opt[], flag: OptionFlag) => opts.filter((x) => x.flag === flag).map((x) => x.value);
