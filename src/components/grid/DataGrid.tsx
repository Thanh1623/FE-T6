"use client";

import HoverLink from "@/components/HoverLink";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { CellEditor, CellView, Chip, ImageEditor, asList, textOf, uploadCellImages } from "./Cells";
import type { CellValue, Col, GridRow, ImageKind } from "./types";
import { setGridImages } from "@/app/(dash)/rnd/grid-actions";
import { noteWrite } from "./rnd-store";
import { getGridPrefs, saveGridPrefs } from "@/app/(dash)/grid-prefs-actions";
import { chipColor, type Opt } from "@/lib/rnd-options";
import { unwrap } from "@/lib/action-result";
import FilterPanel from "./FilterPanel";
import { isActive, kindOf, matchFilter, type Filter, type FilterMatch } from "./filters";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import InfoTip from "@/components/InfoTip";
import ExportModal from "./ExportModal";
import { ScoreModal } from "@/components/rnd/ScoreModal";
import { fmt as fmtScore } from "@/lib/rnd-score-calc";

// Bộ bảng dùng chung kiểu Lark Base: sửa trong ô, thêm / xoá bản ghi, tìm / lọc / sắp xếp / nhóm,
// ẩn-hiện + kéo đổi thứ tự + kéo độ rộng cột (lưu theo từng người trong trình duyệt), xuất CSV, hàng tổng.

type RowH = "s" | "m" | "l" | "xl";
type CardSize = "s" | "m" | "l";
type Prefs = {
  order?: string[]; hidden?: string[]; cardHidden?: string[]; zone?: Record<string, CardZone>; widths?: Record<string, number>; group?: string; groupRev?: number; sort?: [string, 1 | -1] | null; rowH?: RowH;
  filters?: Filter[]; match?: FilterMatch;   // bộ lọc đang dùng — lưu lại, mở lại trình duyệt vẫn còn
  labels?: Record<string, string>;   // tên cột do người dùng đặt lại (chuột phải tiêu đề)
  calc?: Record<string, Calc>;   // phép tính ở chân bảng theo cột
  view?: "table" | "gallery"; card?: CardSize; cover?: string;   // chế độ xem thư viện
  pageSize?: number;   // số dòng mỗi trang (50 / 100 / 200; 0 = tất cả)
};
// Cỡ thẻ thư viện: độ rộng tối thiểu của thẻ + số trường hiện trên thẻ
// Vùng hiển thị của 1 trường trên thẻ: huy hiệu trên ảnh · ô số liệu lớn · trường thông tin. Mặc định theo kiểu dữ liệu; người dùng kéo trường sang vùng khác trong bảng "Trường" để đổi.
type CardZone = "badge" | "metric" | "info";
const defaultZone = (c: Col): CardZone => (c.type === "badge" ? "badge" : c.type === "number" && c.sum && c.key !== "qty" ? "metric" : "info");

const CARD: Record<CardSize, { label: string; min: number; fields: number }> = {
  s: { label: "Nhỏ", min: 180, fields: 3 }, m: { label: "Vừa", min: 275, fields: 8 }, l: { label: "Lớn", min: 350, fields: 12 },
};
// Chiều cao hàng (giống Lark): số dòng chữ hiển thị trong ô tăng theo
const ROW_H: Record<RowH, { label: string; h: number; lines: number }> = {
  s: { label: "Thấp", h: 30, lines: 1 }, m: { label: "Trung bình", h: 36, lines: 1 },
  l: { label: "Cao", h: 52, lines: 2 }, xl: { label: "Rất cao", h: 88, lines: 4 },
};

const PAGE_ROWS = 50;   // số dòng mỗi trang mặc định của bảng R&D (cả dạng bảng lẫn thư viện); người dùng chọn 50 / 100 / 200 / tất cả ở chân bảng
const PAGE_SIZES = [50, 100, 200, 0] as const;   // 0 = tất cả

const GROUPABLE = new Set(["select", "badge", "person", "multi"]);
const DEFAULT_W: Partial<Record<Col["type"], number>> = {
  money: 130, number: 100, date: 110, datetime: 130, select: 150, badge: 150, person: 160, images: 110, link: 200, longtext: 240, multi: 200,
};

function loadPrefs(key: string): Prefs {
  try { return JSON.parse(localStorage.getItem(`grid:${key}`) ?? "{}"); } catch { return {}; }
}
function savePrefs(key: string, p: Prefs) {
  try { localStorage.setItem(`grid:${key}`, JSON.stringify(p)); } catch { /* chế độ riêng tư: bỏ qua */ }
}

// Vùng bảng / thư viện cao tới sát đáy màn hình: đo vị trí thật, tính lại khi đổi cỡ cửa sổ hoặc nội dung phía trên thay đổi
// Chiều cao gần nhất đã đo, dùng chung cho Bảng / Thư viện và mọi tab: bảng mới dựng (đổi tab, đổi chế độ xem) vẽ ngay đúng cỡ cũ rồi chỉnh
// trước khi hiện (đo bằng useLayoutEffect) → khung không nhảy cao/thấp lúc chuyển qua lại
let lastFillH: number | null = null;
const CHIP_STD = "26rem";   // bề rộng chuẩn của dãy chip = bảng nhiều chip nhất (Quay chụp: Tất cả · Chờ xử lý · Đang quay · Hoàn thành ≈ 25rem đo thực tế)
function useFillHeight<T extends HTMLElement>(gap = 1) {
  // Phần tử giữ trong state (ref gọi lại) — bảng xuất hiện muộn (đổi Bảng ↔ Thư viện, tải cấu hình…) vẫn được đo, không bị bỏ sót
  const [el, setEl] = useState<T | null>(null);
  const [h, setH0] = useState<number | null>(lastFillH);
  const setH = (v: number) => { lastFillH = v; setH0(v); };
  useLayoutEffect(() => {
    if (!el) return;
    // Vị trí tuyệt đối trên trang (cộng phần đã cuộn) — đo đúng cả khi trang đang cuộn dở
    // Chỗ phải chừa dưới bảng = mọi khối đứng sau nó (thanh nút lưu…) + đệm dưới của các khung bao ngoài, tới tận body
    const below = () => {
      let sum = 0;
      for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
        for (let sib = n.nextElementSibling as HTMLElement | null; sib; sib = sib.nextElementSibling as HTMLElement | null) {
          const cs = getComputedStyle(sib);
          if (cs.display === "none" || cs.position === "fixed" || cs.position === "absolute") continue;
          sum += sib.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
        }
        const par = n.parentElement;
        if (par && par !== document.body) { const ps = getComputedStyle(par); sum += parseFloat(ps.paddingBottom) + parseFloat(ps.borderBottomWidth); }
      }
      return sum;
    };
    let raf = 0;
    const measure = () => {
      setH(Math.max(256, Math.round(window.innerHeight - (el.getBoundingClientRect().top + window.scrollY) - below() - gap)));
    };
    measure();
    const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    // Khối phía trên bảng (banner lỗi đồng bộ, số đếm trên tab…) hiện muộn làm bảng bị đẩy xuống → các khung bao ngoài đổi cỡ.
    // Quan sát từng khung bao (chỉ phản ứng khi ĐỔI CỠ, nhẹ hơn nhiều so với theo dõi mọi thay đổi DOM — cách đó làm bấm vào bị trễ)
    const ro = new ResizeObserver(later);
    for (let n: HTMLElement | null = el.parentElement; n; n = n.parentElement) ro.observe(n);
    window.addEventListener("resize", later);
    window.addEventListener("load", later);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener("resize", later); window.removeEventListener("load", later); };
  }, [el, gap]);
  return [setEl, h] as const;
}

// Biểu tượng nét mảnh cho thanh công cụ của bảng (đường SVG 24×24)
const ICO = {
  table: "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM3 10h18M9 10v10",
  cards: "M5 4h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM15 4h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM5 14h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1zM15 14h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4.3-4.3",
  calendar: "M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM4 10h16M9 3v4M15 3v4",
  filter: "M3 4h18l-7 8.5V19l-4 2v-8.5z",                                                        // phễu lọc
  group: "M4 4h6v6H4zM4 14h6v6H4zM14 6h7M14 9h4M14 16h7M14 19h4",                                  // các khối có danh sách → gom nhóm
  columns: "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 4v16M15 4v16", // bảng chia cột → ẩn / hiện trường
  rows: "M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4",                                                        // mũi tên lên xuống → chiều cao hàng
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  sort: "M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4",                                                   // mũi tên lên / xuống → sắp xếp
  size: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7",                                                    // phóng to / thu nhỏ → cỡ thẻ
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3", redo: "M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3",
};
const Ico = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
const Dot = () => <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-surface" aria-hidden />;   // chấm "đang bật" ở góc, viền trắng tách khỏi biểu tượng

