"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RND_CHANNEL = exports.wsKeyOf = exports.WS_PATH = exports.wsKeysFor = exports.MEDIA_WS_KEYS = exports.WS_KEYS = void 0;
// Kiểu dữ liệu dùng chung máy chủ ↔ trình duyệt cho không gian R&D (không import gì phía server)
exports.WS_KEYS = ["collection", "approved", "design", "orders", "media", "traffic", "win", "effect"];
// Media xem bảng Sưu tầm (và thêm mẫu bằng form rút gọn) + các bảng từ Hoàn thành mẫu trở đi (để lấy source); không thấy giá vốn / giá bán / chi phí
exports.MEDIA_WS_KEYS = ["collection", "media", "traffic", "win", "effect"]; // Sưu tầm (P0): ai cũng xem và thêm mẫu
const wsKeysFor = (role) => (role === "media" ? exports.MEDIA_WS_KEYS : exports.WS_KEYS);
exports.wsKeysFor = wsKeysFor;
// Đường dẫn ↔ bảng (giữ nguyên URL từng bảng để gửi link / F5 vẫn đúng bảng)
exports.WS_PATH = {
    collection: "/rnd", approved: "/rnd/approved", design: "/rnd/design-3d", orders: "/rnd/orders", media: "/rnd/media",
    traffic: "/rnd/traffic", win: "/rnd/win", effect: "/rnd/commercial",
};
const wsKeyOf = (path) => Object.entries(exports.WS_PATH).find(([, p]) => p === path)?.[0] ?? null;
exports.wsKeyOf = wsKeyOf;
// Kênh Supabase Realtime (broadcast) báo "dữ liệu R&D vừa đổi" — không chứa dữ liệu
exports.RND_CHANNEL = "rnd-changes";
