// Trang "Theo dõi hiệu quả SPU": kiểu dữ liệu + quy tắc phân loại (hàm thuần, dùng được ở máy chủ và trình duyệt).
// Dữ liệu thật nạp ở lib/spu-data.ts (tồn kho nhập từ file Sapo, số bán, video gắn mã SPU); ở đây chỉ có cách TÍNH từ một dòng SPU.

import type { KpiRule } from "@/lib/kpi-constants";
import type { First3d } from "@/lib/video-win";

// ---------- Quy tắc phân loại (ngưỡng điều chỉnh được — không viết cứng trong giao diện) ----------
// Quản lý chỉnh ở trang KPI (lưu core.settings 'spu_rules', xem lib/spu-rules.ts): quy tắc Win theo biên bản họp (`win`), phân loại bán (`sales`), Video Win (`video`); phần còn lại chỉnh tại đây.
export const DEFAULT_SPU_RULES = {
  // Phân loại bán THEO SỐ LƯỢNG BÁN 30 NGÀY GẦN NHẤT (SL) (kể cả SPU hết hàng vẫn bán; Tồn xấu chỉ tính SPU còn hàng):
  //   SL < 0 → Khác · SL = 0 → Tồn xấu · SL < slowBelow → Bán chậm · SL < normalBelow → Bán thường · còn lại → Bán chạy
  sales: { slowBelow: 20, normalBelow: 60 },
  // QUY TẮC WIN DUY NHẤT (biên bản họp R&D × ĐVKD 21/10/2026), dùng chung cho Dashboard và trang Theo dõi đẩy hàng — chỉnh ở trang KPI.
  // "Ngày đầu" = bài (video) ĐẦU TIÊN của SPU trong kỳ đang lọc. Win Traffic: lượt xem VÀ bình luận cộng dồn các bài trong `traffic.days` ngày đầu;
  // Win Đơn hàng: số sản phẩm bán (thuần) trong `order.days` ngày kể từ bài đầu tiên; Ngôi sao = đạt cả hai.
  win: { traffic: { days: 3, views: 100_000, comments: 0 }, order: { days: 7, qty: 30 } } as WinRules,   // comments = 0: không xét bình luận (chỉ còn lượt xem trong N ngày); đặt > 0 ở Cài đặt nếu muốn xét lại
  // Video Win: tiêu chí chấm RIÊNG TỪNG VIDEO (chỉ số của chính video đó) — dùng ở danh sách video của mẫu, Đẩy mẫu ĐVKD và ngăn video của SPU
  video: { rules: [{ metric: "views", op: ">=", value: 30000 }, { metric: "viewers", op: ">=", value: 3000 }] as KpiRule[], match: "all" as "all" | "any" },
  // Gợi ý "Đẩy video": còn hàng, tồn nhiều / tồn lâu mà số video còn ít
  // Gợi ý "Cần lên video": còn hàng nhiều (hoặc tồn lâu) mà ít / chưa có video
  push: { minStock: 40, minAgeDays: 60, maxVideos: 2 },
  // Hết / sắp hết hàng: tồn thấp hơn số ngày bán dự trữ (tính theo tốc độ bán 30 ngày) hoặc dưới số lượng tối thiểu
  // minSold: SPU thường (chưa Win) cũng được gợi ý đẩy SX nếu bán từ mức này / 30 ngày mà sắp hết hàng
  restock: { coverDays: 15, minUnits: 10, minSold: 20 },
};
export type WinRules = { traffic: { days: number; views: number; comments: number }; order: { days: number; qty: number } };
// Tập mã SPU đạt từng tiêu chuẩn Win trong kỳ đang lọc (tính ở lib/spu-winflags.ts): wt = Win Traffic, order = Win Đơn hàng; Ngôi sao = đạt cả hai
export type WinFlags = { wt: ReadonlySet<string>; order: ReadonlySet<string> };
export type SpuRules = typeof DEFAULT_SPU_RULES;
export const SPU_RULES: SpuRules = DEFAULT_SPU_RULES;

