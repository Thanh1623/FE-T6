"use client";

import { useState } from "react";
import { Chip } from "./Cells";
import { DATE_PRESETS, OPS, defaultFilter, kindOf, type Filter, type FilterMatch, type FilterOp } from "./filters";
import type { Col } from "./types";

const sel = "rounded-md border border-line bg-page px-2 py-1 text-sm outline-none focus:border-accent";
// So khớp khi gõ tìm: không phân biệt hoa thường và dấu tiếng Việt
const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

// Khung "Lọc bản ghi" (giống Lark): [trường] [kiểu lọc] [giá trị] ✕ · ghép điều kiện bằng "tất cả" / "bất kỳ"
export default function FilterPanel({ columns, filters, match, onChange, onMatch }: {
  columns: Col[]; filters: Filter[]; match: FilterMatch;
  onChange: (f: Filter[]) => void; onMatch: (m: FilterMatch) => void;
}) {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const set = (i: number, patch: Partial<Filter>) => onChange(filters.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const [openChoice, setOpenChoice] = useState<number | null>(null);
  const [query, setQuery] = useState("");   // từ khoá gõ trong ô giá trị (lọc danh sách lựa chọn)

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <b className="text-sm">Lọc bản ghi</b>
        {filters.length > 1 && (
          <label className="flex items-center gap-1 text-ink-2">
            Thoả
            <select value={match} onChange={(e) => onMatch(e.target.value as FilterMatch)} className={`${sel} py-0.5 text-xs`}>
              <option value="all">tất cả điều kiện</option>
              <option value="any">bất kỳ điều kiện nào</option>
            </select>
          </label>
        )}
      </div>

      {filters.map((f, i) => {
        const c = byKey.get(f.key);
        if (!c) return null;
        const kind = kindOf(c.type);
        const needsValue = f.op !== "empty" && f.op !== "notempty";
        const choices = c.type === "person" ? (c.people ?? []).map((p) => ({ v: p.id, label: p.name })) : (c.options ?? []).map((o) => ({ v: o.value, label: o.value }));
        const picked = Array.isArray(f.value) ? f.value : [];
        const summary = picked.map((v) => choices.find((x) => x.v === v)?.label ?? v).join(", ");
        const shown = openChoice === i && query.trim() ? choices.filter((ch) => fold(ch.label).includes(fold(query.trim()))) : choices;
        const toggle = (v: string) => set(i, { value: picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v] });
        const dateVal = typeof f.value === "string" ? f.value : "this_month";
        const isCustomDate = kind === "date" && (dateVal === "custom" || /^\d{4}-\d{2}-\d{2}$/.test(dateVal));
        return (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="w-6 flex-none text-right text-2xs text-ink-muted">{i === 0 ? "Khi" : match === "all" ? "và" : "hoặc"}</span>
              <select value={f.key} onChange={(e) => { const nc = byKey.get(e.target.value)!; set(i, defaultFilter(nc)); }} className={`${sel} w-32 flex-none`}>
                {columns.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
              <select value={f.op} onChange={(e) => set(i, { op: e.target.value as FilterOp })} className={`${sel} w-28 flex-none`}>
                {OPS[kind].map(([op, label]) => <option key={op} value={op}>{label}</option>)}
              </select>
              <div className="min-w-0 flex-1">
                {!needsValue ? null : kind === "choice" ? (
                  // Ô nhập: gõ để tìm trong danh sách (không phân biệt dấu), Enter chọn / bỏ chọn kết quả đầu, Esc đóng; mục đã chọn hiện mờ trong ô khi chưa gõ
                  <input value={openChoice === i ? query : ""} placeholder={summary || "Chọn hoặc gõ để tìm…"} title={summary || undefined}
                    onFocus={() => { setOpenChoice(i); setQuery(""); }}
                    onBlur={() => setOpenChoice((cur) => (cur === i ? null : cur))}
                    onChange={(e) => { setOpenChoice(i); setQuery(e.target.value); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); if (shown[0]) toggle(shown[0].v); }
                      if (e.key === "Escape") { e.preventDefault(); setOpenChoice(null); (e.target as HTMLInputElement).blur(); }
                    }}
                    className={`${sel} w-full truncate ${picked.length ? "placeholder:text-ink-1" : ""}`} />
                ) : kind === "date" ? (
                  <div className="flex gap-1">
                    <select value={isCustomDate ? "custom" : dateVal} onChange={(e) => set(i, { value: e.target.value })} className={`${sel} min-w-0 flex-1`}>
                      {DATE_PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                    {isCustomDate && (
                      <input type="date" value={/^\d{4}-\d{2}-\d{2}$/.test(dateVal) ? dateVal : ""} onChange={(e) => set(i, { value: e.target.value || "custom" })}
                        className={`${sel} w-36 flex-none`} />
                    )}
                  </div>
                ) : (
                  <input value={typeof f.value === "string" ? f.value : ""} onChange={(e) => set(i, { value: e.target.value })}
                    inputMode={kind === "number" ? "decimal" : undefined} placeholder={kind === "number" ? "Nhập số" : "Nhập nội dung"}
                    className={`${sel} w-full`} />
                )}
              </div>
              <button type="button" onClick={() => onChange(filters.filter((_, j) => j !== i))} title="Xoá điều kiện"
                className="flex-none rounded px-1.5 text-ink-muted hover:bg-grid hover:text-bad">✕</button>
            </div>
            {kind === "choice" && needsValue && openChoice === i && (
              <div onMouseDown={(e) => e.preventDefault()} className="ml-8 flex max-h-40 flex-wrap gap-1 overflow-y-auto rounded-md border border-line p-1.5">
                {shown.map((ch) => {
                  const on = picked.includes(ch.v);
                  return (
                    <button key={ch.v} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => toggle(ch.v)}
                      className={`rounded-md ${on ? "ring-2 ring-accent ring-offset-1" : "opacity-70 hover:opacity-100"}`}>
                      {c.type === "person" ? <span className="rounded-md bg-grid px-2 py-0.5 text-xs">{ch.label}</span> : <Chip value={ch.v} options={c.options} />}
                    </button>
                  );
                })}
                {!choices.length && <span className="text-xs text-ink-muted">Không có lựa chọn</span>}
                {choices.length > 0 && !shown.length && <span className="text-xs text-ink-muted">Không có kết quả khớp “{query.trim()}”</span>}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center justify-between">
        <select value="" onChange={(e) => { const c = byKey.get(e.target.value); if (c) onChange([...filters, defaultFilter(c)]); }}
          className="rounded-md bg-transparent px-1 py-1 text-sm text-accent outline-none hover:bg-grid">
          <option value="">＋ Thêm điều kiện</option>
          {columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        {filters.length > 0 && <button type="button" onClick={() => onChange([])} className="text-xs text-ink-2 hover:text-bad">Xoá mọi điều kiện</button>}
      </div>
    </div>
  );
}
