"use client";

import { useRef, useState, useTransition } from "react";
import { attachPostCode, detachPostCode, linkPostProduct, searchProducts, searchSpus, unlinkPostProduct, type ProductHit, type SpuHit } from "./actions";

// Gắn tay video với một MÃ SPU cho video đã đăng nhưng chưa nhận diện được mã: gõ mã hoặc tên (tìm trong bảng SPU + bảng R&D). Gõ đúng một mã SPU (VD D0002) thì gắn thẳng được dù chưa có trong danh sách
export default function LinkProduct({ postId, label = "＋ Gắn mã", inline = false }: { postId: string; label?: string; inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [spus, setSpus] = useState<SpuHit[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      searchProducts(v).then(setHits).catch(() => setHits([]));
      searchSpus(v).then(setSpus).catch(() => setSpus([]));
    }, 250);
  };
  const pick = (id: string) => start(async () => {
    setErr(null);
    try { await linkPostProduct(postId, id); close(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Không gắn được"); }
  });

  const close = () => { setOpen(false); setQ(""); setHits([]); setSpus([]); setErr(null); };
  const pickCode = (code: string) => start(async () => {
    setErr(null);
    try { await attachPostCode(postId, code); close(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Không gắn được"); }
  });
  const typed = q.trim().toUpperCase();
  const typedIsCode = /^[A-Z]{1,4}\d{3,}$/.test(typed);
  const spuCodes = new Set(spus.map((s) => s.code));
  const onlyProducts = hits.filter((h) => !spuCodes.has(h.label.toUpperCase()));

  // inline: nút gọn dạng chữ (nằm cùng hàng với cảnh báo); mở ra thì ô nhập chiếm cả hàng
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={inline ? "flex-none rounded px-1.5 py-0.5 text-[11px] font-semibold text-accent hover:bg-accent/10" : "rounded-md border border-dashed border-line px-2 py-1 text-xs text-ink-2 hover:border-accent hover:text-accent"}>{label}</button>;
  return (
    <div className={`space-y-1 ${inline ? "w-full" : ""}`}>
      <div className="flex items-center gap-1">
        <input autoFocus value={q} onChange={(e) => search(e.target.value)} placeholder="Mã SPU (D0002) / tên sản phẩm…"
          className="min-w-0 flex-1 rounded-md border border-line bg-page px-2 py-1 text-xs outline-none focus:border-accent" />
        <button type="button" onClick={close} className="rounded-md px-2 py-1 text-xs text-ink-2 hover:bg-grid" aria-label="Đóng">✕</button>
      </div>
      {(spus.length > 0 || onlyProducts.length > 0 || (typedIsCode && !spuCodes.has(typed))) && (
        <ul className="max-h-40 overflow-auto rounded-md border border-line bg-surface text-xs">
          {spus.map((s) => (
            <li key={s.code}>
              <button type="button" disabled={pending} onClick={() => pickCode(s.code)} className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-grid">
                <b className="flex-none">{s.code}</b><span className="truncate text-ink-2">{s.name}</span>
              </button>
            </li>
          ))}
          {typedIsCode && !spuCodes.has(typed) && (
            <li>
              <button type="button" disabled={pending} onClick={() => pickCode(typed)} className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-grid">
                <b className="flex-none">{typed}</b><span className="truncate text-ink-2">Gắn đúng mã này</span>
              </button>
            </li>
          )}
          {onlyProducts.map((h) => (
            <li key={h.id}>
              <button type="button" disabled={pending} onClick={() => pick(h.id)} className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-grid">
                <b className="flex-none">{h.label}</b><span className="truncate text-ink-2">{h.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !typedIsCode && spus.length === 0 && hits.length === 0 && <p className="text-2xs text-ink-muted">Chưa thấy SPU — gõ đúng mã SPU (VD D0002) để gắn trực tiếp.</p>}
      {err && <p className="text-2xs text-bad">{err}</p>}
    </div>
  );
}

// Bỏ mã SPU gắn tay khỏi video
export function UnlinkCode({ postId, code }: { postId: string; code: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} title="Bỏ mã gắn tay khỏi video" aria-label="Bỏ mã gắn tay"
      onClick={() => { if (confirm(`Bỏ mã ${code} khỏi video này?`)) start(async () => { await detachPostCode(postId, code); }); }}
      className="flex-none rounded px-1 text-xs text-ink-muted hover:bg-grid hover:text-bad">✕</button>
  );
}

// Bỏ liên kết gắn tay giữa video và sản phẩm
export function UnlinkProduct({ postId, productId }: { postId: string; productId: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} title="Bỏ gắn sản phẩm này khỏi video" aria-label="Bỏ gắn sản phẩm"
      onClick={() => { if (confirm("Bỏ gắn sản phẩm này khỏi video?")) start(async () => { await unlinkPostProduct(postId, productId); }); }}
      className="flex-none rounded px-1 text-xs text-ink-muted hover:bg-grid hover:text-bad">✕</button>
  );
}
