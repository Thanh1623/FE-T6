"use client";

import { useActionState, useState, useTransition } from "react";
import ResultBadge from "@/components/rnd/ResultBadge";
import type { FormState } from "@/app/(dash)/rnd/actions";
import { cancelHandoff } from "@/app/(dash)/sample-push/actions";
import type { AutoResult } from "@/lib/eval/rules";

type Confirmed = { result: "win" | "win_traffic" | "win_sp" | "fail"; note: string | null; by: string | null; at: string } | null;
type HandoffInfo = { id: string; status: string; statusText: string } | null;

const OPTIONS = [["win", "🏆 WIN"], ["win_traffic", "📈 WIN TRAFFIC"], ["fail", "✕ FAIL"]] as const;
// Màu từng lựa chọn: chưa chọn = viền + chữ màu nhạt, đã chọn = nền đặc
const TONE: Record<string, { idle: string; on: string }> = {
  win: { idle: "border-good/40 bg-good/10 text-good hover:bg-good/20", on: "border-good bg-good font-semibold text-white" },
  win_traffic: { idle: "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20", on: "border-accent bg-accent font-semibold text-white" },
  fail: { idle: "border-bad/40 bg-bad/10 text-bad hover:bg-bad/20", on: "border-bad bg-bad font-semibold text-white" },
};

// Duyệt "Thương mại hoá" = chốt đúng mức Win hệ thống đề xuất (WIN TRAFFIC nếu đề xuất là WIN TRAFFIC, còn lại WIN)
const yesValue = (suggested: AutoResult | null) => (suggested === "win_traffic" ? "win_traffic" : "win");

