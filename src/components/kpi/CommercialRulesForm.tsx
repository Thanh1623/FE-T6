"use client";

import { startTransition, useActionState } from "react";
import { saveCommercialRules, type KpiFormState } from "@/app/(dash)/kpi/actions";
import type { CommercialRules } from "@/lib/commercial-math";

const box = "w-[4.5rem] rounded-lg border border-line bg-page px-2 py-1.5 text-center text-sm tabular-nums outline-none focus:border-accent disabled:opacity-60";
const Cell = ({ label, unit, name, value, disabled }: { label: string; unit: string; name: keyof CommercialRules; value: number; disabled: boolean }) => (
  <div className="flex flex-col gap-1">
    <span className="text-2xs font-medium uppercase tracking-wide text-ink-muted">{label}</span>
    <span className="flex items-center gap-1.5 text-sm">
      <input name={name} type="number" min={0} step={1} defaultValue={value} disabled={disabled} aria-label={label} className={box} /><span className="text-ink-2">{unit}</span>
    </span>
  </div>
);

// Ngưỡng của bảng đánh giá khi duyệt thương mại hoá (tab "Đánh giá TMH" trên trang mẫu). Quản lý sửa; lưu xong áp dụng ngay.
export default function CommercialRulesForm({ rules, canEdit, custom }: { rules: CommercialRules; canEdit: boolean; custom: boolean }) {
  const [state, action, pending] = useActionState<KpiFormState, FormData>(saveCommercialRules, {});
  const off = !canEdit || pending;
  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
      startTransition(() => action(data));
    }}>
      <div className="divide-y divide-line">
        <div className="grid items-end gap-x-8 gap-y-3 py-3 sm:grid-cols-[9rem_1fr]">
          <div className="text-sm font-semibold">💰 Lợi nhuận</div>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <Cell label="Vận hành mặc định" unit="% giá bán" name="opsRatePct" value={rules.opsRatePct} disabled={off} />
            <Cell label="Biên lợi nhuận tối thiểu" unit="%" name="minMarginPct" value={rules.minMarginPct} disabled={off} />
            <Cell label="Hoà vốn tối đa" unit="ngày" name="maxBreakEvenDays" value={rules.maxBreakEvenDays} disabled={off} />
            <Cell label="Tỉ lệ hoàn tối đa" unit="%" name="maxReturnPct" value={rules.maxReturnPct} disabled={off} />
          </div>
        </div>
        <div className="grid items-end gap-x-8 gap-y-3 py-3 sm:grid-cols-[9rem_1fr]">
          <div className="text-sm font-semibold">📦 Số lượng đặt</div>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <Cell label="Tồn an toàn" unit="ngày bán" name="safetyDays" value={rules.safetyDays} disabled={off} />
            <Cell label="Thời gian sản xuất mặc định" unit="ngày" name="defaultLeadDays" value={rules.defaultLeadDays} disabled={off} />
          </div>
        </div>
        <div className="grid items-end gap-x-8 gap-y-3 py-3 sm:grid-cols-[9rem_1fr]">
          <div className="text-sm font-semibold">📊 Độ tin cậy</div>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <Cell label="Đã bán tối thiểu" unit="ngày" name="minDataDays" value={rules.minDataDays} disabled={off} />
            <Cell label="và tối thiểu" unit="sản phẩm" name="minDataQty" value={rules.minDataQty} disabled={off} />
          </div>
        </div>
      </div>
      {state.error && <p className="text-sm font-medium text-bad">⛔ {state.error}</p>}
      {state.ok && <p className="text-sm font-medium text-good">✓ {state.message}</p>}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">{pending ? "Đang lưu…" : "Lưu"}</button>
          <button type="submit" name="intent" value="reset" disabled={pending || !custom} className="rounded-lg border border-line px-4 py-2 text-sm text-ink-2 hover:bg-grid disabled:opacity-50">Khôi phục mặc định</button>
        </div>
      )}
    </form>
  );
}
