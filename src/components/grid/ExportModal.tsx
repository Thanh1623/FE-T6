"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import type { CellValue, Col, GridRow } from "./types";
import { textOf } from "./Cells";

export type ExportScope = "shown" | "picked" | "range" | "all";
export type ExportFormat = "excel" | "csv";

export type ExportModalProps = {
  open: boolean;
  onClose: () => void;
  tableKey: string;
  columns: Col[];
  visibleColumns: Col[];
  allRows: GridRow[];
  shownRows: GridRow[];
  pickedRowIds: Set<string>;
  range: { r1: number; r2: number; c1: number; c2: number } | null;
  flatRows: GridRow[];
  val: (r: GridRow, key: string) => CellValue;
  onSuccess?: (msg: string) => void;
};

export default function ExportModal({
  open,
  onClose,
  tableKey,
  columns,
  visibleColumns,
  allRows,
  shownRows,
  pickedRowIds,
  range,
  flatRows,
  val,
  onSuccess,
}: ExportModalProps) {
  // Format: Excel (.xlsx) hoặc CSV (.csv)
  const [format, setFormat] = useState<ExportFormat>("excel");

  // Phạm vi xuất:
  // - "range": vùng ô đang chọn (nếu có)
  // - "picked": các hàng đã tick chọn (nếu có)
  // - "shown": hàng đang hiển thị sau lọc
  // - "all": tất cả hàng của bảng
  const defaultScope: ExportScope = range ? "range" : pickedRowIds.size > 0 ? "picked" : "shown";
  const [scope, setScope] = useState<ExportScope>(defaultScope);

  // Cột xuất
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set(visibleColumns.map((c) => c.key)));
  const [colSearch, setColSearch] = useState("");
  const [includeHeader, setIncludeHeader] = useState(true);
  const [useRangeCols, setUseRangeCols] = useState(true); // khi scope == "range", mặc định lấy cột theo vùng

  // Tên file
  const defaultFileName = `${tableKey}-${new Date().toISOString().slice(0, 10)}`;
  const [fileName, setFileName] = useState(defaultFileName);
  const [isExporting, setIsExporting] = useState(false);



  // Phím Esc để đóng
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Danh sách cột khả dụng sau lọc tìm kiếm trong modal
  const filteredCols = useMemo(() => {
    if (!colSearch.trim()) return columns;
    const q = colSearch.toLowerCase().trim();
    return columns.filter((c) => c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q));
  }, [columns, colSearch]);

  // Xác định danh sách hàng cần xuất theo scope
  const targetRows = useMemo(() => {
    if (scope === "range" && range) {
      return flatRows.slice(range.r1, range.r2 + 1);
    }
    if (scope === "picked") {
      return allRows.filter((r) => pickedRowIds.has(r.id));
    }
    if (scope === "all") {
      return allRows;
    }
    return shownRows;
  }, [scope, range, flatRows, allRows, pickedRowIds, shownRows]);

  // Xác định danh sách cột cần xuất
  const targetCols = useMemo(() => {
    if (scope === "range" && range && useRangeCols) {
      return visibleColumns.slice(range.c1, range.c2 + 1);
    }
    // Giữ nguyên thứ tự cột theo `columns`
    return columns.filter((c) => selectedKeys.has(c.key));
  }, [scope, range, useRangeCols, visibleColumns, columns, selectedKeys]);

  if (!open) return null;

  const toggleCol = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllCols = () => setSelectedKeys(new Set(columns.map((c) => c.key)));
  const selectVisibleCols = () => setSelectedKeys(new Set(visibleColumns.map((c) => c.key)));
  const deselectAllCols = () => setSelectedKeys(new Set());

  // Thực hiện xuất file
  const handleExport = async () => {
    if (!targetCols.length) {
      alert("Vui lòng chọn ít nhất 1 cột để xuất.");
      return;
    }
    if (!targetRows.length) {
      alert("Không có dữ liệu trong phạm vi xuất đã chọn.");
      return;
    }

    setIsExporting(true);
    try {
      const cleanFileName = (fileName.trim() || defaultFileName).replace(/[/\\?%*:|"<>]/g, "-");
      const headers = includeHeader ? targetCols.map((c) => c.label) : null;

      if (format === "excel") {
        // Chuẩn bị dữ liệu Excel
        const dataRows = targetRows.map((r) =>
          targetCols.map((c) => {
            const v = val(r, c.key);
            if (v === null || v === undefined || v === "") return "";
            if (c.type === "number" || c.type === "money") {
              if (typeof v === "number") return v;
              const n = Number(String(v).replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
              return Number.isFinite(n) ? n : String(v);
            }
            if (c.type === "images") {
              if (Array.isArray(v)) {
                const urls = (v as { url?: string }[]).map((im) => im.url).filter(Boolean);
                return urls.length ? urls.join("\n") : `${v.length} ảnh`;
              }
              return "";
            }
            return textOf(c, v);
          })
        );

        const wb = XLSX.utils.book_new();
        const wsData = headers ? [headers, ...dataRows] : dataRows;
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Tính toán độ rộng cột tự động
        const colWidths = targetCols.map((col, idx) => {
          let maxLen = col.label.length;
          for (let i = 0; i < Math.min(dataRows.length, 60); i++) {
            const str = String(dataRows[i]?.[idx] ?? "");
            if (str.length > maxLen) maxLen = Math.min(str.length, 50);
          }
          return { wch: Math.max(maxLen + 3, 10) };
        });
        ws["!cols"] = colWidths;

        XLSX.utils.book_append_sheet(wb, ws, "Dữ liệu");
        XLSX.writeFile(wb, `${cleanFileName}.xlsx`);
      } else {
        // Chuẩn bị file CSV
        const esc = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
        const lines: string[] = [];
        if (headers) lines.push(headers.map(esc).join(","));

        for (const r of targetRows) {
          const rowVals = targetCols.map((c) => {
            const v = val(r, c.key);
            if (v === null || v === undefined || v === "") return "";
            if (c.type === "images") {
              if (Array.isArray(v)) {
                const urls = (v as { url?: string }[]).map((im) => im.url).filter(Boolean);
                return urls.length ? urls.join(" ") : `${v.length} ảnh`;
              }
              return "";
            }
            return textOf(c, v);
          });
          lines.push(rowVals.map(esc).join(","));
        }

        // Thêm BOM UTF-8 (\uFEFF) để Excel mở tiếng Việt không bị lỗi font chữ
        const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${cleanFileName}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      }

      const successMsg = `Đã xuất ${targetRows.length} hàng × ${targetCols.length} cột ra file ${format.toUpperCase()}`;
      if (onSuccess) onSuccess(successMsg);
      onClose();
    } catch (err) {
      console.error("Lỗi xuất file:", err);
      alert(`Lỗi khi xuất file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExporting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border border-line bg-surface shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4 bg-surface/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent font-bold">
              ⭳
            </div>
            <div>
              <h3 className="text-base font-semibold text-ink-1">Xuất dữ liệu</h3>
              <p className="text-xs text-ink-muted">Tùy chọn định dạng, phạm vi và danh sách cột cần xuất</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-grid hover:text-ink-1"
          >
            ✕
          </button>
        </div>

        {/* Nội dung cấu hình */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* 1. Chọn định dạng file */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-ink-muted block mb-2">
              1. Định dạng file
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormat("excel")}
                className={`flex flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition ${
                  format === "excel"
                    ? "border-accent bg-accent/5 ring-1 ring-accent"
                    : "border-line bg-page hover:border-line-hover hover:bg-grid"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="flex items-center gap-2 font-medium text-ink-1 text-sm">
                    <span className="text-good font-bold">📗</span> Microsoft Excel (.xlsx)
                  </span>
                  {format === "excel" && <span className="text-xs font-bold text-accent">✓ Chọn</span>}
                </div>
                <span className="text-2xs text-ink-muted">
                  Chuẩn bảng tính, giữ đúng số, công thức và ngày tháng. Mở đẹp trong Excel & Google Sheets.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFormat("csv")}
                className={`flex flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition ${
                  format === "csv"
                    ? "border-accent bg-accent/5 ring-1 ring-accent"
                    : "border-line bg-page hover:border-line-hover hover:bg-grid"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="flex items-center gap-2 font-medium text-ink-1 text-sm">
                    <span className="text-sky font-bold">📄</span> File CSV (.csv)
                  </span>
                  {format === "csv" && <span className="text-xs font-bold text-accent">✓ Chọn</span>}
                </div>
                <span className="text-2xs text-ink-muted">
                  Định dạng văn bản gọn nhẹ, mã hóa UTF-8 kèm BOM hỗ trợ tiếng Việt không lỗi font.
                </span>
              </button>
            </div>
          </div>

          {/* 2. Phạm vi dữ liệu (Hàng / Vùng) */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-ink-muted block mb-2">
              2. Phạm vi hàng / Vùng xuất
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Option A: Hàng đang hiển thị */}
              <label
                className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition ${
                  scope === "shown" ? "border-accent bg-accent/5" : "border-line bg-page hover:bg-grid"
                }`}
              >
                <input
                  type="radio"
                  name="export-scope"
                  checked={scope === "shown"}
                  onChange={() => setScope("shown")}
                  className="mt-0.5 accent-accent"
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink-1">Hàng đang hiển thị</div>
                  <div className="text-2xs text-ink-muted">
                    {shownRows.length} hàng (đã qua tìm kiếm / lọc / phân trang)
                  </div>
                </div>
              </label>

              {/* Option B: Các hàng đã tick chọn */}
              <label
                className={`flex items-start gap-3 rounded-xl border p-3 transition ${
                  pickedRowIds.size === 0
                    ? "opacity-50 cursor-not-allowed border-line bg-page/50"
                    : scope === "picked"
                    ? "border-accent bg-accent/5 cursor-pointer"
                    : "border-line bg-page hover:bg-grid cursor-pointer"
                }`}
              >
                <input
                  type="radio"
                  name="export-scope"
                  checked={scope === "picked"}
                  disabled={pickedRowIds.size === 0}
                  onChange={() => setScope("picked")}
                  className="mt-0.5 accent-accent"
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink-1">Các hàng đã chọn (tick)</div>
                  <div className="text-2xs text-ink-muted">
                    {pickedRowIds.size > 0
                      ? `${pickedRowIds.size} hàng đang được đánh dấu`
                      : "Chưa có hàng nào được tick chọn"}
                  </div>
                </div>
              </label>

              {/* Option C: Vùng ô đang chọn (Range) */}
              <label
                className={`flex items-start gap-3 rounded-xl border p-3 transition ${
                  !range
                    ? "opacity-50 cursor-not-allowed border-line bg-page/50"
                    : scope === "range"
                    ? "border-accent bg-accent/5 cursor-pointer"
                    : "border-line bg-page hover:bg-grid cursor-pointer"
                }`}
              >
                <input
                  type="radio"
                  name="export-scope"
                  checked={scope === "range"}
                  disabled={!range}
                  onChange={() => setScope("range")}
                  className="mt-0.5 accent-accent"
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink-1">Vùng ô đang chọn</div>
                  <div className="text-2xs text-ink-muted">
                    {range
                      ? `${range.r2 - range.r1 + 1} hàng × ${range.c2 - range.c1 + 1} cột (${(range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1)} ô)`
                      : "Chưa bôi đen vùng ô nào trong bảng"}
                  </div>
                </div>
              </label>

              {/* Option D: Toàn bộ bản ghi */}
              <label
                className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition ${
                  scope === "all" ? "border-accent bg-accent/5" : "border-line bg-page hover:bg-grid"
                }`}
              >
                <input
                  type="radio"
                  name="export-scope"
                  checked={scope === "all"}
                  onChange={() => setScope("all")}
                  className="mt-0.5 accent-accent"
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink-1">Toàn bộ bản ghi</div>
                  <div className="text-2xs text-ink-muted">{allRows.length} hàng (bỏ qua mọi bộ lọc)</div>
                </div>
              </label>
            </div>

            {/* Nếu đang chọn range: tùy chọn cột theo vùng hay theo danh sách */}
            {scope === "range" && range && (
              <div className="mt-2.5 rounded-lg border border-accent/30 bg-accent/5 p-2.5 text-xs flex items-center justify-between">
                <span className="text-ink-2">Cột xuất cho vùng chọn:</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setUseRangeCols(true)}
                    className={`rounded px-2 py-1 text-2xs font-medium transition ${
                      useRangeCols ? "bg-accent text-white" : "bg-surface text-ink-muted hover:text-ink-1"
                    }`}
                  >
                    Chỉ các cột trong vùng ({range.c2 - range.c1 + 1} cột)
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseRangeCols(false)}
                    className={`rounded px-2 py-1 text-2xs font-medium transition ${
                      !useRangeCols ? "bg-accent text-white" : "bg-surface text-ink-muted hover:text-ink-1"
                    }`}
                  >
                    Theo danh sách cột dưới ({selectedKeys.size} cột)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 3. Chọn các trường / Cột xuất */}
          {!(scope === "range" && range && useRangeCols) && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  3. Chọn các trường (cột) — {selectedKeys.size}/{columns.length} cột
                </label>
                <div className="flex items-center gap-1.5 text-2xs">
                  <button
                    type="button"
                    onClick={selectAllCols}
                    className="rounded border border-line px-2 py-0.5 hover:bg-grid text-ink-2"
                  >
                    Tất cả
                  </button>
                  <button
                    type="button"
                    onClick={selectVisibleCols}
                    className="rounded border border-line px-2 py-0.5 hover:bg-grid text-ink-2"
                  >
                    Đang hiển thị
                  </button>
                  <button
                    type="button"
                    onClick={deselectAllCols}
                    className="rounded border border-line px-2 py-0.5 hover:bg-grid text-ink-muted"
                  >
                    Bỏ chọn
                  </button>
                </div>
              </div>

              {/* Ô tìm kiếm cột nếu có nhiều cột */}
              {columns.length > 8 && (
                <div className="mb-2">
                  <input
                    type="text"
                    value={colSearch}
                    onChange={(e) => setColSearch(e.target.value)}
                    placeholder="Tìm tên cột..."
                    className="w-full rounded-lg border border-line bg-page px-3 py-1.5 text-xs text-ink-1 placeholder:text-ink-muted focus:border-accent focus:outline-none"
                  />
                </div>
              )}

              {/* Danh sách checkbox các cột */}
              <div className="max-h-48 overflow-y-auto rounded-xl border border-line bg-page/50 p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                {filteredCols.map((c) => {
                  const checked = selectedKeys.has(c.key);
                  return (
                    <label
                      key={c.key}
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs cursor-pointer transition select-none ${
                        checked ? "bg-accent/10 text-ink-1 font-medium" : "text-ink-2 hover:bg-grid"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCol(c.key)}
                        className="rounded border-line accent-accent"
                      />
                      <span className="truncate flex-1">{c.label}</span>
                      {c.type && (
                        <span className="text-3xs px-1.5 py-0.5 rounded bg-surface border border-line text-ink-muted">
                          {c.type === "money"
                            ? "Tiền"
                            : c.type === "number"
                            ? "Số"
                            : c.type === "date"
                            ? "Ngày"
                            : c.type === "images"
                            ? "Ảnh"
                            : c.type === "person"
                            ? "Người"
                            : c.type === "select" || c.type === "badge"
                            ? "Lựa chọn"
                            : "Chữ"}
                        </span>
                      )}
                    </label>
                  );
                })}
                {filteredCols.length === 0 && (
                  <div className="col-span-full py-4 text-center text-xs text-ink-muted">
                    Không tìm thấy cột nào khớp với &quot;{colSearch}&quot;
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. Tùy chọn xuất & Tên file */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="text-xs font-medium text-ink-2 block mb-1">Tên file tải về</label>
              <div className="flex items-center rounded-lg border border-line bg-page px-2.5 py-1.5 focus-within:border-accent">
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder="Tên file..."
                  className="w-full bg-transparent text-xs text-ink-1 outline-none"
                />
                <span className="text-xs font-semibold text-ink-muted">.{format === "excel" ? "xlsx" : "csv"}</span>
              </div>
            </div>

            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 rounded-lg border border-line bg-page px-3 py-2 text-xs text-ink-2 cursor-pointer hover:bg-grid select-none">
                <input
                  type="checkbox"
                  checked={includeHeader}
                  onChange={(e) => setIncludeHeader(e.target.checked)}
                  className="rounded border-line accent-accent"
                />
                <span>Bao gồm hàng tiêu đề (Tên cột)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-line px-6 py-4 bg-surface/50">
          <div className="text-xs text-ink-muted">
            Tổng cộng: <b className="text-ink-1">{targetRows.length}</b> hàng ×{" "}
            <b className="text-ink-1">{targetCols.length}</b> cột
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="rounded-lg border border-line px-4 py-2 text-xs font-medium text-ink-2 hover:bg-grid disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting || targetRows.length === 0 || targetCols.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:opacity-95 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{isExporting ? "Đang xuất..." : `Xuất file .${format === "excel" ? "xlsx" : "csv"}`}</span>
              {!isExporting && <span>⭳</span>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
