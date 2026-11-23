"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { unwrap } from "@/lib/action-result";
import { createTestCodeAction } from "./actions";

// Cấp mã SPU test: chọn loại hàng (hiện mã kế tiếp dự kiến) → ghi chú ngắn → "Tạo mã". Mã thật do máy chủ cấp lúc bấm nên không trùng.
export default function TestCodeCreator({ categories, next }: { categories: { key: string; label: string }[]; next: Record<string, string> }) {
  const router = useRouter();
  const [cat, setCat] = useState("");
  const [note, setNote] = useState("");
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (code: string) => { void navigator.clipboard?.writeText(`#${code}`); setCopied(code); setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500); };
  const create = () => start(async () => {
    setError(null);
    try {
      const r = unwrap(await createTestCodeAction(cat, note));
      setMade((m) => [r.code, ...m].slice(0, 5)); setNote(""); copy(r.code);
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Lỗi tạo mã"); }
  });

  return (
    <section className={`space-y-3 rounded-xl border border-accent/40 bg-surface p-4 ${busy ? "opacity-70" : ""}`}>
      <div>
        <h2 className="font-semibold">Tạo mã SPU test</h2>
        <p className="text-xs text-ink-2">Mã do hệ thống cấp theo số thứ tự, <b>không bao giờ trùng</b> kể cả khi nhiều người tạo cùng lúc. Dùng mã làm hashtag trên video (ví dụ <b>#T10007</b>).</p>
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Loại hàng">
        {categories.map((c) => (
          <button key={c.key} type="button" role="radio" aria-checked={cat === c.key} onClick={() => setCat(c.key)}
            className={`rounded-lg border px-3 py-1.5 text-left text-sm ${cat === c.key ? "border-accent bg-accent/10 text-accent" : "border-line hover:border-accent"}`}>
            <span className="block font-semibold">{c.label}</span>
            <span className="block text-2xs tabular-nums text-ink-muted">tiếp theo {next[c.key]}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && cat && !busy) create(); }} maxLength={120}
          placeholder="Ghi chú ngắn cho mẫu (tuỳ chọn): kiểu dáng, đá, nguồn…" aria-label="Ghi chú"
          className="min-w-64 flex-1 rounded-lg border border-line bg-page px-3 py-2 text-sm outline-none focus:border-accent" />
        <button type="button" disabled={!cat || busy} onClick={create} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          {busy ? "Đang tạo…" : cat ? `＋ Tạo mã ${categories.find((c) => c.key === cat)?.label.toLowerCase()} test` : "＋ Tạo mã (chọn loại trước)"}
        </button>
      </div>
      {error && <p className="text-xs font-medium text-bad">⛔ {error}</p>}
      {made.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-good/10 px-3 py-2 text-sm">
          <span className="text-good">✓ Đã tạo:</span>
          {made.map((code, i) => (
            <button key={code} type="button" onClick={() => copy(code)} title="Bấm để sao chép hashtag"
              className={`rounded-md border px-2.5 py-1 font-mono font-bold tracking-wide ${i === 0 ? "border-good bg-good text-white" : "border-good/40 text-good"} hover:opacity-90`}>
              {copied === code ? "✓ đã chép" : `#${code}`}
            </button>
          ))}
          <span className="text-xs text-ink-2">Bấm để sao chép hashtag</span>
        </div>
      )}
    </section>
  );
}
