"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getScoreView, saveScore, type ScoreView } from "@/app/(dash)/rnd/score-actions";
import { fmt, verdictOf, type Scores } from "@/lib/rnd-score-calc";

// Bảng chấm điểm mẫu sưu tầm (mẫu BM23): form "Đánh giá sản phẩm" + bảng đối chiếu điểm các thành viên. Chấm mù: chấm xong mới thấy điểm người khác.
const tone = (ok: boolean | null) => (ok === null ? "bg-grid text-ink-2" : ok ? "bg-good/15 text-good" : "bg-bad/15 text-bad");

function useView(productId: string) {
  const [view, setView] = useState<ScoreView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    void getScoreView(productId).then((r) => {
      if (!alive) return;
      if ("error" in r) setError(r.error); else { setView(r.data); setError(null); }
    });
    return () => { alive = false; };
  }, [productId, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { view, error, reload };
}

// Bảng đối chiếu: hàng = tiêu chí, cột = từng người (+ Trung bình). Ô lệch nhau ≥ ngưỡng thì tô cảnh báo.
export function ScoreCompare({ view }: { view: ScoreView }) {
  const { cfg, combined } = view;
  if (!view.visible) {
    return <p className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-ink-muted">Đã có {view.count} người chấm. Bạn chấm xong mới xem được điểm của các thành viên khác (chấm mù).</p>;
  }
  const cols = [...(view.mine ? [{ id: "me", name: "Bạn", card: view.mine }] : []), ...view.others.map((o) => ({ id: o.scorer_id, name: o.name, card: o }))];
  if (!cols.length) return <p className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-ink-muted">Chưa có ai chấm.</p>;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-xs tabular">
          <thead className="bg-grid text-ink-2">
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold">Tiêu chí</th>
              <th className="px-2 py-1.5 text-right font-semibold">TS</th>
              {cols.map((c) => <th key={c.id} className="px-2 py-1.5 text-center font-semibold">{c.name}</th>)}
              <th className="px-2 py-1.5 text-center font-semibold">Trung bình</th>
            </tr>
          </thead>
          <tbody>
            {cfg.criteria.map((c) => {
              const wide = combined?.spread.includes(c.id);
              const avg = combined?.avg[c.id];
              return (
                <tr key={c.id} className="border-t border-line">
                  <td className="px-2 py-1.5">{c.name}</td>
                  <td className="px-2 py-1.5 text-right text-ink-muted">{c.weight}%</td>
                  {cols.map((k) => <td key={k.id} className={`px-2 py-1.5 text-center ${wide ? "bg-warn-bg font-semibold text-warn-ink" : ""}`}>{k.card.scores[c.id]}</td>)}
                  <td className={`px-2 py-1.5 text-center font-semibold ${avg !== undefined && avg < cfg.fatal ? "text-bad" : ""}`}>{avg !== undefined ? fmt(avg) : "—"}</td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-line bg-grid/60 font-semibold">
              <td className="px-2 py-1.5" colSpan={2}>Điểm quy đổi (thang 100)</td>
              {cols.map((k) => <td key={k.id} className="px-2 py-1.5 text-center">{fmt(k.card.total)}{k.card.fatal ? <span className="ml-1 text-bad" title="Loại ngay">⛔</span> : null}</td>)}
              <td className="px-2 py-1.5 text-center">{combined ? fmt(combined.total) : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {combined && (
        <p className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${tone(view.count >= cfg.minScorers ? combined.passed : null)}`}>
          {view.count < cfg.minScorers
            ? `Mới ${view.count}/${cfg.minScorers} người chấm — chưa đủ để duyệt.`
            : combined.passed ? `ĐẠT — ${fmt(combined.total)} điểm (ngưỡng ${cfg.pass}).` : `KHÔNG ĐẠT — ${combined.reasons.join("; ")}. Chỉ Quản lý được duyệt.`}
        </p>
      )}
      {cols.some((k) => k.card.notes.all) && (
        <ul className="space-y-1 text-xs text-ink-2">
          {cols.filter((k) => k.card.notes.all).map((k) => <li key={k.id}><b>{k.name}:</b> {k.card.notes.all}</li>)}
        </ul>
      )}
      {combined && combined.spread.length > 0 && <p className="text-2xs text-warn-ink">Ô vàng: các thành viên lệch nhau từ {cfg.spread} điểm — nên trao đổi lại.</p>}
    </div>
  );
}

// Vòng tròn điểm tổng (thang 5)
function Ring({ value }: { value: number }) {
  const r = 34, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, value / 5));
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={`${fmt(value)} trên 5`}>
      <circle cx="42" cy="42" r={r} fill="none" strokeWidth="8" className="stroke-line" />
      <circle cx="42" cy="42" r={r} fill="none" strokeWidth="8" strokeLinecap="round" className="stroke-accent" strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 42 42)" />
      <text x="42" y="42" textAnchor="middle" dominantBaseline="central" className="fill-ink-1 text-lg font-bold">{fmt(value)}</text>
      <text x="42" y="58" textAnchor="middle" className="fill-ink-muted text-[9px]">/ 5</text>
    </svg>
  );
}

// Cột trái: ảnh sản phẩm + thông tin ngắn
function ProductSide({ view }: { view: ScoreView }) {
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(false);   // xem ảnh phóng to (bấm ảnh lớn)
  const { images, info } = view.product;
  const step = useCallback((d: number) => setI((n) => (images.length ? (n + d + images.length) % images.length : 0)), [images.length]);
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); setZoom(false); }
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [zoom, step]);
  const vnd = (n: number | null) => (n === null ? null : `${n.toLocaleString("vi-VN")} đ`);
  const margin = info.expectedPrice && info.expectedCost ? Math.round(((info.expectedPrice - info.expectedCost) / info.expectedPrice) * 100) : null;   // biên lợi nhuận dự kiến
  const safeUrl = info.refUrl && /^https?:\/\//i.test(info.refUrl.trim()) ? info.refUrl.trim() : null;
  const rows = [
    ["Dòng SP", info.line], ["Nhóm SP", info.group], ["Chất liệu", info.material], ["Loại đá", info.stone],
    ["Giá tham khảo", vnd(info.priceRef)], ["Giá vốn dự kiến", vnd(info.expectedCost)],
    ["Giá bán dự kiến", info.expectedPrice ? `${vnd(info.expectedPrice)}${margin !== null ? ` · biên ~${margin}%` : ""}` : null],
    ["Source", info.source], ["Người sưu tầm", info.collector],
    ["Ngày sưu tầm", info.createdAt ? new Date(info.createdAt).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : null],
    ["Mô tả", info.description],
  ] as const;
  return (
    <div className="space-y-2.5">
      <div className="overflow-hidden rounded-lg border border-line bg-grid">
        {images[i]
          // eslint-disable-next-line @next/next/no-img-element
          ? <button type="button" onClick={() => setZoom(true)} title="Bấm để phóng to" className="block w-full cursor-zoom-in"><img src={images[i].url} alt="" className="aspect-square w-full object-cover" /></button>
          : <div className="flex aspect-square items-center justify-center text-xs text-ink-muted">Chưa có ảnh</div>}
      </div>
      {zoom && images[i] && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4" onClick={() => setZoom(false)} role="dialog" aria-label="Xem ảnh phóng to">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[i].url} alt="" className="max-h-full max-w-full rounded-md object-contain" onClick={(e) => e.stopPropagation()} />
          {images.length > 1 && (
            <>
              <button type="button" aria-label="Ảnh trước" onClick={(e) => { e.stopPropagation(); step(-1); }} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md bg-white/15 px-3 py-2 text-xl text-white hover:bg-white/30">‹</button>
              <button type="button" aria-label="Ảnh sau" onClick={(e) => { e.stopPropagation(); step(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-white/15 px-3 py-2 text-xl text-white hover:bg-white/30">›</button>
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-black/50 px-3 py-1 text-xs text-white">{i + 1} / {images.length}</span>
            </>
          )}
          <button type="button" aria-label="Đóng" onClick={() => setZoom(false)} className="absolute right-3 top-3 rounded-md bg-white/15 px-3 py-1.5 text-lg text-white hover:bg-white/30">✕</button>
        </div>
      )}
      {images.length > 1 && (
        <div className="grid grid-cols-4 gap-1.5">
          {images.slice(0, 8).map((im, k) => (
            // eslint-disable-next-line @next/next/no-img-element
            <button key={k} type="button" onClick={() => setI(k)} className={`overflow-hidden rounded-md border-2 ${k === i ? "border-accent" : "border-transparent"}`}><img src={im.thumb ?? im.url} alt="" className="aspect-square w-full object-cover" /></button>
          ))}
        </div>
      )}
      {(safeUrl || info.refMetrics) && (
        <div className="space-y-1.5 rounded-lg border border-line p-2.5 text-xs">
          {safeUrl && (
            <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-md bg-accent/10 px-2 py-1.5 font-semibold text-accent hover:bg-accent/20">
              <span aria-hidden>▶</span><span className="truncate">Xem video nguồn{info.refPlatform ? ` (${info.refPlatform})` : ""}</span><span aria-hidden className="ml-auto">↗</span>
            </a>
          )}
          {info.refMetrics && (
            <div><div className="text-2xs text-ink-muted">Chỉ số nguồn</div><div className="whitespace-pre-line font-medium leading-snug text-ink-1">{info.refMetrics}</div></div>
          )}
        </div>
      )}
      <dl className="space-y-1.5 rounded-lg bg-grid/60 p-2.5 text-xs">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}><dt className="text-2xs text-ink-muted">{k}</dt><dd className="font-medium leading-snug text-ink-1">{v}</dd></div>
        ))}
      </dl>
    </div>
  );
}

function Form({ view, onSaved, onCancel }: { view: ScoreView; onSaved: () => void; onCancel: () => void }) {
  const { cfg } = view;
  const [scores, setScores] = useState<Scores>(() => ({ ...(view.mine?.scores ?? {}) }));
  const [note, setNote] = useState(view.mine?.notes.all ?? "");
  const [fatal, setFatal] = useState(view.mine?.fatal ?? false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const done = cfg.criteria.every((c) => scores[c.id] !== undefined);
  const v = useMemo(() => verdictOf(scores, cfg, fatal), [scores, cfg, fatal]);
  const needNote = done && cfg.criteria.some((c) => scores[c.id] <= 1);
  const submit = async () => {
    setBusy(true); setErr(null);
    const r = await saveScore(view.product.id, scores, note, fatal);
    setBusy(false);
    if ("error" in r) setErr(r.error); else onSaved();
  };
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="bg-accent/10 text-ink-1">
            <tr>
              <th className="w-9 px-2 py-2 text-center font-semibold">STT</th>
              <th className="px-2 py-2 text-left font-semibold">Tiêu chí đánh giá</th>
              <th className="w-16 px-2 py-2 text-center font-semibold">Trọng số (%)</th>
              <th className="px-2 py-2 text-left font-semibold">Hướng dẫn chấm điểm (0 - 5 điểm)</th>
              <th className="w-40 px-2 py-2 text-center font-semibold">Điểm của bạn (0 - 5)</th>
            </tr>
          </thead>
          <tbody>
            {cfg.criteria.map((c, i) => {
              const cur = scores[c.id];
              return (
                <tr key={c.id} className="border-t border-line align-middle">
                  <td className="px-2 py-2 text-center text-ink-2">{i + 1}</td>
                  <td className="px-2 py-2 font-medium">{c.name}</td>
                  <td className="px-2 py-2 text-center font-semibold">{c.weight}%</td>
                  <td className="space-y-0.5 px-2 py-2 text-2xs leading-snug text-ink-2">
                    {(["0-1", "2-3", "4-5"] as const).map((lb, k) => <div key={lb}><b>{lb}:</b> {c.guide[k]}</div>)}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-center gap-1" role="group" aria-label={c.name}>
                      {[0, 1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" onClick={() => setScores((s) => ({ ...s, [c.id]: n }))} title={`${n} điểm`} aria-label={`${n} điểm`} aria-pressed={cur === n}
                          className={`h-8 w-8 rounded-full border text-sm font-semibold tabular-nums transition-colors ${cur === n ? (n === 0 ? "border-bad bg-bad text-white" : "border-accent bg-accent text-white") : "border-line text-ink-2 hover:border-accent hover:text-accent"}`}>{n}</button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="rounded-lg border border-line p-3">
          <label htmlFor="score-note" className="text-sm font-semibold">Nhận xét / Ghi chú <span className="text-xs font-normal text-ink-muted">({needNote ? "bắt buộc khi có tiêu chí 0–1 điểm" : "không bắt buộc"})</span></label>
          <textarea id="score-note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={1000} placeholder="Nhập nhận xét, rủi ro, đề xuất cải tiến…"
            className={`mt-1.5 w-full resize-y rounded-md border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent ${needNote && !note.trim() ? "border-bad/60" : "border-line"}`} />
          <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={fatal} onChange={(e) => setFatal(e.target.checked)} /> <b className="text-bad">Loại ngay</b> — trùng logo / nhân vật bản quyền lớn</label>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg bg-accent/10 p-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Tổng điểm <span className="text-xs font-normal text-ink-muted">(tự động tính)</span></div>
            <div className="mt-1 text-2xl font-extrabold text-accent tabular">{fmt(v.total / 20)} <span className="text-base font-semibold text-ink-2">/ 5</span></div>
            <div className="text-2xs text-ink-2">Điểm trung bình theo trọng số · {fmt(v.total)}/100</div>
            {done && <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${tone(v.passed)}`}>{v.passed ? "Đạt" : "Không đạt"}</span>}
          </div>
          <Ring value={v.total / 20} />
        </div>
      </div>
      {done && !v.passed && <p className="text-2xs text-ink-muted">{v.reasons.join("; ")}</p>}
      {err && <p className="rounded-md bg-bad/10 px-2.5 py-1.5 text-xs text-bad">{err}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-line px-5 py-1.5 text-sm font-medium hover:bg-grid">Hủy</button>
        <button type="button" disabled={!done || busy} onClick={submit} className="rounded-md bg-accent px-5 py-1.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Đang lưu…" : "✓ Xác nhận chấm điểm"}</button>
      </div>
    </div>
  );
}

export function ScoreModal({ productId, onClose, onSaved }: { productId: string; onClose: () => void; onSaved?: () => void }) {
  const { view, error, reload } = useView(productId);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/45 p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-6xl rounded-xl border border-line bg-surface p-4 shadow-2xl sm:p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Đánh giá sản phẩm</h2>
            <p className="text-sm text-ink-2">{view ? <>Mã sản phẩm: <b className="text-ink-1">{view.product.st_code ?? "—"}</b> <span className="mx-2 text-ink-muted">|</span> <b className="text-ink-1">{view.product.name}</b></> : "Đang tải…"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-md px-2 py-1 text-lg text-ink-2 hover:bg-grid">✕</button>
        </div>
        {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        {!view && !error && <p className="py-10 text-center text-sm text-ink-muted">Đang tải…</p>}
        {view && (
          <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <ProductSide view={view} />
            <div className="min-w-0 space-y-4">
              {view.product.locked
                ? <p className="rounded-md bg-grid px-3 py-2 text-sm text-ink-2">Mẫu đã duyệt / từ chối / dừng — không chấm điểm nữa.</p>
                : <Form key={view.mine?.updated_at ?? "new"} view={view} onSaved={() => { reload(); onSaved?.(); }} onCancel={onClose} />}
              <div>
                <h3 className="mb-1.5 text-sm font-semibold">Đối chiếu điểm các thành viên</h3>
                <ScoreCompare view={view} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Cửa sổ bật lên: bảng so sánh điểm các thành viên (chấm mù: người chưa chấm chỉ thấy số người đã chấm)
export function ScoreDetailModal({ view, onClose, onScore }: { view: ScoreView; onClose: () => void; onScore?: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/45 p-3 sm:p-8" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-3xl rounded-xl border border-line bg-surface p-4 shadow-2xl sm:p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Bảng so sánh điểm</h2>
            <p className="text-sm text-ink-2">Mã sản phẩm: <b className="text-ink-1">{view.product.st_code ?? "—"}</b> <span className="mx-2 text-ink-muted">|</span> <b className="text-ink-1">{view.product.name}</b></p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-md px-2 py-1 text-lg text-ink-2 hover:bg-grid">✕</button>
        </div>
        <ScoreCompare view={view} />
        <div className="mt-3 flex justify-end gap-2">
          {onScore && !view.product.locked && <button type="button" onClick={onScore} className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-white">{view.mine ? "Sửa điểm của tôi" : "Chấm điểm"}</button>}
          <button type="button" onClick={onClose} className="rounded-md border border-line px-4 py-1.5 text-sm font-medium hover:bg-grid">Đóng</button>
        </div>
      </div>
    </div>
  );
}

// Khối ở trang chi tiết mẫu: chỉ tóm tắt + 2 nút; bảng so sánh điểm mở trong cửa sổ bật lên
export function ScorePanel({ productId }: { productId: string }) {
  const { view, error, reload } = useView(productId);
  const [open, setOpen] = useState<"score" | "detail" | null>(null);
  if (error) return null;   // chưa chạy migration 065 → không hiện khối
  const c = view?.combined, enough = !!view && view.count >= view.cfg.minScorers;
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Chấm điểm mẫu (BM23)</h3>
          <p className="mt-0.5 text-xs text-ink-2">
            {!view ? "Đang tải…" : view.count === 0 ? "Chưa có ai chấm." : (
              <>
                {view.count}/{view.cfg.minScorers} người đã chấm
                {c && <> · <b className="text-ink-1 tabular">{fmt(c.total)}/100</b>{enough && <span className={`ml-1.5 rounded px-1.5 py-0.5 font-semibold ${tone(c.passed)}`}>{c.passed ? "Đạt" : "Không đạt"}</span>}</>}
                {!view.visible && " · chấm xong mới xem được điểm"}
              </>
            )}
          </p>
        </div>
        {view && (
          <div className="flex gap-1.5">
            {view.count > 0 && <button type="button" onClick={() => setOpen("detail")} className="rounded-md border border-accent px-3 py-1 text-xs font-semibold text-accent hover:bg-accent/10">Xem chi tiết điểm</button>}
            {!view.product.locked && <button type="button" onClick={() => setOpen("score")} className="rounded-md bg-accent px-3 py-1 text-xs font-semibold text-white">{view.mine ? "Sửa điểm" : "Chấm điểm"}</button>}
          </div>
        )}
      </div>
      {open === "score" && <ScoreModal productId={productId} onClose={() => setOpen(null)} onSaved={reload} />}
      {open === "detail" && view && <ScoreDetailModal view={view} onClose={() => setOpen(null)} onScore={() => setOpen("score")} />}
    </section>
  );
}
