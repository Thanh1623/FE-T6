import "server-only";
import * as XLSX from "xlsx";
import { parseInventoryGrid, type ParsedInventory } from "@/lib/inventory-parse";

export * from "@/lib/inventory-parse";

export function parseInventory(buf: Buffer): ParsedInventory {
  // .xlsx là tệp nén (bắt đầu "PK"), .xls cũ bắt đầu D0 CF; còn lại coi là CSV / văn bản — đọc UTF-8 (nếu để SheetJS tự đoán sẽ vỡ tiếng Việt)
  const binary = (buf[0] === 0x50 && buf[1] === 0x4b) || (buf[0] === 0xd0 && buf[1] === 0xcf);
  const wb = binary ? XLSX.read(buf, { type: "buffer", cellDates: false }) : XLSX.read(new TextDecoder("utf-8").decode(buf).replace(/^﻿/, ""), { type: "string", cellDates: false });
  const sheet = wb.SheetNames[0];
  if (!sheet) return { rows: [], skus: [], skipped: 0, headers: [], missing: ["Mã SPU", "Kho", "Tồn"], sheet: "", format: "list", warehouses: [] };
  return parseInventoryGrid(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, defval: "", raw: true }), sheet);
}
