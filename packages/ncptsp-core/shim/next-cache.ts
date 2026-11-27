/** ponytail: Nest/worker — unstable_cache gọi thẳng fn; revalidateTag POST sang Next (Phase 3). */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function unstable_cache<T extends (...args: any[]) => any>(fn: T, _keyParts?: string[], _opts?: unknown): T {
  return fn;
}

export function revalidateTag(tag: string, profile?: string | { expire?: number }): void {
  const base = process.env.APP_URL?.replace(/\/$/, "");
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) return;
  void fetch(`${base}/api/internal/revalidate`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ tags: [tag], profile: profile ?? { expire: 0 } }),
    signal: AbortSignal.timeout(10_000),
  }).catch((e) => console.error("revalidate webhook lỗi", tag, e));
}

export function revalidatePath(_path: string, _type?: string): void {
  /* no-op ngoài Next */
}
