import SessionControls from "@/components/rnd/SessionControls";
import StartTestForm from "@/components/rnd/StartTestForm";
import { CHANNELS, fmtDate } from "@/lib/data";
import { RESULT_LABELS, SALES_SCOPES, fmtRule } from "@/lib/kpi-constants";
import type { Goal, Session, Template } from "@/lib/kpi";
import type { FormState } from "@/app/(dash)/rnd/actions";

const RESULT_STYLE = { win: "bg-good text-white", win_traffic: "bg-accent text-white", win_sp: "bg-res-wsp text-white", fail: "bg-bad text-white" } as const;

function SessionSummary({ s, goals, pages }: { s: Session; goals: Goal[]; pages: { id: string; name: string }[] }) {
  const goal = goals.find((g) => g.code === s.goal_code);
  const scope = s.sales_scope === "pages"
    ? `${SALES_SCOPES.pages}: ${s.page_ids.map((id) => pages.find((p) => p.id === id)?.name ?? id).join(", ")}`
    : s.sales_scope === "channels"
      ? `${SALES_SCOPES.channels}: ${s.channels.map((c) => CHANNELS[c as keyof typeof CHANNELS] ?? c).join(", ")}`
      : SALES_SCOPES.all;
  return (
    <div className="space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <b>{goal?.name ?? s.goal_code}</b>
        {goal && goal.code !== "test" && <span className="text-xs text-ink-muted">đạt → {RESULT_LABELS[goal.win_result]}</span>}
        {s.result && <span className={`rounded-md px-2 py-0.5 text-xs ${RESULT_STYLE[s.result]}`}>{RESULT_LABELS[s.result]}</span>}
      </div>
      <div className="text-ink-2">{fmtDate(s.start_date)} → {fmtDate(s.end_date)}{s.campaign && ` · chiến dịch ${s.campaign}`}</div>
      <ul className="list-disc pl-5 text-ink-2">{s.rules.map((r, i) => <li key={i}>{fmtRule(r)}</li>)}</ul>
      <div className="text-xs text-ink-muted">
        {s.rules.length > 1 && (s.match === "all" ? "Đạt tất cả · " : "Đạt ít nhất 1 · ")}
        Đủ dữ liệu: ≥ {s.min_days} ngày{s.min_views ? ` & ≥ ${s.min_views.toLocaleString("vi-VN")} lượt xem` : ""} · Số bán: {scope}
      </div>
      {s.note && <div className="text-xs text-ink-2">📝 {s.note}</div>}
      <div className="text-xs text-ink-muted">Tạo bởi {s.creator?.full_name ?? "?"}</div>
    </div>
  );
}

// Khung "Phiên test" trên trang chi tiết mẫu
export default function TestPanel({ sessions, goals, templates, pages, productLine, canEdit, canCancel, startAction, today }: {
  sessions: Session[]; goals: Goal[]; templates: Template[]; pages: { id: string; name: string }[];
  productLine: string | null; canEdit: boolean; canCancel: boolean; today: string;
  startAction: (s: FormState, f: FormData) => Promise<FormState>;
}) {
  const running = sessions.find((s) => s.status === "running");
  const past = sessions.filter((s) => s.status === "ended");
  const days = running ? Math.min(
    Math.round((Date.parse(today) - Date.parse(running.start_date)) / 86_400_000) + 1,
    Math.round((Date.parse(running.end_date) - Date.parse(running.start_date)) / 86_400_000) + 1,
  ) : 0;
  const total = running ? Math.round((Date.parse(running.end_date) - Date.parse(running.start_date)) / 86_400_000) + 1 : 0;

  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-3 font-semibold">Phiên test</h2>
      {running ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-md bg-accent px-2 py-0.5 text-xs text-white">Đang test</span>
            <span className="text-ink-2">Ngày {Math.max(days, 0)}/{total}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-md bg-grid">
              <div className="h-full rounded-md bg-accent" style={{ width: `${Math.min(100, Math.max(0, (days / total) * 100))}%` }} />
            </div>
          </div>
          <SessionSummary s={running} goals={goals} pages={pages} />
          <p className="rounded-lg bg-page px-3 py-2 text-xs text-ink-muted">
            Tiến độ so với KPI và kết quả đề xuất (WIN / WIN TRAFFIC / FAIL) sẽ hiện ở đây khi có bộ máy đánh giá (giai đoạn 3).
          </p>
          <SessionControls id={running.id} startDate={running.start_date} endDate={running.end_date} canEdit={canEdit} canCancel={canCancel} />
        </div>
      ) : canEdit ? (
        goals.length ? (
          <StartTestForm action={startAction} goals={goals} templates={templates} productLine={productLine}
            pages={pages} channels={CHANNELS} today={today} />
        ) : <p className="text-sm text-ink-muted">Chưa có mục tiêu test nào — Quản lý tạo trong trang KPI.</p>
      ) : <p className="text-sm text-ink-muted">Không có phiên test đang chạy.</p>}

      {past.length > 0 && (
        <div className="mt-5 space-y-3 border-t border-line pt-4">
          <h3 className="font-semibold text-ink-2">Các phiên trước ({past.length})</h3>
          {past.map((s) => (
            <div key={s.id} className="rounded-lg bg-page p-3">
              <SessionSummary s={s} goals={goals} pages={pages} />
              {!s.result && <div className="mt-1 text-xs text-warn-ink">Chờ xác nhận kết quả (giai đoạn 3)</div>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
