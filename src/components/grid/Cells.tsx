"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { attachGridImage, createGridUpload, removeGridImage } from "@/app/(dash)/rnd/grid-actions";
import { putFile } from "@/lib/media-upload";
import { compressImage } from "@/lib/image-compress";
import { chipColor, type Opt } from "@/lib/rnd-options";
import { unwrap } from "@/lib/action-result";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import type { CellValue, Col, ImageKind } from "./types";

// ---------- Hiển thị ----------

export const chipStyle = (color?: number) => {
  const c = chipColor(color);
  return { background: c.bg, color: c.fg };
};

export function Chip({ value, options, className = "" }: { value: string; options?: Opt[]; className?: string }) {
  const o = options?.find((x) => x.value === value);
  return (
    <span className={`inline-flex max-w-full items-center truncate whitespace-nowrap rounded-md px-2 py-px text-xs font-medium leading-5 ${className}`}
      style={chipStyle(o?.color)}>
      {value}
    </span>
  );
}

export const asList = (v: CellValue): string[] =>
  Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string")
  : typeof v === "string" && v ? v.split(/\s*,\s*/).filter(Boolean) : [];

const fmtDate = (v: string, withTime = false) => {
  const d = new Date(v.length === 10 ? `${v}T12:00:00+07:00` : v);
  return withTime ? d.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("vi-VN");
};

// Chuỗi dùng cho tìm kiếm / sắp xếp / xuất CSV
export function textOf(col: Col, v: CellValue): string {
  if (v === null || v === undefined || v === "") return "";
  if (col.type === "person") return col.people?.find((p) => p.id === v)?.name ?? "";
  if (col.type === "images") return Array.isArray(v) ? `${v.length} ảnh` : "";
  if (col.type === "multi") return asList(v).join(", ");
  if (col.type === "date" || col.type === "datetime") return typeof v === "string" ? fmtDate(v) : "";
  return String(v);
}

// Hàng cao (lines > 1) → chữ xuống dòng, ảnh to hơn
const CLAMP: Record<number, string> = { 1: "truncate", 2: "line-clamp-2 whitespace-normal break-words", 3: "line-clamp-3 whitespace-normal break-words", 4: "line-clamp-4 whitespace-normal break-words" };
const IMG: Record<number, number> = { 1: 28, 2: 48, 3: 64, 4: 84 };

// Ô chọn nhiều ở hàng thấp (1 dòng): hiện đủ các nhãn nếu vừa chỗ; không vừa → nhãn đầu luôn đầy đủ, nhãn kế tiếp hiện khi còn chỗ
// (không đủ thì bị cắt), phần còn lại gộp "+N". Đo chiều rộng thật của từng nhãn nên tự đổi theo độ rộng cột.
function MultiChips({ list, options }: { list: string[]; options?: Opt[] }) {
  const box = useRef<HTMLSpanElement>(null);
  const meas = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState({ full: 1, partial: false });
  const key = list.join("");
  useEffect(() => {
    const b = box.current, m = meas.current;
    if (!b || !m) return;
    const GAP = 4, n = list.length;
    const compute = () => {
      const W = b.clientWidth;
      const ws = [...m.children].map((c) => (c as HTMLElement).offsetWidth);
      const plus = ws.pop() ?? 36;
      if (ws.reduce((t, w) => t + w, 0) + GAP * (n - 1) <= W) { setFit({ full: n, partial: false }); return; }
      let used = ws[0], full = 1;
      for (let i = 1; i < n; i++) {
        if (used + GAP + ws[i] + GAP + plus > W) break;
        used += GAP + ws[i]; full++;
      }
      setFit({ full, partial: full === 1 && n > 1 && W - used - plus - 2 * GAP >= 44 });
    };
    const ro = new ResizeObserver(compute);
    ro.observe(b);
    return () => ro.disconnect();
  }, [key, list.length]);
  const shown = Math.min(fit.full, list.length), rest = list.length - shown - (fit.partial ? 1 : 0);
  return (
    <span ref={box} className="relative flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap" title={list.join(", ")}>
      {list.slice(0, shown).map((x) => <Chip key={x} value={x} options={options} className="flex-none" />)}
      {fit.partial && <Chip value={list[1]} options={options} className="min-w-0 shrink overflow-hidden" />}
      {rest > 0 && <span className="flex-none rounded-md bg-grid px-2 py-px text-xs font-medium leading-5 text-ink-2">+{rest}</span>}
      {/* Bản đo (ẩn): chiều rộng tự nhiên của từng nhãn + nhãn "+N" */}
      <span ref={meas} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 flex w-max gap-1 whitespace-nowrap">
        {list.map((x) => <Chip key={x} value={x} options={options} />)}
        <span className="rounded-md px-2 py-px text-xs font-medium leading-5">+99</span>
      </span>
    </span>
  );
}

