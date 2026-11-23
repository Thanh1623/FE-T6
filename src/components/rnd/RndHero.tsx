import BackButton from "@/components/BackButton";
import StageStepper from "@/components/pipeline/StageStepper";
import { APPROVAL_LABELS, STAGE_LABELS, type Approval, type ProductGroup, type Stage } from "@/lib/pipeline-constants";
import { fmtDate } from "@/lib/data";

const chip = "rounded-md bg-grid px-2 py-0.5 text-xs text-ink-2";

// Đầu trang chi tiết mẫu — 1 thẻ gọn: quay lại · ảnh bìa nhỏ · mã + nhãn + tên + 1 dòng thông tin · thanh mốc (cùng hàng khi màn rộng) · nút nhanh
export default function RndHero(p: {
  cover: string | null; name: string; code: string | null; stCode: string | null; inPipeline: boolean;
  stage: Stage; killed: boolean; approval: Approval | null; team: string | null; group: ProductGroup | null; fromMedia: boolean;
  createdAt: string; createdBy: string | null; approvedAt: string | null; daysAt: number | null;
  refUrl: string | null; sourceUrl: string | null; fromStage?: number;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
        <BackButton fallback="/rnd" iconOnly />
        {p.cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL ký tạm thời của Storage
          <img src={p.cover} alt="" className="h-12 w-12 flex-none rounded-lg border border-line object-cover" />
        ) : <div className="flex h-12 w-12 flex-none items-center justify-center rounded-lg bg-grid text-xl">💍</div>}
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="mb-0.5 truncate text-lg font-semibold leading-tight">{p.name}</h1>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {p.stCode && <span className="rounded-md bg-ink-1 px-1.5 py-0.5 font-semibold tracking-wide text-surface">{p.stCode}</span>}
            {p.code && <span className="rounded-md border border-line px-1.5 py-0.5 font-medium text-ink-2">#{p.code}</span>}
            {p.inPipeline && <span className={`rounded-md px-2.5 py-0.5 font-medium ${p.killed ? "bg-bad/10 text-bad" : "bg-accent/10 text-accent"}`}>{p.killed ? "⛔ Đã dừng" : STAGE_LABELS[p.stage]}</span>}
            {p.inPipeline && p.stage === "p0" && p.approval && (
              <span className={`rounded-md px-2.5 py-0.5 font-medium ${p.approval === "approved" ? "bg-good/10 text-good" : p.approval === "rejected" ? "bg-bad/10 text-bad" : "bg-warn-bg text-warn-ink"}`}>{APPROVAL_LABELS[p.approval]}</span>
            )}
            {p.fromMedia && <span className={chip}>Từ luồng Media</span>}
          </div>
          {p.inPipeline && (
            <div className="mt-0.5 truncate text-xs text-ink-muted">
              {p.approvedAt ? `Duyệt ${fmtDate(p.approvedAt)}` : "Chưa duyệt"}
              {p.daysAt !== null ? ` · ${p.daysAt} ngày ở mốc này` : ""}
            </div>
          )}
        </div>
        {p.inPipeline && (
          <div className="flex flex-none items-center gap-2.5 border-l border-line pl-4" title="Người sưu tầm mẫu">
            <span aria-hidden className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
              {(p.createdBy ?? "?").split(/\s+/).map((w) => w[0]).slice(-2).join("").toUpperCase()}
            </span>
            <div className="min-w-0 leading-tight">
              <div className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">Người sưu tầm</div>
              <div className="max-w-[160px] truncate text-sm font-semibold">{p.createdBy ?? "—"}</div>
              <div className="text-xs text-ink-muted">{fmtDate(p.createdAt)}{p.team ? ` · ${p.team}` : ""}</div>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 self-center text-xs">
          {p.refUrl && <a href={p.refUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-line bg-surface px-2.5 py-1 font-medium hover:border-accent hover:text-accent" title="Mẫu tham khảo">🔗<span className="hidden 2xl:inline"> Mẫu tham khảo</span></a>}
          {p.sourceUrl && <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-line bg-surface px-2.5 py-1 font-medium hover:border-accent hover:text-accent" title="Kho Source">📁<span className="hidden 2xl:inline"> Kho Source</span></a>}
        </div>
        {p.inPipeline && (
          <div className="basis-full border-t border-line pt-2">
            <StageStepper stage={p.stage} killed={p.killed} from={p.fromStage} />
          </div>
        )}
      </div>
    </section>
  );
}
