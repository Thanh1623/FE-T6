// Khoảng ngày của bộ lọc báo cáo — hàm thuần, dùng chung máy chủ (parseFilters) và trình duyệt (ô chọn thả xuống).
// range: "today" · "7" | "30" | "90" | "365" (N ngày gần nhất, kết thúc HÔM QUA) · "this_month" · "last_month" · "custom".

const DAY_MS = 86_400_000;
export const shiftDay = (d: string, n: number) => new Date(Date.parse(d) + n * DAY_MS).toISOString().slice(0, 10);

export const RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: "today", label: "Hôm nay" },
  { value: "7", label: "7 ngày qua" },
  { value: "30", label: "30 ngày qua" },
  { value: "90", label: "90 ngày qua" },
  { value: "this_month", label: "Tháng này" },
  { value: "last_month", label: "Tháng trước" },
  { value: "365", label: "1 năm qua" },
];

export const rangeLabel = (range: string) =>
  range === "custom" ? "Tuỳ chọn" : RANGE_OPTIONS.find((o) => o.value === range)?.label ?? "30 ngày qua";

// today: YYYY-MM-DD (giờ VN). Trả null nếu không phải khoảng cố định (custom / không hợp lệ).
export function resolveRange(range: string, today: string): { from: string; to: string } | null {
  const monthStart = `${today.slice(0, 8)}01`;
  if (range === "today") return { from: today, to: today };   // video / bài vừa đăng hôm nay
  if (range === "this_month") return { from: monthStart, to: today };   // từ ngày 1 tới HÔM NAY
  if (range === "last_month") {
    const end = shiftDay(monthStart, -1);
    return { from: `${end.slice(0, 8)}01`, to: end };
  }
  const n = Number(range);
  if ([7, 30, 90, 365].includes(n)) return { from: shiftDay(today, -(n - 1)), to: today };
  return null;
}