export function CellView({ col, v, lines = 1, onImage }: { col: Col; v: CellValue; lines?: number; onImage?: (index: number) => void }) {
  const clamp = CLAMP[lines] ?? "truncate";
  const empty = <span className="text-ink-muted">—</span>;
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return col.type === "images" ? <span className="text-ink-muted">🖼</span> : empty;
  switch (col.type) {
    case "select": case "badge": return <Chip value={String(v)} options={col.options} />;
    case "multi": {
      const list = asList(v);
      // Hàng cao: các nhãn xuống dòng. Hàng thấp (1 dòng): nhãn đầu hiện ĐẦY ĐỦ, nhãn thứ 2 hiện nếu đủ chỗ (không thì bị cắt), các nhãn sau gộp thành "+N"
      // (rê chuột xem đủ; bấm vào ô để mở danh sách và sửa)
      if (lines > 1) return <span className="flex flex-wrap gap-1">{list.map((x) => <Chip key={x} value={x} options={col.options} />)}</span>;
      return <MultiChips list={list} options={col.options} />;
    }
    case "person": {
      const name = col.people?.find((p) => p.id === v)?.name ?? "?";
      const slot = (name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 4) + 1;
      return (
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: `var(--series-${slot})` }}>
            {name.split(/\s+/).map((w) => w[0]).slice(-2).join("").toUpperCase()}
          </span>
          <span className={clamp}>{name}</span>
        </span>
      );
    }
    case "money": return <span className="tabular">{Number(v).toLocaleString("vi-VN")}đ</span>;
    case "number": return <span className="tabular">{Number(v).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}{col.suffix ?? ""}</span>;
    case "date": return <span className="tabular">{fmtDate(String(v))}</span>;
    case "datetime": return <span className="tabular">{fmtDate(String(v), true)}</span>;
    case "link": {
      // Chữ link chỉ để xem (bấm = chọn ô / sửa như ô khác); mở link bằng nút ↗ ở cuối ô (giống Lark)
      const s = String(v);
      return /^https?:\/\//i.test(s) ? (
        <span className="flex min-w-0 items-start gap-1">
          <span className={`${clamp} min-w-0 break-all text-accent`} title={s}>{s.replace(/^https?:\/\/(www\.)?/, "")}</span>
          <a href={s} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Mở link trong tab mới"
            className="flex h-5 w-5 flex-none items-center justify-center rounded-md border border-line bg-surface text-ink-2 shadow-sm hover:border-accent hover:bg-accent hover:text-white">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M7 17L17 7M9 7h8v8" />
            </svg>
          </a>
        </span>
      ) : <span className={`${clamp} break-all`} title={s}>{s}</span>;
    }
    case "images": {
      const imgs = v as { path: string; url: string; thumb?: string }[];
      return (
        <span className="flex items-center gap-1">
          {imgs.slice(0, 3).map((im, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- URL ký tạm thời của Storage
            <img key={im.path} src={im.thumb ?? im.url} alt="" loading="lazy" decoding="async" style={{ width: IMG[lines] ?? 28, height: IMG[lines] ?? 28 }}
              onClick={onImage ? (e) => { e.stopPropagation(); onImage(i); } : undefined} title={onImage ? "Xem ảnh lớn" : undefined}
              className={`flex-none rounded-md object-cover ${onImage ? "cursor-zoom-in hover:ring-2 hover:ring-accent" : ""}`} />
          ))}
          {imgs.length > 3 && <span className="ml-1 text-2xs text-ink-muted">+{imgs.length - 3}</span>}
        </span>
      );
    }
    case "longtext": return <span className={`${CLAMP[Math.max(2, lines)]} whitespace-pre-line`}>{String(v)}</span>;
    default: return <span className={clamp} title={String(v)}>{String(v)}</span>;
  }
}

// ---------- Ô đang sửa (giống Lark: viền xanh ngay trên ô, gõ trực tiếp trong ô) ----------

// Ô đang chọn: phủ đúng khung ô, viền xanh 2px
const frame = "absolute inset-0 z-30 border-2 border-accent";
const drop = "absolute left-[-2px] top-full z-40 mt-1 w-60 rounded-md border border-line bg-surface p-1.5 shadow-lg";
// Khung ảnh: xổ ngay dưới ô
const box = "absolute left-0 top-full z-40 mt-1 rounded-md border border-line bg-surface shadow-lg";