export default function DataGrid({ tableKey, columns: baseColumns, rows: allRows, save, add, remove, restore, tabsKey, tabsKey2, addForm, monthKey, defaultHidden = [], cardShow, defaultCover, defaultGroup, groupRev, defaultView, info, empty = "Chưa có bản ghi nào.", onChanged }: {
  tableKey: string; columns: Col[]; rows: GridRow[];
  save: (rowId: string, key: string, value: CellValue) => Promise<unknown>;
  remove?: (rowIds: string[]) => Promise<unknown>;
  restore?: (token: string) => Promise<unknown>;   // khôi phục dòng đã xoá (hoàn tác) từ ảnh chụp server ký
  add?: { keys: string[]; action: (values: Record<string, CellValue>) => Promise<unknown>; defaults?: Record<string, CellValue>; cols?: Record<string, Col>; required?: string[] };
  addForm?: string;   // có giá trị = "Thêm bản ghi" mở form nhập (hộp thoại, giá trị là tiêu đề) thay cho dòng ＋ nhập tại chỗ
  tabsKey?: string; tabsKey2?: string; monthKey?: string; defaultHidden?: string[];
  groupRev?: number;   // tăng số này khi đổi cách nhóm mặc định của bảng: nhóm người dùng đã lưu TRƯỚC phiên bản này bị bỏ qua một lần (dùng nhóm mặc định mới); chọn lại nhóm thì lưu theo phiên bản mới
  defaultCover?: string;   // Thư viện: cột ảnh làm ảnh bìa khi người dùng chưa tự chọn (vd bảng Vẽ 3D lấy Ảnh 3D); chưa có ảnh thì tự lấy nguồn khác
  cardShow?: string[];   // Thư viện: các trường hiện sẵn trên thẻ khi người dùng CHƯA tự chỉnh (còn lại ẩn); ai muốn xem thêm bấm ◫ Cột — lựa chọn đó lưu riêng cho từng người
  defaultGroup?: string; defaultView?: "table" | "gallery"; info?: string; empty?: string;
  // Không gian R&D: báo kho dữ liệu phía trình duyệt tải lại ở nền (thay cho router.refresh — không tải lại cả trang)
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const changed = () => { noteWrite(); return onChanged ? onChanged() : startRefresh(() => router.refresh()); };
  const [prefs, setPrefs] = useState<Prefs>({});
  const columns = useMemo(() => baseColumns.map((c) => (prefs.labels?.[c.key] ? { ...c, label: prefs.labels[c.key] } : c)), [baseColumns, prefs.labels]);
  const [ready, setReady] = useState(false);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [match, setMatch] = useState<FilterMatch>("all");
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- đọc localStorage (tuỳ chọn + bộ lọc đã lưu) sau khi mount */
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Lưu lên tài khoản sau 1 giây kể từ lần đổi cuối (không ghi mỗi lần bấm). Lỗi mạng: bỏ qua, còn bản trong trình duyệt.
  const pendingSync = useRef<Prefs | null>(null);
  const flushSync = (key: string) => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = null;
    const p = pendingSync.current;
    pendingSync.current = null;
    if (p) void saveGridPrefs(key, p as Record<string, unknown>).catch(() => {});
  };
  const syncToServer = (p: Prefs) => {
    pendingSync.current = p;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => flushSync(tableKey), 1000);
  };
  const applyPrefs = (saved: Prefs) => {
    setPrefs(saved);
    const byK = new Map(baseColumns.map((c) => [c.key, c]));
    // Bỏ điều kiện của cột không còn, và điều kiện cột chọn lưu dạng chữ gõ tay (bản cũ) — giờ chọn bằng pill
    setFilters((saved.filters ?? []).filter((f) => { const c = byK.get(f.key); return !!c && !(kindOf(c.type) === "choice" && typeof f.value === "string"); }));
    setMatch(saved.match ?? "all");
  };
  useEffect(() => {
    const local = loadPrefs(tableKey);
    applyPrefs(local);   // hiện ngay bản trong trình duyệt
    setReady(true);
    let alive = true;
    // Rồi lấy bản theo tài khoản (đúng trên mọi máy); chưa có bản nào trên máy chủ → đẩy bản hiện có lên
    getGridPrefs(tableKey).then((r) => {
      if (!alive || !("ok" in r)) return;
      if (r.data) { applyPrefs(r.data as Prefs); savePrefs(tableKey, r.data as Prefs); }
      else if (Object.keys(local).length) syncToServer(local);
    }).catch(() => {});
    return () => { alive = false; flushSync(tableKey); };   // đổi bảng / rời trang: ghi nốt thay đổi đang chờ
  }, [tableKey]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  const update = (p: Partial<Prefs>) => setPrefs((cur) => { const n = { ...cur, ...p, ...("group" in p && groupRev ? { groupRev } : {}) }; savePrefs(tableKey, n); syncToServer(n); return n; });

  const [q, setQ] = useState("");
  const [tab, setTab] = useState<string | null>(null);
  const activeFilters = filters.filter(isActive);
  const [panel, setPanel] = useState<null | "filter" | "fields" | "group" | "rowh" | "card">(null);
  const [panelX, setPanelX] = useState(0);
  const [ask, setAsk] = useState<{ msg: string; resolve: (v: string | null) => void } | null>(null);   // hộp hỏi lý do (thay prompt() của trình duyệt — dễ bị chặn / không hiện)
  const askNote = (msg: string) => new Promise<string | null>((resolve) => setAsk({ msg, resolve }));
  const [fieldDrag, setFieldDrag] = useState<string | null>(null);   // trường đang kéo trong bảng Trường
  // Khung xổ xuống mở ngay dưới nút vừa bấm; sát mép phải thì dịch sang trái cho vừa
  const togglePanel = (name: NonNullable<typeof panel>, e: React.MouseEvent<HTMLButtonElement>) => {
    if (panel === name) { setPanel(null); return; }
    const btnEl = e.currentTarget, bar = btnEl.parentElement!;
    const w = name === "rowh" || name === "group" ? 208 : name === "filter" ? 560 : 320;   // khung "card" cũng 320
    setPanelX(Math.max(0, Math.min(btnEl.offsetLeft, bar.clientWidth - w)));
    setPanel(name);
  };
  // Vùng chọn nhiều ô: ô neo = selected, ô cuối = rangeEnd (kéo chuột, Shift+bấm hoặc Shift+mũi tên)
  const [rangeEnd, setRangeEnd] = useState<{ row: string; key: string } | null>(null);
  const dragFrom = useRef<{ row: string; key: string } | null>(null);
  useEffect(() => {
    const up = () => { dragFrom.current = null; };
    document.addEventListener("mouseup", up);
    return () => document.removeEventListener("mouseup", up);
  }, []);
  const [selCol, setSelCol] = useState<string | null>(null);   // cột được chọn (bấm tiêu đề)
  const renameAt = useRef(0);   // thời điểm mở ô đổi tên — bỏ qua blur ngay lúc mới mở (menu vừa đóng giành lại tiêu điểm)
  const [renaming, setRenaming] = useState<string | null>(null);   // cột đang đổi tên (ô nhập ngay tại tiêu đề)
  const [sortMenu, setSortMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  const [scoreFor, setScoreFor] = useState<string | null>(null);   // bảng Sưu tầm: mẫu đang mở form chấm điểm
  useEffect(() => {
    if (!sortMenu) return;
    // React của Next gắn sự kiện ở document nên stopPropagation không chặn được — tự bỏ qua bấm trong menu / nút mở menu
    const close = (e?: Event) => { if (e?.target instanceof Element && e.target.closest("[data-colmenu]")) return; setSortMenu(null); };
    document.addEventListener("mousedown", close); window.addEventListener("scroll", close, true);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("scroll", close, true); };
  }, [sortMenu]);
  const [editing, setEditing] = useState<{ row: string; key: string } | null>(null);
  // Ô đang chọn (giống Lark): nhấp lần 1 = chọn, nhấp lần 2 / Enter = sửa; mũi tên di chuyển
  const [selected, setSelected] = useState<{ row: string; key: string } | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [fillRef, fillH] = useFillHeight<HTMLDivElement>();
  const gridEl = useCallback((el: HTMLDivElement | null) => { gridRef.current = el; fillRef(el); }, [fillRef]);
  const [viewer, setViewer] = useState<{ images: { url: string; alt?: string }[]; start: number } | null>(null);   // xem ảnh lớn
  const [pasting, setPasting] = useState<string | null>(null);
  const [local, setLocal] = useState<Record<string, Record<string, CellValue>>>({});   // sửa lạc quan, chờ server
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Record<string, CellValue>>({});
  const [addEdit, setAddEdit] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  // Lịch sử sửa của DÒNG ĐANG THÊM (chưa lưu) — Ctrl+Z khi đang thêm bản ghi hoàn tác nháp trước, rồi mới tới các thao tác đã lưu
  type DraftChange = { key: string; label: string; before: CellValue | File[]; after: CellValue | File[]; files?: boolean };
  const [draftHist, setDraftHist] = useState<DraftChange[]>([]);
  const [draftFuture, setDraftFuture] = useState<DraftChange[]>([]);
  const [draftFiles, setDraftFiles] = useState<Record<string, File[]>>({});   // ảnh chọn ở dòng thêm — tải lên sau khi tạo bản ghi
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Lọc theo tháng (cột ngày monthKey): null = tất cả. Giờ (datetime) tính theo giờ VN
  const [month, setMonth] = useState<string | null>(null);
  const monthOf = (v: CellValue | undefined) => {
    if (typeof v !== "string" || v.length < 7) return "";
    return v.length > 10 ? new Date(Date.parse(v) + 7 * 3_600_000).toISOString().slice(0, 7) : v.slice(0, 7);
  };
  const rows = useMemo(() => (monthKey && month ? allRows.filter((r) => monthOf(r.cells[monthKey]) === month) : allRows), [allRows, monthKey, month]);
  const shiftMonth = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  const [thisMonth] = useState(() => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 7));
  // Dòng được tick để xoá (chỉ dòng có quyền xoá)
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const deletable = !!remove && rows.some((r) => r.del);
  // Chỉ tính dòng còn tồn tại + còn quyền xoá (dữ liệu server có thể đã đổi)
  const picked = useMemo(() => new Set([...checked].filter((id) => rows.some((r) => r.id === id && r.del))), [checked, rows]);

  // Dữ liệu mới từ server → bỏ các giá trị lạc quan
  useEffect(() => { setLocal({}); }, [rows]); // eslint-disable-line react-hooks/set-state-in-effect -- đồng bộ sau khi server trả dữ liệu

  // Sau khi sửa ô, kho dữ liệu tải lại ở nền → bảng dựng lại với dòng mới. Giữ nguyên vị trí cuộn (trong bảng và cả trang) và tiêu điểm bàn phím
  // ở ô đang chọn, để người dùng sửa tiếp ô kế bên mà không bị đẩy về đầu bảng.
  const scrollMemo = useRef({ top: 0, left: 0, winY: 0 });
  useEffect(() => {
    const onWin = () => { scrollMemo.current.winY = window.scrollY; };
    onWin();
    window.addEventListener("scroll", onWin, { passive: true });
    return () => window.removeEventListener("scroll", onWin);
  }, []);
  useLayoutEffect(() => {
    const g = gridRef.current, m = scrollMemo.current;
    if (g && (g.scrollTop !== m.top || g.scrollLeft !== m.left)) { g.scrollTop = m.top; g.scrollLeft = m.left; }
    if (Math.abs(window.scrollY - m.winY) > 2) window.scrollTo({ top: m.winY });
    if (g && selected && !editing && (document.activeElement === document.body || !document.activeElement)) g.focus({ preventScroll: true });
  }, [allRows]); // eslint-disable-line react-hooks/exhaustive-deps -- chỉ chạy khi dữ liệu dòng đổi

  const byKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const order = useMemo(() => {
    const known = (prefs.order ?? []).filter((k) => byKey.has(k));
    return [...known, ...columns.map((c) => c.key).filter((k) => !known.includes(k))];
  }, [prefs.order, columns, byKey]);
  // Mặc định xem dạng Thư viện (thẻ có ảnh) với bảng có cột ảnh; người dùng đổi sang Bảng thì nhớ lựa chọn đó
  const isGallery = ready && (prefs.view ?? defaultView ?? (columns.some((c) => c.type === "images") ? "gallery" : "table")) === "gallery";
  const card = CARD[(ready && prefs.card) || "m"];
  // Trường ẩn / hiện tách theo kiểu xem: Bảng dùng `hidden`, Thư viện dùng `cardHidden` → bảng "Trường" luôn khớp đúng những gì đang hiện trên thẻ.
  // Chưa chỉnh lần nào: thẻ chỉ lấy các trường thường đầu tiên (theo cỡ thẻ) cho gọn, phần còn lại ẩn sẵn; số liệu lớn / huy hiệu / link / thao tác luôn hiện.
  const hiddenKey = isGallery ? "cardHidden" : "hidden";
  const cardDefaultHidden = (() => {
    if (cardShow) return order.filter((k, i) => i > 0 && !cardShow.includes(k));   // danh sách hiện sẵn do cấu hình bảng quy định (cột đầu luôn hiện)
    const plain = order.filter((k, i) => {
      const c = byKey.get(k)!;
      return i > 0 && k !== "name" && k !== "code" && !defaultHidden.includes(k) && !c.action
        && !["images", "link", "badge"].includes(c.type) && !(c.type === "number" && c.sum && k !== "qty");
    });
    return [...defaultHidden, ...plain.slice(card.fields)];
  })();
  const hidden = new Set(ready ? (isGallery ? prefs.cardHidden ?? cardDefaultHidden : prefs.hidden ?? defaultHidden) : defaultHidden);
  const visible = order.filter((k) => !hidden.has(k)).map((k) => byKey.get(k)!);
  const widthOf = (c: Col) => prefs.widths?.[c.key] ?? c.width ?? DEFAULT_W[c.type] ?? 160;
  const groupSaved = prefs.group !== undefined && (!groupRev || (prefs.groupRev ?? 0) >= groupRev);   // nhóm đã lưu còn hiệu lực (không bị phiên bản nhóm mặc định mới thay)
  const groupKey = ready ? (!groupSaved ? defaultGroup : prefs.group || undefined) : defaultGroup;
  const sort = prefs.sort ?? null;
  const rowH = ROW_H[(ready && prefs.rowH) || "s"];
  const imageCols = columns.filter((c) => c.type === "images");
  const coverKey = prefs.cover && byKey.get(prefs.cover)?.type === "images" ? prefs.cover : defaultCover && byKey.get(defaultCover)?.type === "images" ? defaultCover : (imageCols.find((c) => !c.lookup) ?? imageCols[0])?.key;
  // Các nguồn ảnh trên thẻ: ảnh bìa trước, rồi các cột ảnh còn lại (bấm chuyển để đối chiếu)
  const coverCols = coverKey ? [byKey.get(coverKey)!, ...imageCols.filter((c) => c.key !== coverKey)] : [];

  const val = (r: GridRow, k: string) => (local[r.id] && k in local[r.id] ? local[r.id][k] : r.cells[k]);
  const canEdit = (r: GridRow, c: Col) => !!c.editable && !c.lookup && (r.edit === "all" || (Array.isArray(r.edit) && r.edit.includes(c.key)));

  // ---------- lọc / tìm / sắp xếp ----------
  const tabCol = tabsKey ? byKey.get(tabsKey) : undefined;
  const tabCol2 = tabsKey2 ? byKey.get(tabsKey2) : undefined;   // cột tab phụ (vd. Duyệt source: Đạt / Sửa lại) nằm cạnh tab trạng thái
  const tabCounts = useMemo(() => {
    const m = new Map<string, number>();
    if (tabCol) for (const r of rows) { const v = textOf(tabCol, r.cells[tabCol.key]) || "—"; m.set(v, (m.get(v) ?? 0) + 1); }
    return m;
  }, [rows, tabCol]);
  const tabCounts2 = useMemo(() => {
    const m = new Map<string, number>();
    if (tabCol2) for (const r of rows) { const v = textOf(tabCol2, r.cells[tabCol2.key]); if (v) m.set(v, (m.get(v) ?? 0) + 1); }
    return m;
  }, [rows, tabCol2]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    let list = rows.filter((r) =>
      (!tab || (tab.startsWith("2:")
        ? !tabCol2 || textOf(tabCol2, r.cells[tabCol2.key]) === tab.slice(2)
        : !tabCol || (textOf(tabCol, r.cells[tabCol.key]) || "—") === tab))
      && (!activeFilters.length || activeFilters[match === "all" ? "every" : "some"]((f) => {
        const c = byKey.get(f.key);
        return !c || matchFilter(c, r.cells[f.key], f);
      }))
      && (!k || columns.some((c) => textOf(c, r.cells[c.key]).toLowerCase().includes(k))));
    if (sort) {
      const c = byKey.get(sort[0]);
      if (c) list = [...list].sort((a, b) => {
        const x = a.cells[c.key], y = b.cells[c.key];
        if (x === null || x === undefined || x === "") return 1;
        if (y === null || y === undefined || y === "") return -1;
        const n = typeof x === "number" && typeof y === "number" ? x - y : textOf(c, x).localeCompare(textOf(c, y), "vi", { numeric: true });
        return n * sort[1];
      });
    }
    return list;
  }, [rows, q, tab, tabCol, tabCol2, activeFilters, match, sort, byKey, columns]);

  const allGroups = useMemo(() => {
    if (!groupKey || !byKey.has(groupKey)) return [{ key: "", label: "", rows: shown }];
    const c = byKey.get(groupKey)!;
    const m = new Map<string, GridRow[]>();
    for (const r of shown) {
      const keys = c.type === "multi" ? (asList(r.cells[c.key]).length ? asList(r.cells[c.key]) : [""]) : [String(r.cells[c.key] ?? "")];
      for (const k of keys) m.set(k, [...(m.get(k) ?? []), r]);
    }
    const order = c.type === "person" ? (c.people ?? []).map((p) => p.id) : (c.options ?? []).map((o) => o.value);
    return [...m.entries()]
      .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999)))
      .map(([k, rs]) => ({ key: k, label: k ? textOf(c, k) || k : "(Trống)", rows: rs }));
  }, [shown, groupKey, byKey]);

  // Phân trang: tối đa PAGE_ROWS dòng mỗi trang (trên danh sách đã tìm / lọc / sắp xếp / nhóm). Đổi tìm kiếm, bộ lọc, sắp xếp, nhóm → về trang 1.
  const pageKey = `${q}|${tab}|${JSON.stringify(filters)}|${JSON.stringify(sort)}|${groupKey ?? ""}`;
  const [pageState, setPageState] = useState({ page: 1, key: "" });
  const pageSize = (PAGE_SIZES as readonly number[]).includes(prefs.pageSize ?? PAGE_ROWS) ? (prefs.pageSize ?? PAGE_ROWS) : PAGE_ROWS;
  const perPage = pageSize || Math.max(shown.length, 1);
  const pagesTotal = Math.max(1, Math.ceil(shown.length / perPage));
  const page = Math.min(pageState.key === pageKey ? pageState.page : 1, pagesTotal);
  const goPage = (n: number) => setPageState({ page: Math.min(Math.max(1, n), pagesTotal), key: pageKey });
  // Cắt theo thứ tự hiển thị (nhóm nối nhau); tiêu đề nhóm vẫn ghi TỔNG số dòng của nhóm (total)
  const groups = useMemo(() => {
    const start = (page - 1) * perPage, end = page * perPage;
    let seen = 0;
    const out: { key: string; label: string; rows: GridRow[]; total: number }[] = [];
    for (const g of allGroups) {
      const slice = g.rows.slice(Math.max(0, start - seen), Math.max(0, end - seen));
      seen += g.rows.length;
      if (slice.length) out.push({ ...g, rows: slice, total: g.rows.length });
    }
    return out;
  }, [allGroups, page, perPage]);

  // ---------- lưu ô ----------
  const draftNow = (k: string): CellValue => draft[k] ?? add?.defaults?.[k] ?? null;
  const trackDraft = (ch: DraftChange) => { setDraftHist((h) => [...h.slice(-49), ch]); setDraftFuture([]); };
  const setDraftValue = (c: Col, nv: CellValue) => {
    const before = draftNow(c.key);
    if (JSON.stringify(before ?? null) === JSON.stringify(nv ?? null)) return;
    setDraft((d) => ({ ...d, [c.key]: nv }));
    trackDraft({ key: c.key, label: c.label, before, after: nv });
  };
  const setDraftFilesTracked = (key: string, next: File[]) => {
    const before = draftFiles[key] ?? [];
    setDraftFiles((d) => ({ ...d, [key]: next }));
    trackDraft({ key, label: byKey.get(key)?.label ?? key, before, after: next, files: true });
  };
  function applyDraft(ch: DraftChange, to: CellValue | File[]) {   // khai báo dạng hàm (được nâng lên) vì undo / redo ở phía trên gọi tới
    if (ch.files) setDraftFiles((d) => ({ ...d, [ch.key]: to as File[] }));
    else setDraft((d) => ({ ...d, [ch.key]: to as CellValue }));
  }

  // Hoàn tác / làm lại (giống Lark): mỗi thao tác ghi lại đủ để đảo ngược
  //   cell   — sửa 1 ô (giá trị trước → sau), gửi lại qua đúng đường lưu ô
  //   images — thêm / xoá ảnh (danh sách đường dẫn trước → sau; file ảnh được giữ lại trong kho)
  //   rows   — thêm / xoá bản ghi (xoá: server giữ ảnh chụp dữ liệu có chữ ký để khôi phục)
  type Change =
    | { type: "cell"; row: string; key: string; label: string; before: CellValue; after: CellValue }
    | { type: "images"; kind: ImageKind; rowId: string; label: string; before: string[]; after: string[] }
    | { type: "rows"; op: "add" | "delete"; ids: string[]; label: string; token: string | null };
  const [undoStack, setUndoStack] = useState<Change[]>([]);
  const [redoStack, setRedoStack] = useState<Change[]>([]);
  const [undoMsg, setUndoMsg] = useState<string | null>(null);
  const pushUndo = (ch: Change) => { setUndoStack((st) => [...st.slice(-49), ch]); setRedoStack([]); };

  // Đơn / yêu cầu media khôi phục xong nhận id mới → cập nhật id trong mọi thao tác đang nhớ
  const remapIds = (map: Record<string, string>) => {
    if (!Object.keys(map).length) return;
    const fix = (ch: Change): Change =>
      ch.type === "cell" ? { ...ch, row: map[ch.row] ?? ch.row }
        : ch.type === "images" ? (ch.kind === "media" ? { ...ch, rowId: map[ch.rowId] ?? ch.rowId } : ch)
          : { ...ch, ids: ch.ids.map((x) => map[x] ?? x) };
    setUndoStack((st) => st.map(fix)); setRedoStack((st) => st.map(fix));
  };

  // track: "new" = sửa mới (xoá ngăn làm lại) · "undo" / "redo" = đang hoàn tác / làm lại
  async function commit(r: GridRow, c: Col, v: CellValue, track: "new" | "undo" | "redo" = "new"): Promise<boolean> {
    const old = val(r, c.key);
    if (JSON.stringify(old ?? null) === JSON.stringify(v ?? null)) return false;
    setLocal((l) => ({ ...l, [r.id]: { ...(l[r.id] ?? {}), [c.key]: v } }));
    setError(null);
    try {
      try {
        unwrap(await save(r.id, c.key, v));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (!c.noteKey || !/lý do/i.test(msg)) throw e;
        const note = (await askNote(msg.replace(/\s*\(ở cột[^)]*\)/, "")))?.trim();
        if (!note) throw new Error("Đã huỷ — cần ghi lý do");
        unwrap(await save(r.id, c.noteKey, note));
        unwrap(await save(r.id, c.key, v));
      }
      changed();
      if (track === "new") pushUndo({ type: "cell", row: r.id, key: c.key, label: c.label, before: old ?? null, after: v });
      return true;
    } catch (e) {
      setLocal((l) => { const n = { ...l, [r.id]: { ...(l[r.id] ?? {}) } }; delete n[r.id][c.key]; return n; });
      setError(`${c.label}: ${e instanceof Error ? e.message : "Lỗi lưu"}`);
      return false;
    }
  }

  // Áp dụng đảo ngược (dir = "undo") hoặc làm lại (dir = "redo") 1 thao tác. Thành công → trả thao tác (có thể đã đổi id / token) + mô tả
  async function applyChange(ch: Change, dir: "undo" | "redo"): Promise<{ ch: Change; what: string } | null> {
    setError(null);
    try {
      if (ch.type === "cell") {
        const r = rows.find((x) => x.id === ch.row), c = byKey.get(ch.key);
        if (!r || !c) throw new Error("bản ghi không còn trong bảng");
        if (!(await commit(r, c, dir === "undo" ? ch.before : ch.after, dir))) return null;
        return { ch, what: `${ch.label} (${String(r.cells[columns[0]?.key] ?? "")})` };
      }
      if (ch.type === "images") {
        unwrap(await setGridImages(ch.kind, ch.rowId, dir === "undo" ? ch.before : ch.after));
        changed();
        return { ch, what: `ảnh ${ch.label}` };
      }
      // rows: hoàn tác "thêm" = xoá lại · hoàn tác "xoá" = khôi phục (làm lại thì ngược)
      const restoring = (ch.op === "add") === (dir === "redo");
      if (restoring) {
        if (!restore) throw new Error("bảng này không hỗ trợ khôi phục");
        if (!ch.token) throw new Error("không còn dữ liệu để khôi phục (đã tải lại trang hoặc quá hạn)");
        const res = unwrap(await restore(ch.token)) as { map?: Record<string, string> } | undefined;
        const map = res?.map ?? {};
        remapIds(map);
        changed();
        return { ch: { ...ch, ids: ch.ids.map((x) => map[x] ?? x), token: null }, what: `${ch.op === "add" ? "thêm" : "xoá"} ${ch.ids.length} bản ghi` };
      }
      if (!remove) throw new Error("bảng này không hỗ trợ xoá");
      const res = unwrap(await remove(ch.ids)) as { restore?: string | null; note?: string | null } | undefined;
      changed();
      if (!res?.restore) setUndoMsg(res?.note ?? "Đã xoá nhưng không thể hoàn tác thao tác này nữa");
      return { ch: { ...ch, token: res?.restore ?? null }, what: `${ch.op === "add" ? "thêm" : "xoá"} ${ch.ids.length} bản ghi` };
    } catch (e) {
      setError(`Không ${dir === "undo" ? "hoàn tác" : "làm lại"} được: ${e instanceof Error ? e.message : "lỗi"}`);
      return null;
    }
  }

  async function undo() {
    if (adding && draftHist.length) {
      const d = draftHist.at(-1)!;
      setDraftHist((h) => h.slice(0, -1)); setDraftFuture((f) => [...f, d]); applyDraft(d, d.before);
      setUndoMsg(`↶ Đã hoàn tác: ${d.label} (dòng đang thêm)`);
      return;
    }
    const ch = undoStack.at(-1);
    if (!ch) return;
    setUndoStack((st) => st.slice(0, -1));
    const done = await applyChange(ch, "undo");
    if (done) { setRedoStack((st) => [...st, done.ch]); setUndoMsg(`↶ Đã hoàn tác: ${done.what}`); }
  }
  async function redo() {
    if (adding && draftFuture.length) {
      const d = draftFuture.at(-1)!;
      setDraftFuture((f) => f.slice(0, -1)); setDraftHist((h) => [...h, d]); applyDraft(d, d.after);
      setUndoMsg(`↷ Đã làm lại: ${d.label} (dòng đang thêm)`);
      return;
    }
    const ch = redoStack.at(-1);
    if (!ch) return;
    setRedoStack((st) => st.slice(0, -1));
    const done = await applyChange(ch, "redo");
    if (done) { setUndoStack((st) => [...st, done.ch]); setUndoMsg(`↷ Đã làm lại: ${done.what}`); }
  }
  // Ctrl+Z hoàn tác · Ctrl+Y / Ctrl+Shift+Z làm lại — khi KHÔNG đang gõ trong ô nhập (đang gõ thì để trình duyệt hoàn tác chữ)
  const undoRef = useRef({ undo, redo });
  useEffect(() => { undoRef.current = { undo, redo }; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undoRef.current.undo(); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); undoRef.current.redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!undoMsg) return;
    const t = setTimeout(() => setUndoMsg(null), 4000);
    return () => clearTimeout(t);
  }, [undoMsg]);

  async function removeChecked() {
    if (!remove || !picked.size) return;
    const label = (r: GridRow) => String(r.cells[columns[0]?.key] ?? r.id);
    const list = rows.filter((r) => picked.has(r.id));
    if (!confirm(`Xoá vĩnh viễn ${list.length} bản ghi?
${list.slice(0, 8).map(label).join(", ")}${list.length > 8 ? "…" : ""}

Có thể hoàn tác bằng Ctrl+Z (trừ mẫu đã có kết luận / bàn giao).`)) return;
    setDeleting(true); setError(null);
    try {
      const ids = list.map((r) => r.id);
      const res = unwrap(await remove(ids)) as { restore?: string | null; note?: string | null } | undefined;
      setChecked(new Set());
      if (res?.restore) pushUndo({ type: "rows", op: "delete", ids, label: `xoá ${ids.length} bản ghi`, token: res.restore });
      else setUndoMsg(res?.note ?? "Đã xoá — thao tác này không hoàn tác được");
      changed();
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi xoá bản ghi"); }
    finally { setDeleting(false); }
  }
  const toggleCheck = (id: string) => { setSelected(null); setRangeEnd(null); setSelCol(null); setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };

  const addDraftImages = (key: string, files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (imgs.length) setDraftFilesTracked(key, [...(draftFiles[key] ?? []), ...imgs]);
  };

  async function addRow(keepOpen: boolean) {
    if (!add) return;
    // Trường bắt buộc (form thêm mẫu): thiếu thì báo ngay, không gọi máy chủ
    const merged = { ...(add.defaults ?? {}), ...draft };
    const missing = (add.required ?? []).filter((k) => { const v = merged[k]; return v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length); })
      .map((k) => (add.cols?.[k] ?? byKey.get(k))?.label ?? k);
    if (missing.length) { setError(`Nhập đủ các trường bắt buộc: ${missing.join(", ")}`); return; }
    setSaving(true); setError(null);
    try {
      const newId = unwrap(await add.action({ ...(add.defaults ?? {}), ...draft }));
      if (newId !== null && newId !== undefined && typeof newId !== "object") pushUndo({ type: "rows", op: "add", ids: [String(newId)], label: "thêm bản ghi", token: null });
      // Bản ghi đã tạo → tải ảnh đã chọn vào các ô ảnh (cần id bản ghi mới)
      const fileCols = Object.entries(draftFiles).filter(([, fs]) => fs.length);
      if (newId !== null && newId !== undefined && fileCols.length) {
        for (const [key, files] of fileCols) {
          const c = add.cols?.[key] ?? byKey.get(key);
          const err = await uploadCellImages(c?.imageKind ?? "product", String(newId), files, setPasting);
          if (err) setError(`Đã thêm bản ghi, nhưng ${c?.label ?? "ảnh"}: ${err}`);
        }
      }
      setDraft({}); setDraftFiles({}); setDraftHist([]); setDraftFuture([]);
      if (!keepOpen) setAdding(false);
      changed();
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi thêm bản ghi"); }
    finally { setSaving(false); }
  }

  // ---------- kéo cột ----------
  // Kéo cột kiểu Lark: giữ chuột ở tiêu đề (bàn tay nắm), hình mờ của cả cột đi theo chuột, thả vào vị trí mới
  const [colDrag, setColDrag] = useState<{ from: string; over: string | null; after: boolean } | null>(null);
  const justDragged = useRef(false);
  function startColDrag(e: React.MouseEvent<HTMLTableCellElement>, c: Col) {
    if (e.button !== 0 || selCol !== c.key || (e.target as HTMLElement).closest("button,input")) return;   // chỉ kéo được cột đang chọn (bấm tiêu đề trước)
    const th = e.currentTarget, grid = gridRef.current, table = th.closest("table");
    if (!grid || !table) return;
    const idx = visible.findIndex((x) => x.key === c.key);
    const x0 = e.clientX, y0 = e.clientY, grabX = e.clientX - th.getBoundingClientRect().left;
    let ghost: HTMLDivElement | null = null, style: HTMLStyleElement | null = null;
    let over: string | null = null, after = false;

    const begin = () => {
      const gr = grid.getBoundingClientRect(), w = th.offsetWidth;
      ghost = document.createElement("div");
      Object.assign(ghost.style, { position: "fixed", zIndex: "60", pointerEvents: "none", opacity: "0.65", width: `${w}px`, height: `${grid.clientHeight}px`,
        overflow: "hidden", top: `${gr.top}px`, left: `${th.getBoundingClientRect().left}px`, background: "var(--surface)", border: "1px solid var(--accent)", boxShadow: "0 6px 20px rgba(0,0,0,.18)" });
      // Cả cột: tiêu đề cố định ở trên + các dòng đang hiện (cuộn theo vị trí bảng hiện tại)
      const body = document.createElement("div");
      const headH = th.offsetHeight;
      Object.assign(body.style, { position: "absolute", left: "0", top: `${headH}px`, width: `${w}px`, transform: `translateY(${-grid.scrollTop}px)` });
      for (const tr of table.querySelectorAll("thead tr, tbody tr")) {
        const cell = tr.children[idx + 1] as HTMLElement | undefined;
        if (!cell || tr.children.length !== visible.length + 1) continue;
        const cl = cell.cloneNode(true) as HTMLElement;
        Object.assign(cl.style, { display: "block", position: "relative", left: "0", top: "0", width: `${w}px`, height: `${cell.offsetHeight}px`, boxSizing: "border-box" });
        cl.classList.remove("sticky");
        if (tr.parentElement?.tagName === "THEAD") { cl.style.position = "absolute"; cl.style.zIndex = "2"; ghost.appendChild(cl); }
        else body.appendChild(cl);
      }
      ghost.prepend(body);
      document.body.appendChild(ghost);
      style = document.createElement("style");
      style.textContent = "*{cursor:grabbing !important;user-select:none !important}";
      document.head.appendChild(style);
      justDragged.current = true;
      setColDrag({ from: c.key, over: null, after: false });
    };
    const move = (ev: MouseEvent) => {
      if (!ghost) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return; begin(); }
      ghost!.style.left = `${ev.clientX - grabX}px`;
      const gr = grid.getBoundingClientRect();
      if (ev.clientX > gr.right - 50) grid.scrollLeft += 18; else if (ev.clientX < gr.left + 110) grid.scrollLeft -= 18;
      const ths = [...table.querySelectorAll("thead th")].slice(1) as HTMLElement[];
      const hit = ths.findIndex((t) => { const r = t.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX < r.right; });
      const target = hit >= 0 ? visible[hit] : undefined;
      over = target && target.key !== c.key ? target.key : null;
      after = hit > idx;
      setColDrag((d) => (d && (d.over !== over || d.after !== after) ? { ...d, over, after } : d));
    };
    const up = () => {
      document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up);
      ghost?.remove(); style?.remove();
      if (ghost) {
        setColDrag(null);
        setTimeout(() => { justDragged.current = false; }, 0);
        if (over) {
          const o = order.filter((k) => k !== c.key);
          o.splice(o.indexOf(over) + (after ? 1 : 0), 0, c.key);
          update({ order: o });
        }
      }
    };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
  }
  function startResize(e: React.MouseEvent, c: Col) {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, w0 = widthOf(c);
    const move = (ev: MouseEvent) => update({ widths: { ...(prefs.widths ?? {}), [c.key]: Math.max(60, w0 + ev.clientX - x0) } });
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }


  const filterable = columns.filter((c) => GROUPABLE.has(c.type));
  // Phép tính mặc định ở chân bảng: cột đầu = đếm bản ghi; cột có cờ sum = tổng; còn lại = ẩn ("Tính")
  const calcOf = (c: Col, i: number): Calc => prefs.calc?.[c.key] ?? (i === 0 ? "count" : c.sum ? "sum" : "none");
  const totalW = visible.reduce((t, c) => t + widthOf(c), 0) + 44;
  // Phương án 3: nút biểu tượng (đang bật = chữ xanh + chấm nhỏ, không tô nền) và chip trạng thái
  const icoBtn = (on: boolean) => `relative flex h-8 w-8 flex-none items-center justify-center rounded-md ${on ? "text-accent" : "text-ink-2 hover:bg-grid hover:text-ink-1"}`;
  const chipCls = (on: boolean) => `flex h-7 flex-none items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs transition-colors ${on ? "bg-accent font-semibold text-white shadow-sm" : "text-ink-2 hover:bg-grid hover:text-ink-1"}`;

  function openViewer(r: GridRow, c: Col, index: number) {
    const cols = [c, ...columns.filter((x) => x.type === "images" && x.key !== c.key)];
    const images = cols.flatMap((x) => ((val(r, x.key) as { url: string; thumb?: string }[] | null) ?? []).map((im, i, arr) => ({ url: im.url, thumb: im.thumb, alt: `${x.label}${arr.length > 1 ? ` ${i + 1}/${arr.length}` : ""}` })));
    setViewer({ images, start: index });
  }

  // Ảnh mẫu / ảnh 3D gắn với bản ghi mẫu; ảnh chụp media gắn với yêu cầu media (dòng)
  const imageRowId = (r: GridRow, c: Col) => (c.imageKind === "media" ? r.id : r.pid ?? r.id);

  // ---------- Sao chép / dán (Ctrl+C / Ctrl+V) dạng bảng TSV — dán được sang Excel / Lark và ngược lại ----------
  const cellText = (r: GridRow, c: Col) => {
    const v = val(r, c.key);
    if (c.type === "images") return Array.isArray(v) ? (v as { url: string }[]).map((im) => im.url).join(" ") : "";
    return textOf(c, v).replace(/[\t\r\n]+/g, " ");
  };
  const flatRows = () => groups.flatMap((g) => (collapsed.has(g.key) ? [] : g.rows));
  const inField = (t: EventTarget) => t instanceof HTMLElement && !!t.closest("input[type=text], input:not([type]), textarea, select, [contenteditable=true]");

  function onGridCopy(e: React.ClipboardEvent) {
    if (editing || inField(e.target)) return;
    const all = flatRows();
    let grid: string[][] | null = null;
    if (range) {
      grid = all.slice(range.r1, range.r2 + 1).map((r) => visible.slice(range.c1, range.c2 + 1).map((c) => cellText(r, c)));
    } else if (selected) {
      const r = all.find((x) => x.id === selected.row), c = byKey.get(selected.key);
      if (r && c) grid = [[cellText(r, c)]];
    } else if (selCol && byKey.has(selCol)) {
      const c = byKey.get(selCol)!;
      grid = all.map((r) => [cellText(r, c)]);
    } else if (picked.size) {
      grid = all.filter((r) => picked.has(r.id)).map((r) => visible.map((c) => cellText(r, c)));
    }
    if (!grid?.length) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", grid.map((row) => row.join("\t")).join("\n"));
    setUndoMsg(selected || selCol || range ? `Đã sao chép ${grid.length * grid[0].length} ô` : `Đã sao chép ${grid.length} bản ghi`);
  }

  // Văn bản → giá trị ô theo kiểu cột; undefined = không dán được vào kiểu này
  function parseCell(c: Col, raw: string): CellValue | undefined {
    const t = raw.trim();
    switch (c.type) {
      case "images": return undefined;
      case "number": case "money": {
        if (!t) return null;
        const n = Number(t.replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
        return Number.isFinite(n) ? n : undefined;
      }
      case "date": case "datetime": {
        if (!t) return null;
        const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
        if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
        return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : undefined;
      }
      case "select": case "badge": {
        if (!t) return null;
        return c.options?.find((o) => o.value.toLowerCase() === t.toLowerCase())?.value;
      }
      case "multi": {
        if (!t) return [];
        const parts = t.split(/\s*[,;]\s*/).map((x) => c.options?.find((o) => o.value.toLowerCase() === x.toLowerCase())?.value).filter((x): x is string => !!x);
        return parts.length ? parts : undefined;
      }
      case "person": {
        if (!t) return null;
        return c.people?.find((p) => p.name.toLowerCase() === t.toLowerCase())?.id;
      }
      default: return t;
    }
  }

  async function pasteText(text: string) {
    const all = flatRows();
    const data = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((l) => l.split("\t"));
    if (!data.length || (data.length === 1 && data[0].length === 1 && data[0][0] === "")) return;
    const ci0 = range ? range.c1 : visible.findIndex((c) => c.key === (selected?.key ?? selCol));
    if (ci0 < 0) return;
    const single = data.length === 1 && data[0].length === 1;
    const targets: { r: GridRow; c: Col; raw: string }[] = [];
    if (single && range) {
      for (const r of all.slice(range.r1, range.r2 + 1)) for (const c of visible.slice(range.c1, range.c2 + 1)) targets.push({ r, c, raw: data[0][0] });   // 1 giá trị dán vào cả vùng
    } else if (single && !selected && selCol) {
      const c = visible[ci0];
      targets.push(...all.map((r) => ({ r, c, raw: data[0][0] })));    // 1 giá trị dán vào cả cột đang chọn
    } else {
      const ri0 = range ? range.r1 : selected ? all.findIndex((r) => r.id === selected.row) : 0;
      if (ri0 < 0) return;
      data.forEach((cells, dr) => cells.forEach((raw, dc) => {
        const r = all[ri0 + dr], c = visible[ci0 + dc];
        if (r && c) targets.push({ r, c, raw });
      }));
    }
    if (targets.length > 300) { setError("Dán tối đa 300 ô mỗi lần"); return; }
    let ok = 0, skipped = 0;
    setError(null);
    for (const { r, c, raw } of targets) {
      const v = canEdit(r, c) ? parseCell(c, raw) : undefined;
      if (v === undefined) { skipped++; continue; }
      if (await commit(r, c, v)) ok++;
    }
    setUndoMsg(`Đã dán ${ok} ô${skipped ? ` · bỏ qua ${skipped} ô (không có quyền sửa hoặc sai định dạng)` : ""}`);
  }

  // Ctrl+V trên ô ảnh đang chọn → tải ảnh trong bộ nhớ tạm thẳng vào ô
  async function onGridPaste(e: React.ClipboardEvent) {
    if (editing || inField(e.target)) return;
    const txt = e.clipboardData.getData("text/plain");
    if (txt && ![...e.clipboardData.files].some((f) => f.type.startsWith("image/"))) { e.preventDefault(); void pasteText(txt); return; }
    if (!selected) return;
    const r = groups.flatMap((g) => g.rows).find((x) => x.id === selected.row), c = byKey.get(selected.key);
    if (!r || !c || c.type !== "images") return;
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    if (!canEdit(r, c)) { setError(`${c.label}: bạn không có quyền thêm ảnh ở ô này`); return; }
    setError(null);
    const before = ((val(r, c.key) as { path: string }[] | null) ?? []).map((im) => im.path), attached: string[] = [];
    const err = await uploadCellImages(c.imageKind ?? "product", imageRowId(r, c), files, setPasting, (p) => attached.push(p));
    if (attached.length) pushUndo({ type: "images", kind: c.imageKind ?? "product", rowId: imageRowId(r, c), label: c.label, before, after: [...before, ...attached] });
    if (err) setError(`${c.label}: ${err}`);
    changed();
  }

  // Đóng ô đang sửa → ô vẫn được chọn, bàn phím quay lại bảng (đi tiếp bằng mũi tên)
  const closeEdit = () => { setEditing(null); gridRef.current?.focus({ preventScroll: true }); };

  // Phím trên ô đang chọn: ←↑→↓ / Tab di chuyển · Enter (hoặc F2) sửa · Esc bỏ chọn
  function onGridKey(e: React.KeyboardEvent) {
    if (editing || !selected) return;
    const rowsFlat = groups.flatMap((g) => (collapsed.has(g.key) ? [] : g.rows));
    const ri = rowsFlat.findIndex((r) => r.id === selected.row), ci = visible.findIndex((c) => c.key === selected.key);
    if (ri < 0 || ci < 0) return;
    const move = (dr: number, dc: number) => {
      e.preventDefault();
      if (e.shiftKey && e.key.startsWith("Arrow")) {   // Shift+mũi tên: mở rộng vùng chọn
        const endRi = rangeEnd ? rowsFlat.findIndex((x) => x.id === rangeEnd.row) : ri, endCi = rangeEnd ? visible.findIndex((x) => x.key === rangeEnd.key) : ci;
        const nr = rowsFlat[Math.max(0, Math.min(rowsFlat.length - 1, endRi + dr))], nc = visible[Math.max(0, Math.min(visible.length - 1, endCi + dc))];
        if (nr && nc) setRangeEnd({ row: nr.id, key: nc.key });
        return;
      }
      setRangeEnd(null);
      const r = rowsFlat[Math.max(0, Math.min(rowsFlat.length - 1, ri + dr))], c = visible[Math.max(0, Math.min(visible.length - 1, ci + dc))];
      setSelected({ row: r.id, key: c.key });
    };
    if (e.key === "ArrowDown") move(1, 0);
    else if (e.key === "ArrowUp") move(-1, 0);
    else if (e.key === "ArrowRight" || (e.key === "Tab" && !e.shiftKey)) move(0, 1);
    else if (e.key === "ArrowLeft" || (e.key === "Tab" && e.shiftKey)) move(0, -1);
    else if (e.key === "Escape") { setSelected(null); setRangeEnd(null); }
    else if (e.key === "Enter" || e.key === "F2") {
      const r = rowsFlat[ri], c = visible[ci];
      if (canEdit(r, c) || c.type === "images") { e.preventDefault(); setEditing({ row: r.id, key: c.key }); }
    }
  }

  // Vùng chọn → chỉ số hàng / cột (theo thứ tự đang hiện)
  const rowPos = new Map(flatRows().map((r, n) => [r.id, n]));
  const range = (() => {
    if (!selected || !rangeEnd) return null;
    const ra = rowPos.get(selected.row), rb = rowPos.get(rangeEnd.row);
    const ca = visible.findIndex((c) => c.key === selected.key), cb = visible.findIndex((c) => c.key === rangeEnd.key);
    if (ra === undefined || rb === undefined || ca < 0 || cb < 0 || (ra === rb && ca === cb)) return null;
    return { r1: Math.min(ra, rb), r2: Math.max(ra, rb), c1: Math.min(ca, cb), c2: Math.max(ca, cb) };
  })();

  const renderCell = (r: GridRow, c: Col, i: number) => {
    const v = val(r, c.key);
    const editable = canEdit(r, c);
    const isEditing = editing?.row === r.id && editing.key === c.key;
    const isSelected = selected?.row === r.id && selected.key === c.key;
    const rp = rowPos.get(r.id) ?? -1;
    const inRange = !!range && rp >= range.r1 && rp <= range.r2 && i >= range.c1 && i <= range.c2;
    return (
      <td key={c.key} style={{ width: widthOf(c), maxWidth: widthOf(c), height: rowH.h }}
        onMouseDown={(e) => {
          if (isEditing || e.button !== 0 || (e.target as HTMLElement).closest("a,button,input,textarea,select")) return;
          if (!e.shiftKey) dragFrom.current = { row: r.id, key: c.key };
          e.preventDefault();   // không bôi đen chữ khi kéo chọn vùng
          gridRef.current?.focus({ preventScroll: true });
        }}
        onMouseEnter={() => {
          const a = dragFrom.current;
          if (!a || editing || (a.row === r.id && a.key === c.key && !rangeEnd)) return;
          setSelCol(null); setSelected(a); setRangeEnd({ row: r.id, key: c.key });
        }}
        onClick={(e) => {
          if (isEditing) return;
          if (e.shiftKey && selected) { setSelCol(null); setRangeEnd({ row: r.id, key: c.key }); return; }
          setRangeEnd(null);
          if (isSelected && (editable || c.type === "images")) setEditing({ row: r.id, key: c.key });
          else { setSelCol(null); setSelected({ row: r.id, key: c.key }); setEditing(null); gridRef.current?.focus({ preventScroll: true }); }
        }}
        className={`relative border-b border-r border-line px-2 ${rowH.lines > 1 ? "py-1.5 align-top" : ""} ${c.type === "money" || c.type === "number" ? "text-right" : ""} ${
          i === 0 ? "sticky left-11 z-10 bg-surface" : ""} ${picked.has(r.id) ? "bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface))]" : inRange && !isSelected ? "bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))]" : selCol === c.key ? "bg-[color-mix(in_srgb,var(--accent)_9%,var(--surface))]" : ""} ${editable ? "cursor-default hover:bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]" : ""} ${c.lookup ? "text-ink-2" : ""}`}>
        <div className={`flex min-w-0 overflow-hidden ${rowH.lines > 1 ? "items-start" : "items-center"} ${c.type === "money" || c.type === "number" ? "justify-end" : ""}`}
          style={{ maxHeight: rowH.h - (rowH.lines > 1 ? 12 : 4) }}>
          {i === 0 && r.href ? <HoverLink href={r.href} onClick={(e) => e.stopPropagation()} className="truncate font-semibold hover:text-accent"><CellView col={c} v={v} lines={rowH.lines} /></HoverLink> : <CellView col={c} v={v} lines={rowH.lines} onImage={c.type === "images" ? (i) => openViewer(r, c, i) : undefined} />}
        </div>
        {isSelected && !isEditing && <span className={`pointer-events-none absolute inset-0 z-20 ${range ? "border" : "border-2"} border-accent`} />}
        {inRange && range && !isSelected && (
          <span className={`pointer-events-none absolute inset-0 z-20 border-accent ${rp === range.r1 ? "border-t" : ""} ${rp === range.r2 ? "border-b" : ""} ${i === range.c1 ? "border-l" : ""} ${i === range.c2 ? "border-r" : ""}`} />
        )}
        {inRange && range && rp === range.r2 && i === range.c2 && (
          <span className="pointer-events-none absolute -bottom-[3px] -right-[3px] z-30 h-1.5 w-1.5 bg-accent" />
        )}
        {isSelected && !isEditing && c.type === "images" && editable && (
          <span className="pointer-events-none absolute bottom-0.5 right-1 z-20 rounded-md bg-accent px-1 text-2xs text-white">Ctrl+V dán ảnh</span>
        )}
        {isEditing && (c.type === "images"
          ? <ImageEditor kind={c.imageKind ?? "product"} rowId={imageRowId(r, c)} editable={editable} images={(v as { path: string; url: string }[]) ?? []}
              onImages={(before, after) => pushUndo({ type: "images", kind: c.imageKind ?? "product", rowId: imageRowId(r, c), label: c.label, before, after })}
              onChanged={changed} onClose={closeEdit} />
          : <CellEditor col={c} v={v} onSave={(nv) => commit(r, c, nv)} onClose={closeEdit} />)}
      </td>
    );
  };

  return (
    <div className="space-y-2">
      {/* Đầu bảng (phương án 3): MỘT hàng duy nhất trong một khung — ＋ Thêm · kiểu xem · chip trạng thái | tìm · tháng · công cụ dạng biểu tượng · hoàn tác.
          Phân trang chỉ còn ở chân bảng. Công cụ đang bật chỉ đổi màu + chấm nhỏ (không tô nền) để không lấn át dữ liệu; tên đầy đủ ở chú thích khi rê chuột. */}
      <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5 shadow-sm 2xl:flex-nowrap">   {/* hẹp hơn 2xl: cho xuống dòng thay vì ép nhỏ vùng chip làm cụt chữ (vd "Từ chối") */}
        {add && !adding && (
          <button onClick={() => { if (isGallery) update({ view: "table" }); setAdding(true); }}
            className="h-8 flex-none whitespace-nowrap rounded-md bg-accent px-3 text-xs font-semibold text-white shadow-sm hover:opacity-90">＋ Thêm</button>
        )}
        <div className="flex flex-none rounded-md bg-grid p-0.5" role="group" aria-label="Chế độ xem">
          <button onClick={() => update({ view: "table" })} title="Xem dạng bảng" aria-pressed={!isGallery}
            className={`flex h-7 w-8 items-center justify-center rounded-md ${!isGallery ? "bg-surface text-ink-1 shadow-sm" : "text-ink-muted hover:text-ink-1"}`}><Ico d={ICO.table} /></button>
          <button onClick={() => { update({ view: "gallery" }); setAdding(false); setSelected(null); setEditing(null); }} title="Xem dạng thư viện" aria-pressed={isGallery}
            className={`flex h-7 w-8 items-center justify-center rounded-md ${isGallery ? "bg-surface text-ink-1 shadow-sm" : "text-ink-muted hover:text-ink-1"}`}><Ico d={ICO.cards} /></button>
        </div>
        {/* Vùng chip có độ rộng CHUẨN CHUNG = bảng nhiều chip nhất (CHIP_STD, đo thực tế ở bảng Quay chụp), áp cho MỌI bảng kể cả bảng ít chip / không chip.
            Bảng KHÔNG có nút ＋ Thêm (4.75rem) hoặc KHÔNG có ô chọn tháng (9.5rem) được cộng bù vào vùng chip, để ô tìm vẫn đúng cỡ như bảng đủ nút.
            Nhờ vậy phần còn lại cho ô tìm giống nhau ở mọi tab: màn hình nhỏ → ô tìm co vừa với chuẩn đó; màn hình lớn → ô tìm dãn thêm chút (có trần). */}
        <div className="no-scrollbar min-w-fit max-w-full overflow-x-auto" style={{ flex: `0 0.05 calc(${CHIP_STD} + ${add ? 0 : 4.75}rem + ${monthKey ? 0 : 9.5}rem)` }} role="tablist" aria-label="Trạng thái">
          <div className="flex w-max items-center gap-0.5">
          {tabCol && (
            <>
              <button onClick={() => setTab(null)} className={chipCls(!tab)}>Tất cả <span className="tabular opacity-70">{rows.length}</span></button>
              {[...(tabCol.options ?? []).map((o) => o.value), ...[...tabCounts.keys()].filter((k) => !(tabCol.options ?? []).some((o) => o.value === k))]
                .filter((k) => tabCounts.get(k))
                .map((k) => (
                  <button key={k} onClick={() => setTab(k)} className={chipCls(tab === k)}>
                    <span className="h-2 w-2 rounded-full ring-1 ring-white/70" style={{ background: chipColor(tabCol.options?.find((o) => o.value === k)?.color).bg }} />
                    {k} <span className="tabular opacity-70">{tabCounts.get(k)}</span>
                  </button>
                ))}
              {tabCol2 && [...(tabCol2.options ?? []).map((o) => o.value), ...[...tabCounts2.keys()].filter((k) => !(tabCol2.options ?? []).some((o) => o.value === k))]
                .filter((k) => tabCounts2.get(k))
                .map((k) => (
                  <button key={`2:${k}`} onClick={() => setTab(`2:${k}`)} className={chipCls(tab === `2:${k}`)}>
                    <span className="h-2 w-2 rounded-full ring-1 ring-white/70" style={{ background: chipColor(tabCol2.options?.find((o) => o.value === k)?.color).bg }} />
                    {k} <span className="tabular opacity-70">{tabCounts2.get(k)}</span>
                  </button>
                ))}
            </>
          )}
          </div>
        </div>
        <label className="relative ml-auto min-w-24 max-w-72 flex-[1_8_10rem]">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted"><Ico d={ICO.search} size={14} /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape" && q) { e.preventDefault(); setQ(""); } }} placeholder="Tìm…" aria-label="Tìm trong bảng"
            className="h-8 w-full rounded-md border border-transparent bg-grid pl-7 pr-7 text-xs outline-none placeholder:text-ink-muted focus:border-accent focus:bg-surface" />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Xoá chữ đã nhập" title="Xoá"
            className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:bg-line hover:text-ink-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg></button>}
        </label>
        {monthKey && (
          <div className="flex h-8 flex-none items-center rounded-md bg-grid text-xs" role="group" aria-label="Lọc theo tháng">
            <button onClick={() => setMonth(shiftMonth(month ?? thisMonth, -1))} className="h-full px-1.5 text-ink-muted hover:text-ink-1" aria-label="Tháng trước">‹</button>
            <button onClick={() => setMonth(month ? null : thisMonth)} title={month ? "Bấm để xem mọi thời gian" : "Bấm để lọc tháng này"}
              className={`flex h-full items-center gap-1 px-1 font-medium ${month ? "text-accent" : "text-ink-2 hover:text-ink-1"}`}>
              <Ico d={ICO.calendar} size={13} />{month ? `Tháng ${Number(month.slice(5))}/${month.slice(0, 4)}` : "Mọi thời gian"}
            </button>
            <button onClick={() => setMonth(shiftMonth(month ?? thisMonth, 1))} className="h-full px-1.5 text-ink-muted hover:text-ink-1" aria-label="Tháng sau">›</button>
          </div>
        )}
        <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />
        <button onClick={(e) => togglePanel("filter", e)} className={icoBtn(activeFilters.length > 0 || panel === "filter")} title={activeFilters.length ? `Lọc (${activeFilters.length} điều kiện)` : "Lọc"} aria-label="Lọc">
          <Ico d={ICO.filter} />{activeFilters.length > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-md bg-accent px-1 text-[10px] font-bold leading-4 text-white ring-2 ring-surface">{activeFilters.length}</span>}
        </button>
        <button onClick={(e) => togglePanel("group", e)} className={icoBtn(!!groupKey || panel === "group")} title={groupKey ? `Nhóm theo: ${byKey.get(groupKey)?.label}` : "Nhóm"} aria-label="Nhóm">
          <Ico d={ICO.group} />{groupKey && <Dot />}
        </button>
        <button onClick={(e) => togglePanel("fields", e)} className={icoBtn(hidden.size > 0 || panel === "fields")} title={hidden.size ? `Cột / trường (đang ẩn ${hidden.size})` : "Cột / trường"} aria-label="Cột">
          <Ico d={ICO.columns} />{hidden.size > 0 && <Dot />}
        </button>
        {isGallery ? (
          <button onClick={(e) => togglePanel("card", e)} className={icoBtn(panel === "card")} title={`Ảnh bìa và cỡ thẻ: ${card.label}`} aria-label="Cỡ thẻ"><Ico d={ICO.size} /></button>
        ) : (
          <button onClick={(e) => togglePanel("rowh", e)} className={icoBtn(panel === "rowh" || (ready && !!prefs.rowH && prefs.rowH !== "m"))} title={`Chiều cao hàng: ${rowH.label}`} aria-label="Chiều cao hàng">
            <Ico d={ICO.rows} />{ready && !!prefs.rowH && prefs.rowH !== "m" && <Dot />}
          </button>
        )}
        {isGallery && !sort && columns.some((c) => c.type === "number" || c.type === "money" || c.type === "date") && (   // thư viện không có tiêu đề cột để bấm → chọn sắp xếp ở thanh công cụ
          <label className={`${icoBtn(false)} cursor-pointer`} title="Sắp xếp">
            <Ico d={ICO.sort} />
            {/* ô chọn gốc của trình duyệt phủ kín biểu tượng (trong suốt) → bấm biểu tượng là mở danh sách sắp xếp */}
            <select value="" onChange={(e) => { const [k, d] = e.target.value.split("|"); if (k) update({ sort: [k, Number(d) as 1 | -1] }); }} aria-label="Sắp xếp" title="Sắp xếp"
              className="absolute inset-0 cursor-pointer opacity-0">
              <option value="">Sắp xếp theo…</option>
            {columns.filter((c) => c.type === "number" || c.type === "money" || c.type === "date").flatMap((c) => [
              <option key={`${c.key}|-1`} value={`${c.key}|-1`}>{c.label} ↓ (cao / mới nhất trước)</option>,
              <option key={`${c.key}|1`} value={`${c.key}|1`}>{c.label} ↑ (thấp / cũ nhất trước)</option>,
            ])}
            </select>
          </label>
        )}
        {sort && <button onClick={() => update({ sort: null })} className={chipCls(true)} title="Bỏ sắp xếp">↕ {byKey.get(sort[0])?.label} {sort[1] === 1 ? "↑" : "↓"} ✕</button>}
        <button type="button" onClick={() => setExportOpen(true)} className={icoBtn(exportOpen)} title="Xuất file Excel (.xlsx) hoặc CSV" aria-label="Xuất file"><Ico d={ICO.download} /></button>
        <button onClick={undo} disabled={!undoStack.length && !(adding && draftHist.length)} className={`${icoBtn(false)} disabled:opacity-30`} aria-label="Hoàn tác"
          title={adding && draftHist.length ? `Hoàn tác: ${draftHist.at(-1)!.label} (dòng đang thêm, Ctrl+Z)` : undoStack.length ? `Hoàn tác: ${undoStack.at(-1)!.label} (Ctrl+Z)` : "Hoàn tác (Ctrl+Z)"}><Ico d={ICO.undo} /></button>
        <button onClick={redo} disabled={!redoStack.length && !(adding && draftFuture.length)} className={`${icoBtn(false)} disabled:opacity-30`} aria-label="Làm lại"
          title={adding && draftFuture.length ? `Làm lại: ${draftFuture.at(-1)!.label} (dòng đang thêm, Ctrl+Y)` : redoStack.length ? `Làm lại: ${redoStack.at(-1)!.label} (Ctrl+Y)` : "Làm lại (Ctrl+Y)"}><Ico d={ICO.redo} /></button>
        {info && <span className="px-0.5"><InfoTip text={info} /></span>}
        {picked.size > 0 && (
          <>
            <button disabled={deleting} onClick={removeChecked}
              className="h-8 rounded-md bg-bad px-2.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60">
              {deleting ? "Đang xoá…" : `Xoá ${picked.size} bản ghi`}</button>
            <button onClick={() => setChecked(new Set())} className="h-8 rounded-md px-2 text-xs text-ink-2 hover:bg-grid">Bỏ chọn</button>
          </>
        )}
      </div>

        {panel && (
          <div style={{ left: panelX }}
            className={`absolute top-full z-40 mt-1 rounded-md border border-line bg-surface p-3 text-sm shadow-xl ${panel === "rowh" || panel === "group" ? "w-52" : panel === "filter" ? "w-[560px] max-w-[calc(100vw-2rem)]" : "w-80"}`}>
            {panel === "fields" && (
              <>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <b>{isGallery ? "Trường trên thẻ" : "Trường"} · {order.length - hidden.size}/{order.length} đang hiện</b>
                  <span className="flex gap-2">
                    <button onClick={() => update({ [hiddenKey]: order.slice(1) })} className="text-accent hover:underline">Ẩn hết</button>
                    <button onClick={() => update({ [hiddenKey]: [] })} className="text-accent hover:underline">Hiện hết</button>
                  </span>
                </div>
                {/* Giống danh sách trường của Lark: biểu tượng kiểu dữ liệu · tên · 👁 hiện/ẩn · kéo ⠿ để đổi thứ tự. Trường đầu bị khoá (luôn hiện) */}
                {isGallery ? (() => {
                  // Thư viện: xếp các trường đúng vị trí trên thẻ, từ trên xuống (ảnh → huy hiệu → mã & tên → ô số liệu → trường thông tin → link → nút thao tác).
                  // Trường ẩn vẫn nằm đúng chỗ của nó (mờ, con mắt gạch). Kéo thả để đổi chỗ; kéo sang nhóm khác (huy hiệu / ô số liệu / trường thông tin) để đổi cách hiện trên thẻ.
                  const zone = prefs.zone ?? {};
                  const zoneOf = (c: Col): CardZone => zone[c.key] ?? defaultZone(c);
                  const all = order.map((k) => byKey.get(k)!);
                  const idC = all[0];
                  const titleC = byKey.get("name") ?? all[1];
                  const spuC = all.find((c) => c.key === "code" && c !== idC && c !== titleC);
                  const base = all.filter((c) => c !== idC && c !== titleC && c !== spuC && c.type !== "images" && c.type !== "link" && !c.action);
                  const groups: { id: string; label: string; cols: Col[]; zone?: CardZone }[] = [
                    { id: "img", label: "Ảnh bìa", cols: all.filter((c) => c.type === "images") },
                    { id: "badge", label: "Huy hiệu trên ảnh", cols: base.filter((c) => zoneOf(c) === "badge"), zone: "badge" as const },
                    { id: "head", label: "Mã & tên", cols: [idC, spuC, titleC].filter((c): c is Col => !!c && !c.action) },
                    { id: "metric", label: "Ô số liệu lớn", cols: base.filter((c) => zoneOf(c) === "metric"), zone: "metric" as const },
                    { id: "info", label: "Trường thông tin", cols: base.filter((c) => zoneOf(c) === "info"), zone: "info" as const },
                    { id: "link", label: "Nút link", cols: all.filter((c) => c.type === "link" && c !== titleC) },
                    { id: "act", label: "Nút thao tác", cols: all.filter((c) => c.action) },
                  ].filter((g) => g.cols.length || g.zone);
                  const groupOf = new Map(groups.flatMap((g) => g.cols.map((c) => [c.key, g] as const)));
                  const dragCol = fieldDrag ? byKey.get(fieldDrag) : undefined;
                  const dragZoneOk = !!dragCol && !!groupOf.get(dragCol.key)?.zone;   // chỉ trường thường mới kéo đổi vùng được
                  // Thả trường đang kéo vào vùng `z`: trước dòng `before` (nếu có), không thì cuối vùng. Vùng khác vùng cũ → đổi cách hiện trên thẻ.
                  const dropTo = (z: CardZone, before?: string) => {
                    if (!fieldDrag || !dragCol || !dragZoneOk || before === fieldDrag) return;
                    const target = groups.find((g) => g.zone === z)!;
                    const next = order.filter((x) => x !== fieldDrag);
                    let at: number;
                    if (before) at = next.indexOf(before) + (order.indexOf(fieldDrag) < order.indexOf(before) ? 1 : 0);
                    else { const last = target.cols.filter((c) => c.key !== fieldDrag).at(-1); at = last ? next.indexOf(last.key) + 1 : next.length; }
                    next.splice(at, 0, fieldDrag);
                    const nz = { ...zone };
                    if (z === defaultZone(dragCol)) delete nz[fieldDrag]; else nz[fieldDrag] = z;
                    update({ order: next, zone: nz });
                    setFieldDrag(null);
                  };
                  // Nhóm không đổi vùng (nút link, nút thao tác…): chỉ đổi chỗ trong nhóm — vd đưa "Chi phí SX" lên trên "Trạng thái"
                  const reorder = (gid: string, target: string) => {
                    if (!fieldDrag || fieldDrag === target || groupOf.get(fieldDrag)?.id !== gid) return;
                    const next = order.filter((x) => x !== fieldDrag);
                    next.splice(next.indexOf(target) + (order.indexOf(fieldDrag) < order.indexOf(target) ? 1 : 0), 0, fieldDrag);
                    update({ order: next });
                    setFieldDrag(null);
                  };
                  return (
                    <div className="max-h-80 space-y-2 overflow-y-auto">
                      {groups.map((g) => (
                        <div key={g.id}
                          onDragOver={(e) => { if (g.zone && dragZoneOk) e.preventDefault(); }}
                          onDrop={(e) => { if (g.zone) { e.preventDefault(); dropTo(g.zone); } }}
                          className={`rounded-md ${fieldDrag && dragZoneOk && g.zone ? "bg-accent/5 ring-1 ring-accent/30" : ""}`}>
                          <div className="mb-0.5 px-1 text-2xs font-bold uppercase tracking-wide text-ink-muted">{g.label}</div>
                          <ul className="space-y-0.5">
                            {g.cols.map((c) => {
                              const locked = c.key === order[0], off = hidden.has(c.key), move = !!g.zone || (g.id !== "head" && g.cols.length > 1);
                              return (
                                <li key={c.key} draggable={move}
                                  onDragStart={(e) => { setFieldDrag(c.key); e.dataTransfer.effectAllowed = "move"; }}
                                  onDragOver={(e) => { if (fieldDrag && fieldDrag !== c.key && (g.zone ? dragZoneOk : groupOf.get(fieldDrag)?.id === g.id)) e.preventDefault(); }}
                                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (g.zone) dropTo(g.zone, c.key); else reorder(g.id, c.key); }}
                                  onDragEnd={() => setFieldDrag(null)}
                                  className={`flex items-center gap-2 rounded-md px-1 py-1 hover:bg-grid ${fieldDrag === c.key ? "opacity-40" : ""}`}>
                                  <span className={`w-3 select-none text-center text-xs ${move ? "cursor-grab text-ink-muted" : "invisible"}`} aria-hidden>⠿</span>
                                  <span className="w-5 flex-none text-center text-xs text-ink-muted" aria-hidden>{TYPE_ICON[c.type] ?? "A"}</span>
                                  <span className={`min-w-0 flex-1 truncate ${off ? "text-ink-muted" : ""}`} title={c.label}>{c.label}{locked && <span className="ml-1" title="Trường đầu tiên luôn hiện">🔒</span>}</span>
                                  {!locked && (
                                    <button type="button" onClick={() => update({ [hiddenKey]: off ? [...hidden].filter((x) => x !== c.key) : [...hidden, c.key] })}
                                      title={off ? "Đang ẩn — bấm để hiện trên thẻ" : "Đang hiện — bấm để ẩn khỏi thẻ"} aria-label={`${off ? "Hiện" : "Ẩn"} trường ${c.label}`} aria-pressed={!off}
                                      className={`flex h-6 w-7 flex-none items-center justify-center rounded-md hover:bg-surface ${off ? "text-ink-muted" : "text-accent"}`}>
                                      <EyeIcon off={off} />
                                    </button>
                                  )}
                                </li>
                              );
                            })}
                            {!g.cols.length && <li className="px-1 py-1 text-2xs text-ink-muted">Kéo trường vào đây</li>}
                          </ul>
                        </div>
                      ))}
                    </div>
                  );
                })() : (
                <ul className="max-h-80 space-y-0.5 overflow-y-auto">
                  {order.map((k, i) => {
                    const c = byKey.get(k)!, off = hidden.has(k), locked = i === 0;
                    return (
                      <li key={k} draggable={!locked}
                        onDragStart={(e) => { setFieldDrag(k); e.dataTransfer.effectAllowed = "move"; }}
                        onDragOver={(e) => { if (fieldDrag && fieldDrag !== k && i > 0) e.preventDefault(); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (!fieldDrag || fieldDrag === k || i === 0) return;
                          const next = order.filter((x) => x !== fieldDrag);
                          next.splice(next.indexOf(k) + (order.indexOf(fieldDrag) < i ? 1 : 0), 0, fieldDrag);
                          update({ order: next });
                        }}
                        onDragEnd={() => setFieldDrag(null)}
                        className={`group/f flex items-center gap-2 rounded-md px-1 py-1 hover:bg-grid ${fieldDrag === k ? "opacity-40" : ""}`}>
                        <span className={`w-3 select-none text-center text-xs ${locked ? "invisible" : "cursor-grab text-ink-muted"}`} aria-hidden>⠿</span>
                        <span className="w-5 flex-none text-center text-xs text-ink-muted" aria-hidden>{TYPE_ICON[c.type] ?? "A"}</span>
                        <span className={`min-w-0 flex-1 truncate ${off ? "text-ink-muted" : ""}`} title={c.label}>
                          {c.label}{c.lookup && <span className="ml-1 text-2xs text-ink-muted">★ tra cứu</span>}{locked && <span className="ml-1" title="Trường đầu tiên luôn hiện">🔒</span>}
                        </span>
                        {!locked && (
                          <button type="button" onClick={() => update({ [hiddenKey]: off ? [...hidden].filter((x) => x !== k) : [...hidden, k] })}
                            title={off ? "Đang ẩn — bấm để hiện" : "Đang hiện — bấm để ẩn"} aria-label={`${off ? "Hiện" : "Ẩn"} trường ${c.label}`} aria-pressed={!off}
                            className={`flex h-6 w-7 flex-none items-center justify-center rounded-md hover:bg-surface ${off ? "text-ink-muted" : "text-accent"}`}>
                            <EyeIcon off={off} />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                )}
                <div className="mt-2 flex items-center justify-between text-2xs text-ink-muted">
                  <span>{isGallery ? "Kéo ⠿ để đổi chỗ · kéo sang nhóm khác để đổi cách hiện trên thẻ" : "Kéo ⠿ để đổi thứ tự · thẻ thư viện hiện theo cùng thứ tự"}</span>
                  <button onClick={() => update(isGallery ? { cardHidden: undefined, order: [], zone: undefined } : { hidden: [], order: [], widths: {} })} className="text-accent hover:underline">Khôi phục mặc định</button>
                </div>
              </>
            )}
            {panel === "card" && (
              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-xs font-medium text-ink-2">Ảnh bìa</div>
                  <select value={coverKey ?? ""} onChange={(e) => update({ cover: e.target.value })} className="w-full rounded-md border border-line bg-page px-2 py-1.5">
                    {!imageCols.length && <option value="">(bảng không có cột ảnh)</option>}
                    {imageCols.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-ink-2">Cỡ thẻ</div>
                  <div className="flex gap-1">
                    {(Object.keys(CARD) as CardSize[]).map((k) => (
                      <button key={k} onClick={() => update({ card: k })}
                        className={`flex-1 rounded-md border px-2 py-1 ${card === CARD[k] ? "border-accent font-semibold text-accent" : "border-line hover:bg-grid"}`}>{CARD[k].label}</button>
                    ))}
                  </div>
                </div>
                <p className="text-2xs text-ink-muted">Trường hiện trên thẻ = các cột đang hiện, theo thứ tự cột (chỉnh ở nút ◫ Cột).</p>
              </div>
            )}
            {panel === "rowh" && (
              <ul className="space-y-0.5">
                {(Object.keys(ROW_H) as RowH[]).map((k) => (
                  <li key={k}>
                    <button onClick={() => { update({ rowH: k }); setPanel(null); }}
                      className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-grid ${rowH === ROW_H[k] ? "font-semibold text-accent" : ""}`}>
                      <span className="flex w-5 flex-col justify-center gap-[2px]" aria-hidden>
                        {Array.from({ length: k === "s" ? 4 : k === "m" ? 3 : k === "l" ? 2 : 1 }).map((_, i) => <span key={i} className="h-[2px] rounded-md bg-current" />)}
                      </span>
                      {ROW_H[k].label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {panel === "group" && (
              <ul className="space-y-0.5">
                <li><button onClick={() => { update({ group: "" }); setPanel(null); }} className="w-full rounded-md px-2 py-1.5 text-left hover:bg-grid">Không nhóm</button></li>
                {filterable.map((c) => (
                  <li key={c.key}><button onClick={() => { update({ group: c.key }); setPanel(null); }}
                    className={`w-full rounded-md px-2 py-1.5 text-left hover:bg-grid ${groupKey === c.key ? "font-semibold text-accent" : ""}`}>{c.label}</button></li>
                ))}
              </ul>
            )}
            {panel === "filter" && (
              <FilterPanel columns={visible.length ? columns.filter((c) => !hidden.has(c.key) || filters.some((f) => f.key === c.key)) : columns}
                filters={filters.length ? filters : []} match={match} onChange={(f) => { setFilters(f); update({ filters: f }); }} onMatch={(m) => { setMatch(m); update({ match: m }); }} />
            )}
            <button onClick={() => setPanel(null)} className="mt-3 w-full rounded-md bg-grid py-1 text-xs">Đóng</button>
          </div>
        )}
      </div>
      {ask && <NoteDialog msg={ask.msg} onDone={(v) => { ask.resolve(v); setAsk(null); }} />}
      {error && <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn-ink">⛔ {error}</p>}
      {pasting && <p className="rounded-md bg-grid px-3 py-1.5 text-xs text-ink-2">📋 {pasting}</p>}
      {(() => {
        // Thanh tính nhanh trên vùng / cột đang chọn: trung bình · số lượng (ô có dữ liệu) · tổng (các ô là số)
        const all = flatRows();
        const cells: CellValue[] = range
          ? all.slice(range.r1, range.r2 + 1).flatMap((r) => visible.slice(range.c1, range.c2 + 1).map((c) => val(r, c.key)))
          : selCol && byKey.has(selCol) && !isGallery ? all.map((r) => val(r, selCol)) : [];
        if (cells.length < 2) return null;
        const filled = cells.filter((v) => !isEmptyCell(v)).length;
        const nums = cells.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
        const total = nums.reduce((a, b) => a + b, 0);
        const fmt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
        return (
          <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center divide-x divide-line rounded-md border border-line bg-surface py-2 text-xs text-ink-1 shadow-lg">
            <span className="px-4">Trung bình: {fmt(nums.length ? total / nums.length : 0)}</span>
            <span className="px-4">Số lượng: {filled}</span>
            <span className="px-4">Tổng: {fmt(total)}</span>
          </div>
        );
      })()}
      {undoMsg && (
        // Thông báo nổi giữa phía trên màn hình (giống Lark), tự tắt sau vài giây
        <div role="status" className="pointer-events-none fixed left-1/2 top-16 z-50 flex max-w-[90vw] -translate-x-1/2 items-center gap-2 rounded-md border border-accent bg-surface px-4 py-2.5 text-sm text-ink-1 shadow-lg">
          <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 text-accent" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="currentColor" /><path d="M8 7v4.2M8 4.6v.1" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" /></svg>
          <span>{undoMsg}</span>
        </div>
      )}
      {viewer && <ImageLightbox images={viewer.images} startIndex={viewer.start} onClose={() => setViewer(null)} />}

      {sortMenu && (() => {
        const mc = byKey.get(sortMenu.key);
        const item = "block w-full px-3 py-1.5 text-left hover:bg-grid";
        return (
          <div data-colmenu className="fixed z-50 w-48 rounded-md border border-line bg-surface py-1 text-xs shadow-lg" style={{ left: sortMenu.x, top: sortMenu.y }}
            onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
            <button className={item} onClick={() => { renameAt.current = Date.now(); setRenaming(sortMenu.key); setSortMenu(null); }}>✎ Đổi tên trường</button>
            {prefs.labels?.[sortMenu.key] && (
              <button className={`${item} text-ink-2`} onClick={() => { update({ labels: Object.fromEntries(Object.entries(prefs.labels ?? {}).filter(([k]) => k !== sortMenu.key)) }); setSortMenu(null); }}>↺ Khôi phục tên gốc</button>
            )}
            <button className={item} onClick={() => { update({ [hiddenKey]: [...hidden, sortMenu.key] }); setSelCol(null); setSortMenu(null); }}>◌ Ẩn trường</button>
            <div className="my-1 border-t border-line" />
            {([["Sắp xếp tăng dần ↑", 1], ["Sắp xếp giảm dần ↓", -1]] as const).map(([lb, d]) => (
              <button key={d} onClick={() => { update({ sort: [sortMenu.key, d] }); setSortMenu(null); }}
                className={`${item} ${sort?.[0] === sortMenu.key && sort[1] === d ? "font-semibold text-accent" : ""}`}>{lb}</button>
            ))}
            {sort?.[0] === sortMenu.key && <button onClick={() => { update({ sort: null }); setSortMenu(null); }} className={`${item} text-ink-2`}>Bỏ sắp xếp</button>}
            {mc && GROUPABLE.has(mc.type) && (
              <>
                <div className="my-1 border-t border-line" />
                <button className={item} onClick={() => { update({ group: sortMenu.key }); setSortMenu(null); }}>☰ Nhóm theo {mc.label}</button>
              </>
            )}
          </div>
        );
      })()}
      {/* Bảng */}
      {isGallery ? (
        <>
        <Gallery groups={groups} groupCol={groupKey ? byKey.get(groupKey) : undefined} visible={visible} byKey={byKey} zone={prefs.zone ?? {}}
          actions={visible.filter((c) => c.action)} canEdit={canEdit} value={val} onSave={commit} onScore={setScoreFor}
          coverCols={coverCols} card={card} empty={q || filters.length || tab ? "Không có bản ghi phù hợp." : empty} />
        {scoreFor && <ScoreModal productId={scoreFor} onClose={() => setScoreFor(null)} onSaved={changed} />}
        </>
      ) : (
      <div ref={gridEl} tabIndex={-1} onKeyDown={onGridKey} onScroll={(e) => { scrollMemo.current.top = e.currentTarget.scrollTop; scrollMemo.current.left = e.currentTarget.scrollLeft; }} onPaste={onGridPaste} onCopy={onGridCopy}
        style={{ height: fillH ?? undefined }}
        className="min-h-64 overflow-auto rounded-md border border-line bg-surface outline-none">
        <table className="grid-lines table-fixed border-separate border-spacing-0 text-sm" style={{ width: totalW, height: fillH ? "100%" : undefined }}>
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="sticky left-0 z-30 w-11 border-b border-r border-line bg-page text-center">
                {deletable && (() => {
                  const ids = groups.flatMap((g) => g.rows).filter((r) => r.del).map((r) => r.id);
                  const all = ids.length > 0 && ids.every((id) => picked.has(id));
                  return <input type="checkbox" title="Chọn tất cả dòng trên trang này (để xoá)" checked={all} disabled={!ids.length}
                    onChange={() => { setSelected(null); setRangeEnd(null); setSelCol(null); setChecked(all ? new Set() : new Set(ids)); }} />;
                })()}
              </th>
              {visible.map((c, i) => (
                <th key={c.key} onMouseDown={(e) => startColDrag(e, c)}
                  onContextMenu={(e) => { e.preventDefault(); setSortMenu({ key: c.key, x: Math.max(8, Math.min(e.clientX, window.innerWidth - 200)), y: Math.min(e.clientY, window.innerHeight - 260) }); }}
                  style={{ width: widthOf(c), cursor: selCol === c.key ? "grab" : "default" }} title={c.hint ?? c.label}
                  className={`group/h relative select-none border-b border-r border-line px-2 py-1.5 text-left text-xs font-medium ${selCol === c.key ? "bg-[color-mix(in_srgb,var(--accent)_18%,var(--page))] text-ink-1" : "bg-page text-ink-2"} ${i === 0 ? "sticky left-11 z-30" : ""}`}>
                  <div style={{ cursor: selCol === c.key ? "grab" : "default" }} onClick={() => { if (justDragged.current) return; setSelCol(selCol === c.key ? null : c.key); setSelected(null); setRangeEnd(null); setEditing(null); gridRef.current?.focus({ preventScroll: true }); }}
                    className={`flex w-full items-center gap-1 truncate pr-6 text-left hover:text-ink-1 ${selCol === c.key ? "[&_*]:cursor-grab" : "[&_*]:cursor-default"}`}>
                    {c.lookup && <span className="text-2xs text-ink-muted">★</span>}
                    {renaming === c.key ? (
                      <input ref={(el) => { if (el && !el.dataset.init) { el.dataset.init = "1"; setTimeout(() => { el.focus(); el.select(); }, 60); } }} defaultValue={c.label} onClick={(e) => e.stopPropagation()} onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); else if (e.key === "Escape") { e.currentTarget.dataset.cancel = "1"; e.currentTarget.blur(); } }}
                        onBlur={(e) => {
                          if (Date.now() - renameAt.current < 300) { const el = e.currentTarget; setTimeout(() => el.focus(), 0); return; }
                          const v = e.currentTarget.value.trim();
                          setRenaming(null);
                          if (e.currentTarget.dataset.cancel) return;
                          const base = baseColumns.find((x) => x.key === c.key)?.label;
                          const rest = Object.fromEntries(Object.entries(prefs.labels ?? {}).filter(([k]) => k !== c.key));
                          update({ labels: v && v !== base ? { ...rest, [c.key]: v } : rest });
                        }}
                        className="w-full min-w-0 rounded-md border border-accent bg-surface px-1 py-0.5 text-xs font-medium text-ink-1 outline-none" />
                    ) : <span className="truncate">{c.label}</span>}
                    {sort?.[0] === c.key && <span>{sort[1] === 1 ? "↑" : "↓"}</span>}
                  </div>
                  <button type="button" data-colmenu aria-label={`Sắp xếp theo ${c.label}`} title="Sắp xếp"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (sortMenu?.key === c.key) { setSortMenu(null); return; }
                      const rc = e.currentTarget.getBoundingClientRect();
                      setSortMenu({ key: c.key, x: Math.max(8, Math.min(rc.left, window.innerWidth - 168)), y: rc.bottom + 4 });
                    }}
                    className={`absolute right-1.5 top-1/2 h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md border border-line bg-surface text-ink-2 transition-colors hover:border-accent hover:text-accent group-hover/h:flex ${sortMenu?.key === c.key ? "flex border-accent text-accent" : "hidden"}`}>
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" /></svg>
                  </button>
                  {colDrag?.over === c.key && <span className={`pointer-events-none absolute top-0 z-40 h-full w-0.5 bg-accent ${colDrag.after ? "right-0" : "left-0"}`} />}
                  <span onMouseDown={(e) => startResize(e, c)} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-accent" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows key={g.key} label={groupKey ? g.label : null} count={g.total} span={visible.length + 1}
                collapsed={collapsed.has(g.key)} toggle={() => setCollapsed((s) => { const n = new Set(s); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
                groupCol={groupKey ? byKey.get(groupKey) : undefined} groupValue={g.key}>
                {g.rows.map((r, idx) => (
                  <tr key={`${g.key}${r.id}`} className={`group ${r.muted ? "opacity-55" : ""}`}>
                    <td className={`sticky left-0 z-10 w-11 border-b border-r border-line text-center text-2xs text-ink-muted ${picked.has(r.id) ? "bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface))]" : "bg-surface"}`}>
                      {deletable && r.del && (picked.size > 0 || picked.has(r.id)) ? (
                        <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggleCheck(r.id)} title="Chọn để xoá" />
                      ) : (
                        <>
                          {r.href ? <HoverLink href={r.href} title="Mở chi tiết" className="block group-hover:hidden">{idx + 1}</HoverLink>
                            : <span className={deletable && r.del ? "block group-hover:hidden" : ""}>{idx + 1}</span>}
                          <span className="hidden items-center justify-center gap-1 group-hover:flex">
                            {deletable && r.del && <input type="checkbox" checked={false} onChange={() => toggleCheck(r.id)} title="Chọn để xoá" />}
                            {r.href && <HoverLink href={r.href} title="Mở chi tiết" className="text-accent">⤢</HoverLink>}
                          </span>
                        </>
                      )}
                    </td>
                    {visible.map((c, i) => renderCell(r, c, i))}
                  </tr>
                ))}
              </GroupRows>
            ))}
            {shown.length === 0 && !(add && !q && !filters.length && !tab) && (   // bảng trống có dòng ＋: bỏ khung báo trống để dòng ＋ nằm sát tiêu đề (như Lark)
              <tr><td colSpan={visible.length + 1} className="py-3 text-center text-ink-muted">{q || filters.length || tab ? "Không có bản ghi phù hợp." : empty}</td></tr>
            )}

            {/* Thêm bản ghi: dòng ＋ cuối bảng */}
            {add && !adding && (
              <tr className="group cursor-pointer" onClick={() => setAdding(true)}>
                <td className="sticky left-0 z-10 h-7 border-b border-r border-line bg-surface text-center text-base text-ink-muted group-hover:text-accent">＋</td>
                <td colSpan={visible.length} className="border-b border-line px-2 text-xs text-ink-muted group-hover:bg-grid group-hover:text-accent">
                  <span className="sticky left-14">Thêm bản ghi</span>
                </td>
              </tr>
            )}
            {add && adding && !addForm && (
              <tr className="bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]">
                <td style={{ height: rowH.h }} className="sticky left-0 z-10 border-b border-r border-line bg-surface text-center text-accent">
                  <button type="button" title="Huỷ dòng đang thêm" aria-label="Huỷ dòng đang thêm"
                    onClick={() => { setAdding(false); setAddEdit(null); setDraft({}); setDraftFiles({}); setDraftHist([]); setDraftFuture([]); setError(null); }}
                    className="rounded-md px-1.5 text-ink-muted hover:bg-grid hover:text-red-500">✕</button>
                </td>
                {visible.map((vc, i) => {
                  const c = add.cols?.[vc.key] ?? vc;   // vd ô "Mã ST" ở dòng thêm = chọn mẫu
                  const on = add.keys.includes(c.key);
                  const v = draft[c.key] ?? add.defaults?.[c.key] ?? null;
                  return (
                    <td key={c.key} style={{ width: widthOf(c), maxWidth: widthOf(c), height: rowH.h }}
                      onClick={(e) => { if (!on) return; if (c.type === "images") e.currentTarget.focus(); else setAddEdit(c.key); }}
                      tabIndex={on && c.type === "images" ? 0 : undefined}
                      onPaste={on && c.type === "images" ? (e) => {
                        // Ctrl+V ảnh trong bộ nhớ tạm (chụp màn hình, sao chép ảnh từ web…) vào ô ảnh đang chọn
                        const fs = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
                        if (!fs.length) return;
                        e.preventDefault(); e.stopPropagation();
                        const named = fs.map((f, n) => (f.name && f.name !== "image.png" ? f : new File([f], `dan-${Date.now()}-${n}.${(f.type.split("/")[1] ?? "png").replace("jpeg", "jpg")}`, { type: f.type })));
                        addDraftImages(c.key, named);
                      } : undefined}
                      className={`relative border-b border-r border-line px-2 ${rowH.lines > 1 ? "py-1.5 align-top" : ""} ${on ? "cursor-text bg-surface" : "text-ink-muted"} ${on && c.type === "images" ? "outline-none focus:ring-2 focus:ring-inset focus:ring-accent" : ""} ${i === 0 ? "sticky left-11 z-10" : ""}`}>
                      {on && c.type === "images" ? (
                        // Ô ảnh kiểu Lark: ảnh đã chọn thu nhỏ + ô vuông "+" (bấm để chọn tệp); bấm vào ô rồi Ctrl+V để dán. Ảnh tải lên sau khi bản ghi được tạo
                        <DraftImages files={draftFiles[c.key] ?? []} size={ADD_IMG[rowH.lines] ?? 28}
                          onPick={(fs) => addDraftImages(c.key, fs)}
                          onRemove={(n) => setDraftFilesTracked(c.key, (draftFiles[c.key] ?? []).filter((_, k) => k !== n))} />
                      ) : on ? (v === null || v === "" ? <span className="text-xs text-ink-muted">{c.label}…</span> : <CellView col={c} v={v} />) : <span className="text-2xs">—</span>}
                      {addEdit === c.key && <CellEditor col={c} v={v} onSave={(nv) => setDraftValue(c, nv)} onClose={() => setAddEdit(null)} />}
                    </td>
                  );
                })}
              </tr>
            )}
            {/* Dòng đệm co giãn: bảng ngắn thì đẩy chân bảng xuống sát đáy khung (như Lark) */}
            <tr aria-hidden className="h-full"><td colSpan={visible.length + 1} className="p-0" /></tr>
          </tbody>
          {/* Chân bảng (giống Lark): mỗi cột chọn 1 phép tính trên các bản ghi đang hiện */}
          <tfoot className="sticky bottom-0 z-20">
            <tr>
              <td className="sticky left-0 z-10 border-t border-line bg-page" />
              {visible.map((c, i) => (
                <td key={c.key} className={`border-t border-line bg-page p-0 ${i === 0 ? "sticky left-11 z-10" : ""}`}>
                  <FooterCell col={c} rows={shown} calc={calcOf(c, i)} onChange={(k) => update({ calc: { ...(prefs.calc ?? {}), [c.key]: k } })} />
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      )}
      {shown.length > 0 && (shown.length > PAGE_ROWS || pageSize !== PAGE_ROWS) && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
          <span className="tabular">Hiển thị <b className="text-ink-1">{((page - 1) * perPage + 1).toLocaleString("vi-VN")}–{Math.min(page * perPage, shown.length).toLocaleString("vi-VN")}</b> / {shown.length.toLocaleString("vi-VN")} bản ghi</span>
          <span className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5">Số dòng mỗi trang
              <select value={pageSize} onChange={(e) => { update({ pageSize: Number(e.target.value) }); setPageState({ page: 1, key: pageKey }); }}
                className="rounded-md border border-line bg-page px-1.5 py-0.5 text-ink-1">
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n || "Tất cả"}</option>)}
              </select></label>
            {pagesTotal > 1 && (
              <span className="flex items-center gap-1">
                <button type="button" disabled={page <= 1} onClick={() => goPage(1)} aria-label="Trang đầu" className="rounded-md border border-line px-2 py-0.5 hover:bg-grid disabled:opacity-40">«</button>
                <button type="button" disabled={page <= 1} onClick={() => goPage(page - 1)} aria-label="Trang trước" className="rounded-md border border-line px-2 py-0.5 hover:bg-grid disabled:opacity-40">‹</button>
                <span className="tabular px-1">Trang <b className="text-ink-1">{page}</b>/{pagesTotal}</span>
                <button type="button" disabled={page >= pagesTotal} onClick={() => goPage(page + 1)} aria-label="Trang sau" className="rounded-md border border-line px-2 py-0.5 hover:bg-grid disabled:opacity-40">›</button>
                <button type="button" disabled={page >= pagesTotal} onClick={() => goPage(pagesTotal)} aria-label="Trang cuối" className="rounded-md border border-line px-2 py-0.5 hover:bg-grid disabled:opacity-40">»</button>
              </span>
            )}
          </span>
        </div>
      )}
      {add && adding && addForm && (
        <AddFormModal title={addForm} required={add.required} cols={add.keys.map((k) => add.cols?.[k] ?? byKey.get(k)).filter((c): c is Col => !!c)}
          draft={draft} defaults={add.defaults} files={draftFiles} saving={saving} error={error}
          onValue={setDraftValue} onFiles={addDraftImages} onRemoveFile={(key, n) => setDraftFilesTracked(key, (draftFiles[key] ?? []).filter((_, k) => k !== n))}
          onSave={addRow}
          onCancel={() => { setAdding(false); setDraft({}); setDraftFiles({}); setDraftHist([]); setDraftFuture([]); setError(null); }} />
      )}
      {add && adding && !addForm && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {adding && (
            <>
              <span className="text-ink-2">Bấm các ô ở dòng ＋ để nhập rồi:</span>
              <button disabled={saving} onClick={() => addRow(true)} className="rounded-md bg-accent px-2.5 py-1 font-medium text-white disabled:opacity-60">
                {saving ? "Đang lưu…" : "Lưu & thêm tiếp"}</button>
              <button disabled={saving} onClick={() => addRow(false)} className="rounded-md border border-accent px-2.5 py-1 text-accent">Lưu</button>
              <button onClick={() => { setAdding(false); setDraft({}); setDraftFiles({}); setDraftHist([]); setDraftFuture([]); setError(null); }} className="rounded-md px-2.5 py-1 text-ink-2 hover:bg-grid">Huỷ</button>
            </>
          )}
        </div>
      )}
      {exportOpen && (
        <ExportModal
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          tableKey={tableKey}
          columns={columns}
          visibleColumns={visible}
          allRows={rows}
          shownRows={shown}
          pickedRowIds={picked}
          range={range}
          flatRows={flatRows()}
          val={val}
          onSuccess={(msg) => setUndoMsg(msg)}
        />
      )}
    </div>
  );
}

// Form nhập bản ghi mới (hộp thoại): mỗi cột cho nhập là một trường theo kiểu dữ liệu. Giá trị giữ ở nháp của DataGrid (Ctrl+Z, lưu, tải ảnh dùng chung)
function AddFormModal({ title, required, cols, draft, defaults, files, saving, error, onValue, onFiles, onRemoveFile, onSave, onCancel }: {
  title: string; required?: string[]; cols: Col[]; draft: Record<string, CellValue>; defaults?: Record<string, CellValue>; files: Record<string, File[]>;
  saving: boolean; error: string | null;
  onValue: (c: Col, v: CellValue) => void; onFiles: (key: string, fs: File[]) => void; onRemoveFile: (key: string, index: number) => void;
  onSave: (keepOpen: boolean) => void; onCancel: () => void;
}) {
  const inp = "w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  // Ctrl+V dán ảnh ở BẤT KỲ đâu trong hộp thoại (không cần bấm vào ô ảnh trước); dán chữ vào ô nhập vẫn bình thường
  const imageKey = cols.find((c) => c.type === "images")?.key;
  useEffect(() => {
    if (!imageKey) return;
    const onPaste = (e: ClipboardEvent) => {
      const fs = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (!fs.length) return;
      e.preventDefault();
      onFiles(imageKey, fs.map((f, n) => (f.name && f.name !== "image.png" ? f : new File([f], `dan-${Date.now()}-${n}.${(f.type.split("/")[1] ?? "png").replace("jpeg", "jpg")}`, { type: f.type }))));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [imageKey, onFiles]);
  const field = (c: Col) => {
    const v = draft[c.key] ?? defaults?.[c.key] ?? null;
    const s = v === null ? "" : String(v);
    const setText = (t: string) => onValue(c, t.trim() === "" ? null : t);
    switch (c.type) {
      case "longtext": return <textarea rows={3} className={inp} value={s} onChange={(e) => setText(e.target.value)} />;
      case "number": case "money": return <input type="number" inputMode="decimal" className={inp} value={s} onChange={(e) => onValue(c, e.target.value === "" ? null : Number(e.target.value))} />;
      case "date": return <input type="date" className={inp} value={s.slice(0, 10)} onChange={(e) => setText(e.target.value)} />;
      case "datetime": return <input type="datetime-local" className={inp} value={s.slice(0, 16)} onChange={(e) => setText(e.target.value ? `${e.target.value}:00+07:00` : "")} />;
      case "select": case "badge":
        return (
          <select className={inp} value={s} onChange={(e) => setText(e.target.value)}>
            <option value="">—</option>
            {(c.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.value}</option>)}
          </select>
        );
      case "person":
        return (
          <select className={inp} value={s} onChange={(e) => setText(e.target.value)}>
            <option value="">—</option>
            {(c.people ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        );
      case "multi": {
        const list = asList(v);
        return (
          <div className="flex flex-wrap gap-1.5">
            {(c.options ?? []).map((o) => {
              const on = list.includes(o.value);
              return (
                <button key={o.value} type="button" onClick={() => { const n = on ? list.filter((x) => x !== o.value) : [...list, o.value]; onValue(c, n.length ? n : null); }}
                  className={`rounded-md border px-2.5 py-0.5 text-xs ${on ? "border-accent bg-accent text-white" : "border-line text-ink-2 hover:border-accent"}`}>{o.value}</button>
              );
            })}
          </div>
        );
      }
      case "images":
        return (
          <div>
            <DraftImages files={files[c.key] ?? []} size={160} onPick={(fs) => onFiles(c.key, fs)} onRemove={(n) => onRemoveFile(c.key, n)} />
            <p className="mt-1.5 text-2xs text-ink-muted">Bấm “Tải ảnh lên từ máy” để chọn tệp · hoặc bấm vào khung rồi nhấn <b>Ctrl+V</b> để dán ảnh.</p>
          </div>
        );
      default: return <input type={c.type === "link" ? "url" : "text"} className={inp} value={s} onChange={(e) => setText(e.target.value)} />;
    }
  };
  const wide = (c: Col) => c.type === "longtext" || c.type === "images" || c.type === "multi" || c.type === "link";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(false); }} className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-md border border-line bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onCancel} aria-label="Đóng" className="rounded-md px-2 text-ink-muted hover:bg-grid hover:text-ink-1">✕</button>
        </div>
        <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2">
          {cols.map((c) => {
            const cls = `flex flex-col gap-1 text-xs font-medium text-ink-2 ${wide(c) ? "sm:col-span-2" : ""}`;
            const head = <span>{c.label}{required?.includes(c.key) && <span className="text-bad"> *</span>}</span>;
            // Ô ảnh / nhiều nhãn chứa nút bấm riêng → KHÔNG bọc <label>: trình duyệt chuyển mọi cú bấm trong <label> sang nút đầu tiên
            // (bấm vào khung ảnh cũng mở cửa sổ chọn tệp; bấm khoảng trống cũng bật nhãn đầu tiên)
            return c.type === "images" || c.type === "multi"
              ? <div key={c.key} className={cls}>{head}{field(c)}</div>
              : <label key={c.key} className={cls}>{head}{field(c)}</label>;
          })}
        </div>
        {error && <p className="border-t border-line px-4 py-2 text-xs text-red-500">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3 text-sm">
          <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-ink-2 hover:bg-grid">Huỷ</button>
          <button type="button" disabled={saving} onClick={() => onSave(true)} className="rounded-md border border-accent px-3 py-1.5 text-accent disabled:opacity-60">Lưu & thêm tiếp</button>
          <button type="submit" disabled={saving} className="rounded-md bg-accent px-3 py-1.5 font-medium text-white disabled:opacity-60">{saving ? "Đang lưu…" : "Lưu"}</button>
        </div>
      </form>
    </div>
  );
}

// Hộp nhập lý do (server đòi lý do khi chọn khác đề xuất…): Enter = xác nhận, Esc / bấm ra ngoài = huỷ
function NoteDialog({ msg, onDone }: { msg: string; onDone: (v: string | null) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onDone(null); }}>
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) onDone(text); }} className="w-full max-w-md space-y-3 rounded-md border border-line bg-surface p-4 shadow-xl">
        <p className="text-sm font-medium">{msg}</p>
        <textarea autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Nhập lý do…"
          onKeyDown={(e) => { if (e.key === "Escape") onDone(null); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (text.trim()) onDone(text); } }}
          className="w-full rounded-md border border-line bg-page px-2.5 py-1.5 text-sm outline-none focus:border-accent" />
        <div className="flex justify-end gap-2 text-sm">
          <button type="button" onClick={() => onDone(null)} className="rounded-md px-3 py-1.5 text-ink-2 hover:bg-grid">Huỷ</button>
          <button type="submit" disabled={!text.trim()} className="rounded-md bg-accent px-3 py-1.5 font-medium text-white disabled:opacity-60">Xác nhận</button>
        </div>
      </form>
    </div>
  );
}

// Biểu tượng kiểu dữ liệu trong danh sách trường (giống Lark)
const TYPE_ICON: Record<string, string> = {
  text: "Aᵀ", longtext: "A≡", number: "#", money: "#", date: "▦", datetime: "▦", select: "⌄", multi: "☰", person: "◔", link: "↗", images: "▣", badge: "◉",
};
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {off ? (<><path d="M1.5 8.5C3 6 5.3 4.8 8 4.8s5 1.2 6.5 3.7" /><path d="M3.5 10.2 2.3 11.6M6.3 11.2 5.8 12.9M9.7 11.2l.5 1.7M12.5 10.2l1.2 1.4" /></>)
        : (<><path d="M1.2 8S3.6 3.8 8 3.8 14.8 8 14.8 8 12.4 12.2 8 12.2 1.2 8 1.2 8Z" /><circle cx="8" cy="8" r="2" /></>)}
    </svg>
  );
}

// Kích thước ô ảnh ở dòng thêm theo "Chiều cao hàng" (khớp ảnh thu nhỏ ở các hàng khác)
const ADD_IMG: Record<number, number> = { 1: 28, 2: 48, 3: 64, 4: 84 };

// Ô ảnh của dòng thêm: ảnh đã chọn (xem trước, rê chuột hiện ✕ để bỏ) + ô vuông "+" để chọn thêm
function DraftImages({ files, size, onPick, onRemove }: { files: File[]; size: number; onPick: (fs: File[]) => void; onRemove: (index: number) => void }) {
  const pick = useRef<HTMLInputElement>(null);
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return (
    <span className="flex flex-wrap items-center gap-2">
      {urls.map((u, n) => (
        <span key={u} className="group/img relative flex-none" style={{ width: size, height: size }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- xem trước tệp vừa chọn (blob) */}
          <img src={u} alt="" className="h-full w-full rounded-md object-cover" />
          <button type="button" title="Bỏ ảnh này" onClick={(e) => { e.stopPropagation(); onRemove(n); }}
            className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-black/70 text-[10px] leading-none text-white group-hover/img:flex">✕</button>
        </span>
      ))}
      {size >= 100 ? (
        // Khung lớn: chỉ dấu ＋ / chữ "Tải ảnh lên từ máy" mở cửa sổ chọn tệp; bấm vào phần còn lại của khung = chọn khung để Ctrl+V
        <div tabIndex={0} title="Bấm vào khung rồi Ctrl+V để dán ảnh" style={{ width: size * 1.5, height: size }}
          className="flex flex-none cursor-default flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-line bg-page text-ink-2 outline-none transition focus:border-accent focus:bg-accent/5 focus:ring-2 focus:ring-accent/40">
          <button type="button" onClick={(e) => { e.stopPropagation(); pick.current?.click(); }}
            className="flex cursor-pointer flex-col items-center gap-0.5 rounded-md px-3 py-1.5 hover:text-accent">
            <span className="text-3xl leading-none">＋</span>
            <span className="text-xs font-medium">Tải ảnh lên từ máy</span>
          </button>
          <span className="px-2 text-center text-2xs text-ink-muted">hoặc bấm vào khung rồi nhấn Ctrl+V</span>
          <input ref={pick} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onPick([...(e.target.files ?? [])]); e.target.value = ""; }} />
        </div>
      ) : (
        <label onClick={(e) => e.stopPropagation()} title="Thêm ảnh (hoặc bấm vào ô rồi Ctrl+V để dán)" style={{ width: size, height: size }}
          className="flex flex-none cursor-pointer items-center justify-center rounded-md border border-line bg-grid text-base text-ink-2 hover:border-accent hover:text-accent">
          ＋
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onPick([...(e.target.files ?? [])]); e.target.value = ""; }} />
        </label>
      )}
    </span>
  );
}

function GroupRows({ label, count, span, collapsed, toggle, groupCol, groupValue, children }: {
  label: string | null; count: number; span: number; collapsed: boolean; toggle: () => void;
  groupCol?: Col; groupValue: string; children: React.ReactNode;
}) {
  if (label === null) return <>{children}</>;
  return (
    <>
      <tr>
        <td colSpan={span} className="border-b border-line bg-page px-3 py-1">
          <button onClick={toggle} className="flex items-center gap-2 text-sm font-medium">
            <span className="w-3 text-ink-muted">{collapsed ? "▸" : "▾"}</span>
            {groupCol && (groupCol.type === "select" || groupCol.type === "badge" || groupCol.type === "multi") && groupValue
              ? <Chip value={groupValue} options={groupCol.options} /> : label}
            <span className="text-xs text-ink-muted">{count}</span>
          </button>
        </td>
      </tr>
      {!collapsed && children}
    </>
  );
}

// Chế độ xem thư viện (giống Gallery view của Lark): mỗi bản ghi 1 thẻ — ảnh bìa, tiêu đề, các trường đang hiện
// Màu ô số liệu nổi bật: lượt xem = xanh dương, số bán = xanh lá, còn lại (video, tương tác…) = vàng
function metricTone(c: Col) {
  if (c.key === "views") return { box: "ring-accent/30 bg-gradient-to-br from-accent/20 to-accent/5", label: "text-accent", value: "text-accent" };
  if (/^(sold|qty)|SL/i.test(c.key) || /^SL /.test(c.label)) return { box: "ring-good/30 bg-gradient-to-br from-good/20 to-good/5", label: "text-good", value: "text-good" };
  return { box: "ring-warn-ink/30 bg-warn-bg", label: "text-warn-ink", value: "text-warn-ink" };
}

function Gallery({ groups, groupCol, visible, byKey, zone, coverCols, card, empty, actions, canEdit, value, onSave, onScore }: {
  groups: { key: string; label: string; rows: GridRow[]; total?: number }[]; groupCol?: Col; visible: Col[]; byKey: Map<string, Col>;
  zone: Record<string, CardZone>; coverCols: Col[]; card: { min: number; fields: number }; empty: string;
  actions: Col[]; canEdit: (r: GridRow, c: Col) => boolean; value: (r: GridRow, k: string) => CellValue;
  onSave: (r: GridRow, c: Col, v: CellValue) => Promise<unknown>; onScore: (productId: string) => void;
}) {
  const idCol = visible[0];
  const titleCol = byKey.get("name") && visible.some((c) => c.key === "name") ? byKey.get("name")! : visible[1];
  const router = useRouter();
  const [galRef, galH] = useFillHeight<HTMLDivElement>();
  // Cột link (link source, file 3D, link video…) luôn hiện thành nút ở cuối thẻ, không tính vào số trường
  const links = visible.filter((c) => c.type === "link" && c !== titleCol);
  // Mã SPU nằm cạnh mã Sưu tầm ở đầu thẻ (không tính vào danh sách trường)
  const spuCol = visible.find((c) => c.key === "code" && c !== idCol && c !== titleCol);
  // Chia cột hiển thị thành: huy hiệu kết quả (góc ảnh) · ô số liệu lớn · trường thường. Chỉ trường thường bị giới hạn theo cỡ thẻ,
  // nên huy hiệu (WIN…) và số liệu luôn hiện dù cột nằm xa phía sau.
  const base = visible.filter((c) => c !== idCol && c !== titleCol && c !== spuCol && c.key !== "score" && c.type !== "images" && c.type !== "link" && !c.action);
  // (cột "Số lượng" của đơn đặt hàng chỉ là trường thường, không phải số liệu traffic)
  // (cột "Số lượng" của đơn đặt hàng chỉ là trường thường, không phải số liệu traffic) — vùng của mỗi trường: do người dùng đặt, chưa đặt thì theo kiểu dữ liệu
  const zoneOf = (c: Col) => zone[c.key] ?? defaultZone(c);
  const metrics = base.filter((c) => zoneOf(c) === "metric");
  const badges = base.filter((c) => zoneOf(c) === "badge");
  const rest = base.filter((c) => zoneOf(c) === "info");
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  if (!total) return <div ref={galRef} style={{ height: galH ?? undefined }} className="flex min-h-64 items-center justify-center rounded-md border border-line bg-surface p-10 text-center text-ink-muted">{empty}</div>;
  return (
    <div ref={galRef} style={{ height: galH ?? undefined }} className="min-h-64 space-y-4 overflow-y-auto rounded-md border border-line bg-surface p-3 outline-none">
      {groups.map((g) => (
        <section key={g.key}>
          {groupCol && (
            <h3 className="mb-2 flex items-center gap-2">
              {g.key && (groupCol.type === "select" || groupCol.type === "badge" || groupCol.type === "multi") ? <Chip value={g.key} options={groupCol.options} /> : g.label}
              <span className="text-xs font-normal text-ink-muted">{g.total ?? g.rows.length}</span>
            </h3>
          )}
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${card.min}px, 1fr))` }}>
            {g.rows.map((r) => {
              const inner = (
                <>
                  <div className="relative">
                    <CardCover sources={coverCols.map((c) => ({ label: c.label, imgs: (r.cells[c.key] as { path: string; url: string; thumb?: string }[] | null) ?? [] }))} />
                    {r.score && (   // điểm chấm BM23 ở góc dưới trái ảnh (chấm mù: chưa chấm thì chỉ thấy số người đã chấm)
                      <div className={`pointer-events-none absolute bottom-2 left-2 rounded-md px-2 py-0.5 text-xs font-extrabold tabular-nums shadow ${typeof r.cells.score === "number" ? (r.score.n >= r.score.min ? (r.score.passed ? "bg-good text-white" : "bg-bad text-white") : "bg-black/65 text-white") : "bg-black/55 text-white/90"}`}
                        title={typeof r.cells.score === "number" ? `Điểm chấm ${fmtScore(r.cells.score)}/100 · ${r.score.n} người chấm${r.score.n < r.score.min ? ` (cần ${r.score.min})` : r.score.passed ? " · Đạt" : " · Không đạt"}` : `${r.score.n} người đã chấm — chấm xong mới xem được điểm`}>
                        {typeof r.cells.score === "number" ? <>{fmtScore(r.cells.score)}<span className="ml-1 font-semibold opacity-80">· {r.score.n}/{r.score.min}</span></> : r.score.n ? `${r.score.n}/${r.score.min} đã chấm` : "Chưa chấm"}
                      </div>
                    )}
                    {badges.some((c) => r.cells[c.key]) && (
                      <div className="pointer-events-none absolute right-2 top-2 flex max-w-[62%] flex-wrap justify-end gap-1 drop-shadow">
                        {badges.map((c) => (r.cells[c.key] ? <Chip key={c.key} value={String(r.cells[c.key])} options={c.options} /> : null))}
                      </div>
                    )}
                  </div>
                  {/* Thẻ cố định kích thước: tên 2 dòng, mỗi trường 1 dòng (dài → …), link + phần duyệt dồn xuống đáy thẻ */}
                  <div className="flex flex-1 flex-col gap-1.5 p-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-block max-w-full truncate rounded-md bg-grid px-1.5 py-0.5 text-2xs font-bold tracking-wide text-ink-2">{String(r.cells[idCol.key] ?? "")}</span>
                        {spuCol && (r.cells[spuCol.key] ? (
                          <span title={`${spuCol.label}: ${textOf(spuCol, r.cells[spuCol.key])}`} className="inline-block max-w-full truncate rounded-md border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-2xs font-extrabold tracking-wide text-accent">{textOf(spuCol, r.cells[spuCol.key])}</span>
                        ) : <span className="rounded-md border border-dashed border-line px-1.5 py-0.5 text-2xs text-ink-muted" title={`${spuCol.label}: chưa gắn`}>{spuCol.label} —</span>)}
                      </div>
                      <div className="truncate text-[15px] font-semibold leading-snug" title={titleCol ? textOf(titleCol, r.cells[titleCol.key]) : ""}>
                        {titleCol ? textOf(titleCol, r.cells[titleCol.key]) || "—" : ""}
                      </div>
                    </div>
                    {metrics.length > 0 && (
                      <div className="grid grid-cols-3 gap-1.5">
                        {metrics.map((c) => {
                          const tone = metricTone(c);
                          return (
                          <div key={c.key} className={`min-w-0 rounded-md px-2 py-1 ring-1 ring-inset ${tone.box}`} title={`${c.label}: ${textOf(c, r.cells[c.key])}`}>
                            <div className={`truncate text-[9px] font-bold uppercase tracking-wide ${tone.label}`}>{c.label}</div>
                            <div className={`truncate text-sm font-extrabold leading-tight tabular-nums ${tone.value}`}>
                              {r.cells[c.key] === null || r.cells[c.key] === undefined || r.cells[c.key] === "" ? <span className="text-ink-muted">—</span> : <CellView col={c} v={r.cells[c.key]} />}
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Các trường chia 2 cột (trước đây dồn 1 cột bên trái → thẻ dài, bên phải trống) */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line pt-2">
                      {rest.map((c) => (
                        <div key={c.key} className="min-w-0">
                          <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{c.label}</div>
                          <div className={`flex h-5 min-w-0 items-center overflow-hidden whitespace-nowrap [&_.flex-wrap]:flex-nowrap ${c.key === "code" ? "text-sm font-extrabold tracking-wide" : "text-xs"}`} title={textOf(c, r.cells[c.key])}>   {/* mã SPU / SKU in đậm */}
                            <CellView col={c} v={r.cells[c.key]} />
                          </div>
                        </div>
                      ))}
                      {/* Nút link (File 3D, link video…) nằm CÙNG HÀNG với trường cuối (vd Đơn vị tính), không tách thành hàng riêng */}
                      {links.map((c) => {
                        const url = typeof r.cells[c.key] === "string" ? (r.cells[c.key] as string) : "";
                        const chipCls = "inline-flex h-6 min-w-0 max-w-full items-center gap-1 rounded-md border px-2 text-xs";
                        return (
                          <div key={c.key} className="flex min-w-0 flex-col justify-end">
                            <div aria-hidden className="select-none text-[10px] leading-[1.15] opacity-0">.</div>
                            {/^https?:\/\//i.test(url) ? (
                              <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title={`${c.label}: ${url}`}
                                className={`${chipCls} border-line text-accent hover:border-accent hover:bg-grid`}>
                                📁 <span className="truncate">{c.label}</span> ↗
                              </a>
                            ) : url ? (
                              <span title={`${c.label}: ${url} — bấm để chép`} onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(url); }}
                                className={`${chipCls} cursor-copy border-line text-ink-2`}>
                                📁 <span className="truncate">{c.label}</span> ⧉
                              </span>
                            ) : (
                              <span title={`${c.label}: chưa có`} className={`${chipCls} border-dashed border-line text-ink-muted`}>
                                <span className="truncate">{c.label}: chưa có</span>
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-auto space-y-2">
                      {actions.length > 0 && (
                        <div className={`${actions.length > 1 && !actions.some((c) => (c.options?.length ?? 0) > 2) ? "grid grid-cols-2 gap-2" : "space-y-2"} border-t border-line pt-2`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                          {actions.map((c) => <ActionField key={c.key} col={c} v={value(r, c.key)} editable={canEdit(r, c)} onSave={(v) => onSave(r, c, v)} score={c.key === "approval" ? r.score : undefined} onScore={() => onScore(r.id)} />)}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              );
              const cls = `group flex h-full cursor-pointer flex-col overflow-hidden rounded-md bg-surface card3d ${r.muted ? "opacity-55" : ""}`;
              // Thẻ là ô bấm (không dùng <a> bọc ngoài vì bên trong có nút link)
              return (
                <div key={r.id} role={r.href ? "link" : undefined} tabIndex={r.href ? 0 : undefined} className={cls}
                  onClick={() => r.href && router.push(r.href)} onKeyDown={(e) => { if (e.key === "Enter" && r.href) router.push(r.href); }}>
                  {inner}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// Ô thao tác trên thẻ (giống Lark): nhãn màu + ▾, bấm xổ danh sách nhãn để chọn
// Cột theo bước: chỉ hiện trạng thái hiện tại + bước kế tiếp (bỏ nhãn "huỷ"). Chưa có trạng thái → bước đầu tiên.
function stepChoices(opts: Opt[], cur: string | null): Opt[] {
  const steps = opts.filter((o) => o.flag !== "cancel");
  const i = steps.findIndex((o) => o.value === cur);
  if (i < 0) return cur ? opts.filter((o) => o.value === cur) : steps.slice(0, 1);   // đang ở trạng thái huỷ / lạ: chỉ hiện nó
  return steps.slice(i, i + 2);
}

function ActionInput({ col, v, editable, onSave }: { col: Col; v: CellValue; editable: boolean; onSave: (v: CellValue) => void }) {
  const money = col.type === "money";
  // Số tiền hiện có dấu chấm ngăn hàng nghìn (1.500.000); ô số / chữ giữ nguyên
  const fmt = (x: CellValue | undefined) => (x === null || x === undefined || x === "" ? "" : money ? Number(x).toLocaleString("vi-VN") : String(x));
  const shown = fmt(v);
  const [text, setText] = useState(shown);
  const [saving, setSaving] = useState(false);
  useEffect(() => setText(shown), [shown]);   // eslint-disable-line react-hooks/set-state-in-effect -- giá trị đổi từ nơi khác (đồng bộ, hoàn tác) → cập nhật ô
  const numeric = col.type !== "text";
  const dirty = text.trim() !== shown;
  const onType = (raw: string) => {
    if (!money) { setText(raw); return; }
    const digits = raw.replace(/\D/g, "");   // tiền chỉ nhận chữ số, tự chèn dấu ngăn hàng nghìn
    setText(digits ? Number(digits).toLocaleString("vi-VN") : "");
  };
  // Nhập xong phải bấm Lưu (hoặc Enter) mới ghi — không tự lưu khi bấm ra ngoài
  const save = async () => {
    if (!dirty || saving) return;
    const t = text.trim();
    let val: CellValue = t === "" ? null : t;
    if (numeric && t !== "") {
      const n = Number(t.replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(n)) { setText(shown); return; }
      val = n;
    }
    setSaving(true);
    try { await onSave(val); } finally { setSaving(false); }
  };
  return (
    <div className="min-w-0">
      <div className="mb-1 truncate text-[10px] font-semibold uppercase tracking-wide text-ink-muted" title={col.label}>{col.label}</div>
      {editable ? (
        <div className="flex items-center gap-1">
          <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-line bg-page px-2 focus-within:border-accent">
            <input value={text} inputMode={numeric ? "decimal" : "text"} placeholder="Nhập…" aria-label={col.label}
              onChange={(e) => onType(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") setText(shown); }}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-sm font-medium tabular-nums outline-none" />
            {money && <span className="text-xs text-ink-muted">đ</span>}
          </div>
          {dirty && (
            <>
              <button type="button" onClick={() => void save()} disabled={saving} title="Lưu (Enter)"
                className="flex-none rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">{saving ? "…" : "Lưu"}</button>
              <button type="button" onClick={() => setText(shown)} disabled={saving} title="Bỏ thay đổi (Esc)" aria-label="Bỏ thay đổi"
                className="flex-none rounded-md px-1.5 py-1.5 text-xs text-ink-2 hover:bg-grid">✕</button>
            </>
          )}
        </div>
      ) : <div className="text-sm font-medium"><CellView col={col} v={v} /></div>}
    </div>
  );
}

function ActionField({ col, v, editable, onSave, score, onScore }: { col: Col; v: CellValue; editable: boolean; onSave: (v: CellValue) => void; score?: GridRow["score"]; onScore?: () => void }) {
  const opts = col.options ?? [];
  const cur = typeof v === "string" ? v : null;
  // Vị trí danh sách (position: fixed) — không bị khung thẻ cắt; sát đáy màn hình thì xổ lên trên
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);
  const open = !!pos;
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  // Cột người (Người phụ trách…): chọn trong danh sách người, hiện avatar + tên; cột chọn thường: nhãn màu
  const isPerson = col.type === "person";
  const items = isPerson ? (col.people ?? []).map((p) => ({ value: p.id, label: p.name })) : opts.map((o) => ({ value: o.value, label: o.value }));
  const shownOpts = items.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  const nameOf = (id: string) => items.find((i) => i.value === id)?.label ?? "?";
  const who = (name: string) => (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white" aria-hidden>
        {name.split(/\s+/).map((w) => w[0]).slice(-2).join("").toUpperCase()}
      </span>
      <span className="truncate text-sm">{name}</span>
    </span>
  );
  const pick = (val: string | null) => { setPos(null); setQ(""); if (val !== cur) onSave(val); };
  const toggle = () => {
    if (pos) { setPos(null); return; }
    const b = ref.current!.getBoundingClientRect();
    const h = Math.min(240, opts.length * 30 + 10) + 44;   // + ô Tìm và dòng "Xoá giá trị"
    setQ("");
    const width = Math.max(b.width, 208);
    const left = Math.min(b.left, window.innerWidth - width - 8);
    setPos(window.innerHeight - b.bottom < h + 8 ? { left, width, bottom: window.innerHeight - b.top + 4 } : { left, width, top: b.bottom + 4 });
  };
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : e.type === "scroll" ? !listRef.current?.contains(e.target as Node) : !ref.current?.contains(e.target as Node) && !listRef.current?.contains(e.target as Node)) setPos(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);   // cuộn → đóng (danh sách cố định theo màn hình)
    return () => {
      document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  // Duyệt mẫu sưu tầm: đúng 3 pill — trạng thái hiện tại · Duyệt · Từ chối (Bản nháp thì pill giữa là "Gửi duyệt")
  if (col.key === "approval" && opts.some((o) => o.value === "Đã duyệt") && opts.some((o) => o.value === "Từ chối")) {
    const submit = cur === "Bản nháp" && opts.some((o) => o.value === "Chờ duyệt");
    // Có bảng chấm điểm: chưa đủ người chấm → nút "Chấm điểm" thay cho Duyệt; đủ rồi mới hiện Duyệt (mẫu không đạt: ẩn với người không phải Quản lý). Từ chối luôn hiện.
    const needScore = !!score && !submit && (score.n < score.min || (!score.mine && !score.bypass));   // chưa đủ người chấm, hoặc BẠN chưa chấm (Quản lý ngoại lệ) → nút "Chấm điểm" thay cho Duyệt
    const go = submit ? { label: "Gửi duyệt", value: "Chờ duyệt", on: false } : { label: "✓ Duyệt", value: "Đã duyệt", on: cur === "Đã duyệt" };
    const no = { label: "✕ Từ chối", value: "Từ chối", on: cur === "Từ chối" };
    const pill = "min-w-0 truncate whitespace-nowrap rounded-md border px-1.5 py-1.5 text-center text-xs! font-semibold leading-4 transition";   // text-xs! (important): globals.css có `button { font-size: inherit }` NGOÀI @layer nên thắng class cỡ chữ thường — không có ! thì <button> 14px còn <span> 12px
    return (
      <div className="min-w-0">
        <div className="mb-1 truncate text-[10px] font-semibold uppercase tracking-wide text-ink-muted" title={col.label}>{col.label}</div>
        {/* Thẻ vừa / lớn (≥ 240px): 3 pill 1 hàng. Thẻ nhỏ không đủ chỗ → trạng thái 1 hàng riêng, Duyệt / Từ chối chia đôi hàng dưới (container query) */}
        <div className="@container">
        <div className="grid grid-cols-2 gap-1.5 @[240px]:grid-cols-3">
          <span className={`${pill} border-transparent ${editable && cur !== "Đã duyệt" ? "col-span-2 @[240px]:col-span-1" : "col-span-full"}`} style={{ background: chipColor(opts.find((o) => o.value === cur)?.color).bg, color: chipColor(opts.find((o) => o.value === cur)?.color).fg }}>
            {cur ?? "—"}
          </span>
          {editable && cur !== "Đã duyệt" && (   // đã duyệt thì khoá: không duyệt lại, không từ chối
            <>
              {needScore ? (
                <button type="button" onClick={onScore} title={score!.mine ? `Đã có ${score!.n}/${score!.min} người chấm — đủ người mới được duyệt` : "Bạn cần chấm điểm mẫu này trước khi duyệt"}
                  className={`${pill} border-accent/50 bg-accent/10 text-accent hover:bg-accent hover:text-white`}>{score!.mine ? "Sửa điểm" : "Chấm điểm"}</button>
              ) : score?.block ? (
                <span title="Mẫu chưa đạt bảng chấm điểm — chỉ Quản lý được duyệt" className={`${pill} cursor-not-allowed border-line bg-grid text-ink-muted`}>Không đạt</span>
              ) : (
                <button type="button" disabled={go.on} onClick={() => onSave(go.value)}
                  className={`${pill} border-good/40 bg-good/10 text-good hover:bg-good hover:text-white disabled:cursor-default disabled:opacity-40 disabled:hover:bg-good/10 disabled:hover:text-good`}>{go.label}</button>
              )}
              <button type="button" disabled={no.on} onClick={() => onSave(no.value)}
                className={`${pill} border-bad/40 bg-bad/10 text-bad hover:bg-bad hover:text-white disabled:cursor-default disabled:opacity-40 disabled:hover:bg-bad/10 disabled:hover:text-bad`}>{no.label}</button>
            </>
          )}
        </div>
        {score && cur !== "Đã duyệt" && cur !== "Từ chối" && (!needScore || !editable) && (   // người không có quyền duyệt (vd Media) vẫn chấm được
          <button type="button" onClick={onScore} className="mt-1 text-2xs font-medium text-accent hover:underline">{score.mine ? "Sửa điểm của tôi" : "Chấm điểm"} · {score.n}/{score.min} người đã chấm</button>
        )}
        </div>
      </div>
    );
  }

  // Ô số tiền / số / chữ ngắn (vd Chi phí SX): nhập tay ngay trên thẻ, Enter hoặc bấm ra ngoài để lưu
  if (col.type === "money" || col.type === "number" || col.type === "text") {
    return <ActionInput col={col} v={v} editable={editable} onSave={onSave} />;
  }

  // Ít lựa chọn (Thương mại hoá / Không…, Chờ duyệt / Đạt / Sửa lại…): hiện thành NÚT BẤM thay vì danh sách xổ
  if (opts.length > 0 && (opts.length <= 4 || col.nextOnly) && !col.dropdown) {
    return (
      <div className="min-w-0">
        <div className="mb-1 truncate text-[10px] font-semibold uppercase tracking-wide text-ink-muted" title={col.label}>{col.label}</div>
        {editable ? (
          <div className="flex gap-1" role="group" aria-label={col.label}>   {/* các nút nằm 1 hàng, giãn theo độ dài chữ (tối đa 4 lựa chọn) */}
            {(col.nextOnly ? stepChoices(opts, cur) : opts).map((o, i) => {
              const on = cur === o.value, c = chipColor(o.color);
              const next = !!col.nextOnly && !on && (i > 0 || cur === null);   // nút bước kế tiếp: có mũi tên "chuyển sang"
              return (
                <button key={o.value} type="button" aria-pressed={on} onClick={() => { if (!on) onSave(o.value); }}
                  title={next ? `Chuyển sang “${o.value}”` : undefined}
                  style={on ? { background: c.bg, color: c.fg, borderColor: c.bg } : undefined}
                  className={`flex-auto whitespace-nowrap rounded-md border px-1 py-1 text-[11px] font-semibold transition ${
                    on ? "shadow-sm" : next ? "border-accent/50 bg-accent/10 text-accent hover:bg-accent hover:text-white" : "border-line bg-page text-ink-2 hover:border-accent hover:text-accent"}`}>
                  {on && "✓ "}{o.value}{next && " →"}
                </button>
              );
            })}
          </div>
        ) : cur ? <Chip value={cur} options={opts} /> : <span className="text-xs text-ink-muted">—</span>}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="mb-0.5 truncate text-2xs text-ink-muted" title={col.label}>{col.label}</div>
      <div ref={ref} className="relative w-full">
        <button type="button" disabled={!editable} onClick={toggle} aria-haspopup="listbox" aria-expanded={open}
          className={`flex w-full items-center justify-between gap-1 rounded-md border px-1.5 py-1 ${
            editable ? `bg-page hover:border-accent ${open ? "border-accent" : "border-line"}` : "cursor-default border-transparent px-0"}`}>
          {cur ? (isPerson ? who(nameOf(cur)) : <Chip value={cur} options={opts} />) : <span className="text-xs text-ink-muted">{editable ? "Chọn…" : "—"}</span>}
          {editable && <span className="text-xs text-ink-muted">▾</span>}
        </button>
        {/* Vẽ ra ngoài thẻ (portal vào body): thẻ có hiệu ứng rê chuột (translate) + overflow-hidden sẽ làm "fixed" tính theo thẻ → danh sách lệch chỗ / bị cắt */}
        {open && createPortal(
          <div ref={listRef} style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width }}
            className="z-50 rounded-md border border-line bg-surface p-1.5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            {/* Giống ô chọn trong bảng: ô Tìm tự focus · Enter chọn dòng đầu · Esc đóng · có "Xoá giá trị" */}
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm…"
              onKeyDown={(e) => {
                if (e.key === "Escape") setPos(null);
                if (e.key === "Enter" && shownOpts[0]) { e.preventDefault(); pick(shownOpts[0].value); }
              }}
              className="mb-1 w-full rounded-md border border-line bg-page px-2 py-1 text-xs outline-none focus:border-accent" />
            <ul role="listbox" className="max-h-60 overflow-y-auto">
              {cur && <li><button type="button" onClick={() => pick(null)} className="w-full rounded-md px-2 py-1 text-left text-xs text-ink-muted hover:bg-grid">Xoá giá trị</button></li>}
              {shownOpts.map((o) => (
                <li key={o.value}>
                  <button type="button" role="option" aria-selected={cur === o.value} onClick={() => pick(o.value)}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-left hover:bg-grid ${cur === o.value ? "bg-grid" : ""}`}>
                    {isPerson ? who(o.label) : <Chip value={o.value} options={opts} />}
                    {cur === o.value && <span className="text-xs text-accent">✓</span>}
                  </button>
                </li>
              ))}
              {!shownOpts.length && <li className="px-2 py-1 text-xs text-ink-muted">Không có lựa chọn phù hợp</li>}
            </ul>
          </div>,
          document.body,
        )}
      </div>
    </div>
  );
}

// Ảnh bìa thẻ: nhiều nguồn ảnh (vd Ảnh 3D ↔ Ảnh SP) bấm chuyển để đối chiếu; mỗi nguồn nhiều ảnh thì ‹ › để lật
function CardCover({ sources }: { sources: { label: string; imgs: { path: string; url: string; thumb?: string }[] }[] }) {
  const firstWith = Math.max(0, sources.findIndex((x) => x.imgs.length));
  const [picked, setSrc] = useState<number | null>(null);   // nguồn do người dùng bấm chọn; chưa chọn (hoặc nguồn đó không có ảnh) thì theo nguồn đầu tiên có ảnh
  const src = picked !== null && sources[picked]?.imgs.length ? picked : firstWith;
  const [idx, setIdx] = useState(0);
  const cur = sources[src] ?? { label: "", imgs: [] };
  const img = cur.imgs[Math.min(idx, cur.imgs.length - 1)];
  const [box, setBox] = useState<number | null>(null);
  const all = sources.flatMap((x) => x.imgs.map((im, i) => ({ url: im.url, thumb: im.thumb, alt: `${x.label}${x.imgs.length > 1 ? ` ${i + 1}/${x.imgs.length}` : ""}` })));
  const startAt = sources.slice(0, src).reduce((n, x) => n + x.imgs.length, 0) + Math.min(idx, Math.max(0, cur.imgs.length - 1));
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const go = (d: number) => setIdx((i) => (i + d + cur.imgs.length) % cur.imgs.length);
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-t-md bg-grid">
      {img ? (
        <button type="button" onClick={(e) => { stop(e); setBox(startAt); }} title="Xem ảnh lớn" className="block h-full w-full cursor-zoom-in">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL ký tạm thời của Storage */}
          <img src={img.thumb ?? img.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        </button>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-ink-muted">
          <span className="text-3xl">💍</span>
          {cur.label && <span className="text-2xs">Chưa có {cur.label}</span>}
        </div>
      )}
      {/* Chuyển nguồn ảnh: nút phân đoạn kính mờ, nguồn đang xem nổi bật, số ảnh nhỏ bên cạnh */}
      {sources.length > 1 && (
        <div className="absolute left-1.5 top-1.5 flex gap-px rounded-md bg-black/35 p-px text-[10px] shadow-sm ring-1 ring-white/15 backdrop-blur-md" role="tablist" aria-label="Nguồn ảnh" onClick={stop}>
          {sources.map((x, i) => (
            <button key={x.label} type="button" role="tab" aria-selected={i === src} onClick={(e) => { stop(e); setSrc(i); setIdx(0); }}
              className={`flex items-center gap-0.5 rounded-md px-1.5 font-semibold leading-4 transition-colors ${i === src ? "bg-white text-ink-1 shadow-sm" : "text-white/80 hover:bg-white/15 hover:text-white"}`}>
              {x.label}
              {x.imgs.length > 0 && <span className={`rounded-md px-[3px] text-[9px] font-bold leading-[14px] tabular-nums ${i === src ? "bg-black/10 text-ink-2" : "bg-white/20 text-white"}`}>{x.imgs.length}</span>}
            </button>
          ))}
        </div>
      )}
      {/* Lật ảnh trong cùng nguồn */}
      {cur.imgs.length > 1 && (
        <>
          <button type="button" onClick={(e) => { stop(e); go(-1); }} aria-label="Ảnh trước"
            className="absolute left-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full bg-black/50 text-white opacity-0 transition group-hover:opacity-100">‹</button>
          <button type="button" onClick={(e) => { stop(e); go(1); }} aria-label="Ảnh sau"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full bg-black/50 text-white opacity-0 transition group-hover:opacity-100">›</button>
          <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 px-1.5 text-2xs text-white">{Math.min(idx, cur.imgs.length - 1) + 1}/{cur.imgs.length}</span>
        </>
      )}
      {box !== null && <ImageLightbox images={all} startIndex={box} onClose={() => setBox(null)} />}
    </div>
  );
}

// ---------- Chân bảng: phép tính theo cột (giống Lark) ----------
type Calc = "none" | "count" | "empty" | "filled" | "unique" | "pct_empty" | "pct_filled" | "sum" | "avg" | "min" | "max";
const CALC_LABEL: Record<Calc, string> = {
  none: "Ẩn", count: "Đếm tất cả", empty: "Đếm bản ghi trống", filled: "Đếm bản ghi đã điền", unique: "Đếm bản ghi duy nhất",
  pct_empty: "Phần trăm bản ghi trống", pct_filled: "Phần trăm bản ghi đã điền", sum: "Tổng", avg: "Trung bình", min: "Nhỏ nhất", max: "Lớn nhất",
};
const CALC_SHORT: Record<Calc, string> = {
  none: "", count: "", empty: "Trống", filled: "Đã điền", unique: "Duy nhất", pct_empty: "Trống", pct_filled: "Đã điền",
  sum: "Tổng", avg: "TB", min: "Nhỏ nhất", max: "Lớn nhất",
};
const isEmptyCell = (v: CellValue) => v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length);

function calcValue(col: Col, rows: GridRow[], k: Calc): string {
  const vals = rows.map((r) => r.cells[col.key]);
  const n = vals.length, filled = vals.filter((v) => !isEmptyCell(v)).length;
  const pct = (x: number) => `${n ? Math.round((x / n) * 100) : 0}%`;
  const nums = vals.map((v) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : null)).filter((x): x is number => x !== null);
  const fmt = (x: number) => (col.type === "money" ? `${Math.round(x).toLocaleString("vi-VN")}đ` : x.toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + (col.suffix ?? ""));
  switch (k) {
    case "count": return `${n.toLocaleString("vi-VN")} bản ghi`;
    case "empty": return (n - filled).toLocaleString("vi-VN");
    case "filled": return filled.toLocaleString("vi-VN");
    case "unique": return new Set(vals.filter((v) => !isEmptyCell(v)).map((v) => textOf(col, v))).size.toLocaleString("vi-VN");
    case "pct_empty": return pct(n - filled);
    case "pct_filled": return pct(filled);
    case "sum": return fmt(nums.reduce((t, x) => t + x, 0));
    case "avg": return nums.length ? fmt(nums.reduce((t, x) => t + x, 0) / nums.length) : "—";
    case "min": return nums.length ? fmt(Math.min(...nums)) : "—";
    case "max": return nums.length ? fmt(Math.max(...nums)) : "—";
    default: return "";
  }
}

function FooterCell({ col, rows, calc, onChange }: { col: Col; rows: GridRow[]; calc: Calc; onChange: (k: Calc) => void }) {
  const numeric = col.type === "number" || col.type === "money";
  const options: Calc[] = ["none", "count", "empty", "filled", "unique", "pct_empty", "pct_filled", ...(numeric ? (["sum", "avg", "min", "max"] as Calc[]) : [])];
  const [pos, setPos] = useState<{ left: number; bottom: number; width: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : e.type === "scroll" || !(e.target as HTMLElement).closest?.("[data-footer-menu]")) setPos(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); window.removeEventListener("scroll", close, true); };
  }, [pos]);
  const value = calc === "none" ? "" : calcValue(col, rows, calc);
  return (
    <>
      <button ref={ref} type="button" data-footer-menu
        onClick={() => {
          if (pos) { setPos(null); return; }
          const b = ref.current!.getBoundingClientRect();
          const width = Math.max(b.width, 200);
          setPos({ left: Math.min(b.left, window.innerWidth - width - 8), bottom: window.innerHeight - b.top + 4, width });
        }}
        className={`group flex h-7 w-full items-center justify-end gap-1 px-2 text-xs hover:bg-grid ${pos ? "bg-grid" : ""}`}>
        {calc === "none" ? (
          <span className="text-ink-muted opacity-0 transition group-hover:opacity-100">Tính</span>
        ) : (
          <span className="truncate">
            {CALC_SHORT[calc] && <span className="text-ink-muted">{CALC_SHORT[calc]} </span>}
            <b className="font-semibold tabular">{value}</b>
          </span>
        )}
        <span className={`text-2xs text-ink-muted ${calc === "none" ? "opacity-0 group-hover:opacity-100" : ""}`}>▾</span>
      </button>
      {pos && (
        <ul data-footer-menu role="listbox" style={{ position: "fixed", left: pos.left, bottom: pos.bottom, width: pos.width }}
          className="z-50 max-h-80 overflow-y-auto rounded-md border border-line bg-surface p-1 text-sm shadow-lg">
          {options.map((k) => (
            <li key={k}>
              <button type="button" role="option" aria-selected={calc === k} onClick={() => { onChange(k); setPos(null); }}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-grid ${calc === k ? "font-medium text-accent" : ""}`}>
                <span>{CALC_LABEL[k]}</span>
                {k !== "none" && <span className="truncate text-xs text-ink-muted tabular">{calcValue(col, rows, k)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
