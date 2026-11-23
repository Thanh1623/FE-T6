import { STAGES, STAGE_LABELS, stageIndex, type Stage } from "@/lib/pipeline-constants";

// Thanh mốc P0 → P6 dạng đường nối: mốc đã qua có dấu ✓, mốc hiện tại tô đậm, mốc chưa tới mờ.
// Mẫu bị dừng hiện ⛔ ở mốc kế tiếp. Màn nhỏ: cuộn ngang.
export default function StageStepper({ stage, killed, from = 0 }: { stage: Stage; killed: boolean; from?: number }) {   // from: bỏ các mốc đầu (Media chỉ thấy từ P3)
  const cur = stageIndex(stage);
  return (
    <ol className="flex items-start overflow-x-auto pb-0">
      {STAGES.map((s, i) => {
        if (i < from) return null;
        const done = i < cur, now = i === cur, stopped = killed && i === cur + 1;
        const [code, ...rest] = STAGE_LABELS[s].split(" · ");
        const dot = stopped ? "border-bad bg-bad/10 text-bad"
          : now ? (killed ? "border-ink-muted bg-grid text-ink-2" : "border-accent bg-accent text-white shadow-[0_0_0_4px] shadow-accent/20")
          : done ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface text-ink-muted";
        return (
          <li key={s} className="flex min-w-[76px] flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${i === from ? "bg-transparent" : i <= cur ? "bg-accent" : "bg-line"}`} />
              <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full border-2 text-xs font-bold ${dot}`}>
                {stopped ? "⛔" : done ? "✓" : code.replace("P", "")}
              </span>
              <span className={`h-0.5 flex-1 ${i === STAGES.length - 1 ? "bg-transparent" : i < cur ? "bg-accent" : "bg-line"}`} />
            </div>
            <div className={`mt-1 px-1 text-xs leading-tight ${now && !killed ? "font-semibold text-accent" : done ? "text-ink-1" : "text-ink-muted"}`}>
              {rest.join(" · ") || code}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
