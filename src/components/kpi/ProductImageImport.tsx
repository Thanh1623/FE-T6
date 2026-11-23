"use client";

import { useActionState, useRef, useState } from "react";
import { importProductImages, importProductImagesParsed, type ImageImportState } from "@/app/(dash)/kpi/image-actions";
import { detectSplits, imageRows, parseProductGrids } from "@/lib/product-grid";

// File lớn hơn mức này (vd file Sapo "Xuất danh sách sản phẩm" kèm tồn kho ~9 MB) không gửi nguyên lên máy chủ được (giới hạn ~4,5 MB):
// TRÌNH DUYỆT đọc file, tách SPU trùng mã, chọn ảnh / tên cho từng SPU rồi chỉ gửi kết quả gọn.
const BIG_FILE = 3.5 * 1024 * 1024;
const MAX_PAYLOAD = 3.9 * 1024 * 1024;

// Khung nhập ảnh sản phẩm (Cài đặt): tải file Excel / CSV danh sách sản phẩm kèm link ảnh → mỗi SPU một ảnh
export default function ProductImageImport({ count, updatedAt, splits }: { count: number | null; updatedAt: string | null; splits: { code: string; newCode: string; skus: number }[] }) {
  const [formState, action, formPending] = useActionState<ImageImportState, FormData>(importProductImages, {});
  const [big, setBig] = useState<ImageImportState | null>(null);
  const [bigBusy, setBigBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const state = big ?? formState, pending = formPending || !!bigBusy;

  async function importBig(f: File) {
    setBig(null);
    try {
      setBigBusy("Đang đọc file trong trình duyệt…");
      const XLSX = await import("xlsx");
      const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: "array", cellDates: false });
      const parsed = parseProductGrids(wb.SheetNames.map((name) => ({ name, grid: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "", raw: true }) })));
      if (parsed.missing.length) throw new Error(`Thiếu cột: ${parsed.missing.join(" · ")}. Các cột tìm thấy: ${parsed.headers.slice(0, 12).join(", ") || "(không có)"}`);
      if (!parsed.items.some((i) => i.url)) throw new Error("Không có dòng nào có link ảnh hợp lệ");
      const splitsFound = detectSplits(parsed.items);
      const overrides = new Map(splitsFound.flatMap((g) => g.skus.map((sku) => [sku, g.newCode] as [string, string])));
      const img = imageRows(parsed.items, overrides);
      const payload = JSON.stringify({ rows: img.rows, splits: splitsFound, spus: img.spus, withoutImage: img.withoutImage, totalRows: parsed.totalRows, badLinks: parsed.badLinks });
      if (payload.length > MAX_PAYLOAD) throw new Error("Dữ liệu sau khi đọc vẫn quá lớn để gửi — hãy xuất file ít cột hơn");
      setBigBusy("Đang lưu vào hệ thống…");
      setBig(await importProductImagesParsed({ fileName: f.name, payload }));
    } catch (e) {
      setBig({ error: e instanceof Error ? e.message : "Không đọc được file" });
    } finally { setBigBusy(null); }
  }
  const [name, setName] = useState("");
  const fmt = (n: number) => n.toLocaleString("vi-VN");

  return (
    <form action={action} className="flex flex-col gap-3"
      onSubmit={(e) => { const f = fileRef.current?.files?.[0]; if (f && f.size > BIG_FILE) { e.preventDefault(); void importBig(f); } else setBig(null); }}>
      <p className="text-sm text-ink-2">
        Tải file Excel danh sách sản phẩm có link ảnh — nhận thẳng file Sapo <b>“Xuất danh sách sản phẩm”</b> (cột <b>Mã SKU</b> và <b>Ảnh phiên bản / Ảnh đại diện</b>).
        Mỗi SPU lấy ảnh và tên sản phẩm của SKU gốc; SPU đã có sẽ được cập nhật, SPU không có trong file giữ nguyên.
        Cùng lúc, file này dùng để <b>tách SPU bị gộp nhầm do đặt trùng mã</b>: SKU dạng “mã-số” (vd N400622-5) thuộc sản phẩm Sapo khác với SKU mã trần (N400622) sẽ thành SPU riêng (N400622X).
      </p>
      <p className="text-xs text-ink-muted">
        {count === null ? "Chưa chạy migration 049 trong Supabase (bảng ảnh sản phẩm chưa có)."
          : count === 0 ? "Chưa có ảnh nào được nhập."
          : <>Hiện có <b className="text-ink-1">{fmt(count)}</b> SPU có ảnh nhập từ file{updatedAt ? ` · cập nhật ${new Date(updatedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}` : ""}. Ảnh nhập ở đây được ưu tiên hơn ảnh đồng bộ từ Qlydonhang.</>}
      </p>

      <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line bg-page px-4 py-6 text-sm text-ink-2 hover:border-accent hover:bg-accent/5">
        <span className="text-2xl" aria-hidden>🖼️</span>
        <span className="font-medium">{name || "Bấm để chọn file"}</span>
        <span className="text-xs text-ink-muted">.xlsx · .xls · .csv · file lớn (vài chục MB) được đọc ngay trên máy bạn</span>
        <input ref={fileRef} type="file" name="file" accept=".xlsx,.xls,.csv" required className="sr-only" onChange={(e) => { setName(e.target.files?.[0]?.name ?? ""); setBig(null); }} />
      </label>

      {state.error && <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-ink">⛔ {state.error}</p>}
      {state.ok && (
        <p className="rounded-md bg-good/10 px-3 py-2 text-sm text-good">
          ✓ Đã lưu ảnh cho <b>{fmt(state.saved ?? 0)}</b> SPU và tên cho <b>{fmt(state.names ?? 0)}</b> SPU (đọc {fmt(state.totalRows ?? 0)} dòng / {fmt(state.spus ?? 0)} SPU trong file)
          {state.withoutImage ? <> · {fmt(state.withoutImage)} SPU trong file không có ảnh</> : null}
          {state.badLinks ? <> · bỏ {fmt(state.badLinks)} link không hợp lệ</> : null}.
          {state.splits?.length ? <> Đã tách <b>{fmt(state.splits.length)}</b> SPU bị gộp nhầm: {state.splits.slice(0, 12).map((s) => `${s.code} → ${s.newCode}`).join(", ")}{state.splits.length > 12 ? "…" : ""}. Nhập lại tồn kho / số bán sau khi tách để số liệu cập nhật đầy đủ.</> : null}
        </p>
      )}
      {state.splitWarning && <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-ink">⚠ {state.splitWarning}</p>}

      {splits.length > 0 && (
        <details className="rounded-md bg-page px-3 py-2 text-xs text-ink-2">
          <summary className="cursor-pointer font-medium text-ink-1">Đã tách {fmt(splits.length)} SPU bị gộp nhầm do đặt trùng mã</summary>
          <ul className="mt-1.5 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
            {splits.map((s) => <li key={s.newCode}><span className="font-mono font-semibold text-ink-1">{s.code}</span> → <span className="font-mono font-semibold text-ink-1">{s.newCode}</span> · {s.skus} SKU “mã-số”</li>)}
          </ul>
        </details>
      )}

      <div>
        <button disabled={pending || !name} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{bigBusy ?? (pending ? "Đang nhập…" : "Nhập ảnh")}</button>
      </div>
    </form>
  );
}
