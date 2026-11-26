// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cache<T extends (...args: any[]) => any>(fn: T): T {
  return fn;
}