// Khung xổ xuống mở ngay dưới ô; nếu phía dưới không đủ chỗ (ô nằm cuối bảng / sát đáy màn hình) mà phía trên rộng hơn
// thì lật lên trên ô. Đo sau khi vẽ (trước khi trình duyệt hiển thị) nên không bị nhấp nháy.
function useFlipUp(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current, cell = el?.parentElement;
    if (!el || !cell) return;
    el.style.top = ""; el.style.bottom = ""; el.style.marginTop = ""; el.style.marginBottom = "";
    const scroller = el.closest<HTMLElement>(".overflow-auto");
    const sc = scroller?.getBoundingClientRect();
    // Mép dưới dùng được = đáy màn hình / đáy vùng cuộn của bảng, trừ hàng tổng dính ở đáy; mép trên trừ hàng tiêu đề dính
    const footer = scroller?.querySelector("tfoot")?.getBoundingClientRect().height ?? 0;
    const header = scroller?.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    const limitBottom = Math.min(window.innerHeight, sc ? sc.bottom : Infinity) - footer - 6;
    const limitTop = Math.max(0, sc ? sc.top : 0) + header + 6;
    const c = cell.getBoundingClientRect(), h = el.offsetHeight + 4;
    const below = limitBottom - c.bottom, above = c.top - limitTop;
    if (below < h && above > below) { el.style.top = "auto"; el.style.bottom = "100%"; el.style.marginTop = "0"; el.style.marginBottom = "4px"; }
  }, [ref]);
}

// Đóng khi bấm ra ngoài
function useOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return ref;
}

