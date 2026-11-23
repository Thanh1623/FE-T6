import AgeSelect from "@/components/rnd/AgeSelect";
import ResultBadge from "@/components/rnd/ResultBadge";
import { AGE_REASON, STATUS_TEXT, type Evaluation } from "@/lib/eval/data";
import { KPI_METRICS, KPI_OPS } from "@/lib/kpi-constants";
import type { Check } from "@/lib/eval/rules";

const fmt = (metric: Check["metric"], v: number | null) => {
  if (v === null) return "–";
  const u = KPI_METRICS[metric].unit;
  return `${v.toLocaleString("vi-VN", { maximumFractionDigits: u === "%" ? 2 : 0 })}${u}`;
};
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function Group({ title, items, status }: { title: string; items: Check[]; status?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-ink-2">{title}</span>
        {status && <span className={status === "pass" ? "font-medium text-good" : "text-ink-muted"}>{STATUS_TEXT[status] ?? status}</span>}
      </div>
      <ul className="space-y-1.5">
        {items.map((c, i) => (
          <li key={i} className="text-xs">
            <div className="flex justify-between gap-2">
              <span>{c.pass ? "✓" : "○"} {KPI_METRICS[c.metric].label} {KPI_OPS[c.op]} {fmt(c.metric, c.target)}</span>
              <span className="tabular text-ink-2">{fmt(c.metric, c.actual)}</span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-md bg-grid">
              <div className="h-full rounded-md" style={{ width: `${Math.round(c.progress * 100)}%`, background: c.pass ? "var(--res-win)" : "var(--accent)" }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Khung "Đánh giá" trên trang chi tiết mẫu: kết quả, mới/cũ, tiến độ KPI, dự báo, xếp hạng video
export default function EvaluationPanel({ e, productId, ageOverride, canEdit, pageName }: {
  e: Evaluation; productId: string; ageOverride: "new" | "old" | null; canEdit: boolean; pageName: (id: string) => string;
}) {
  const total = Math.round((Date.parse(e.window_end) - Date.parse(e.first_post_date)) / 86_400_000) + 1;
  const groupTitle = (g: string) => (g === "sales" ? "💰 KPI bán hàng (→ WIN)" : g === "traffic" ? "👁 KPI traffic (→ WIN TRAFFIC)" : "🎯 KPI mục tiêu của phiên");
  const main = e.checks.filter((g) => (e.source === "session" ? g.group.startsWith("goal:") : true));
  const secondary = e.source === "session" ? e.checks.filter((g) => !g.group.startsWith("goal:")) : [];

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Đánh giá</h2>
        <div className="flex items-center gap-2">
          <ResultBadge result={e.result} />
          <span className="text-xs text-ink-muted">{e.source === "session" ? "theo phiên test" : "tự động"}</span>
        </div>
      </div>

      <div className="text-xs text-ink-2">
        Cửa sổ test {dm(e.first_post_date)} → {dm(e.window_end)} · ngày {Math.min(e.days_elapsed, total)}/{total}
        <div className="mt-1 h-1.5 overflow-hidden rounded-md bg-grid">
          <div className="h-full rounded-md bg-accent" style={{ width: `${Math.min(100, (e.days_elapsed / total) * 100)}%` }} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-page px-3 py-2 text-xs">
        <span>
          <b>{e.age === "new" ? "🆕 Mẫu mới" : "📦 Mẫu cũ"}</b> — {AGE_REASON[e.age_reason] ?? e.age_reason}
          {!e.age_reliable && <span className="text-warn-ink"> · lịch sử bán chưa đủ, nên kiểm tra lại</span>}
        </span>
        <AgeSelect productId={productId} value={ageOverride} disabled={!canEdit} />
      </div>

      {e.forecast && (
        <div className="rounded-lg border border-line px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">📊 Dự báo khi hết cửa sổ (còn {e.forecast.days_left} ngày)</span>
            <ResultBadge result={e.forecast.predicted} size="xs" />
          </div>
          <div className="tabular mt-1 text-ink-2">
            ~{e.forecast.views.toLocaleString("vi-VN")} lượt xem · ~{e.forecast.viewers.toLocaleString("vi-VN")} người xem ·
            ~{e.forecast.qty_net.toLocaleString("vi-VN")} SL bán
          </div>
          <div className="mt-0.5 text-ink-muted">Ngoại suy tuyến tính theo nhịp hiện tại — chỉ mang tính tham khảo.</div>
        </div>
      )}

      <div className="space-y-3">
        {main.map((g) => (
          <Group key={g.group} title={groupTitle(g.group)} items={g.items}
            status={g.group === "sales" ? e.sales_status : g.group === "traffic" ? e.traffic_status : undefined} />
        ))}
      </div>
      {secondary.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-ink-2">Tín hiệu phụ: Sales {STATUS_TEXT[e.sales_status]} · Traffic {STATUS_TEXT[e.traffic_status]}</summary>
          <div className="mt-2 space-y-3">
            {secondary.map((g) => <Group key={g.group} title={groupTitle(g.group)} items={g.items} />)}
          </div>
        </details>
      )}

      <div>
        <h3 className="mb-1 font-medium text-ink-2">Video trong cửa sổ test ({e.videos.length})</h3>
        <ol className="space-y-1.5 text-xs">
          {e.videos.map((v, i) => (
            <li key={v.id} className="flex items-center gap-2">
              <span className="w-4 text-ink-muted">{i + 1}.</span>
              {v.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element -- ảnh CDN Facebook
                <img src={v.thumb} alt="" className="h-8 w-6 flex-none rounded object-cover" />
              ) : <span className="h-8 w-6 flex-none rounded bg-page" />}
              <a href={v.url ?? "#"} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                {dm(v.date)} · {pageName(v.channel_id)}
              </a>
              <span className="tabular flex-none text-ink-2">
                {v.views.toLocaleString("vi-VN")} xem · {v.viewers.toLocaleString("vi-VN")} người
                {v.ctr !== null && ` · CTR ${v.ctr.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`}
              </span>
            </li>
          ))}
          {!e.videos.length && <li className="text-ink-muted">Chưa có video trong cửa sổ.</li>}
        </ol>
      </div>
      <p className="text-2xs text-ink-muted">Đánh giá lúc {new Date(e.evaluated_at).toLocaleString("vi-VN")} · tự chạy lại mỗi lần đồng bộ</p>
    </section>
  );
}
