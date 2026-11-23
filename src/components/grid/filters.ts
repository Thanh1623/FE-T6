// Bộ lọc kiểu Lark: mỗi điều kiện = [trường] [kiểu lọc] [giá trị]; ghép bằng "tất cả" (và) hoặc "bất kỳ" (hoặc)
import { asList, textOf } from "./Cells";
import type { CellValue, Col, ColType } from "./types";

export type FilterOp =
  | "in" | "notin"                                  // ô chọn / người / nhiều nhãn
  | "contains" | "notcontains" | "is"               // chữ
  | "eq" | "ne" | "gt" | "gte" | "lt" | "lte"       // số
  | "on" | "before" | "after"                       // ngày
  | "empty" | "notempty";
export type Filter = { key: string; op: FilterOp; value?: string | string[] };
export type FilterMatch = "all" | "any";

type Kind = "choice" | "text" | "number" | "date" | "image";
export const kindOf = (t: ColType): Kind =>
  t === "select" || t === "badge" || t === "person" || t === "multi" ? "choice"
  : t === "number" || t === "money" ? "number"
  : t === "date" || t === "datetime" ? "date"
  : t === "images" ? "image" : "text";

export const OPS: Record<Kind, [FilterOp, string][]> = {
  choice: [["in", "là"], ["contains", "chứa"], ["notcontains", "không chứa"], ["empty", "trống"], ["notempty", "không trống"]],
  text: [["contains", "chứa"], ["notcontains", "không chứa"], ["is", "là"], ["empty", "trống"], ["notempty", "không trống"]],
  number: [["eq", "="], ["ne", "≠"], ["gt", ">"], ["gte", "≥"], ["lt", "<"], ["lte", "≤"], ["empty", "trống"], ["notempty", "không trống"]],
  date: [["on", "là"], ["before", "trước"], ["after", "sau"], ["empty", "trống"], ["notempty", "không trống"]],
  image: [["notempty", "có ảnh"], ["empty", "chưa có ảnh"]],
};

export const DATE_PRESETS: [string, string][] = [
  ["today", "hôm nay"], ["yesterday", "hôm qua"], ["tomorrow", "ngày mai"],
  ["this_week", "tuần này"], ["last_week", "tuần trước"], ["this_month", "tháng này"], ["last_month", "tháng trước"],
  ["last7", "7 ngày qua"], ["last30", "30 ngày qua"], ["custom", "ngày cụ thể…"],
];

export const defaultFilter = (c: Col): Filter => {
  const k = kindOf(c.type);
  return { key: c.key, op: OPS[k][0][0], value: k === "choice" ? [] : k === "date" ? "this_month" : "" };
};

// Điều kiện đã đủ để lọc chưa (trống / không trống luôn đủ)
export const isActive = (f: Filter) =>
  f.op === "empty" || f.op === "notempty" || (Array.isArray(f.value) ? f.value.length > 0 : !!f.value && f.value !== "custom");

const vnToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const vnDate = (v: string) => (v.length === 10 ? v : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(v)));

// Khoảng ngày [từ, đến] của 1 lựa chọn ngày
export function dateRange(value: string): [string, string] | null {
  const t = vnToday();
  const dow = (new Date(`${t}T00:00:00Z`).getUTCDay() + 6) % 7;   // 0 = thứ Hai
  const monthStart = `${t.slice(0, 8)}01`;
  switch (value) {
    case "today": return [t, t];
    case "yesterday": return [shift(t, -1), shift(t, -1)];
    case "tomorrow": return [shift(t, 1), shift(t, 1)];
    case "this_week": return [shift(t, -dow), shift(t, 6 - dow)];
    case "last_week": return [shift(t, -dow - 7), shift(t, -dow - 1)];
    case "this_month": return [monthStart, shift(`${shift(monthStart, 32).slice(0, 8)}01`, -1)];
    case "last_month": { const prevEnd = shift(monthStart, -1); return [`${prevEnd.slice(0, 8)}01`, prevEnd]; }
    case "last7": return [shift(t, -6), t];
    case "last30": return [shift(t, -29), t];
    default: return /^\d{4}-\d{2}-\d{2}$/.test(value) ? [value, value] : null;
  }
}

const empty = (v: CellValue) => v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length);

export function matchFilter(col: Col, v: CellValue, f: Filter): boolean {
  if (f.op === "empty") return empty(v);
  if (f.op === "notempty") return !empty(v);
  const k = kindOf(col.type);
  if (k === "choice") {
    const vals = col.type === "multi" ? asList(v) : empty(v) ? [] : [String(v)];
    // Giá trị lưu từ bản cũ có thể là chữ gõ tay → vẫn lọc theo "chứa chữ"
    if (typeof f.value === "string") {
      const q = f.value.trim().toLowerCase();
      const hit = vals.some((x) => (col.type === "person" ? col.people?.find((p) => p.id === x)?.name ?? x : x).toLowerCase().includes(q));
      return f.op === "in" || f.op === "contains" ? hit : !hit;
    }
    const want = (f.value as string[]) ?? [];
    const hit = vals.some((x) => want.includes(x));   // "Là" / "Chứa": có ít nhất 1 nhãn đã chọn · "Không chứa" / "Không là": không có nhãn nào
    return f.op === "in" || f.op === "contains" ? hit : !hit;
  }
  if (k === "text") {
    const s = textOf(col, v).toLowerCase(), q = String(f.value ?? "").trim().toLowerCase();
    return f.op === "contains" ? s.includes(q) : f.op === "notcontains" ? !s.includes(q) : s === q;
  }
  if (k === "number") {
    if (empty(v)) return f.op === "ne";
    const n = Number(v), x = Number(String(f.value).replace(/[.,\s](?=\d{3}\b)/g, "").replace(",", "."));
    if (!Number.isFinite(x)) return true;
    return f.op === "eq" ? n === x : f.op === "ne" ? n !== x : f.op === "gt" ? n > x : f.op === "gte" ? n >= x : f.op === "lt" ? n < x : n <= x;
  }
  if (k === "date") {
    if (empty(v)) return false;
    const r = dateRange(String(f.value));
    if (!r) return true;
    const d = vnDate(String(v));
    return f.op === "on" ? d >= r[0] && d <= r[1] : f.op === "before" ? d < r[0] : d > r[1];
  }
  return true;
}
