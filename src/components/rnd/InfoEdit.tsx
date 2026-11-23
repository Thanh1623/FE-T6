"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { saveCell } from "@/app/(dash)/rnd/grid-actions";
import { unwrap } from "@/lib/action-result";

// Chế độ sửa thông tin mẫu ngay trên trang chi tiết: mặc định chỉ xem; bấm "Cập nhật" mới mở các ô nhập, sửa xong bấm "Lưu" để ghi tất cả ô đã đổi
// (mỗi ô lưu qua cùng đường lưu của bảng R&D nên quyền / kiểm tra / lịch sử giống hệt); "Huỷ" bỏ mọi thay đổi chưa lưu.
type Table = "collection" | "design";
type Draft = { table: Table; field: string; value: string; original: string };
type Ctx = {
  productId: string; canEdit: boolean; editing: boolean;
  draftOf: (key: string) => string | undefined;
  setDraft: (table: Table, field: string, value: string, original: string) => void;
};
const InfoEditContext = createContext<Ctx | null>(null);
export const useInfoEdit = () => useContext(InfoEditContext);
export const keyOf = (table: Table, field: string) => `${table}:${field}`;

type Bar = { editing: boolean; changes: number; pending: boolean; error: string | null; start: () => void; cancel: () => void; save: () => void };
const BarContext = createContext<Bar | null>(null);

export function InfoEditProvider({ productId, canEdit, children }: { productId: string; canEdit: boolean; children: ReactNode }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const setDraft = useCallback((table: Table, field: string, value: string, original: string) => {
    setDrafts((d) => {
      const k = keyOf(table, field), next = { ...d };
      if (value === original) delete next[k]; else next[k] = { table, field, value, original };
      return next;
    });
  }, []);
  const draftOf = useCallback((key: string) => drafts[key]?.value, [drafts]);
  const changes = Object.keys(drafts).length;

  const bar: Bar = {
    editing, changes, pending, error,
    start: () => { setError(null); setEditing(true); },
    cancel: () => { setDrafts({}); setError(null); setEditing(false); },
    save: () => startTransition(async () => {
      setError(null);
      const left = { ...drafts };
      for (const [k, d] of Object.entries(drafts)) {
        try { unwrap(await saveCell(d.table, productId, d.field, d.value || null)); delete left[k]; }
        catch (e) { setDrafts(left); setError(`${d.field}: ${e instanceof Error ? e.message : "Lỗi lưu"}`); router.refresh(); return; }   // dừng ở ô lỗi, các ô đã lưu không phải nhập lại
      }
      setDrafts({}); setEditing(false); router.refresh();
    }),
  };
  const ctx = useMemo<Ctx>(() => ({ productId, canEdit, editing, draftOf, setDraft }), [productId, canEdit, editing, draftOf, setDraft]);
  return <InfoEditContext.Provider value={ctx}><BarContext.Provider value={bar}>{children}</BarContext.Provider></InfoEditContext.Provider>;
}

// Nút Cập nhật / Lưu / Huỷ (đặt trong InfoEditProvider)
export function InfoEditBar({ label = "Thông tin mẫu" }: { label?: string }) {
  const ctx = useInfoEdit(), bar = useContext(BarContext);
  if (!ctx || !bar || !ctx.canEdit) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-2.5">
      <div className="text-sm">
        <span className="font-semibold">{label}</span>
        <span className="ml-2 text-xs text-ink-muted">{bar.editing ? (bar.changes ? `${bar.changes} ô đã sửa, chưa lưu` : "Đang sửa — chưa có thay đổi") : "Bấm Cập nhật để sửa thông tin"}</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        {bar.error && <span className="text-xs text-bad">⛔ {bar.error}</span>}
        {bar.editing ? (
          <>
            <button type="button" onClick={bar.cancel} disabled={bar.pending} className="rounded-md px-3 py-1.5 text-ink-2 hover:bg-grid disabled:opacity-60">Huỷ</button>
            <button type="button" onClick={bar.save} disabled={bar.pending || bar.changes === 0} className="rounded-md bg-accent px-4 py-1.5 font-medium text-white hover:opacity-90 disabled:opacity-60">{bar.pending ? "Đang lưu…" : "Lưu"}</button>
          </>
        ) : (
          <button type="button" onClick={bar.start} className="rounded-md border border-accent px-3 py-1.5 font-medium text-accent hover:bg-accent/10">✎ Cập nhật</button>
        )}
      </div>
    </div>
  );
}
