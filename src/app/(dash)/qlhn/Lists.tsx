"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { LineStatus, OrderLine, WinRow } from "@/lib/team-report";

// Ba bảng danh sách của tab chi tiết: sản phẩm trong đơn hàng, thống kê SPU, SPU win và SP test.
// Cùng một bộ máy: nút lọc + ô tìm + bấm tên cột để sắp xếp + phân trang. Dữ liệu đã tính sẵn ở máy chủ (migration 071).
type Col<T> = { h: string; n?: boolean; cls?: string; v: (r: T) => string | number; f: (r: T) => ReactNode; t?: (r: T) => string };
type Filter<T> = { id: string; label: string; test: (r: T) => boolean };

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const nf = (n: number) => n.toLocaleString("vi-VN");

function ListTable<T>({ id, rows, cols, filters, txt, size, col, dir, empty = "Không có dòng nào khớp.", ext }: {
  id: string; rows: T[]; cols: Col<T>[]; filters: Filter<T>[]; txt: (r: T) => string; size: number; col: number; dir: 1 | -1; empty?: string;
  ext?: { listen: string };
}) {
  const [f, setF] = useState(filters[0].id), [q, setQ] = useState(""), [sort, setSort] = useState({ col, dir }), [page, setPage] = useState(1);
  useEffect(() => {   // ô số trên dashboard bấm vào thì mở bảng này với đúng bộ lọc
    if (!ext) return;
    const on = (e: Event) => { const d = (e as CustomEvent<{ id: string; f: string }>).detail; if (d.id === ext.listen && filters.some((x) => x.id === d.f)) { setF(d.f); setPage(1); } };
    window.addEventListener("qlhn-filter", on);
    return () => window.removeEventListener("qlhn-filter", on);
  }, [ext, filters]);
  const counts = useMemo(() => filters.map((x) => rows.filter(x.test).length), [rows, filters]);
  const view = useMemo(() => {
    const flt = filters.find((x) => x.id === f) ?? filters[0], needle = q.trim().toLowerCase(), c = cols[sort.col];
    return rows.filter(flt.test).filter((r) => !needle || txt(r).toLowerCase().includes(needle)).sort((a, b) => {
      const x = c.v(a), y = c.v(b);
      return (typeof x === "string" ? x.localeCompare(String(y), "vi") : x - (y as number)) * sort.dir;
    });
  }, [rows, filters, f, q, sort, cols, txt]);
  const pages = Math.max(1, Math.ceil(view.length / size)), p = Math.min(page, pages), from = (p - 1) * size;
  return (
    <>
      <div className="tools">
        <div className="seg" role="tablist" aria-label="Lọc">
          {filters.map((x, i) => <button key={x.id} role="tab" type="button" aria-selected={f === x.id} onClick={() => { setF(x.id); setPage(1); }}>{x.label} {counts[i]}</button>)}
        </div>
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Tìm kiếm" aria-label="Tìm kiếm" />
      </div>
      <div className="scroll"><table className="dt" id={`${id}-t`}>
        <thead><tr><th className="n">STT</th>{cols.map((c, i) => (
          <th key={c.h} className={`srt${c.n ? " n" : ""}`} data-dir={sort.col === i ? (sort.dir > 0 ? "asc" : "desc") : undefined}
            onClick={() => { setSort(sort.col === i ? { col: i, dir: (-sort.dir) as 1 | -1 } : { col: i, dir: c.n ? -1 : 1 }); setPage(1); }}>{c.h}</th>))}</tr></thead>
        <tbody>
          {view.slice(from, from + size).map((r, i) => (
            <tr key={from + i}><td className="n stt">{from + i + 1}</td>{cols.map((c) => <td key={c.h} className={`${c.n ? "n " : ""}${c.cls ?? ""}`} title={c.t?.(r)}>{c.f(r)}</td>)}</tr>))}
          {!view.length && <tr><td colSpan={cols.length + 1} className="hint">{empty}</td></tr>}
        </tbody>
      </table></div>
      <div className="pager">
        <span>{view.length ? from + 1 : 0}–{Math.min(from + size, view.length)} / {view.length}</span>
        <span><button type="button" disabled={p <= 1} onClick={() => setPage(p - 1)}>‹ Trước</button> Trang <b>{p}</b> / {pages} <button type="button" disabled={p >= pages} onClick={() => setPage(p + 1)}>Sau ›</button></span>
      </div>
    </>
  );
}

const Pill = ({ tone, children }: { tone: string; children: ReactNode }) => <span className={`pill p-${tone}`}>{children}</span>;
const code = (c: string) => <b className="code">{c}</b>;

