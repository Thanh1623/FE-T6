"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/(dash)/rnd/actions";
import { SALES_SCOPES, type SalesScope } from "@/lib/kpi-constants";


const input = "w-full rounded-lg border border-line bg-page px-3 py-2 text-sm outline-none focus:border-accent";
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);

export default function StartTestForm({ action, pages, channels, today }: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  // goals / templates / productLine: không còn dùng (một kiểu test duy nhất) — TestPanel vẫn có thể truyền xuống
  goals?: unknown; templates?: unknown; productLine?: string | null;
  pages: { id: string; name: string }[]; channels: Record<string, string>; today: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDays(today, 13));
  const [scope, setScope] = useState<SalesScope>("all");

  return (
    <form action={formAction} className="space-y-3 text-sm">
      {/* Một kiểu test duy nhất: KPI lấy từ mẫu mặc định Sales + Traffic. Đạt KPI bán → WIN; chưa bán đủ mà đạt KPI traffic → WIN TRAFFIC */}
      <input type="hidden" name="goal_code" value="test" />
      <input type="hidden" name="rules" value="[]" />
      <input type="hidden" name="min_days" value="0" />
      <input type="hidden" name="min_views" value="0" />
      <p className="rounded-lg bg-page px-3 py-2 text-xs text-ink-2">
        Đánh giá theo KPI chung: đạt KPI <b>bán hàng</b> → WIN · chưa bán đủ nhưng đạt KPI <b>traffic</b> → WIN TRAFFIC (sau đó bán đủ thì nâng lên WIN).
        Hết hạn mà chưa đạt vế nào → FAIL.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">Bắt đầu
          <input type="date" name="start_date" value={start} className={input}
            onChange={(e) => { setStart(e.target.value); setEnd(addDays(e.target.value, 13)); }} />
        </label>
        <label className="block">Kết thúc dự kiến
          <input type="date" name="end_date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={input} />
        </label>
        <label className="block sm:col-span-2">Chiến dịch <span className="text-ink-muted">(tuỳ chọn)</span>
          <input name="campaign" className={input} />
        </label>
      </div>

      <fieldset className="rounded-lg border border-line p-3">
        <legend className="px-1 font-medium">Phạm vi số bán</legend>
        <div className="flex flex-wrap gap-4">
          {Object.entries(SALES_SCOPES).map(([k, label]) => (
            <label key={k} className="flex items-center gap-1.5">
              <input type="radio" name="sales_scope" value={k} checked={scope === k} onChange={() => setScope(k as SalesScope)} /> {label}
            </label>
          ))}
        </div>
        {scope === "pages" && (
          <div className="mt-2 flex flex-wrap gap-3">
            {pages.map((p) => <label key={p.id} className="flex items-center gap-1.5"><input type="checkbox" name="page_ids" value={p.id} /> {p.name}</label>)}
            <p className="w-full text-xs text-ink-muted">Chỉ đếm đơn có tag page_id_ của Trang trên Sapo; traffic chỉ lấy bài của các Trang này.</p>
          </div>
        )}
        {scope === "channels" && (
          <div className="mt-2 flex flex-wrap gap-3">
            {Object.entries(channels).filter(([k]) => k !== "bao_hanh").map(([k, l]) => (
              <label key={k} className="flex items-center gap-1.5"><input type="checkbox" name="channels" value={k} /> {l}</label>
            ))}
          </div>
        )}
      </fieldset>

      <label className="block">Ghi chú
        <textarea name="note" rows={2} className={input} placeholder="Giả thuyết, cách đăng, ngân sách…" />
      </label>

      {state.error && <p className="text-bad">⛔ {state.error}</p>}
      <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-60">
        {pending ? "Đang tạo…" : "▶ Bắt đầu test"}
      </button>
    </form>
  );
}
