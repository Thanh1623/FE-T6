"use client";

import { useActionState, useState } from "react";
import CardShell from "@/components/kpi/CardShell";
import RuleList from "@/components/kpi/RuleList";
import RulesEditor from "@/components/kpi/RulesEditor";
import { saveDefaultKpi, saveWindowDays, type KpiFormState } from "@/app/(dash)/kpi/actions";
import type { KpiRule } from "@/lib/kpi-constants";

type Tpl = { id: string; rules: KpiRule[]; match: "all" | "any"; min_days: number; min_views: number };
const input = "w-full rounded-lg border border-line bg-page px-3 py-2 text-sm outline-none focus:border-accent";

// Thẻ 1 bộ KPI mặc định (Traffic hoặc Bán hàng): đọc như câu văn; Quản lý bấm "Sửa" để đổi điều kiện.
// Lưu xong hệ thống chấm lại mọi mã ngay (xem message trả về).
export default function KpiCard({ goal, title, wins, tone, tpl, canEdit, windowDays }: {
  goal: "traffic" | "sales"; title: string; wins: string; tone: string; tpl: Tpl | null; canEdit: boolean; windowDays: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<KpiFormState, FormData>(async (s, f) => {
    const r = await saveDefaultKpi(s, f);
    if (r.ok) setOpen(false);
    return r;
  }, {});

  return (
    <CardShell icon={goal === "traffic" ? "👁" : "💰"} title={title.replace(/^\S+\s/, "")} result={wins} tone={tone}
      action={canEdit && tpl && !open ? <button onClick={() => setOpen(true)} className="rounded-lg border border-line px-3 py-1.5 text-sm text-accent hover:bg-grid">✎ Sửa</button> : undefined}>
      {!tpl ? <p className="text-sm text-bad">Chưa có bộ KPI mặc định cho mục tiêu này.</p> : !open ? (
        <div className="space-y-2">
          <RuleList rules={tpl.rules} match={tpl.match}
            chips={[`Đủ dữ liệu sau ≥ ${tpl.min_days} ngày`, ...(tpl.min_views ? [`≥ ${tpl.min_views.toLocaleString("vi-VN")} lượt xem tối thiểu`] : [])]} />
          {tpl.min_days > windowDays && (
            <p className="rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn-ink">⚠ Đủ dữ liệu sau {tpl.min_days} ngày dài hơn cửa sổ test ({windowDays} ngày): nên đặt ≤ {windowDays}.</p>
          )}
        </div>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="goal_code" value={goal} />
          <RulesEditor rules={tpl.rules} match={tpl.match} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">Đủ dữ liệu sau (ngày)
              <input name="min_days" type="number" min={0} defaultValue={tpl.min_days} className={input} />
            </label>
            <label className="block text-sm">và lượt xem tối thiểu
              <input name="min_views" type="number" min={0} defaultValue={tpl.min_views} className={input} />
            </label>
          </div>
          {goal === "sales" && <p className="text-xs text-ink-muted">Bán hàng chỉ được tính đạt khi mã đã có ít nhất số lượt xem tối thiểu ở trên (chuyển đổi trên vài người xem là nhiễu).</p>}
          {state.error && <p className="text-sm text-bad">⛔ {state.error}</p>}
          <div className="flex gap-2">
            <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
              {pending ? "Đang lưu và chấm lại…" : "Lưu & chấm lại"}
            </button>
            <button type="button" disabled={pending} onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm text-ink-2 hover:bg-grid">Huỷ</button>
          </div>
        </form>
      )}
      {state.ok && !open && state.message && <p className="text-sm text-good">✓ {state.message}</p>}
    </CardShell>
  );
}

// Cửa sổ test tự động (ngày kể từ video đầu tiên)
export function WindowForm({ days, canEdit }: { days: number; canEdit: boolean }) {
  const [state, action, pending] = useActionState<KpiFormState, FormData>(saveWindowDays, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2" title="Mỗi mã được chấm trong số ngày này kể từ video đầu tiên gắn mã">
      <label htmlFor="window_days" className="text-sm text-ink-2">Cửa sổ test</label>
      <input id="window_days" name="window_days" type="number" min={3} max={90} defaultValue={days} disabled={!canEdit} className="w-20 rounded-lg border border-line bg-page px-3 py-2 text-center text-sm tabular-nums outline-none focus:border-accent disabled:opacity-60" />
      <span className="text-sm text-ink-2">ngày</span>
      {canEdit && (
        <button disabled={pending} className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-grid disabled:opacity-60">{pending ? "Đang lưu…" : "Lưu & chấm lại"}</button>
      )}
      {state.error && <span className="text-sm text-bad">⛔ {state.error}</span>}
      {state.ok && <span className="text-sm text-good">✓ {state.message}</span>}
    </form>
  );
}
