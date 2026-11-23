"use client";

import { useState } from "react";
import { decideApproval, killItem, requestCraft, restoreItem, skipTo, startProduction, submitForApproval } from "@/app/(dash)/rnd/pipeline-actions";
import { APPROVAL_LABELS, STAGE_LABELS, type Approval, type Stage } from "@/lib/pipeline-constants";
import { Err, Panel, StatusPill, btn, btnGhost, input, useRun } from "./ui";

// Khung điều khiển: duyệt mẫu sưu tầm (→ P1), bắt đầu sản xuất (→ P2), chọn quay chế tác (P5), dừng / mở lại mẫu, bỏ qua công đoạn
export default function ControlPanel({ id, stage, approval, approvalNote, approvedBy, killed, killReason, can }: {
  id: string; stage: Stage; approval: Approval | null; approvalNote: string | null; approvedBy: string | null;
  killed: boolean; killReason: string | null;
  can: { approve: boolean; work: boolean; restore: boolean };
}) {
  const { busy, error, run } = useRun();
  const [note, setNote] = useState("");
  const [skip, setSkip] = useState<Stage | "">("");

  const tone = approval === "approved" ? "good" : approval === "rejected" ? "bad" : approval === "pending" ? "warn" : "muted";

  return (
    <Panel title="Duyệt mẫu" badge={approval && <StatusPill tone={tone}>{APPROVAL_LABELS[approval]}</StatusPill>}>
      {killed && (
        <div className="rounded-lg border border-bad/40 px-3 py-2">
          <div className="font-medium text-bad">⛔ Mẫu đã dừng</div>
          {killReason && <div className="text-xs text-ink-2">{killReason}</div>}
          {can.restore && <button disabled={busy} onClick={() => run(() => restoreItem(id))} className="mt-1 text-xs text-accent hover:underline">Mở lại mẫu</button>}
        </div>
      )}

      {approval === "approved" && (
        <p className="text-xs text-ink-2">Duyệt bởi {approvedBy ?? "?"}{approvalNote ? ` · ${approvalNote}` : ""}</p>
      )}
      {approval === "rejected" && approvalNote && <p className="text-xs text-warn-ink">Lý do: {approvalNote}</p>}

      {!killed && stage === "p0" && (approval === "draft" || approval === "rejected") && can.work && (
        <button disabled={busy} onClick={() => run(() => submitForApproval(id))} className={btn}>
          {approval === "rejected" ? "Đã sửa — gửi duyệt lại" : "Gửi duyệt"}
        </button>
      )}

      {!killed && stage === "p0" && approval === "pending" && (
        can.approve ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (bắt buộc nếu không duyệt)" className={input} />
            </div>
            <div className="flex gap-2">
              <button disabled={busy} className={btn}
                onClick={() => run(() => decideApproval(id, true, note))}>✓ Duyệt → P1</button>
              <button disabled={busy} className={btnGhost}
                onClick={() => run(() => decideApproval(id, false, note))}>✕ Không duyệt</button>
            </div>
          </div>
        ) : <p className="text-xs text-ink-muted">Đang chờ Quản lý hoặc trưởng team duyệt.</p>
      )}

      {!killed && stage === "p1" && (can.work || can.approve) && (
        <button disabled={busy} onClick={() => run(() => startProduction(id))} className={btn}>▶ Bắt đầu sản xuất mẫu → P2</button>
      )}

      {!killed && (stage === "p5" || stage === "p6") && can.work && (
        <button disabled={busy} onClick={() => { if (confirm("Tạo yêu cầu quay source chế tác cho mẫu này?")) run(() => requestCraft(id)); }} className={btnGhost}>
          🎬 Chọn quay source chế tác
        </button>
      )}

      {!killed && (stage === "p1" || stage === "p2") && can.approve && (
        <details className="text-xs">
          <summary className="cursor-pointer text-ink-2">Bỏ qua công đoạn (mẫu mua sẵn, không cần 3D / đặt xưởng…)</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            <select value={skip} onChange={(e) => setSkip(e.target.value as Stage)} className={`${input} w-44`}>
              <option value="">Lên thẳng mốc…</option>
              {(["p2", "p3"] as Stage[]).filter((s) => s > stage).map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
            </select>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lý do" className={`${input} flex-1`} />
            <button disabled={busy || !skip} onClick={() => run(() => skipTo(id, skip as Stage, note))} className={btnGhost}>Xác nhận</button>
          </div>
        </details>
      )}

      {!killed && (can.approve || can.work) && stage !== "p5" && stage !== "p6" && (
        <details className="text-xs">
          <summary className="cursor-pointer text-ink-2">Dừng mẫu (kill)</summary>
          <div className="mt-2 flex gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lý do dừng" className={input} />
            <button disabled={busy} onClick={() => { if (confirm("Dừng mẫu này?")) run(() => killItem(id, note)); }}
              className="whitespace-nowrap rounded-lg border border-bad px-3 py-1.5 text-bad hover:bg-grid">Dừng</button>
          </div>
        </details>
      )}
      <Err error={error} />
    </Panel>
  );
}
