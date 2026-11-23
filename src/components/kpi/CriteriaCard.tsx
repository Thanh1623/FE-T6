"use client";

import { useActionState, useState } from "react";
import CardShell from "@/components/kpi/CardShell";
import RuleList from "@/components/kpi/RuleList";
import RulesEditor from "@/components/kpi/RulesEditor";
import { saveVideoKpi, type KpiFormState } from "@/app/(dash)/kpi/actions";
import type { KpiRule } from "@/lib/kpi-constants";

// Thẻ tiêu chí tự chấm của trang Mục tiêu, cùng kiểu với Traffic / Bán hàng: Video Win (điều kiện chấm riêng từng video, chỉ chỉ số traffic).
// Win Traffic / Win Đơn hàng / Ngôi sao của SPU nằm ở mục "Quy tắc Win theo biên bản họp" (WinRulesForm).
export default function CriteriaCard({ rules, match, canEdit, custom }: {
  rules: KpiRule[]; match: "all" | "any"; canEdit: boolean; custom: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<KpiFormState, FormData>(async (s, f) => {
    const r = await saveVideoKpi(s, f);
    if (r.ok) setOpen(false);
    return r;
  }, {});

  return (
    <CardShell icon="🎬" title="Video Win" result="VIDEO WIN" tone="--res-win"
      action={canEdit && !open ? <button onClick={() => setOpen(true)} className="rounded-lg border border-line px-3 py-1.5 text-sm text-accent hover:bg-grid">✎ Sửa</button> : undefined}>
      {!open ? (
        <RuleList rules={rules} match={match} chips={["Chấm riêng từng video", custom ? "Đã chỉnh" : "Mặc định"]} />
      ) : (
        <form action={action} className="space-y-3">
          <RulesEditor rules={rules} match={match} groups={["traffic"]} />
          {state.error && <p className="text-sm text-bad">⛔ {state.error}</p>}
          <div className="flex gap-2">
            <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">{pending ? "Đang lưu…" : "Lưu"}</button>
            <button type="button" disabled={pending} onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm text-ink-2 hover:bg-grid">Huỷ</button>
          </div>
        </form>
      )}
      {state.ok && !open && state.message && <p className="text-sm text-good">✓ {state.message}</p>}
    </CardShell>
  );
}