// ===== Sản phẩm trong đơn hàng =====
const ST: Record<LineStatus, [string, string]> = { d: ["Đã giao hàng", "ok"], c: ["Còn hàng, chưa giao", "info"], t: ["Thiếu hàng", "bad"], m: ["Đang chế tác", "warn"], r: ["Đã hoàn hàng", "mute"] };
const RET: Record<string, string> = { i: "Đang trả hàng", p: "Đã trả một phần", f: "Đã trả toàn bộ" };
const LINE_COLS: Col<OrderLine>[] = [
  { h: "Ngày đặt", v: (r) => r[0] + r[1], f: (r) => dm(r[0]) },
  { h: "Mã đơn hàng", v: (r) => r[1], f: (r) => code(r[1]) },
  { h: "SPU", v: (r) => r[2], f: (r) => code(r[2]) },
  { h: "SKU", v: (r) => r[3], f: (r) => r[3] },
  { h: "Tên sản phẩm", cls: "nmc", v: (r) => r[4], t: (r) => r[4], f: (r) => r[4] },
  { h: "SL", n: true, v: (r) => r[5], f: (r) => <b>{r[5]}</b> },
  { h: "Trạng thái", v: (r) => r[6], f: (r) => <><Pill tone={ST[r[6]][1]}>{ST[r[6]][0]}</Pill>{r[8] ? <> <Pill tone={r[8] === "i" ? "warn" : "mute"}>{RET[r[8]]}</Pill></> : null}</> },
  { h: "Số ngày xử lý", n: true, v: (r) => r[7], f: (r) => (r[6] === "d" ? <b>{r[7]} ngày</b> : r[6] === "r" ? <span className="hint">—</span> : <span className="hint">chờ {r[7]} ngày</span>) },
];
const LINE_FILTERS: Filter<OrderLine>[] = [
  { id: "all", label: "Tất cả", test: () => true },
  ...(["d", "c", "t", "m", "r"] as LineStatus[]).map((s) => ({ id: s, label: ST[s][0], test: (r: OrderLine) => r[6] === s })),
];
export function OrderListTable({ rows }: { rows: OrderLine[] }) {
  return <ListTable id="lines" rows={rows} cols={LINE_COLS} filters={LINE_FILTERS} txt={(r) => `${r[1]} ${r[2]} ${r[3]} ${r[4]}`} size={15} col={0} dir={-1} />;
}

// ===== Thống kê SPU =====
// cls: phân loại tồn kho của CÔNG TY (cùng cách tính trang SPU): hot bán chạy · normal bán thường · slow bán chậm · bad tồn xấu · other chưa có số bán
export type SpuClass = "hot" | "normal" | "slow" | "bad" | "other";
export const CLS_LABEL: Record<SpuClass, [string, string]> = { hot: ["Bán chạy", "ok"], normal: ["Bán thường", "info"], slow: ["Bán chậm", "warn"], bad: ["Tồn xấu", "bad"], other: ["Chưa xếp", "mute"] };
export type SpuStatRow = { code: string; name: string; sold: number; delivered: number; videos: number; ordered: number; pos: number; eta: string | null; stock: number; cls: SpuClass };
export function SpuStatTable({ rows, today }: { rows: SpuStatRow[]; today: string }) {
  const cols: Col<SpuStatRow>[] = [
    { h: "SPU", v: (r) => r.code, f: (r) => code(r.code) },
    { h: "Tên sản phẩm", cls: "nmc", v: (r) => r.name, t: (r) => r.name, f: (r) => r.name },
    { h: "Phân loại tồn kho", v: (r) => r.cls, f: (r) => <Pill tone={CLS_LABEL[r.cls][1]}>{CLS_LABEL[r.cls][0]}</Pill> },
    { h: "Tồn", n: true, v: (r) => r.stock, f: (r) => r.stock },
    { h: "SL bán", n: true, v: (r) => r.sold, f: (r) => <b>{r.sold}</b> },
    { h: "SL đã giao", n: true, v: (r) => r.delivered, f: (r) => r.delivered },
    { h: "SL còn thiếu", n: true, v: (r) => r.sold - r.delivered, f: (r) => (r.sold - r.delivered ? <Pill tone="warn">{r.sold - r.delivered}</Pill> : "–") },
    { h: "SL đã order", n: true, v: (r) => r.ordered, f: (r) => (r.ordered ? <><b>{nf(r.ordered)}</b>{r.pos > 1 && <span className="hint"> ({r.pos} PO)</span>}</> : "–") },
    { h: "Dự kiến về", v: (r) => r.eta ?? "9999", f: (r) => (r.eta ? (r.eta < today ? <Pill tone="bad">Quá hạn {dm(r.eta)}</Pill> : dm(r.eta)) : "–") },
    { h: "SL video đã lên", n: true, v: (r) => r.videos, f: (r) => (r.videos ? r.videos : <Pill tone="bad">0</Pill>) },
  ];
  const filters: Filter<SpuStatRow>[] = [
    { id: "all", label: "Tất cả mã", test: () => true }, { id: "classified", label: "SPU đã phân loại", test: (r) => r.cls !== "other" }, { id: "instock", label: "Còn hàng", test: (r) => r.stock > 0 },
    { id: "hot", label: "Bán chạy", test: (r) => r.cls === "hot" }, { id: "normal", label: "Bán thường", test: (r) => r.cls === "normal" },
    { id: "slow", label: "Bán chậm", test: (r) => r.cls === "slow" }, { id: "bad", label: "Tồn xấu", test: (r) => r.cls === "bad" }, { id: "other", label: "Chưa xếp", test: (r) => r.cls === "other" },
    { id: "short", label: "Còn thiếu", test: (r) => r.sold > r.delivered },
    { id: "po", label: "Có hàng đang order", test: (r) => r.ordered > 0 }, { id: "novid", label: "Chưa có video", test: (r) => r.videos === 0 },
  ];
  return <ListTable id="spu" rows={rows} cols={cols} filters={filters} txt={(r) => `${r.code} ${r.name}`} size={15} col={4} dir={-1} ext={{ listen: "spu" }} />;
}