// Khung "Kết luận": R&D xác nhận đề xuất của hệ thống (hoặc sửa, kèm lý do) và chuyển Sao Biển
// inPipeline: mẫu thuộc quy trình R&D → Win lên P5 (kèm SL duyệt sản xuất), FAIL dừng mẫu
export default function DecisionPanel({ action, suggested, confirmed, handoff, hasSource, canEdit, inPipeline = false, pendingCommercial = false, commercial = null }: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  suggested: AutoResult | null; confirmed: Confirmed; handoff: HandoffInfo; hasSource: boolean; canEdit: boolean;
  inPipeline?: boolean;
  commercial?: { label: string; tone: string; suggestion: "approve" | "conditional" | "reject"; href: string } | null;   // gợi ý từ bảng đánh giá thương mại hoá
  pendingCommercial?: boolean;   // mẫu trong quy trình chưa ở P6 (chưa duyệt thương mại hoá) → luôn mở sẵn nút duyệt, kể cả khi từng có kết luận cũ
}) {
  const [editing, setEditing] = useState(!confirmed || pendingCommercial);
  const [state, formAction, pending] = useActionState<FormState, FormData>(async (s, f) => {
    const r = await action(s, f);
    if (r.ok) setEditing(false);
    return r;
  }, {});
  const [result, setResult] = useState<string>(pendingCommercial ? (suggested === "fail" ? "fail" : yesValue(suggested)) : confirmed?.result ?? (suggested && suggested !== "testing" ? suggested : ""));
  const [busy, start] = useTransition();
  const canHandoff = result === "win" || result === "win_traffic" || result === "win_sp";
  const handoffOpen = handoff && handoff.status !== "returned";

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-5 text-sm">
      <h2 className="font-semibold">{inPipeline ? "Duyệt thương mại hoá (P5 → P6)" : "Kết luận của R&D"}</h2>
      {canEdit === false && !confirmed && inPipeline && <p className="text-xs text-ink-muted">Quản lý hoặc trưởng team của mẫu duyệt bước này.</p>}

      {confirmed && !editing && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {inPipeline ? (
              <span className={`rounded-md px-2.5 py-0.5 text-xs font-semibold ${confirmed.result === "fail" ? "bg-bad/10 text-bad" : "bg-good/10 text-good"}`}>
                {confirmed.result === "fail" ? "✕ Không thương mại hoá" : "✓ Đã duyệt thương mại hoá"}
              </span>
            ) : <ResultBadge result={confirmed.result} />}
            <span className="text-xs text-ink-muted">
              xác nhận bởi {confirmed.by ?? "?"} · {new Date(confirmed.at).toLocaleString("vi-VN")}
            </span>
          </div>
          {suggested && suggested !== confirmed.result && suggested !== "testing" && (
            <div className="text-xs text-warn-ink">Khác đề xuất của hệ thống ({suggested.toUpperCase().replace("_", " ")})</div>
          )}
          {confirmed.note && <div className="text-xs text-ink-2">📝 {confirmed.note}</div>}
          {handoff && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-page px-3 py-2 text-xs">
              🎬 Đẩy mẫu ĐVKD: <b>{handoff.statusText}</b>
              {handoff.status === "pending" && canEdit && (
                <button disabled={busy} className="text-bad hover:underline"
                  onClick={() => { if (confirm("Huỷ phiếu đẩy mẫu ĐVKD?")) start(async () => { const r = await cancelHandoff(handoff.id); if ("error" in r) alert(r.error); }); }}>Huỷ chuyển</button>
              )}
            </div>
          )}
          {canEdit && <button onClick={() => setEditing(true)} className="text-xs text-accent hover:underline">Xác nhận lại</button>}
        </div>
      )}

      {editing && canEdit && (
        <form action={formAction} className="space-y-3">
          <div className="text-xs text-ink-2">
            Hệ thống đề xuất: {suggested ? <ResultBadge result={suggested} size="xs" /> : "chưa có đánh giá"}
            {suggested === "testing" && " — mẫu chưa hết cửa sổ test, chỉ xác nhận sớm khi chắc chắn"}
          </div>
          {inPipeline && commercial && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-ink-2">Đánh giá thương mại hoá:</span>
              <span className={`rounded-md px-2 py-0.5 font-semibold ${commercial.tone}`}>{commercial.label}</span>
              <a href={commercial.href} className="text-accent hover:underline">Xem chi tiết</a>
              {((commercial.suggestion === "reject" && result !== "fail") || (commercial.suggestion === "approve" && result === "fail")) && <span className="text-warn-ink">· quyết định ngược gợi ý — ghi lý do</span>}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {(inPipeline
              ? ([[yesValue(suggested), "✓ Thương mại hoá", "win"], ["fail", "✕ Không thương mại hoá", "fail"]] as const)
              : OPTIONS.map(([k, label]) => [k, label, k] as const)
            ).map(([k, label, tone]) => (
              <label key={k} className={`cursor-pointer rounded-lg border px-3 py-1.5 transition ${result === k ? TONE[tone].on : TONE[tone].idle}`}>
                <input type="radio" name="result" value={k} checked={result === k} onChange={() => setResult(k)} className="sr-only" />
                {label}
              </label>
            ))}
            {inPipeline && <input type="hidden" name="commercial" value="1" />}
          </div>
          <textarea name="note" rows={2} className="w-full rounded-lg border border-line bg-page px-3 py-2 outline-none focus:border-accent"
            placeholder={suggested && suggested !== "testing" && result && result !== suggested ? "Bắt buộc: vì sao khác đề xuất?" : "Ghi chú (tuỳ chọn)"} />
          {inPipeline && canHandoff && (
            <label className="flex items-center gap-2">
              SL duyệt sản xuất
              <input name="win_qty" type="number" min={1} placeholder="VD 20"
                className="w-24 rounded-lg border border-line bg-page px-2 py-1 outline-none focus:border-accent" />
            </label>
          )}
          {inPipeline && result === "fail" && <p className="text-xs text-warn-ink">Không thương mại hoá sẽ dừng mẫu ở mốc hiện tại.</p>}
          {canHandoff && !handoffOpen && (
            <div className="space-y-2 rounded-lg border border-line p-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="handoff" value="1" defaultChecked={result === "win"} disabled={!hasSource} />
                🎬 Tạo phiếu đẩy mẫu ĐVKD (chọn team nhận sau ở trang Đẩy mẫu ĐVKD)
              </label>
              {!hasSource && <p className="text-xs text-warn-ink">Cần nhập link kho Source ở phần Thông tin trước khi chuyển.</p>}
              <textarea name="handoff_note" rows={2} disabled={!hasSource} placeholder="Yêu cầu cho team nhận (cần làm gì tiếp…)"
                className="w-full rounded-lg border border-line bg-page px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60" />
            </div>
          )}
          {state.error && <p className="text-bad">⛔ {state.error}</p>}
          <div className="flex gap-2">
            <button disabled={pending || !result} className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-60">
              {pending ? "Đang lưu…" : inPipeline ? "✓ Xác nhận duyệt" : "✓ Xác nhận kết quả"}
            </button>
            {confirmed && <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-4 py-2 text-ink-2 hover:bg-grid">Huỷ</button>}
          </div>
        </form>
      )}
      {!confirmed && !canEdit && <p className="text-ink-muted">Chưa có kết luận.</p>}
    </section>
  );
}
