export declare const HANDOFF_STATUS: {
    readonly pending: "Chờ tiếp nhận";
    readonly received: "Đã tiếp nhận";
    readonly developing: "Đã lên video";
    readonly done: "Hoàn thành";
    readonly returned: "Từ chối";
};
export type HandoffStatus = keyof typeof HANDOFF_STATUS;
