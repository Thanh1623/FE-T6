"use client";

import { startTransition, useActionState } from "react";
import { saveStockRules, type KpiFormState } from "@/app/(dash)/kpi/actions";
import type { SpuRules } from "@/lib/spu-tracking";

const box = "w-[4.5rem] rounded-lg border border-line bg-page px-2 py-1.5 text-center text-sm tabular-nums outline-none focus:border-accent disabled:opacity-60";

function Num({ name, value, disabled, label }: { name: string; value: number; disabled: boolean; label: string }) {
  return <input name={name} type="number" min={0} step={1} defaultValue={value} disabled={disabled} aria-label={label} className={box} />;
}
const Cell = ({ label, children, unit }: { label: string; children: React.ReactNode; unit: string }) => (
  <div className="flex flex-col gap-1">
    <span className="text-2xs font-medium uppercase tracking-wide text-ink-muted">{label}</span>
    <span className="flex items-center gap-1.5 text-sm">{children}<span className="text-ink-2">{unit}</span></span>
  </div>
);

// Quy tắc phân loại bán của trang Theo dõi SPU và Dashboard — dựa HOÀN TOÀN vào SL = số lượng bán trong 30 ngày gần nhất (kể cả SPU hết hàng vẫn bán; tồn xấu chỉ tính SPU còn hàng).
// SL < 0 → Khác · SL = 0 → Tồn xấu · SL < [bán chậm] → Bán chậm · SL < [bán thường] → Bán thường · còn lại → Bán chạy. Quản lý sửa; lưu xong áp dụng ngay.
export default function StockRulesForm({ rules, canEdit, custom }: { rules: Pick<SpuRules, "sales">; canEdit: boolean; custom: boolean }) {
  const [state, action, pending] = useActionState<KpiFormState, FormData>(saveStockRules, {});
  const off = !canEdit || pending;
  const { slowBelow, normalBelow } = rules.sales;
  const row = "grid items-center gap-x-6 gap-y-1 py-3 sm:grid-cols-[9rem_1fr]";
  return (
    <form className="space-y-4" onSubmit={(e) => {
      // onSubmit (không dùng action=): ô nhập không bị React reset sau khi lưu
      e.preventDefault();
      const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
      startTransition(() => action(data));
    }}>
      <p className="pt-2 text-sm text-ink-2">Phân loại theo <b>SL = số lượng bán trong 30 ngày gần nhất</b> của từng SPU (tồn xấu chỉ tính SPU còn hàng; SPU hết hàng vẫn bán được xếp theo số bán).</p>
      <div className="divide-y divide-line">
        <div className={row}>
          <div className="text-sm font-semibold">📦 Tồn xấu</div>
          <div className="text-sm text-ink-2">SL = 0 <span className="text-ink-muted">(còn hàng nhưng 30 ngày không bán được sản phẩm nào — cố định)</span></div>
        </div>
        <div className={row}>
          <div className="text-sm font-semibold">🐌 Bán chậm</div>
          <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-ink-2">0 &lt; SL &lt;</span><Num disabled={off} label="Bán chậm: dưới" name="slow_below" value={slowBelow} /><span className="text-ink-2">sản phẩm</span></div>
        </div>
        <div className={row}>
          <div className="text-sm font-semibold">🙂 Bán thường</div>
          <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-ink-2">{slowBelow} ≤ SL &lt;</span><Num disabled={off} label="Bán thường: dưới" name="normal_below" value={normalBelow} /><span className="text-ink-2">sản phẩm</span></div>
        </div>
        <div className={row}>
          <div className="text-sm font-semibold">🔥 Bán chạy</div>
          <div className="text-sm text-ink-2">SL ≥ {normalBelow} sản phẩm <span className="text-ink-muted">(tự theo ngưỡng bán thường)</span></div>
        </div>
        <div className={row}>
          <div className="text-sm font-semibold">❔ Khác</div>
          <div className="text-sm text-ink-2">SL &lt; 0 <span className="text-ink-muted">(số bán âm, vd hoàn nhiều hơn bán — cố định)</span></div>
        </div>
      </div>
      {state.error && <p className="text-sm font-medium text-bad">⛔ {state.error}</p>}
      {state.ok && <p className="text-sm font-medium text-good">✓ {state.message}</p>}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">{pending ? "Đang lưu…" : "Lưu"}</button>
          <button type="submit" name="intent" value="reset" disabled={pending || !custom} className="rounded-lg border border-line px-4 py-2 text-sm text-ink-2 hover:bg-grid disabled:opacity-50" title="Đưa KPI Ngôi sao và ngưỡng phân loại bán về mặc định">Khôi phục mặc định</button>
        </div>
      )}
    </form>
  );
}
