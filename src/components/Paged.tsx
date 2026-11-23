"use client";

import { Children, useState, type ReactNode } from "react";

// Phân trang cho danh sách / bảng dựng ở máy chủ: nhận mảng dòng đã dựng sẵn, chỉ hiện `size` dòng mỗi trang kèm thanh chuyển trang.
// Quy ước kích thước (xem lib/paging): bảng danh sách lớn ≤ 50 dòng/trang; bảng nhỏ ở Dashboard / Nội dung / Traffic 15–30 dòng.
//   as="row"  — đặt trong <tbody>: thanh trang là 1 hàng <tr> trải hết `cols` cột
//   as="item" — đặt trong <ul>/<ol>: thanh trang là 1 <li>
//   as="block" — đặt trong <div>: thanh trang là 1 <div>
// resetKey đổi (vd bộ lọc đổi) → về trang 1.
export default function Paged({ children, size, as = "row", cols = 1, resetKey = "", barClass = "" }: {
  children: ReactNode; size: number; as?: "row" | "item" | "block"; cols?: number; resetKey?: string;
  barClass?: string;   // lớp CSS cho thanh trang (vd "col-span-full" khi nằm trong lưới)
}) {
  const items = Children.toArray(children);
  const [state, setState] = useState({ page: 1, key: resetKey });
  const page0 = state.key === resetKey ? state.page : 1;
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(page0, pages);
  const go = (n: number) => setState({ page: Math.min(Math.max(1, n), pages), key: resetKey });
  const shown = items.slice((page - 1) * size, page * size);
  const nf = (n: number) => n.toLocaleString("vi-VN");

  const bar = pages > 1 && (
    <div className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs">
      <span className="text-ink-2">{nf((page - 1) * size + 1)}–{nf(Math.min(page * size, items.length))} / {nf(items.length)}</span>
      <span className="flex items-center gap-1">
        <button type="button" disabled={page <= 1} onClick={() => go(1)} className="rounded-md px-2 py-1 text-ink-2 hover:bg-grid disabled:opacity-40" aria-label="Trang đầu">«</button>
        <button type="button" disabled={page <= 1} onClick={() => go(page - 1)} className="rounded-md border border-line px-2.5 py-1 hover:bg-grid disabled:opacity-40">‹ Trước</button>
        <span className="tabular px-1.5 text-ink-2">Trang <b className="text-ink-1">{page}</b> / {nf(pages)}</span>
        <button type="button" disabled={page >= pages} onClick={() => go(page + 1)} className="rounded-md border border-line px-2.5 py-1 hover:bg-grid disabled:opacity-40">Sau ›</button>
        <button type="button" disabled={page >= pages} onClick={() => go(pages)} className="rounded-md px-2 py-1 text-ink-2 hover:bg-grid disabled:opacity-40" aria-label="Trang cuối">»</button>
      </span>
    </div>
  );

  return (
    <>
      {shown}
      {bar && (as === "row" ? <tr><td colSpan={cols} className="border-t border-line px-3">{bar}</td></tr>
        : as === "item" ? <li className="px-1">{bar}</li>
          : <div className={barClass}>{bar}</div>)}
    </>
  );
}
