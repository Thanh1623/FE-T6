// Xu hướng lượt xem của 1 bài từ ảnh chụp cộng dồn theo ngày — hàm thuần (dùng được ở máy chủ, trình duyệt, kiểm thử).
export type Snap = { date: string; views: number };
export type Trend = {
  totals: Snap[];                            // TỔNG lượt xem của bài tại từng ngày (số cộng dồn đã ghi) — tối đa 14 ngày gần nhất
  days: { date: string; gain: number }[];   // lượt xem TĂNG THÊM mỗi ngày (chênh lệch tổng giữa 2 ngày liên tiếp)
  direction: "up" | "down" | "flat" | "none";
  changePct: number | null;                 // % đổi của các ngày gần đây so với các ngày liền trước
};

const diffDays = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

// snaps: ảnh chụp tăng dần theo ngày. Khoảng trống giữa 2 ảnh chụp (đồng bộ bị lỡ) chia đều cho các ngày thiếu.
export function trendOf(snaps: Snap[], maxDays = 14): Trend {
  const s = [...snaps].sort((x, y) => x.date.localeCompare(y.date));
  const days: Trend["days"] = [];
  for (let i = 1; i < s.length; i++) {
    const gap = Math.max(1, diffDays(s[i - 1].date, s[i].date));
    const gain = Math.max(0, s[i].views - s[i - 1].views) / gap;
    for (let k = gap - 1; k >= 0; k--) {
      const d = new Date(Date.parse(s[i].date) - k * 86_400_000).toISOString().slice(0, 10);
      days.push({ date: d, gain: Math.round(gain) });
    }
  }
  const last = days.slice(-maxDays);
  const totals = s.slice(-maxDays);
  if (last.length < 2) return { totals, days: last, direction: "none", changePct: null };
  // So nửa sau với nửa đầu của chuỗi (vd 14 ngày: 7 ngày gần nhất so với 7 ngày trước đó)
  const half = Math.floor(last.length / 2);
  const sum = (a: typeof last) => a.reduce((t, x) => t + x.gain, 0);
  const prev = sum(last.slice(last.length - 2 * half, last.length - half)), cur = sum(last.slice(last.length - half));
  if (prev === 0 && cur === 0) return { totals, days: last, direction: "flat", changePct: 0 };
  if (prev === 0) return { totals, days: last, direction: "up", changePct: null };
  const pct = ((cur - prev) / prev) * 100;
  return { totals, days: last, direction: pct > 10 ? "up" : pct < -10 ? "down" : "flat", changePct: pct };
}
