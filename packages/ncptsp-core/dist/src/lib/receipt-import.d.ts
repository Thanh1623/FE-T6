import "server-only";
export type ReceiptRow = {
    po: string;
    sku: string;
    seq: number;
    receivedOn: string;
    qty: number;
    supplier: string | null;
};
export type ParsedReceipts = {
    rows: ReceiptRow[];
    pending: number;
    skipped: number;
    from: string | null;
    to: string | null;
    headers: string[];
    missing: string[];
    sheet: string;
};
export declare function parseReceipts(buf: Buffer): ParsedReceipts;
