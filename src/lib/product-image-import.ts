import "server-only";
import * as XLSX from "xlsx";
import { parseProductGrids, type ParsedImages } from "@/lib/product-grid";

export * from "@/lib/product-grid";

export function parseProductImages(buf: Buffer): ParsedImages {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  return parseProductGrids(wb.SheetNames.map((name) => ({ name, grid: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "", raw: true }) })));
}
