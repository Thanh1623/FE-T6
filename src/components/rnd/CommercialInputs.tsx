"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(dash)/rnd/actions";

// Số liệu nhập tay cho đánh giá thương mại hoá (ô trống = dùng mặc định)
export default function CommercialInputs({ action, values, defaults, canEdit }: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  values: { video_cost: number | null; ops_cost: number | null; lead_days: number | null; min_order_qty: number | null };
  defaults: { opsRatePct: number; leadDays: number };
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const field = "w-32 rounded-md border border-line bg-page px-2 py-1 text-right tabular-nums outline-none focus:border-accent disabled:opacity-60";
  return (
    <form action={formAction} className="space-y-2 text-sm">
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-2">Chi phí quay mẫu (đ)
          <input name="video_cost" defaultValue={values.video_cost ?? ""} inputMode="numeric" disabled={!canEdit} className={field} placeholder="0" /></label>
        <label className="flex items-center justify-between gap-2">Chi phí vận hành / sp (đ)
          <input name="ops_cost" defaultValue={values.ops_cost ?? ""} inputMode="numeric" disabled={!canEdit} className={field} placeholder={`${defaults.opsRatePct}% giá bán`} /></label>
        <label className="flex items-center justify-between gap-2">Thời gian sản xuất hàng loạt (ngày)
          <input name="lead_days" defaultValue={values.lead_days ?? ""} inputMode="numeric" disabled={!canEdit} className={field} placeholder={String(defaults.leadDays)} /></label>
        <label className="flex items-center justify-between gap-2">SL đặt tối thiểu (bội số)
          <input name="min_order_qty" defaultValue={values.min_order_qty ?? ""} inputMode="numeric" disabled={!canEdit} className={field} placeholder="1" /></label>
      </div>
      {canEdit && (
        <div className="flex items-center gap-3">
          <button disabled={pending} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60">{pending ? "Đang lưu…" : "Lưu số liệu"}</button>
          {state.ok && <span className="text-xs text-good">Đã lưu — bảng đánh giá đã tính lại</span>}
          {state.error && <span className="text-xs text-bad">⛔ {state.error}</span>}
        </div>
      )}
      <p className="text-2xs text-ink-muted">Ô trống = dùng mặc định (vận hành theo % cài đặt, sản xuất {defaults.leadDays} ngày, bội số đặt 1).</p>
    </form>
  );
}
