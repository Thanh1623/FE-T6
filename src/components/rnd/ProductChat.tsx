"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { unwrap } from "@/lib/action-result";
import { putFile } from "@/lib/media-upload";
import { compressImage } from "@/lib/image-compress";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { createChatImageUpload, fetchOlderProductMessages, fetchProductMessages, recallProductMessage, sendProductMessage } from "@/app/(dash)/rnd/chat-actions";

// Chat trao đổi theo mẫu (cột phải trang chi tiết mẫu) — chủ yếu để trao đổi thiết kế 3D: tin có thể kèm ảnh (chọn file, kéo thả, hoặc dán ảnh chụp màn hình Ctrl+V).
// Tin của mình nằm bên phải; thu hồi = xoá mềm. Không dùng Realtime: hỏi tin mới khi tab đang mở — 12 giây/lần lúc đang trao đổi, thưa dần (30 → 60 giây)
// khi im lặng; có tin mới / mình gửi tin / quay lại tab thì về 12 giây ngay (và hỏi ngay khi quay lại tab).
type Img = { path: string; url: string };
type Msg = { id: string; userId: string; author: string; content: string | null; images: Img[]; recalled: boolean; createdAt: string };
type Page = { messages: Msg[]; hasMore: boolean };
type Pending = { id: string; file: File; preview: string };

const POLL_MS = 12_000;
// Khoảng hỏi tin mới theo độ im lặng của cuộc trao đổi: < 2 phút kể từ lần có hoạt động → 12 giây; < 10 phút → 30 giây; lâu hơn → 60 giây
const pollDelay = (idleMs: number) => (idleMs < 120_000 ? POLL_MS : idleMs < 600_000 ? 30_000 : 60_000);
const MAX_IMAGES = 8;
const day = (iso: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
const hhmm = (iso: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const dm = (iso: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" }).format(new Date(iso));
const initials = (name: string) => name.trim().split(/\s+/).slice(-2).map((w) => w[0]?.toUpperCase() ?? "").join("");

// Biến đường link trong tin nhắn thành link bấm được
function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
        /^https?:\/\//.test(part)
          ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all underline">{part}</a>
          : <span key={i}>{part}</span>,
      )}
    </>
  );
}

