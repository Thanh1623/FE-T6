// Nhãn trạng thái phiếu giao việc — dùng chung server + client (lib/handoff.ts là "server-only" nên client không import được)
export const HANDOFF_STATUS = {
  pending: "Chờ tiếp nhận", received: "Đã tiếp nhận", developing: "Đã lên video", done: "Hoàn thành", returned: "Từ chối",
} as const;
export type HandoffStatus = keyof typeof HANDOFF_STATUS;