export const GROUPS = ["Nhẫn", "Dây chuyền", "Lắc tay", "Bông tai", "Kiềng", "Mặt dây", "Vòng tay", "Set", "Khác"] as const;   // "Khác" = hộp, khăn lau, đá rời, charm, mã trung gian…
export type Group = (typeof GROUPS)[number];

// Video gắn mã SPU: đăng cách đây `age` ngày; các trường sau chỉ để liệt kê video (ngăn video, cảnh báo) — lấy từ bài đăng thật
export type SpuVid = { id?: string; channelId?: string; age: number; views: number; title?: string; platform?: "FB" | "IG" | "TT"; channel?: string; team?: string | null; url?: string | null; thumb?: string | null; first3d?: First3d };
// Một dòng bán trong 30 ngày gần nhất: bán cách đây `age` ngày, số lượng, team của đơn (null = chưa gán được; đơn kênh Ads gán cho team "ADS")
export type SpuSale = { age: number; qty: number; team: string | null };
export type SpuRow = {
  code: string; name: string; group: Group; variants: number; image: string | null;
  stockBy: Record<string, number>;           // tồn theo từng kho (tên kho Sapo)
  availBy: Record<string, number> | null;    // "Có thể bán" theo kho (có thể âm); null = chưa nhập file có cột này
  incoming: number;                          // hàng đang về (cột "Đang về kho" của file tồn)
  ageApprox?: boolean;                       // true = có phần tồn không có lô nhập kho trong file đơn nhập (nhập trước ngày đầu file) → tuổi tồn là "≥ N ngày"
  ageDays: number | null;                    // số ngày tồn (TB theo tồn từ ngày lô cũ nhất); null = chưa có dữ liệu tuổi tồn → chưa xếp bán chậm / tồn xấu
  sold30: number | null;                     // bán 30 ngày gần nhất; null = chưa có dữ liệu bán
  sales: SpuSale[];                          // chi tiết số bán 30 ngày (để tính ĐÚNG số bán trong kỳ đang xem và theo team)
  soldBy: Record<string, number>;            // bán 30 ngày theo TEAM (tên team; theo tag trên đơn → kênh → team); đơn không gán được team không có ở đây
  vids: SpuVid[];                            // video gắn đúng mã SPU — lọc theo khoảng ngày đang xem
  footage: number | null;                    // số clip source đã quay; null = chưa có dữ liệu
  teams: string[];                           // team có lên video cho SPU này
};

export type Flags = { active: boolean; inStock: boolean; hot: boolean; normal: boolean; other: boolean; slow: boolean; bad: boolean; star: boolean; win: boolean; winTraffic: boolean; hasVideo: boolean };
export type Action = "produce" | "traffic" | "convert" | "bad" | "shoot" | "video" | "slow" | null;
export const ACTION_LABEL: Record<Exclude<Action, null>, { label: string; hint: string }> = {
  produce: { label: "Đẩy mạnh SX", hint: "Bán tốt nhưng hàng đã hết hoặc sắp hết — nhập / sản xuất bổ sung" },
  traffic: { label: "Đẩy mạnh traffic", hint: "Đang bán mạnh và còn đủ hàng — tăng video, mở rộng kênh để đẩy thêm traffic" },
  convert: { label: "Tối ưu chuyển đổi", hint: "Traffic tốt nhưng bán chưa tương xứng — kiểm tra giá, ưu đãi, nội dung chốt đơn" },
  bad: { label: "Ưu tiên xử lý tồn", hint: "Tồn xấu — cần phương án giải phóng tồn kho" },
  shoot: { label: "Cần quay source", hint: "Còn nhiều hàng nhưng chưa có video và chưa có source — quay source rồi lên video" },
  video: { label: "Cần lên video", hint: "Còn nhiều hàng / tồn lâu nhưng ít hoặc chưa có video — cần lên video" },
  slow: { label: "Theo dõi bán chậm", hint: "Kiểm tra hiệu quả nội dung và lượng bán" },
};