// Giá trị ban đầu của ô ngày theo giờ VN (timestamp lưu UTC → 7h sáng VN vẫn đúng ngày)
const VN = "Asia/Ho_Chi_Minh";
function initialDraft(col: Col, v: CellValue) {
  if (v === null || v === undefined) return "";
  if (col.type === "multi") return asList(v).join(", ");
  const s = String(v);
  if (col.type === "date") return s.length > 10 ? new Intl.DateTimeFormat("en-CA", { timeZone: VN }).format(new Date(s)) : s;
  if (col.type === "datetime") {
    const d = new Date(s.length === 10 ? `${s}T09:00:00+07:00` : s);
    return new Intl.DateTimeFormat("sv-SE", { timeZone: VN, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .format(d).replace(" ", "T");
  }
  return s;
}

export function CellEditor({ col, v, onSave, onClose }: {
  col: Col; v: CellValue; onSave: (v: CellValue) => void; onClose: () => void;
}) {
  const initial = initialDraft(col, v);
  const [draft, setDraft] = useState<string>(initial);
  const [picked, setPicked] = useState<string[]>(asList(v));
  const [q, setQ] = useState("");
  // Ô chữ / số / ngày không đổi gì → chỉ đóng (không gửi lưu, không ghi lịch sử)
  const commit = (val: CellValue) => {
    if (typeof val === "string" && val === initial.trim()) { onClose(); return; }
    if (val === null && initial === "") { onClose(); return; }
    onSave(val); onClose();
  };
  const dropRef = useRef<HTMLDivElement>(null);
  useFlipUp(dropRef);
  const ref = useOutside(() => {
    if (col.type === "multi") commit(picked.length ? picked : null);
    else if (!["select", "person", "images"].includes(col.type)) commit(draft.trim() === "" ? null : draft.trim());
    else onClose();
  });
  // Ô ngày: mở ngay bảng chọn ngày khi bắt đầu sửa (nhấp lần 2) — giống Lark
  const pickRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (col.type !== "date" && col.type !== "datetime") return;
    try { pickRef.current?.showPicker(); } catch { /* trình duyệt chưa hỗ trợ / chưa có thao tác người dùng → vẫn gõ được */ }
  }, [col.type]);
  // Enter = lưu (ô nhiều dòng: Shift+Enter xuống dòng) · Esc = huỷ · bấm ra ngoài = lưu
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    if (e.key === "Enter" && !(col.type === "longtext" && e.shiftKey)) { e.preventDefault(); commit(draft.trim() === "" ? null : draft.trim()); }
  };

  // Ô chọn: giữ nguyên ô (viền xanh) + danh sách xổ ngay bên dưới
  if (col.type === "select" || col.type === "person" || col.type === "multi") {
    const items = col.type === "person"
      ? (col.people ?? []).map((p) => ({ value: p.id, label: p.name }))
      : (col.options ?? []).map((o) => ({ value: o.value, label: o.value }));
    const shown = items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()));
    return (
      <div ref={ref} className={frame} onClick={(e) => e.stopPropagation()}>
        <div ref={dropRef} className={drop}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm…"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && col.type !== "multi" && shown[0]) { e.preventDefault(); commit(shown[0].value); }
            }}
            className="mb-1 w-full rounded-md border border-line bg-page px-2 py-1 text-xs outline-none focus:border-accent" />
          <ul className="max-h-60 overflow-y-auto">
            {col.type !== "multi" && v !== null && v !== "" && (
              <li><button onClick={() => commit(null)} className="w-full rounded-md px-2 py-1 text-left text-xs text-ink-muted hover:bg-grid">Xoá giá trị</button></li>
            )}
            {shown.map((i) => (
              <li key={i.value}>
                {col.type === "multi" ? (
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-grid">
                    <input type="checkbox" checked={picked.includes(i.value)}
                      onChange={() => setPicked((p) => (p.includes(i.value) ? p.filter((x) => x !== i.value) : [...p, i.value]))} />
                    <Chip value={i.value} options={col.options} />
                  </label>
                ) : (
                  <button onClick={() => commit(i.value)} className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-left hover:bg-grid ${v === i.value ? "bg-grid" : ""}`}>
                    {col.type === "select" ? <Chip value={i.value} options={col.options} /> : <span>{i.label}</span>}
                    {v === i.value && <span className="text-xs text-accent">✓</span>}
                  </button>
                )}
              </li>
            ))}
            {!shown.length && <li className="px-2 py-1 text-xs text-ink-muted">Không có lựa chọn phù hợp</li>}
          </ul>
          {col.type === "multi" && (
            <button onClick={() => commit(picked.length ? picked : null)} className="mt-1 w-full rounded-md bg-accent py-1 text-xs font-medium text-white">Xong</button>
          )}
        </div>
      </div>
    );
  }

  // Ô chữ / ô nhiều dòng: gõ ngay trong ô, chữ tự xuống dòng như lúc hiển thị, ô tự cao theo nội dung (tối đa ~8 dòng).
  // Ô chữ thường (tên SP, link…): Enter = lưu, không chèn xuống dòng; ô nhiều dòng: Shift+Enter xuống dòng.
  if (col.type === "longtext" || col.type === "text" || col.type === "link") {
    const grow = (el: HTMLTextAreaElement) => {
      const cellH = el.parentElement!.parentElement!.clientHeight;
      el.style.height = "auto";
      el.style.height = `${Math.min(Math.max(el.scrollHeight, cellH), 180)}px`;
    };
    return (
      <div ref={ref} className="absolute left-0 top-0 z-30 w-full" onClick={(e) => e.stopPropagation()}>
        <textarea autoFocus value={draft} onKeyDown={keys} placeholder={col.type === "link" ? "https://…" : ""}
          onChange={(e) => { setDraft(col.type === "longtext" ? e.target.value : e.target.value.replace(/[\r\n]+/g, " ")); grow(e.target); }}
          onFocus={(e) => { const el = e.target; el.selectionStart = el.selectionEnd = el.value.length; grow(el); }}
          className={`block w-full resize-none border-2 border-accent bg-surface px-2 py-1.5 leading-snug shadow-md outline-none ${col.type === "link" ? "break-all" : "break-words"}`} />
      </div>
    );
  }

  // Ô số / tiền / ngày: input phủ đúng khung ô (ngày-giờ: khung rộng hơn ô cho vừa bộ chọn)
  const numeric = col.type === "money" || col.type === "number";
  const isDate = col.type === "date" || col.type === "datetime";
  return (
    <div ref={ref} className={`${frame} bg-surface ${col.type === "datetime" ? "right-auto min-w-[190px]" : isDate ? "right-auto min-w-[140px]" : ""}`}
      onClick={(e) => e.stopPropagation()}>
      <input ref={pickRef} autoFocus value={draft} onKeyDown={keys}
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          // Chọn xong 1 ngày đầy đủ trên bảng chọn → lưu luôn (năm < 2000 = đang gõ dở năm, chưa lưu)
          if (col.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0, 4)) >= 2000) commit(v);
        }}
        onFocus={(e) => { if (!isDate) e.target.select(); }}
        type={col.type === "date" ? "date" : col.type === "datetime" ? "datetime-local" : "text"} inputMode={numeric ? "decimal" : undefined}
        className={`h-full w-full bg-transparent px-1.5 outline-none ${numeric ? "text-right tabular" : ""}`} />
    </div>
  );
}

// ---------- Ảnh: tải thẳng lên Storage bằng "vé" server cấp ----------

// Tải nhiều ảnh vào 1 ô ảnh (dùng cho khung ảnh và dán Ctrl+V). Trả lỗi cuối cùng (nếu có).
export async function uploadCellImages(kind: ImageKind, rowId: string, files: File[], onProgress?: (msg: string | null) => void, onAttached?: (path: string) => void) {
  let lastError: string | null = null;
  for (const [i, orig] of files.entries()) {
    if (!orig.type.startsWith("image/")) { lastError = `${orig.name || "Tệp"}: không phải ảnh`; continue; }
    if (orig.size > 40 * 1024 * 1024) { lastError = `${orig.name || "Ảnh"}: lớn hơn 40MB`; continue; }
    onProgress?.(`Đang tải ảnh ${i + 1}/${files.length}…`);
    const f = await compressImage(orig);   // thu nhỏ + WebP trước khi tải (tiết kiệm dung lượng kho)
    if (f.size > 10 * 1024 * 1024) { lastError = `${orig.name || "Ảnh"}: lớn hơn 10MB sau khi nén`; continue; }
    try {
      const name = f.name && f.name !== "image.png" ? f.name : `dan-${Date.now()}.${(f.type.split("/")[1] ?? "png").replace("jpeg", "jpg")}`;
      const ticket = unwrap(await createGridUpload(kind, rowId, name));
      await putFile(ticket, f);
      unwrap(await attachGridImage(kind, rowId, ticket.path));
      onAttached?.(ticket.path);
    } catch (e) { lastError = e instanceof Error ? e.message : "Lỗi tải ảnh"; }
  }
  onProgress?.(null);
  return lastError;
}

export function ImageEditor({ kind, rowId, images, editable, onChanged, onClose, onImages }: {
  kind: ImageKind; rowId: string; images: { path: string; url: string; thumb?: string }[]; editable: boolean; onChanged: () => void; onClose: () => void;
  onImages?: (before: string[], after: string[]) => void;   // ghi lại thao tác ảnh để hoàn tác
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewAt, setViewAt] = useState<number | null>(null);   // ảnh đang mở trong cửa sổ xem ảnh
  const ref = useOutside(() => { if (viewAt === null) onClose(); });   // đang xem ảnh lớn thì không đóng khung
  useFlipUp(ref);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const before = images.map((im) => im.path), attached: string[] = [];
    setError(await uploadCellImages(kind, rowId, [...files], setBusy, (p) => attached.push(p)));
    if (attached.length) onImages?.(before, [...before, ...attached]);
    onChanged();
  }
  return (
    <div ref={ref} className={`${box} w-72 p-2`}>
      <div className="grid grid-cols-3 gap-1.5">
        {images.map((im) => (
          <div key={im.path} className="group relative aspect-square overflow-hidden rounded-md bg-grid">
            <a href={im.url} target="_blank" rel="noreferrer" onClick={(e) => { e.preventDefault(); setViewAt(images.indexOf(im)); }} className="cursor-zoom-in">
              {/* eslint-disable-next-line @next/next/no-img-element -- URL ký tạm thời của Storage */}
              <img src={im.thumb ?? im.url} alt="" loading="lazy" className="h-full w-full object-cover" />
            </a>
            {editable && (
              <button onClick={async () => { if (confirm("Xoá ảnh? (Ctrl+Z để hoàn tác)")) { unwrap(await removeGridImage(kind, rowId, im.path)); onImages?.(images.map((x) => x.path), images.filter((x) => x.path !== im.path).map((x) => x.path)); onChanged(); } }}
                className="absolute right-0.5 top-0.5 hidden rounded-md bg-black/60 px-1 text-xs text-white group-hover:block">✕</button>
            )}
          </div>
        ))}
        {editable && (
          <label className="flex aspect-square cursor-pointer items-center justify-center rounded-md border border-dashed border-line text-xl text-ink-muted hover:border-accent hover:text-accent">
            ＋<input type="file" accept="image/*" multiple className="hidden" disabled={!!busy} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </label>
        )}
      </div>
      {!images.length && !editable && <p className="text-xs text-ink-muted">Chưa có ảnh.</p>}
      {busy && <p className="mt-1 text-xs text-ink-2">{busy}</p>}
      {viewAt !== null && <ImageLightbox images={images.map((im, i) => ({ url: im.url, thumb: im.thumb, alt: `Ảnh ${i + 1}` }))} startIndex={viewAt} onClose={() => setViewAt(null)} />}
      {error && <p className="mt-1 text-xs text-bad">⛔ {error}</p>}
    </div>
  );
}
