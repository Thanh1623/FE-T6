"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { importSales, type SalesImportState } from "./actions";

const fmt = (n: number) => n.toLocaleString("vi-VN");
const dmy = (d?: string | null) => (d ? d.split("-").reverse().join("/") : "—");

const CHUNK_ROWS = 3000;   // số dòng tối đa mỗi phần gửi lên (nhỏ để mỗi lần gọi máy chủ xong trong vài chục giây dù database đang chậm) (luôn cắt ở ranh giới đơn hàng để không làm mất dòng của đơn nằm giữa hai phần)

// Đọc file ngay trong trình duyệt, tách thành các phần theo đơn hàng và nén từng phần → file Excel 12 MB cũng gửi được (mỗi phần chỉ vài trăm KB)
async function packFile(file: File): Promise<File[]> {
  const XLSX = await import("xlsx");
  const isText = /\.csv$/i.test(file.name);
  // Thư viện đọc Excel in cảnh báo "Bad uncompressed size" ra console với một số file Sapo xuất (vẫn đọc đúng); tắt riêng cảnh báo này để không hiện khung lỗi ở chế độ dev
  const origErr = console.error;
  console.error = (...args: unknown[]) => { if (typeof args[0] === "string" && args[0].startsWith("Bad uncompressed size")) return; origErr(...args); };
  let wb: ReturnType<typeof XLSX.read>;
  try { wb = isText ? XLSX.read((await file.text()).replace(/^﻿/, ""), { type: "string", cellDates: false, raw: true }) : XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false }); } finally { console.error = origErr; }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("File không có dữ liệu");
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "", blankrows: false });
  const norm = (t: unknown) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  let h = grid.slice(0, 15).findIndex((r) => r.some((c) => ["ma don hang", "ma don", "so don hang"].includes(norm(c))));
  if (h < 0) h = 0;
  const head = grid[h] ?? [];
  const idCol = Math.max(0, head.findIndex((c) => ["ma don hang", "ma don", "so don hang"].includes(norm(c))));
  const data = grid.slice(h + 1);
  const parts: unknown[][][] = [];
  let cur: unknown[][] = [];
  for (const r of data) {
    const newOrder = cur.length > 0 && String(r[idCol] ?? "") !== "" && String(r[idCol]) !== String(cur[cur.length - 1][idCol] ?? "");
    if (newOrder && cur.length >= CHUNK_ROWS) { parts.push(cur); cur = []; }
    cur.push(r);
  }
  if (cur.length) parts.push(cur);
  const base = file.name.replace(/\.(xlsx|xls|csv)$/i, "");
  const out: File[] = [];
  for (let i = 0; i < parts.length; i++) {
    // Ghi lại thành file Excel (đã nén sẵn dạng zip) chứ KHÔNG qua CSV: máy chủ đọc CSV sẽ tự đoán ngày "03-10-2026" theo kiểu tháng-ngày → sai ngày đặt hàng
    const out_wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(out_wb, XLSX.utils.aoa_to_sheet([head, ...parts[i]]), "Orders");
    const bytes = XLSX.write(out_wb, { bookType: "xlsx", type: "array", compression: true }) as ArrayBuffer;
    out.push(new File([bytes], `${base}${parts.length > 1 ? `_phan${i + 1}` : ""}.xlsx`, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  }
  return out;
}

// Nút "Nhập số bán" + hộp tải file "Danh sách chi tiết đơn hàng" xuất từ Sapo (CSV hoặc Excel)
export default function SalesImport() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SalesImportState>({});
  const router = useRouter();
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState("");
  const [fileObj, setFileObj] = useState<File | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fileObj) return;
    setState({});
    start(async () => {
      try {
        setProgress("Đang đọc và nén file…");
        const files = await packFile(fileObj);
        const total: SalesImportState = { ok: true, file: fileObj.name, imported: 0, orders: 0, codes: 0, qty: 0, otherQty: 0, otherCodes: 0, gifts: 0, refunds: 0, skippedInvalid: 0, cancelled: 0, removedLines: 0, from: null, to: null };
        for (let i = 0; i < files.length; i++) {
          setProgress(`Đang nhập phần ${i + 1}/${files.length}…`);
          const fd = new FormData();
          fd.set("file", files[i]);
          fd.set("final", i === files.length - 1 ? "1" : "0");   // chỉ phần cuối làm mới số liệu
          let r: SalesImportState;
          try { r = await importSales({}, fd); }
          catch {   // máy chủ không trả lời đúng (quá thời gian / mất kết nối): thử lại một lần — ghi theo mã đơn + SKU nên chạy lại không bị trùng
            await new Promise((x) => setTimeout(x, 2000));
            try { r = await importSales({}, fd); }
            catch { setState({ error: `Phần ${i + 1}/${files.length}: máy chủ không phản hồi (có thể quá thời gian do database đang bận).${i > 0 ? ` ${i} phần trước đã nhập xong.` : ""} Bấm nhập lại đúng file này để làm tiếp, không bị trùng.` }); return; }
          }
          if (r.error) { setState({ error: `${files.length > 1 ? `Phần ${i + 1}/${files.length}: ` : ""}${r.error}${i > 0 ? ` (${i} phần trước đã nhập xong — nhập lại file này để làm tiếp, không bị trùng)` : ""}` }); return; }
          total.imported = (total.imported ?? 0) + (r.imported ?? 0); total.orders = (total.orders ?? 0) + (r.orders ?? 0); total.codes = Math.max(total.codes ?? 0, r.codes ?? 0);
          total.qty = (total.qty ?? 0) + (r.qty ?? 0); total.otherQty = (total.otherQty ?? 0) + (r.otherQty ?? 0); total.otherCodes = Math.max(total.otherCodes ?? 0, r.otherCodes ?? 0);
          total.gifts = (total.gifts ?? 0) + (r.gifts ?? 0); total.refunds = (total.refunds ?? 0) + (r.refunds ?? 0); total.skippedInvalid = (total.skippedInvalid ?? 0) + (r.skippedInvalid ?? 0);
          total.cancelled = (total.cancelled ?? 0) + (r.cancelled ?? 0); total.removedLines = (total.removedLines ?? 0) + (r.removedLines ?? 0);
          if (r.from && (!total.from || r.from < total.from)) total.from = r.from;
          if (r.to && (!total.to || r.to > total.to)) total.to = r.to;
          total.staffNames = r.staffNames; total.staffMatched = r.staffMatched; total.staffUnmatched = r.staffUnmatched; total.staffSaved = r.staffSaved;
        }
        setState(total);
        router.refresh();   // làm mới trang /spu một lần sau khi nhập xong
      } catch (err) {
        setState({ error: `Không đọc được file: ${err instanceof Error ? err.message : String(err)}` });
      } finally { setProgress(""); }
    });
  }
  const [name, setName] = useState("");
  const [size, setSize] = useState(0);
  const tooBig = size > 60 * 1024 * 1024;   // Vercel chặn thân yêu cầu > ~4,5 MB trước khi tới máy chủ (trình duyệt chỉ hiện "This page couldn't load"), nên chặn ngay ở trình duyệt

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
        Nhập số bán
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !pending) setOpen(false); }}>
          <form onSubmit={submit} className="flex w-full max-w-lg flex-col gap-3 rounded-lg border border-line bg-surface p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Nhập số lượng bán</h2>
              <button type="button" disabled={pending} onClick={() => setOpen(false)} aria-label="Đóng" className="rounded px-2 text-ink-muted hover:bg-grid">✕</button>
            </div>

            <p className="text-sm text-ink-2">
              Tải file <b>Danh sách chi tiết đơn hàng</b> xuất từ Sapo (CSV hoặc Excel). Mỗi dòng sản phẩm được <b>thêm hoặc cập nhật</b> theo mã đơn + SKU: nhập lại file trùng đơn không bị nhân đôi, file của đợt khác không bị xoá.
            </p>

            <div className="rounded-md bg-page px-3 py-2 text-xs text-ink-2">
              <div className="mb-1 font-semibold text-ink-1">Cột cần có (đúng như file Sapo xuất)</div>
              <ul className="list-inside list-disc space-y-0.5">
                <li><b>Mã đơn hàng</b> · <b>Ngày đặt hàng</b> (dd-mm-yyyy hh:mm) · <b>Mã SKU</b> · <b>Số lượng sản phẩm</b></li>
                <li>Có thêm <b>Giá sản phẩm</b>, <b>Trạng thái đơn hàng</b>, <b>Nguồn</b>, <b>Chi nhánh</b> thì dùng để lọc quà tặng và đơn huỷ</li>
              </ul>
              <div className="mt-1.5 text-ink-muted">Mã SPU lấy từ SKU (phần trước dấu “-” đầu tiên). <b>Lưu tất cả dòng</b>, kể cả mã không phải SPU (vd mã trung gian của hàng chế tác) và quà tặng giá 0, để thống kê về sau; khi tính số bán SPU thì loại quà tặng và đơn “Đã hủy”. Số bán <b>không trừ hoàn</b>: dòng đơn hoàn (file Sapo ghi SL = 0 nhưng có giá) tính 1 sản phẩm.</div>
            </div>

            <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-line bg-page px-4 py-6 text-sm text-ink-2 hover:border-accent hover:text-accent">
              <span className="text-2xl" aria-hidden>📄</span>
              <span className="font-medium">{name || "Bấm để chọn file"}</span>
              <span className="text-xs text-ink-muted">.csv · .xlsx · .xls · tối đa 60 MB · tự nén khi gửi</span>
              <input type="file" name="file" accept=".csv,.xlsx,.xls" required className="sr-only" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFileObj(f); setName(f?.name ?? ""); setSize(f?.size ?? 0); }} />
            </label>

            {tooBig && <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-ink">⛔ File {(size / 1048576).toFixed(1)} MB — vượt giới hạn 60 MB. Hãy xuất từ Sapo theo từng khoảng ngày rồi nhập lần lượt; nhập nhiều file không bị trùng.</p>}
            {state.error && <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-ink">⛔ {state.error}</p>}
            {state.ok && (
              <div className="space-y-0.5 rounded-md bg-good/10 px-3 py-2 text-sm text-good">
                <p>✓ Đã nhập <b>{fmt(state.imported ?? 0)}</b> dòng từ “{state.file}”: {fmt(state.orders ?? 0)} đơn · {fmt(state.codes ?? 0)} SPU · <b>{fmt(state.qty ?? 0)}</b> sản phẩm bán · {dmy(state.from)} → {dmy(state.to)}</p>
                <p className="text-xs">
                  Hàng không phải SPU (hàng chế tác…): {fmt(state.otherQty ?? 0)} sản phẩm / {fmt(state.otherCodes ?? 0)} mã · quà tặng giá 0: {fmt(state.gifts ?? 0)} dòng{state.refunds ? ` · dòng hoàn tính 1 sản phẩm (không trừ hoàn): ${fmt(state.refunds)}` : ""}{state.cancelled ? ` · đơn huỷ: ${fmt(state.cancelled)} dòng` : ""}{state.removedLines ? ` · đã xoá ${fmt(state.removedLines)} dòng cũ không còn trong đơn` : ""}
                  {state.skippedInvalid ? ` · bỏ ${fmt(state.skippedInvalid)} dòng thiếu mã đơn / ngày / SKU` : ""}. Các dòng này đã lưu, chỉ không cộng vào số bán SPU.
                </p>
                {state.staffNames ? (
                  <p className="text-xs">
                    Nhân viên phụ trách: {fmt(state.staffNames)} tên{state.staffSaved ? " (đã lưu vào database)" : " (chưa lưu — chạy migration 046)"} · {fmt(state.staffMatched ?? 0)} đã có team
                    {state.staffUnmatched?.length ? <> · <b>chưa có team:</b> {state.staffUnmatched.join(", ")} — gán tay trong bảng <code>sales.staff_teams</code></> : null}.
                  </p>
                ) : null}
              </div>
            )}

            <div className="flex justify-end gap-2 text-sm">
              <button type="button" disabled={pending} onClick={() => setOpen(false)} className="rounded-md px-3 py-1.5 text-ink-2 hover:bg-grid">{state.ok ? "Đóng" : "Huỷ"}</button>
              <button disabled={pending || !name || tooBig} className="rounded-md bg-accent px-4 py-1.5 font-medium text-white hover:opacity-90 disabled:opacity-60">{pending ? progress || "Đang nhập…" : "Nhập số bán"}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