// Cờ theo TỒN và SL bán 30 ngày (không phụ thuộc video / KPI). MỘT công thức dùng chung cho viewOf và đường đọc bảng tổng hợp (lib/spu-query.ts);
// hàm SQL sales.spu_query (migration 060) phải giữ đúng công thức này.
//   Phân loại bán theo SL bán 30 ngày (không quy đổi theo kỳ đang xem), KỂ CẢ SPU hết hàng (Sapo cho bán âm); chưa có số bán (null) thì chưa xếp nhóm nào. Tồn xấu thì phải còn hàng.
//   SPU Active = còn tồn kho, hoặc hết tồn nhưng có phát sinh đơn hàng trong 30 ngày (SL bán 30 ngày > 0).
export function saleFlags(stock: number, sl: number | null, R: SpuRules) {
  const inStock = stock > 0;
  return {
    inStock, active: inStock || (sl !== null && sl > 0),
    other: sl !== null && sl < 0, bad: inStock && sl !== null && sl === 0,
    slow: sl !== null && sl > 0 && sl < R.sales.slowBelow,
    normal: sl !== null && sl >= R.sales.slowBelow && sl < R.sales.normalBelow,
    hot: sl !== null && sl >= R.sales.normalBelow,
  };
}

// Gợi ý hành động (theo thứ tự ưu tiên): cầu mạnh mà hết / sắp hết hàng → đẩy SX · Ngôi sao / Win còn hàng → đẩy traffic ·
// Win Traffic → tối ưu chuyển đổi · tồn xấu → xử lý tồn · tồn nhiều mà ít video → quay / lên video · bán chậm → theo dõi.
// Tách riêng để viewOf và đường đọc bảng tổng hợp SQL (lib/spu-query.ts) dùng CHUNG một công thức (xem docs/KIEN-TRUC-TONG-HOP-SPU.md).
export function actionOf(i: { stock: number; inStock: boolean; sl30: number | null; sold: number | null; videos: number; ageDays: number | null; footage: number | null; days: number;
  flags: Pick<Flags, "star" | "win" | "winTraffic" | "bad" | "slow"> }, R: SpuRules): Action {
  const { stock, inStock, sl30, sold, videos, flags: f } = i;
  const k = i.days / 30;
  const lowStock = stock <= R.restock.minUnits || (sl30 !== null && stock < (sl30 * R.restock.coverDays) / 30);
  const strong = f.star || f.win || (sold !== null && sold >= R.restock.minSold * k);
  return strong && lowStock ? "produce"
    : f.star || f.win ? "traffic"
    : f.winTraffic ? "convert"
    : f.bad ? "bad"
    : inStock && videos <= R.push.maxVideos && (stock >= R.push.minStock || (i.ageDays !== null && i.ageDays >= R.push.minAgeDays)) ? (i.footage === 0 && videos === 0 ? "shoot" : "video")
    : inStock && f.slow ? "slow" : null;
}

// Giá trị của 1 SPU theo bộ lọc hiện tại: tồn theo kho đang chọn, bán / video / lượt xem theo kỳ đang xem (số bán quy đổi tuyến tính từ số 30 ngày)
export type View = { row: SpuRow; stock: number; available: number | null; sold: number | null; videos: number; views: number | null; views3?: number | null; flags: Flags; action: Action };   // views3: lượt xem tăng 3 ngày (migration 101); đường tính trực tiếp không có → để trống

