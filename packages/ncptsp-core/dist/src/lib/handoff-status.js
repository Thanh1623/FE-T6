"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HANDOFF_STATUS = void 0;
// Nhãn trạng thái phiếu giao việc — dùng chung server + client (lib/handoff.ts là "server-only" nên client không import được)
exports.HANDOFF_STATUS = {
    pending: "Chờ tiếp nhận", received: "Đã tiếp nhận", developing: "Đã lên video", done: "Hoàn thành", returned: "Từ chối",
};
