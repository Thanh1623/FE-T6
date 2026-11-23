"use client";

import { Children, useState, type ReactNode } from "react";

// Phân trang cho các dòng bảng (mỗi trang `size` dòng), thanh trang kiểu bản mẫu
export default function PagerRows({ children, size = 10, cols }: { children: ReactNode; size?: number; cols: number }) {
  const rows = Children.toArray(children);
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / size)), p = Math.min(page, pages);
  return (
    <>
      {rows.slice((p - 1) * size, p * size)}
      {pages > 1 && (
        <tr><td colSpan={cols}>
          <div className="pager">
            <span>{(p - 1) * size + 1}–{Math.min(p * size, rows.length)} / {rows.length}</span>
            <span><button type="button" disabled={p <= 1} onClick={() => setPage(p - 1)}>‹ Trước</button> Trang <b>{p}</b> / {pages} <button type="button" disabled={p >= pages} onClick={() => setPage(p + 1)}>Sau ›</button></span>
          </div>
        </td></tr>
      )}
    </>
  );
}