// endAge: kỳ kết thúc cách hôm nay bao nhiêu ngày (0 = tới hôm nay) — khoảng ngày [endAge, endAge + days) tính từ hôm nay lùi về trước
// teams: chỉ tính số bán của các team này (đơn của team khác và đơn kênh Ads không tính); bỏ trống = toàn công ty
export function viewOf(row: SpuRow, opt: { wh: string | null; days: number; endAge?: number; rules?: SpuRules; teams?: string[]; pageIds?: string[]; win?: WinFlags; companyClass?: boolean }): View {
  const end = opt.endAge ?? 0;
  const inWin = row.vids.filter((v) => v.age >= end && v.age < end + opt.days && (!opt.teams?.length || (!!v.team && opt.teams.includes(v.team))) && (!opt.pageIds || (!!v.channelId && opt.pageIds.includes(v.channelId))));   // lọc team: chỉ video của team đó · pageIds: chỉ video của các Page này
  const stock = opt.wh ? row.stockBy[opt.wh] ?? 0 : Object.values(row.stockBy).reduce((a, b) => a + b, 0);
  // Số bán TRONG KỲ đang xem cộng đúng từ từng dòng đơn (không quy đổi từ số 30 ngày); số bán chỉ có 30 ngày gần nhất nên kỳ dài hơn chỉ tính phần đã có dữ liệu
  const teams = opt.teams ?? [];
  const mine = (l: SpuSale) => !teams.length || (l.team !== null && teams.includes(l.team));
  const sold = row.sold30 === null ? null : row.sales.filter((l) => l.age >= end && l.age < end + opt.days && mine(l)).reduce((n, l) => n + l.qty, 0);
  // SL bán 30 ngày (để phân loại bán / Active): toàn công ty, hoặc riêng team đang lọc; companyClass = luôn toàn công ty (trang Theo dõi SPU: lọc team chỉ đổi SL bán / video của team, không đổi phân loại theo tồn)
  const sl30 = row.sold30 === null ? null : teams.length && !opt.companyClass ? row.sales.filter((l) => l.age < 30 && mine(l)).reduce((n, l) => n + l.qty, 0) : row.sold30;
  const videos = inWin.length;                                                              // video đăng TRONG kỳ đang xem
  const views = videos ? inWin.reduce((n, v) => n + v.views, 0) : null;                    // chưa có video trong kỳ → "chưa có dữ liệu", không ghi 0
  const R = opt.rules ?? DEFAULT_SPU_RULES;
  const { inStock, other, bad, slow, normal, hot, active } = saleFlags(stock, sl30, R);
  const age = row.ageDays;
  // Win Traffic / Win Đơn hàng / Ngôi sao theo QUY TẮC WIN DUY NHẤT (biên bản họp, chỉnh ở trang KPI) trong kỳ đang lọc — không đạt thì false
  const winTraffic = !!opt.win?.wt.has(row.code), win = !!opt.win?.order.has(row.code), star = winTraffic && win;
  const hasVideo = videos > 0;
  const flags: Flags = { active, inStock, hot, normal, other, slow, bad, star, win, winTraffic, hasVideo };
  const action = actionOf({ stock, inStock, sl30, sold, videos, ageDays: age, footage: row.footage, days: opt.days, flags: { star, win, winTraffic, bad, slow } }, R);
  const available = row.availBy === null ? null : opt.wh ? row.availBy[opt.wh] ?? 0 : Object.values(row.availBy).reduce((a, b) => a + b, 0);   // có thể bán (theo kho đang chọn)
  return { row, stock, available, sold, videos, views, flags, action };
}

export type StatusFilter = "all" | "instock" | "outstock" | "hot" | "normal" | "slow" | "bad" | "star" | "win" | "wintraffic" | "novideo" | "video";
export const STATUS_FILTERS: { id: StatusFilter; label: string; test: (f: Flags) => boolean }[] = [
  { id: "all", label: "SPU Active", test: () => true },   // phạm vi bảng đã chỉ gồm SPU Active (còn tồn hoặc có đơn trong 30 ngày)
  { id: "instock", label: "Còn hàng", test: (f) => f.inStock },
  { id: "outstock", label: "Hết hàng có đơn", test: (f) => !f.inStock },   // phạm vi bảng chỉ gồm SPU Active → không còn tồn nghĩa là có đơn trong 30 ngày (số "hết hàng có đơn" ở thẻ S0 Dashboard; migration 095)
  { id: "hot", label: "Bán chạy", test: (f) => f.hot },   // còn hàng, SL bán 30 ngày từ mốc "bán thường" trở lên (không cần traffic); cùng cách tính ở thẻ S0 của dashboard
  { id: "normal", label: "Bán thường", test: (f) => f.normal },
  { id: "slow", label: "Bán chậm", test: (f) => f.slow },
  { id: "bad", label: "Tồn xấu", test: (f) => f.bad },
  { id: "star", label: "Ngôi sao", test: (f) => f.star },
  { id: "win", label: "Win Đơn hàng", test: (f) => f.win },
  { id: "wintraffic", label: "Win Traffic", test: (f) => f.winTraffic },
  { id: "novideo", label: "Chưa có video", test: (f) => !f.hasVideo },
  { id: "video", label: "Đã có video", test: (f) => f.hasVideo },
];
