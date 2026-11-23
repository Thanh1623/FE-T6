import type { CellValue, Col, GridRow } from "@/components/grid/types";

// Kiểu dữ liệu dùng chung máy chủ ↔ trình duyệt cho không gian R&D (không import gì phía server)
export const WS_KEYS = ["collection", "approved", "design", "orders", "media", "traffic", "win", "effect"] as const;
export type WsKey = (typeof WS_KEYS)[number];

// Media xem bảng Sưu tầm (và thêm mẫu bằng form rút gọn) + các bảng từ Hoàn thành mẫu trở đi (để lấy source); không thấy giá vốn / giá bán / chi phí
export const MEDIA_WS_KEYS: readonly WsKey[] = ["collection", "media", "traffic", "win", "effect"];   // Sưu tầm (P0): ai cũng xem và thêm mẫu
export const wsKeysFor = (role: string): readonly WsKey[] => (role === "media" ? MEDIA_WS_KEYS : WS_KEYS);

export type WsTable = {
  cols: Col[]; rows: GridRow[];
  // null = người này không được thêm bản ghi ở bảng này
  // keys: trường trong form thêm (không có = dùng danh sách mặc định của bảng; vai trò rút gọn như Media chỉ có vài trường)
  add: { cols?: Record<string, Col>; defaults?: Record<string, CellValue>; required?: string[]; keys?: string[] } | null;
};
export type WsData = { tables: Partial<Record<WsKey, WsTable>>; counts: Record<string, number>; at: number; allowed: readonly WsKey[] };

// Đường dẫn ↔ bảng (giữ nguyên URL từng bảng để gửi link / F5 vẫn đúng bảng)
export const WS_PATH: Record<WsKey, string> = {
  collection: "/rnd", approved: "/rnd/approved", design: "/rnd/design-3d", orders: "/rnd/orders", media: "/rnd/media",
  traffic: "/rnd/traffic", win: "/rnd/win", effect: "/rnd/commercial",
};
export const wsKeyOf = (path: string): WsKey | null =>
  (Object.entries(WS_PATH).find(([, p]) => p === path)?.[0] as WsKey | undefined) ?? null;

// Kênh Supabase Realtime (broadcast) báo "dữ liệu R&D vừa đổi" — không chứa dữ liệu
export const RND_CHANNEL = "rnd-changes";
