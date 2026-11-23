"use client";

import { useState } from "react";
import { linkSku } from "@/app/(dash)/rnd/pipeline-actions";
import { Err, Panel, btn, input, useRun } from "./ui";

// Gắn mã SPU = hashtag trên video. Có mã + có video → hệ thống tự đánh giá và mẫu tự lên P4.
export default function SkuPanel({ id, code, canEdit }: { id: string; code: string | null; canEdit: boolean }) {
  const { busy, error, run } = useRun();
  const [c, setC] = useState(code ?? "");
  return (
    <Panel title="P4 · Mã SPU & test traffic">
      <p className="text-xs text-ink-2">
        {code
          ? <>Đăng video kèm hashtag <b>#{code}</b> — hệ thống tự nhận bài, đánh giá traffic + số bán và chuyển mẫu sang P4.</>
          : "Gắn mã SPU trước khi đăng video. Mã này dùng làm hashtag trên bài đăng."}
      </p>
      {canEdit && (
        <div className="space-y-2">
          <input value={c} onChange={(e) => setC(e.target.value)} placeholder="Mã SPU = mã Sapo trước dấu '-', VD N0123" className={`${input} uppercase sm:max-w-xs`} />
          <button disabled={busy || !c.trim()} onClick={() => run(() => linkSku(id, c))} className={btn}>
            {busy ? "Đang gắn…" : code ? "Đổi mã" : "Gắn mã SPU"}
          </button>
          <p className="text-xs text-ink-muted">Nếu video đã đăng trước khi gắn, số liệu của mã đó được gộp vào mẫu này.</p>
        </div>
      )}
      <Err error={error} />
    </Panel>
  );
}
