export type OptionFlag = "done" | "media" | "cancel" | "draft";
export declare const CHIP_COLORS: Record<number, {
    bg: string;
    fg: string;
    name: string;
}>;
export declare const chipColor: (n?: number) => {
    bg: string;
    fg: string;
    name: string;
};
export type Opt = {
    value: string;
    color?: number;
    flag?: OptionFlag;
};
export declare const OPTION_KEYS: {
    readonly line: "Dòng SP";
    readonly material: "Chất liệu";
    readonly stone: "Loại đá";
    readonly color: "Màu sắc (xi)";
    readonly unit: "Đơn vị tính";
    readonly supplier: "Nhà cung cấp / xưởng";
    readonly ref_platform: "Nguồn tham khảo";
    readonly source_status: "Source";
    readonly order_status: "Trạng thái đặt hàng / sản xuất";
    readonly media_type: "Yêu cầu nội dung (media)";
    readonly kill_reason: "Lý do kill";
    readonly review: "Đánh giá hiệu quả";
};
export type OptionKey = keyof typeof OPTION_KEYS;
export type RndOptions = Record<OptionKey, Opt[]>;
export declare const DEFAULT_OPTIONS: RndOptions;
export declare const optionValues: (opts: Opt[]) => string[];
export declare const DRAFT_ORDER = "Ch\u01B0a \u0111\u1EB7t";
export declare const PLACED_ORDER = "\u0110\u00E3 \u0111\u1EB7t h\u00E0ng";
export declare const normOrderStatus: (s: string) => string;
export declare const draftStatuses: (opts: Opt[]) => string[];
export declare const flagged: (opts: Opt[], flag: OptionFlag) => string[];
