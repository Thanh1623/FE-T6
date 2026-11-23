"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { importInventory, importInventoryParsed, type ImportState } from "./actions";
import { parseInventoryGrid } from "@/lib/inventory-parse";

// File lớn hơn mức này (vd file Sapo "Xuất danh sách sản phẩm" kèm tồn kho ~9 MB) không gửi nguyên lên máy chủ được (giới hạn ~4,5 MB):
// TRÌNH DUYỆT đọc file rồi chỉ gửi dữ liệu gọn đã đọc.
const BIG_FILE = 3.5 * 1024 * 1024;
const MAX_PAYLOAD = 3.9 * 1024 * 1024;

// Nút "Nhập tồn kho" + hộp tải file Excel / CSV. File mẫu chính thức sẽ được bổ sung — tới lúc đó tên cột nhận theo gợi ý bên dưới.
export default function InventoryImport() {
  const [open, setOpen] = useState(false);
  const [formState, action, formPending] = useActionState<ImportState, FormData>(importInventory, {});
  const [big, setBig] = useState<ImportState | null>(null);   // kết quả của đường nhập file lớn (đọc ở trình duyệt)
  const [bigBusy, setBigBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const state = big ?? formState, pending = formPending || !!bigBusy;

  async function importBig(f: File) {
    setBig(null);
    try {
      setBigBusy("Đang đọc file trong trình duyệt…");
      const XLSX = await import("xlsx");
      const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array", cellDates: false });
      const sheet = wb.SheetNames[0];
      const parsed = parseInventoryGrid(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, defval: "", raw: true }), sheet);
      if (parsed.missing.length) throw new Error(`Thiếu cột bắt buộc: ${parsed.missing.join(", ")}`);
      if (!parsed.rows.length) throw new Error("Không có dòng tồn kho hợp lệ nào trong file");
      const payload = JSON.stringify({ rows: parsed.rows, skus: parsed.skus, hasCost: parsed.hasCost, hasPrice: parsed.hasPrice, skipped: parsed.skipped, format: parsed.format });
      if (payload.length > MAX_PAYLOAD) throw new Error("Dữ liệu sau khi đọc vẫn quá lớn để gửi — hãy xuất file ít cột / ít sản phẩm hơn");
      setBigBusy("Đang lưu vào hệ thống…");
      setBig(await importInventoryParsed({ fileName: f.name, payload }));
    } catch (e) {
      setBig({ error: e instanceof Error ? e.message : "Không đọc được file" });
    } finally { setBigBusy(null); }
  }
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !pending) setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-md border border-accent px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/10">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3m0 0L7 8m5-5 5 5M4 21h16" /></svg>
        Nhập tồn kho
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !pending) setOpen(false); }}>
          <form action={action} className="flex w-full max-w-lg flex-col gap-3 rounded-lg border border-line bg-surface p-5 shadow-xl"
            onSubmit={(e) => { const f = fileRef.current?.files?.[0]; if (f && f.size > BIG_FILE) { e.preventDefault(); void importBig(f); } else setBig(null); }}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Nhập dữ liệu tồn kho</h2>
              <button type="button" disabled={pending} onClick={() => setOpen(false)} aria-label="Đóng" className="rounded px-2 text-ink-muted hover:bg-grid">✕</button>
            </div>

            <p className="text-sm text-ink-2">
              Tải file tồn kho hiện tại: file Sapo <b>“Quản lý kho phiên bản sản phẩm”</b> (.xlsx, mỗi kho 5 cột Tồn kho · Có thể bán · Đang giao dịch · Đang về kho · Đang đóng gói) hoặc bảng phẳng (Mã SPU, Kho, Tồn). Mỗi lần nhập là <b>một bản chụp mới</b>: SPU nào không còn trong file sẽ bị xoá khỏi tồn kho.
            </p>

            <div className="rounded-md bg-page px-3 py-2 text-xs text-ink-2">
              <div className="mb-1 font-semibold text-ink-1">Nếu dùng bảng phẳng, cần các cột (viết có dấu hoặc không dấu). File Sapo nhận thẳng, không cần sửa</div>
              <ul className="list-inside list-disc space-y-0.5">
                <li><b>Mã SPU</b> — vd N0123, D0006-00-S-WH</li>
                <li><b>Kho</b> — tên kho</li>
                <li><b>Tồn</b> — số lượng tồn (số nguyên)</li>
                <li><b>Ngày nhập gần nhất</b> — không bắt buộc, dùng để tính thời gian tồn</li>
              </ul>
              <div className="mt-1.5 text-ink-muted">File mẫu chính thức sẽ được cập nhật — <span title="Sẽ có khi file mẫu được cung cấp" className="cursor-not-allowed underline decoration-dotted">tải file mẫu</span> (chưa có).</div>
            </div>

            <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-line bg-page px-4 py-6 text-sm text-ink-2 hover:border-accent hover:text-accent">
              <span className="text-2xl" aria-hidden>📄</span>
              <span className="font-medium">{name || "Bấm để chọn file"}</span>
              <span className="text-xs text-ink-muted">.xlsx · .xls · .csv · file lớn (vài chục MB) được đọc ngay trên máy bạn</span>
              <input ref={fileRef} type="file" name="file" accept=".xlsx,.xls,.csv" required className="sr-only" onChange={(e) => { setName(e.target.files?.[0]?.name ?? ""); setBig(null); }} />
            </label>

            {state.error && <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-ink">⛔ {state.error}</p>}
            {state.ok && (
              <p className="rounded-md bg-good/10 px-3 py-2 text-sm text-good">
                ✓ Đã nhập <b>{state.skus?.toLocaleString("vi-VN")}</b> SKU ({state.spus?.toLocaleString("vi-VN")} SPU · {state.warehouses} kho), trong đó <b>{state.imported?.toLocaleString("vi-VN")}</b> dòng SKU × kho có hàng từ “{state.file}” — tồn <b>{state.stock?.toLocaleString("vi-VN")}</b>, đang về <b>{state.incoming?.toLocaleString("vi-VN")}</b>
                {state.skipped ? <> · bỏ qua {state.skipped} dòng không hợp lệ</> : null}.
              </p>
            )}

            <div className="flex justify-end gap-2 text-sm">
              <button type="button" disabled={pending} onClick={() => setOpen(false)} className="rounded-md px-3 py-1.5 text-ink-2 hover:bg-grid">{state.ok ? "Đóng" : "Huỷ"}</button>
              <button disabled={pending || !name} className="rounded-md bg-accent px-4 py-1.5 font-medium text-white hover:opacity-90 disabled:opacity-60">{bigBusy ?? (pending ? "Đang nhập…" : "Nhập tồn kho")}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