// ===== SPU win và SP test =====
// Cột "Win của team": chấm lại bằng đúng KPI Win nhưng chỉ tính video và đơn của team trong kỳ (lib/team-win.ts); cột "Kết quả công ty": đánh giá R&D chung của SPU.
// result: win · win_traffic · fail · testing · none (chưa có đánh giá) · test (mã test)
const WIN_TONE: Record<string, [string, string]> = { win: ["Win bán hàng", "ok"], win_traffic: ["Win traffic", "info"], fail: ["Chưa đạt", "bad"], testing: ["Đang test", "warn"], none: ["Chưa đánh giá", "mute"], test: ["SP test", "warn"] };
const tone = (k: string) => WIN_TONE[k] ?? WIN_TONE.none;
const teamRes = (r: WinRow) => r[7] || r[2];   // chưa chấm được theo team (chưa chạy migration 076...) thì dùng kết quả công ty
export function WinTable({ rows }: { rows: WinRow[] }) {
  const cols: Col<WinRow>[] = [
    { h: "SPU", v: (r) => r[0], t: (r) => `${r[0]} ${r[1]}`, f: (r) => <>{code(r[0])} <span className="nm">{r[1]}</span></> },
    { h: "Win của team", v: (r) => teamRes(r), t: () => "Chấm bằng KPI Win, chỉ tính video và đơn của team trong kỳ", f: (r) => <Pill tone={tone(teamRes(r))[1]}>{tone(teamRes(r))[0]}</Pill> },
    { h: "Kết quả công ty", v: (r) => r[2], t: () => "Đánh giá R&D chung của SPU (mọi team, mọi kênh)", f: (r) => (r[2] === "test" ? "–" : <span className="hint">{tone(r[2])[0]}</span>) },
    { h: "SL bán", n: true, v: (r) => r[3], f: (r) => (r[2] === "test" ? "–" : <b>{r[3]}</b>) },
    { h: "Video", n: true, v: (r) => r[4], f: (r) => (r[2] === "test" ? "–" : r[4]) },
    { h: "Lượt xem", n: true, v: (r) => r[5], f: (r) => (r[2] === "test" ? "–" : nf(r[5])) },
    { h: "Mới / cũ", v: (r) => r[6], f: (r) => (r[6] === "new" ? "Mới" : r[6] === "old" ? "Cũ" : "–") },
  ];
  const filters: Filter<WinRow>[] = [
    { id: "all", label: "Tất cả", test: () => true }, { id: "win", label: "Win bán hàng", test: (r) => teamRes(r) === "win" },
    { id: "win_traffic", label: "Win traffic", test: (r) => teamRes(r) === "win_traffic" }, { id: "fail", label: "Chưa đạt", test: (r) => teamRes(r) === "fail" },
    { id: "testing", label: "Đang test", test: (r) => teamRes(r) === "testing" }, { id: "test", label: "SP test", test: (r) => r[2] === "test" },
  ];
  return <ListTable id="win" rows={rows} cols={cols} filters={filters} txt={(r) => `${r[0]} ${r[1]}`} size={10} col={5} dir={-1} ext={{ listen: "win" }} />;
}
