/** Stub type-only cho lib R&D khi build worker — không kéo UI components. */

// ponytail: stub lỏng — chỉ để tsc worker; không dùng lưới R&D ở cron
export type CellValue = unknown;
export type Col = Record<string, unknown>;
export type GridRow = Record<string, unknown>;