import CommercialInputs from "@/components/rnd/CommercialInputs";
import { SUGGESTION_LABEL, type CommercialResult } from "@/lib/commercial-math";
import type { CommercialEval } from "@/lib/commercial-eval";
import type { FormState } from "@/app/(dash)/rnd/actions";

const n = (v: number | null | undefined, digits = 0) => (v === null || v === undefined ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: digits }));
const money = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${Math.round(v).toLocaleString("vi-VN")}đ`);
const SUG_TONE = { approve: "bg-good/10 text-good", conditional: "bg-warn-bg text-warn-ink", reject: "bg-bad/10 text-bad" } as const;

// Thẻ số liệu: mỗi thẻ một màu nhạt (nền + viền) để phân biệt nhanh; số nhạy cảm (âm / lỗ) vẫn tô đỏ bằng tone
const Stat = ({ label, value, sub, tone = "", color }: { label: string; value: string; sub?: string; tone?: string; color: string }) => (
  <div className="rounded-md border px-3 py-2" style={{ background: `color-mix(in srgb, var(${color}) 9%, var(--surface))`, borderColor: `color-mix(in srgb, var(${color}) 35%, var(--line))` }}>
    <div className="text-xs font-medium text-ink-2">{label}</div>
    <div className={`mt-0.5 text-lg font-bold tabular-nums ${tone}`}>{value}</div>
    {sub && <div className="mt-0.5 text-2xs text-ink-muted">{sub}</div>}
  </div>
);
const Block = ({ n: no, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h3 className="flex items-center gap-2 text-sm font-semibold"><span className="flex h-5 w-5 items-center justify-center rounded-sm bg-grid text-2xs font-bold text-ink-2">{no}</span>{title}</h3>
    {children}
  </section>
);

// Tóm tắt 1 dòng (hiện cạnh nút duyệt)
export function commercialHint(r: CommercialResult) {
  return { label: SUGGESTION_LABEL[r.suggestion], tone: SUG_TONE[r.suggestion], suggestion: r.suggestion };
}

// Đánh giá khi duyệt thương mại hoá (P5 → P6): chỉ mẫu mới trong quy trình R&D (mẫu R&D + mẫu Media test đã vào R&D)
export default function CommercialPanel({ ev, values, saveAction, canEdit }: {
  ev: CommercialEval; canEdit: boolean;
  values: { video_cost: number | null; ops_cost: number | null; lead_days: number | null; min_order_qty: number | null };
  saveAction: (s: FormState, f: FormData) => Promise<FormState>;
}) {
  const { input: i, result: r, rules } = ev;
  const base = r.scenarios[1];
  return (
    <div className="max-w-4xl space-y-5 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">Đánh giá thương mại hoá</h2>
        <span className={`rounded-md px-2.5 py-0.5 text-xs font-semibold ${SUG_TONE[r.suggestion]}`}>Gợi ý: {SUGGESTION_LABEL[r.suggestion]}</span>
        <span className="text-xs text-ink-muted">Hệ thống chỉ gợi ý — người duyệt quyết định. Chỉ áp dụng cho mẫu mới trong quy trình R&amp;D.</span>
      </div>
      {r.missing.length > 0 && (
        <p className="rounded-md bg-warn-bg px-3 py-2 text-xs text-warn-ink">Chưa tính đủ: {r.missing.join(", ")}. {!i.launchDate && "Mẫu Media test cần gắn mã SPU + ngày mở bán ở trang Mã SPU test."}</p>
      )}

      <Block n={1} title="Dữ liệu đầu vào">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat color="--series-1" label="Giá bán / sp" value={money(i.price)} sub={i.priceSource ? `số ${i.priceSource}` : "chưa có"} />
          <Stat color="--series-2" label="Giá vốn / sp" value={money(i.unitCost)} sub={i.costSource ? `số ${i.costSource}` : "chưa có"} />
          <Stat color="--series-3" label="Lãi gộp / sp" value={money(r.unitMargin)} sub={r.marginPct === null ? undefined : `${n(r.marginPct, 1)}% sau chi phí vận hành`} tone={r.unitMargin !== null && r.unitMargin <= 0 ? "text-bad" : ""} />
          <Stat color="--series-7" label="Vốn đã bỏ ra" value={money(r.sunk)} sub={`mẫu ${money(i.sampleCost)} · Ads ${money(i.adsCost)} · quay ${money(i.videoCost)}`} />
          <Stat color="--series-6" label="Đã bán (thuần)" value={n(i.sold)} sub={i.launchDate ? `${n(i.daysSinceLaunch)} ngày từ ${i.launchDate.split("-").reverse().join("/")}` : "chưa có ngày mở bán"} />
          <Stat color="--series-4" label="Tốc độ bán / ngày" value={n(i.perDay.d14, 1)} sub={`7 ngày ${n(i.perDay.d7, 1)} · 30 ngày ${n(i.perDay.d30, 1)}`} />
          <Stat color="--series-5" label="Tỉ lệ hoàn" value={r.returnPct === null ? "—" : `${n(r.returnPct, 1)}%`} sub={`${n(i.returned)} / ${n(i.soldGross)} sp`} />
          <Stat color="--series-1" label="Tồn kho hiện có" value={i.onHand === null ? "—" : n(i.onHand)} sub={i.onHand === null ? "chưa có dữ liệu tồn" : "từ file tồn kho đã nhập"} />
        </div>
        <CommercialInputs action={saveAction} values={values} defaults={{ opsRatePct: rules.opsRatePct, leadDays: rules.defaultLeadDays }} canEdit={canEdit} />
      </Block>

      <Block n={2} title="Hoà vốn">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat color="--series-7" label="SL cần bán để hoà vốn" value={n(r.breakEvenQty)} sub={r.breakEvenQty === null ? "lãi gộp ≤ 0 hoặc thiếu giá" : `${money(r.sunk)} ÷ ${money(r.unitMargin)}`} />
          <Stat color="--series-2" label="Còn thiếu" value={r.remainingQty === null ? "—" : r.remainingQty === 0 ? "Đã hoà vốn" : `${n(r.remainingQty)} sp`} tone={r.remainingQty === 0 ? "text-good" : ""} />
          <Stat color="--series-1" label="Thời gian hoà vốn (cơ sở)" value={base.days === null ? "—" : base.days === 0 ? "Đã hoà vốn" : `${n(base.days)} ngày`} sub={`tối đa chấp nhận ${rules.maxBreakEvenDays} ngày`} />
          <Stat color="--series-3" label="Lợi nhuận sau 30 / 60 / 90 ngày" value={money(r.profit.d30)} sub={`60 ngày ${money(r.profit.d60)} · 90 ngày ${money(r.profit.d90)}`} tone={r.profit.d30 !== null && r.profit.d30 < 0 ? "text-bad" : ""} />
        </div>
        <table className="w-full text-xs">
          <thead className="text-left text-ink-2"><tr><th className="py-1 font-medium">Kịch bản</th><th className="py-1 text-right font-medium">Bán / ngày</th><th className="py-1 text-right font-medium">Ngày để hoà vốn</th></tr></thead>
          <tbody className="divide-y divide-line">
            {r.scenarios.map((s) => (
              <tr key={s.label}><td className="py-1">{s.label}</td><td className="py-1 text-right tabular-nums">{n(s.perDay, 1)}</td><td className="py-1 text-right tabular-nums">{s.days === null ? "—" : s.days === 0 ? "đã hoà vốn" : n(s.days)}</td></tr>
            ))}
          </tbody>
        </table>
      </Block>

      <Block n={3} title="Số lượng đề xuất đặt">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat color="--series-4" label="Nhu cầu trong thời gian sản xuất" value={n(r.order.demand === null ? null : Math.ceil(r.order.demand))} sub={`${n(i.leadDays)} ngày × tốc độ bán`} />
          <Stat color="--series-6" label="Tồn an toàn" value={n(r.order.safety === null ? null : Math.ceil(r.order.safety))} sub={`${rules.safetyDays} ngày bán`} />
          <Stat color="--series-5" label="Trừ tồn + hàng đang về" value={n((i.onHand ?? 0) + i.incoming)} sub={i.onHand === null ? "chưa có dữ liệu tồn — coi là 0" : undefined} />
          <Stat color="--series-1" label="SL đề xuất đặt" value={n(r.order.suggested)} sub={r.order.capital === null ? undefined : `vốn ≈ ${money(r.order.capital)}${i.minOrderQty > 1 ? ` · bội số ${i.minOrderQty}` : ""}`} tone="text-accent" />
        </div>
      </Block>

      <Block n={4} title="Đánh giá">
        <ul className="divide-y divide-line rounded-md border border-line text-sm">
          {r.checks.map((c) => (
            <li key={c.key} className="flex items-center gap-3 px-3 py-2">
              <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-2xs font-bold text-white ${c.ok === true ? "bg-good" : c.ok === false ? "bg-bad" : "bg-ink-muted"}`}>{c.ok === true ? "✓" : c.ok === false ? "✕" : "?"}</span>
              <span className="flex-1">{c.label}</span>
              <span className="text-xs text-ink-2">{c.detail}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-muted">Quyết định ngược với gợi ý (duyệt khi hệ thống chưa nên duyệt, hoặc không duyệt khi nên duyệt) phải ghi lý do. Chỉ số lúc duyệt được lưu lại để đối chiếu sau.</p>
      </Block>
    </div>
  );
}