export default function ProductChat({ productId, me, isAdmin, initial }: { productId: string; me: string; isAdmin: boolean; initial: Page }) {
  const [msgs, setMsgs] = useState<Msg[]>(initial.messages);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sending, startSend] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const stick = useRef(true);   // đang ở cuối khung → tin mới tự cuộn xuống; đang đọc tin cũ thì không giật
  const lastActive = useRef(0);                                          // thời điểm có hoạt động gần nhất (khởi tạo ở effect, không gọi Date.now lúc render)
  const known = useRef(new Set(initial.messages.map((m) => m.id)));      // id tin đã thấy → nhận ra tin MỚI của người khác

  // Mọi ảnh trong cuộc trao đổi (theo thứ tự cũ → mới) để lật qua lại khi xem phóng to
  const gallery = useMemo(() => msgs.flatMap((m) => m.images), [msgs]);

  const scrollDown = () => { const el = box.current; if (el) el.scrollTop = el.scrollHeight; };
  useEffect(() => { scrollDown(); }, []);
  useEffect(() => { if (stick.current) scrollDown(); }, [msgs]);

  // Gộp tin mới tải về vào danh sách (giữ tin cũ đã tải thêm)
  const merge = useCallback((fresh: Msg[]) => {
    setMsgs((cur) => {
      const byId = new Map(cur.map((m) => [m.id, m]));
      for (const m of fresh) byId.set(m.id, m);
      const next = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return next.length === cur.length && next.every((m, i) => m.id === cur[i].id && m.recalled === cur[i].recalled) ? cur : next;
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const fresh = unwrap(await fetchProductMessages(productId)).messages;
      if (fresh.some((m) => !known.current.has(m.id))) lastActive.current = Date.now();   // có tin mới → hỏi dày lại
      for (const m of fresh) known.current.add(m.id);
      merge(fresh);
    } catch { /* lần sau thử lại */ }
  }, [productId, merge]);

  useEffect(() => {
    lastActive.current = Date.now();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      timer = setTimeout(async () => {
        if (document.visibilityState === "visible") await refresh();
        if (!stopped) loop();
      }, pollDelay(Date.now() - lastActive.current));
    };
    const onVisible = () => { if (document.visibilityState === "visible") { lastActive.current = Date.now(); void refresh(); } };
    loop();
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  // Thêm ảnh vào khay chờ gửi (chọn file / kéo thả / dán)
  const addFiles = (list: File[]) => {
    const imgs = list.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    setError(null);
    const ok = imgs.filter((f) => f.size <= 40 * 1024 * 1024);
    if (ok.length < imgs.length) setError("Có ảnh lớn hơn 40MB nên bị bỏ qua");
    setPending((cur) => {
      const room = Math.max(0, MAX_IMAGES - cur.length);
      if (ok.length > room) setError(`Tối đa ${MAX_IMAGES} ảnh mỗi tin`);
      return [...cur, ...ok.slice(0, room).map((file) => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, file, preview: URL.createObjectURL(file) }))];
    });
  };
  const dropPending = (id: string) => setPending((cur) => { const p = cur.find((x) => x.id === id); if (p) URL.revokeObjectURL(p.preview); return cur.filter((x) => x.id !== id); });

  const send = () => {
    const content = text.trim();
    if ((!content && !pending.length) || sending) return;
    setError(null);
    startSend(async () => {
      try {
        // Tải ảnh lên kho (thu nhỏ trước), rồi gửi tin kèm đường dẫn
        const paths: string[] = [];
        for (const [i, p] of pending.entries()) {
          setStatus(`Đang tải ảnh ${i + 1}/${pending.length}…`);
          const file = await compressImage(p.file);
          if (file.size > 10 * 1024 * 1024) throw new Error(`${p.file.name || "Ảnh"}: lớn hơn 10MB sau khi nén`);
          const ticket = unwrap(await createChatImageUpload(productId, file.name));
          await putFile(ticket, file);
          paths.push(ticket.path);
        }
        setStatus(null);
        const m = unwrap(await sendProductMessage(productId, content, paths)) as Msg;
        setText("");
        for (const p of pending) URL.revokeObjectURL(p.preview);
        setPending([]);
        stick.current = true;
        known.current.add(m.id); lastActive.current = Date.now();   // mình vừa gửi → chờ trả lời nên hỏi dày lại
        merge([m]);
      } catch (e) { setStatus(null); setError(e instanceof Error ? e.message : "Không gửi được tin nhắn"); }
    });
  };

  const recall = async (id: string) => {
    if (!confirm("Thu hồi tin nhắn này?")) return;
    try {
      unwrap(await recallProductMessage(id));
      setMsgs((cur) => cur.map((m) => (m.id === id ? { ...m, recalled: true, content: null, images: [] } : m)));
    } catch (e) { setError(e instanceof Error ? e.message : "Không thu hồi được"); }
  };

  const older = async () => {
    const first = msgs[0];
    if (!first) return;
    try {
      const el = box.current, h = el?.scrollHeight ?? 0;
      stick.current = false;
      const r = unwrap(await fetchOlderProductMessages(productId, first.createdAt));
      merge(r.messages); setHasMore(r.hasMore);
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - h; });   // giữ nguyên vị trí đang đọc
    } catch (e) { setError(e instanceof Error ? e.message : "Không tải được tin cũ"); }
  };

  return (
    <section className={`flex flex-col rounded-xl border bg-surface ${dragging ? "border-accent ring-2 ring-accent/30" : "border-line"}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles([...e.dataTransfer.files]); }}>
      <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-warn-bg text-warn-ink" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight">Trao đổi nội bộ</h2>
          <p className="text-xs text-ink-muted">Thiết kế 3D · cả team cùng thấy{msgs.length ? ` · ${msgs.length}${hasMore ? "+" : ""} tin` : ""}</p>
        </div>
      </div>

      <div ref={box} className="max-h-[min(640px,calc(100vh-16rem))] min-h-[320px] space-y-3 overflow-y-auto px-4 py-4"
        onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
        {hasMore && <button type="button" onClick={older} className="mx-auto block rounded-md border border-line px-3 py-1 text-xs text-ink-2 hover:bg-grid">Tải tin cũ hơn</button>}
        {!msgs.length && <p className="py-10 text-center text-sm text-ink-muted">Chưa có trao đổi nào. Gửi ảnh thiết kế 3D, nhận xét hoặc câu hỏi về mẫu này.</p>}
        {msgs.map((m, i) => {
          const mine = m.userId === me, newDay = i === 0 || day(msgs[i - 1].createdAt) !== day(m.createdAt);
          const canRecall = !m.recalled && (mine || isAdmin);
          return (
            <div key={m.id}>
              {newDay && <div className="my-1 text-center text-xs text-ink-muted">{day(m.createdAt)}</div>}
              <div className={`group flex items-start gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent" title={m.author}>{initials(m.author)}</span>
                <div className={`flex min-w-0 max-w-[85%] flex-col ${mine ? "items-end" : "items-start"}`}>
                  <span className="mb-1 flex items-baseline gap-2 px-0.5 text-xs text-ink-muted">
                    <b className="text-sm font-semibold text-ink-1">{mine ? "Bạn" : m.author}</b>
                    {hhmm(m.createdAt)} - {dm(m.createdAt)}
                    {canRecall && <button type="button" onClick={() => recall(m.id)} className="hidden hover:text-bad group-hover:inline">Thu hồi</button>}
                  </span>
                  {m.recalled ? (
                    <div className="rounded-2xl border border-dashed border-line px-4 py-3 text-base italic text-ink-muted">Tin nhắn đã thu hồi</div>
                  ) : (
                    <div className={`flex max-w-full flex-col gap-1.5 rounded-2xl p-1.5 ${mine ? "bg-accent/10" : "bg-grid"}`}>
                      {m.images.length > 0 && (
                        <div className={`grid gap-1.5 ${m.images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                          {m.images.map((im) => (
                            <button key={im.path} type="button" onClick={() => setLightbox(gallery.findIndex((g) => g.path === im.path))} className="cursor-zoom-in overflow-hidden rounded-xl">
                              {/* eslint-disable-next-line @next/next/no-img-element -- URL ký tạm thời của kho ảnh */}
                              <img src={im.url} alt="Ảnh đính kèm" loading="lazy" className={`w-full object-cover ${m.images.length === 1 ? "max-h-72" : "aspect-square"}`} />
                            </button>
                          ))}
                        </div>
                      )}
                      {m.content && <div className="whitespace-pre-wrap break-words px-2.5 py-1.5 text-base text-ink-1"><Linkified text={m.content} /></div>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-line p-3">
        {error && <p className="mb-1.5 rounded-md bg-bad/10 px-2 py-1 text-xs text-bad">{error}</p>}
        {status && <p className="mb-1.5 px-1 text-xs text-ink-2">{status}</p>}
        {pending.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pending.map((p) => (
              <div key={p.id} className="relative h-16 w-16 overflow-hidden rounded-lg border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element -- xem trước ảnh cục bộ */}
                <img src={p.preview} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => dropPending(p.id)} disabled={sending} aria-label="Bỏ ảnh" className="absolute right-0.5 top-0.5 h-5 w-5 rounded-full bg-black/60 text-xs leading-5 text-white">✕</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2.5">
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
          <button type="button" onClick={() => fileInput.current?.click()} disabled={sending || pending.length >= MAX_IMAGES} aria-label="Đính kèm ảnh" title="Đính kèm ảnh (cũng có thể kéo thả hoặc dán Ctrl+V)"
            className="flex h-12 w-10 flex-none items-center justify-center rounded-md text-ink-2 transition hover:bg-grid hover:text-ink-1 disabled:opacity-40">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
          </button>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={2000} placeholder="Nhập tin nhắn…"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            onPaste={(e) => { const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/")); if (files.length) { e.preventDefault(); addFiles(files); } }}
            className="max-h-40 min-h-[48px] flex-1 resize-none rounded-3xl border border-line bg-page px-5 py-3 text-base outline-none focus:border-accent" />
          <button type="button" onClick={send} disabled={sending || (!text.trim() && !pending.length)}
            aria-label="Gửi" title="Gửi (Enter)" className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-accent text-white transition hover:opacity-90 disabled:opacity-40">
            {sending
              ? <span className="text-lg leading-none">…</span>
              : <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></svg>}
          </button>
        </div>
        <p className="mt-1.5 px-2 text-2xs text-ink-muted">Enter để gửi · Shift+Enter xuống dòng · kéo thả hoặc dán (Ctrl+V) ảnh vào khung</p>
      </div>

      {lightbox !== null && lightbox >= 0 && <ImageLightbox images={gallery.map((g) => ({ url: g.url, alt: "Ảnh thiết kế" }))} startIndex={lightbox} onClose={() => setLightbox(null)} />}
    </section>
  );
}
