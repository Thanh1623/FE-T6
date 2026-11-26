"use strict";
// Hằng số R&D dùng chung cho server và client (không có "server-only")
Object.defineProperty(exports, "__esModule", { value: true });
exports.RND_BUCKET = exports.RND_FIELD_LABELS = exports.RND_FIELDS = exports.RND_STATUS = void 0;
exports.RND_STATUS = {
    researching: "Đang nghiên cứu",
    testing: "Đang test",
    ended: "Kết thúc test",
};
// Các trường R&D nhập tay (dùng chung cho form, action và ghi lịch sử)
exports.RND_FIELDS = ["code", "sapo_code", "name", "line", "category", "material", "stone", "size", "description", "source_url", "status"];
exports.RND_FIELD_LABELS = {
    code: "Mã mẫu", sapo_code: "Mã Sapo", name: "Tên", line: "Line", category: "Loại", material: "Chất liệu",
    stone: "Đá", size: "Size", description: "Mô tả", source_url: "Link Source", status: "Trạng thái",
};
exports.RND_BUCKET = "rnd-images";
