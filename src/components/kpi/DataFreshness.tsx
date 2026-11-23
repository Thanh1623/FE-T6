import type { Freshness } from "@/lib/data-freshness";

const dmy = (d: string | null) => (d ? d.split("-").reverse().join("/") : null);
const when = (iso: string) => new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const ago = (n: number | null) => (n === null ? "" : n === 0 ? "hôm nay" : n === 1 ? "hôm qua" : `${n} ngày trước`);

// Bảng "Độ mới của dữ liệu" (Cài đặt): mỗi bộ dữ liệu nhập từ file — lần nhập cuối, nhịp khuyến nghị, trạng thái. extra: ghi chú thêm theo từng bộ (vd số SPU còn hàng chưa có ảnh)
export default function DataFreshness({ items, extra }: { items: Freshness[]; extra?: Partial<Record<Freshness["key"], string | null>> }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((f) => {
        const warn = f.status === "warn", never = f.status === "never", note = extra?.[f.key];
        const tone = never ? "border-line" : warn ? "border-warn-ink/40 bg-warn-bg/40" : "border-line";
        return (
          <li key={f.key} className={`flex flex-col gap-1.5 rounded-2xl border bg-surface px-4 py-3.5 ${tone}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{f.label}</span>
              <span className={`rounded-md px-2 py-0.5 text-2xs font-semibold ${never ? "bg-grid text-ink-muted" : warn ? "bg-warn-bg text-warn-ink" : "bg-good/15 text-good"}`}>
                {never ? "Chưa nhập" : warn ? "Cần cập nhật" : "Đã cập nhật"}
              </span>
            </div>
            <div className="text-sm">
              {f.lastAt ? <><b>{when(f.lastAt)}</b> <span className="text-ink-muted">· {ago(f.ageDays)}</span></> : <span className="text-ink-muted">Chưa có lần nhập nào</span>}
            </div>
            {f.coverTo && <div className="text-xs text-ink-2">Dữ liệu tới ngày {dmy(f.coverTo)}</div>}
            {note && <div className="text-xs font-medium text-warn-ink">{note}</div>}
            <div className="mt-auto pt-1 text-2xs text-ink-muted"><b className="text-ink-2">Nhịp: {f.cadence}.</b> {f.why}</div>
          </li>
        );
      })}
    </ul>
  );
}
