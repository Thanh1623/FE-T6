"use client";

import { useActionState, useState } from "react";
import { importReceipts, type ReceiptImportState } from "@/app/(dash)/kpi/receipt-actions";

const dmy = (d: string | null | undefined) => (d ? d.split("-").reverse().join("/") : "—");

// Khung nhập đơn nhập hàng (Cài đặt): file Sapo "Danh sách chi tiết đơn nhập hàng" → thời gian tồn theo FIFO
export default function ReceiptImport({ count, lastAt, from, to }: { count: number | null; lastAt: string | null; from: string | null; to: string | null }) {
  const [state, action, pending] = useActionState<ReceiptImportState, FormData>(importReceipts, {});
  const [name, setName] = useState("");
  const fmt = (n: number) => n.toLocaleString("vi-VN");

  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">
        Tải file Sapo <b>“Danh sách chi tiết đơn nhập hàng”</b> (.xlsx) để tính <b>thời gian tồn</b> của từng SPU theo FIFO: tồn hiện tại là các lô nhập gần nhất, tuổi = số ngày từ ngày nhập lô, bình quân gia quyền theo số lượng.
        Chỉ dòng <b>“Đã nhập”</b> được tính. Phần tồn nhập trước ngày đầu của file hiện là “≥ N ngày”.
      </p>
      <p className="text-xs text-ink-muted">
        {count === null ? "Chưa chạy migration 055 trong Supabase (bảng lô nhập kho chưa có)."
          : count === 0 ? "Chưa nhập file đơn nhập hàng nào — cột “Thời gian tồn” chưa có số."
          : <>Hiện có <b className="text-ink-1">{fmt(count)}</b> lô nhập kho{from ? ` (${dmy(from)} → ${dmy(to)})` : ""}{lastAt ? ` · nhập file lần cuối ${new Date(lastAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}` : ""}. Nhập file mới nhất (có thể chỉ phần gần đây): lô mới được thêm, lô cũ không bị xoá.</>}
      </p>

      <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line bg-page px-4 py-6 text-sm text-ink-2 hover:border-accent hover:bg-accent/5">
        <span className="text-2xl" aria-hidden>📦</span>
        <span className="font-medium">{name || "Bấm để chọn file"}</span>
        <span className="text-xs text-ink-muted">.xlsx · .xls · .csv · tối đa 4 MB</span>
        <input type="file" name="file" accept=".xlsx,.xls,.csv" required className="sr-only" onChange={(e) => setName(e.target.files?.[0]?.name ?? "")} />
      </label>

      {state.error && <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-ink">⛔ {state.error}</p>}
      {state.ok && (
        <p className="rounded-md bg-good/10 px-3 py-2 text-sm text-good">
          ✓ Đã lưu <b>{fmt(state.saved ?? 0)}</b> lô nhập kho ({fmt(state.skus ?? 0)} SKU, {dmy(state.from)} → {dmy(state.to)})
          {state.pending ? <> · bỏ {fmt(state.pending)} dòng chưa nhập</> : null}
          {state.skipped ? <> · bỏ {fmt(state.skipped)} dòng thiếu thông tin</> : null}. Thời gian tồn đã được tính lại.
        </p>
      )}

      <div>
        <button disabled={pending || !name} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{pending ? "Đang nhập…" : "Nhập đơn nhập hàng"}</button>
      </div>
    </form>
  );
}
