"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveOptionList } from "./actions";
import { unwrap } from "@/lib/action-result";
import { CHIP_COLORS, chipColor, type Opt, type OptionFlag, type OptionKey } from "@/lib/rnd-options";

const FLAGS: Record<OptionFlag, string> = { media: "→ tạo yêu cầu Media", done: "= Hoàn thành SX", cancel: "= Huỷ đơn", draft: "= Chưa đặt xưởng (nháp)" };
type Row = Opt & { origin: string };   // origin = tên lúc tải trang, để biết lựa chọn nào bị đổi tên
const strip = (l: Row[]): Opt[] => l.map((o) => ({ value: o.value, color: o.color, ...(o.flag ? { flag: o.flag } : {}) }));

export default function OptionEditor({ optionKey, label, initial, canEdit }: { optionKey: OptionKey; label: string; initial: Opt[]; canEdit: boolean }) {
  const router = useRouter();
  const [list, setList] = useState<Row[]>(initial.map((o) => ({ ...o, origin: o.value })));
  const [added, setAdded] = useState("");
  const [pick, setPick] = useState<number | null>(null);   // đang chọn màu cho lựa chọn thứ mấy
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(strip(list)) !== JSON.stringify(strip(initial.map((o) => ({ ...o, origin: o.value }))));
  const set = (i: number, patch: Partial<Opt>) => setList(list.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const move = (i: number, d: number) => { const n = [...list]; [n[i], n[i + d]] = [n[i + d], n[i]]; setList(n); };
  const add = () => { if (!added.trim()) return; setList([...list, { value: added.trim(), color: (list.length % 8) + 1, origin: "" }]); setAdded(""); };

  function save() {
    setMsg(null);
    start(async () => {
      try {
        unwrap(await saveOptionList(optionKey, strip(list), list.filter((o) => o.origin && o.origin !== o.value).map((o) => [o.origin, o.value])));
        setMsg("✓ Đã lưu");
        router.refresh();
      } catch (e) { setMsg(`⛔ ${e instanceof Error ? e.message : "Lỗi"}`); }
    });
  }

  return (
    <section className="space-y-2 rounded-xl border border-line bg-surface p-4 text-sm">
      <h2 className="font-semibold">{label}</h2>
      <ul className="space-y-1">
        {list.map((o, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span className="relative flex-none">
              <button type="button" disabled={!canEdit} onClick={() => setPick(pick === i ? null : i)} title="Đổi màu"
                className="h-6 w-7 rounded-md border border-line" style={{ background: chipColor(o.color).bg }} />
              {pick === i && (
                <span className="absolute left-0 top-full z-20 mt-1 grid w-48 grid-cols-6 gap-1 rounded-lg border border-line bg-surface p-1.5 shadow-lg">
                  {Object.entries(CHIP_COLORS).map(([n, c]) => (
                    <button key={n} type="button" title={c.name} onClick={() => { set(i, { color: Number(n) }); setPick(null); }}
                      className={`h-6 rounded-md text-2xs font-bold ${o.color === Number(n) ? "ring-2 ring-accent ring-offset-1" : ""}`}
                      style={{ background: c.bg, color: c.fg }}>A</button>
                  ))}
                </span>
              )}
            </span>
            <input value={o.value} disabled={!canEdit} onChange={(e) => set(i, { value: e.target.value })}
              className="min-w-0 flex-1 rounded-md border border-line bg-page px-2 py-1 outline-none focus:border-accent" />
            <span className="hidden flex-none rounded-md px-2 py-px text-xs font-medium leading-5 sm:inline" style={{ background: chipColor(o.color).bg, color: chipColor(o.color).fg }}>
              {o.value || "…"}
            </span>
            {optionKey === "order_status" && (
              <select value={o.flag ?? ""} disabled={!canEdit} onChange={(e) => set(i, { flag: (e.target.value || undefined) as OptionFlag | undefined })}
                className="w-36 rounded-md border border-line bg-page px-1 py-1 text-xs">
                <option value="">—</option>
                {(Object.keys(FLAGS) as OptionFlag[]).map((f) => <option key={f} value={f}>{FLAGS[f]}</option>)}
              </select>
            )}
            {canEdit && (
              <span className="flex flex-none text-xs text-ink-muted">
                <button disabled={i === 0} onClick={() => move(i, -1)} className="px-1 hover:text-ink-1 disabled:opacity-30">↑</button>
                <button disabled={i === list.length - 1} onClick={() => move(i, 1)} className="px-1 hover:text-ink-1 disabled:opacity-30">↓</button>
                <button onClick={() => setList(list.filter((_, j) => j !== i))} className="px-1 hover:text-bad" title="Xoá">✕</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="flex gap-1.5">
          <input value={added} onChange={(e) => setAdded(e.target.value)} placeholder="Thêm lựa chọn…"
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            className="min-w-0 flex-1 rounded-md border border-line bg-page px-2 py-1 outline-none focus:border-accent" />
          <button disabled={!added.trim()} onClick={add} className="rounded-md border border-line px-2 hover:bg-grid disabled:opacity-50">＋</button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs">{msg}</span>
        {canEdit && dirty && (
          <button disabled={pending} onClick={save} className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-60">
            {pending ? "Đang lưu…" : "Lưu"}
          </button>
        )}
      </div>
    </section>
  );
}
