import Link from "next/link";
import { Chip } from "@/components/grid/Cells";
import ImageThumbs from "@/components/ui/ImageThumbs";
import type { DesignTask, MediaRequest, SampleOrder } from "@/lib/pipeline";
import { DRAW_OPTS, MEDIA_STATUS_OPTS, REVIEW_OPTS, drawLabel } from "@/lib/pipeline-constants";
import { normOrderStatus } from "@/lib/rnd-options";
import type { RndOptions } from "@/lib/rnd-options";

// Hành trình của 1 mẫu qua các bảng (giống mở rộng bản ghi trong Lark): mỗi bảng tóm tắt + link sửa ở bảng đó
const d = (s: string | null | undefined) => (s ? new Date(s.length === 10 ? `${s}T12:00:00+07:00` : s).toLocaleDateString("vi-VN") : "—");

function Section({ title, href, empty, children }: { title: string; href: string; empty: boolean; children: React.ReactNode }) {
  return (
    <div className="border-t border-line pt-3 first:border-0 first:pt-0">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <Link href={href} className="text-xs text-accent hover:underline">Mở bảng →</Link>
      </div>
      {empty ? <p className="text-xs text-ink-muted">Chưa tới bước này.</p> : children}
    </div>
  );
}

export default function Journey({ design, samples, media, names, images3d, options }: {
  design: DesignTask | null; samples: SampleOrder[]; media: MediaRequest[];
  names: (id: string | null | undefined) => string | null; images3d: string[]; options: RndOptions;
}) {
  const draw = design ? drawLabel(design.status) : null;
  const review = design ? (design.status === "review" ? "Chờ duyệt" : design.status === "done" ? "Đạt" : design.status === "redo" ? "Sửa lại" : null) : null;
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-5 text-sm">
      <h2 className="font-semibold">Hành trình qua các bảng</h2>

      <Section title="P2 · Sản xuất mẫu — vẽ 3D" href="/rnd/design-3d" empty={!design}>
        {design && (
          <div className="space-y-1.5 text-xs text-ink-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {draw && <Chip value={draw} options={DRAW_OPTS} />}{review && <Chip value={review} options={REVIEW_OPTS} />}
              <span>· người vẽ <b className="text-ink-1">{names(design.assignee_id) ?? "chưa giao"}</b></span>
              {design.done_at && <span>· xong {d(design.done_at)}</span>}
            </div>
            {design.file_url && <a href={design.file_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">📁 File 3D</a>}
            {images3d.length > 0 && (
              <ImageThumbs urls={images3d} label="Ảnh 3D" />
            )}
            {design.review_note && <div className="text-warn-ink">Nhận xét: {design.review_note}</div>}
          </div>
        )}
      </Section>

      <Section title="Theo dõi đặt hàng" href="/rnd/orders" empty={!samples.length}>
        <ul className="space-y-1 text-xs text-ink-2">
          {samples.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-1.5">
              <Chip value={normOrderStatus(o.status)} options={options.order_status} />
              <span>{o.supplier ?? "—"} · {o.qty ?? 1} {o.unit ?? "cái"} · đặt {d(o.ordered_at)}{o.received_at ? ` · nhận ${d(o.received_at)}` : ""}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="P3 · Hoàn thành mẫu" href="/rnd/media" empty={!media.length}>
        <ul className="space-y-1 text-xs text-ink-2">
          {media.map((m) => {
            const st = m.status === "todo" ? "Chờ xử lý" : m.status === "doing" ? "Đang quay" : "Hoàn thành";
            const ap = m.approval === "pass" ? "Đạt" : m.approval === "redo" ? "Sửa lại" : m.approval === "pending" ? "Chờ duyệt" : null;
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-1.5">
                {m.request_type.split(/s*,s*/).filter(Boolean).map((t) => <Chip key={t} value={t} options={options.media_type} />)}<Chip value={st} options={MEDIA_STATUS_OPTS} />
                {ap && <Chip value={ap} options={REVIEW_OPTS} />}
                <span>· {names(m.assignee_id) ?? "chưa giao"}{m.deadline ? ` · hạn ${d(m.deadline)}` : ""}</span>
                {m.drive_url && /^https?:/i.test(m.drive_url) && <a href={m.drive_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">📁</a>}
              </li>
            );
          })}
        </ul>
        {media.length > 0 && <p className="mt-1 text-2xs text-ink-muted">{media.filter((m) => m.approval === "pass").length}/{media.length} yêu cầu đạt — đủ hết thì mẫu sang bảng Traffic.</p>}
      </Section>
    </section>
  );
}
