export declare const SPU_SHAPE: RegExp;
export declare const spuOf: (sku: unknown) => string;
export declare const isSpuCode: (code: string) => boolean;
export type ProductGroup = "Nhẫn" | "Dây chuyền" | "Lắc tay" | "Bông tai" | "Kiềng" | "Mặt dây" | "Vòng tay" | "Set" | "Khác";
export declare function isNonProduct(name: string | null | undefined, code: string): boolean;
export declare function groupOfProduct(name: string | null | undefined, code: string): ProductGroup;
