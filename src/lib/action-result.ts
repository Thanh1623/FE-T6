// Kết quả server action: TRẢ lỗi thay vì ném lỗi.
// Next.js giấu nội dung lỗi ném ra từ server action (trình duyệt chỉ thấy "Minified React error #441"),
// nên mọi action thao tác dữ liệu bọc bằng attempt() → client nhận { error: "thông báo tiếng Việt" }.
export type ActionResult<T = unknown> = { ok: true; data: T } | { error: string };

export async function attempt<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
    // Lỗi điều hướng của Next (redirect / notFound) phải ném tiếp
    if (msg === "NEXT_REDIRECT" || msg === "NEXT_NOT_FOUND" || (e as { digest?: string })?.digest?.startsWith?.("NEXT_")) throw e;
    console.error("[action]", e);
    return { error: msg || "Lỗi không xác định" };
  }
}

// Phía client: lấy dữ liệu hoặc ném lỗi (ném ở client giữ nguyên thông báo)
export function unwrap<T>(r: ActionResult<T>): T;
export function unwrap(r: unknown): unknown;
export function unwrap<T>(r: ActionResult<T> | unknown): T {
  if (r && typeof r === "object" && "error" in r && typeof (r as { error: unknown }).error === "string") throw new Error((r as { error: string }).error);
  return (r && typeof r === "object" && "data" in r ? (r as { data: T }).data : (r as T));
}
