// Kiểu dữ liệu của bộ bảng dùng chung (DataGrid) — dùng chung server + client
import type { Opt } from "@/lib/rnd-options";

export type ColType =
  | "text" | "longtext" | "number" | "money" | "date" | "datetime"
  | "select" | "multi" | "person" | "link" | "images" | "badge";

export type ImageKind = "product" | "design" | "media";

export type Col = {
  key: string;
  label: string;
  type: ColType;
  options?: Opt[];                       // select / multi / badge (màu)
  people?: { id: string; name: string }[];   // person
  editable?: boolean;                    // cột cho sửa (còn tuỳ quyền từng dòng)
  lookup?: boolean;                      // lấy từ bảng khác (★, chỉ đọc)
  imageKind?: ImageKind;                 // images: tải ảnh lên đâu
  width?: number;
  sum?: boolean;                         // cộng ở hàng tổng
  hint?: string;                         // chú thích tiêu đề cột
  suffix?: string;                       // vd " ngày"
  dropdown?: boolean;                    // cột action ít lựa chọn vẫn hiện danh sách xổ (mặc định ≤ 4 lựa chọn hiện thành nút bấm)
  nextOnly?: boolean;                    // cột action theo bước (trạng thái đặt hàng…): thẻ chỉ hiện trạng thái hiện tại + bước kế tiếp; nhãn "huỷ" chỉ đổi được trong bảng
  action?: boolean;                      // cột DUYỆT / TRẠNG THÁI: luôn hiện & đổi được ngay trên thẻ thư viện
  noteKey?: string;                      // cột ghi lý do — server đòi lý do thì hỏi rồi lưu vào cột này, thử lại
};

// Ảnh: url = ảnh gốc (phóng to), thumb = ảnh đã thu nhỏ (hiện trong bảng / thẻ)
export type CellValue = string | number | string[] | { path: string; url: string; thumb?: string }[] | null;

export type GridRow = {
  id: string;
  cells: Record<string, CellValue>;
  edit?: string[] | "all";               // cột dòng này được sửa (server kiểm tra lại)
  pid?: string;                          // id bản ghi mẫu (khi dòng là đơn đặt hàng / yêu cầu media) — để sửa ảnh mẫu, ảnh 3D
  href?: string;                         // mở chi tiết
  muted?: boolean;                       // mờ (đã dừng / huỷ)
  del?: boolean;                         // được xoá dòng này (server kiểm tra lại)
  score?: { n: number; mine: boolean; min: number; passed: boolean | null; block: boolean; bypass: boolean };   // bảng Sưu tầm: tóm tắt chấm điểm — n người đã chấm (công khai), bạn đã chấm chưa, đạt / không (null = chưa đủ người hoặc không được xem)
};
