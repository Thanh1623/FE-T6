"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { unwrap } from "@/lib/action-result";

// Kiểu dùng chung cho các khung quy trình R&D
export const input = "w-full rounded-lg border border-line bg-page px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60";
export const btn = "rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60";
export const btnGhost = "rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-grid disabled:opacity-60";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

export function Panel({ title, badge, children, muted }: { title: string; badge?: React.ReactNode; children: React.ReactNode; muted?: boolean }) {
  return (
    <section className={`space-y-3 rounded-xl border bg-surface p-5 text-sm ${muted ? "border-dashed border-line opacity-80" : "border-line"}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {badge}
      </div>
      {children}
    </section>
  );
}

// Chạy server action, hiện lỗi, làm mới trang
export function useRun() {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>) => start(async () => {
    setError(null);
    try { unwrap(await fn()); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Lỗi"); }
  });
  return { busy, error, run };
}

export const Err = ({ error }: { error: string | null }) => (error ? <p className="text-sm text-bad">⛔ {error}</p> : null);

export function StatusPill({ tone = "muted", children }: { tone?: "muted" | "accent" | "warn" | "good" | "bad"; children: React.ReactNode }) {
  const cls = {
    muted: "bg-grid text-ink-2", accent: "bg-accent text-white", warn: "bg-warn-bg text-warn-ink",
    good: "border border-good text-good", bad: "border border-bad text-bad",
  }[tone];
  return <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-xs ${cls}`}>{children}</span>;
}

export const taskTone = (s: string) =>
  (({ todo: "muted", doing: "accent", review: "warn", redo: "bad", done: "good" }) as const)[s as "todo"] ?? "muted";
