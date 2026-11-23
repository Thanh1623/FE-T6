"use client";

import { startTransition, useActionState } from "react";
import { saveWinRules, type KpiFormState } from "@/app/(dash)/kpi/actions";
import type { WinRules } from "@/lib/spu-tracking";

const input = "w-full rounded-md border border-line bg-page px-2 py-1 text-sm tabular-nums outline-none focus:border-accent disabled:opacity-60";

// Một ô nhập có nhãn phía trên + đơn vị bên phải
function Field({ label, unit, children }: { label: string; unit?: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-0.5 block truncate text-2xs text-ink-muted">{label}</span>
      <span className="flex items-center gap-1.5">{children}{unit && <span className="flex-none text-xs text-ink-2">{unit}</span>}</span>
    </label>
  );
}

// QUY TẮC WIN DUY NHẤT theo biên bản họp R&D × ĐVKD — dùng chung cho Dashboard (thẻ S2–S4) và trang Theo dõi đẩy hàng (nút Win Traffic / Win Đơn hàng / Ngôi sao).
// Hai cách tính, CÙNG ngưỡng: (1) SPU đang bán — cuốn chiếu theo N ngày gần nhất, không phụ thuộc kỳ lọc; (2) mẫu mới (mã test, SP R&D) — theo video đầu tiên. Quản lý sửa; lưu xong áp dụng ngay.
export default function WinRulesForm({ rules, canEdit, custom }: { rules: WinRules; canEdit: boolean; custom: boolean }) {
  const [state, action, pending] = useActionState<KpiFormState, FormData>(saveWinRules, {});
  const off = !canEdit || pending;
  return (
    <form className="space-y-3" onSubmit={(e) => {
      // onSubmit (không dùng action=): ô nhập không bị React reset sau khi lưu
      e.preventDefault();
      const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
      startTransition(() => action(data));
    }}>
      <p className="text-xs text-ink-2">
        Áp dụng cho <b>SP đang bán</b> (tính cuốn chiếu theo các ngày gần nhất, không phụ thuộc kỳ lọc) và <b>mẫu test đã win</b> (tính theo các ngày đầu kể từ video đầu tiên).
        Chấm theo từng sản phẩm, cộng dồn mọi video gắn mã SPU; lượt xem và bình luận tính phần <b>tăng thêm</b> trong khoảng ngày.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-lg border border-line p-3">
          <h3 className="mb-2 text-sm font-semibold">👁 Win Traffic <span className="font-normal text-ink-muted">· đạt cả hai</span></h3>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Lượt xem tăng thêm ≥"><input name="traffic_views" type="number" min={1} step={1} defaultValue={rules.traffic.views} disabled={off} className={input} /></Field>
            <Field label="Bình luận tăng thêm ≥"><input name="traffic_comments" type="number" min={0} step={1} defaultValue={rules.traffic.comments} disabled={off} className={input} /></Field>
            <Field label="Trong" unit="ngày"><input name="traffic_days" type="number" min={1} max={30} step={1} defaultValue={rules.traffic.days} disabled={off} className={input} /></Field>
          </div>
        </section>
        <section className="rounded-lg border border-line p-3">
          <h3 className="mb-2 text-sm font-semibold">🛒 Win Đơn hàng</h3>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Sản phẩm bán (thuần) ≥" unit="sp"><input name="order_qty" type="number" min={1} step={1} defaultValue={rules.order.qty} disabled={off} className={input} /></Field>
            <Field label="Trong" unit="ngày"><input name="order_days" type="number" min={1} max={30} step={1} defaultValue={rules.order.days} disabled={off} className={input} /></Field>
          </div>
        </section>
      </div>
      <p className="text-xs text-ink-2">⭐ <b>Ngôi sao</b> = đạt cả Win Traffic và Win Đơn hàng.</p>
      {state.error && <p className="text-sm font-medium text-bad">⛔ {state.error}</p>}
      {state.ok && <p className="text-sm font-medium text-good">✓ {state.message}</p>}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">{pending ? "Đang lưu…" : "Lưu"}</button>
          <button type="submit" name="intent" value="reset" disabled={pending || !custom} className="rounded-lg border border-line px-4 py-2 text-sm text-ink-2 hover:bg-grid disabled:opacity-50" title="Đưa quy tắc Win về đúng biên bản họp (100.000 lượt xem · 300 bình luận · 3 ngày; 30 sản phẩm · 7 ngày)">Khôi phục theo biên bản họp</button>
        </div>
      )}
    </form>
  );
}
