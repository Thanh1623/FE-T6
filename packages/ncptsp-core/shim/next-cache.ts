/** ponytail: Nest/worker — không có Next cache; gọi thẳng fn (parity dữ liệu, không parity TTL cache). */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function unstable_cache<T extends (...args: any[]) => any>(fn: T, _keyParts?: string[], _opts?: unknown): T {
  return fn;
}

export function revalidateTag(_tag: string, _profile?: string | { expire?: number }): void {
  /* no-op ngoài Next */
}

export function revalidatePath(_path: string, _type?: string): void {
  /* no-op ngoài Next */
}