export type InventoryRow = {
    sku: string;
    code: string;
    warehouse: string;
    stock: number;
    lastIn: string | null;
    incoming: number;
    available: number | null;
    inTransit?: number;
};
export type ParsedInventory = {
    rows: InventoryRow[];
    skus: {
        sku: string;
        code: string;
        name?: string;
        cost?: number | null;
        price?: number | null;
    }[];
    hasCost?: boolean;
    hasPrice?: boolean;
    skipped: number;
    headers: string[];
    missing: string[];
    sheet: string;
    format: "wide" | "products" | "list";
    warehouses: string[];
};
export declare const COLUMN_ALIASES: {
    readonly code: readonly ["ma spu", "spu", "ma sp", "ma san pham", "sku", "ma hang", "ma"];
    readonly warehouse: readonly ["kho", "ten kho", "kho hang", "ma kho", "dia diem", "dia diem kho"];
    readonly stock: readonly ["ton", "ton kho", "so luong ton", "sl ton", "ton cuoi", "ton hien tai", "so luong", "sl"];
    readonly lastIn: readonly ["ngay nhap", "ngay nhap kho", "ngay nhap gan nhat", "ngay nhap cuoi", "ngay ton"];
    readonly incoming: readonly ["dang ve", "dang ve kho", "hang dang ve"];
};
export declare const COLUMN_LABELS: {
    readonly code: "Mã SPU";
    readonly warehouse: "Kho";
    readonly stock: "Tồn";
    readonly lastIn: "Ngày nhập gần nhất (tuỳ chọn)";
    readonly incoming: "Đang về (tuỳ chọn)";
};
export declare function parseInventoryGrid(grid: unknown[][], sheet: string): ParsedInventory;
