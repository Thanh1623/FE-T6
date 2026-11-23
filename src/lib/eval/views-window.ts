// Lượt xem / người xem / tương tác của 1 bài TRONG MỘT KHOẢNG NGÀY — hàm thuần (không đọc DB), dùng chung máy chủ + kiểm thử.
//
// Facebook / TikTok chỉ trả số CỘNG DỒN của bài, nên:
//   • bài ĐĂNG TRONG kỳ: toàn bộ số cộng dồn tính đến cuối kỳ (mốc đầu = 0);
//   • bài ĐĂNG TRƯỚC kỳ: số cộng dồn cuối kỳ − số cộng dồn ngay trước kỳ — cần ảnh chụp (social.post_daily). Chưa có ảnh chụp đủ gần → null
//     ("chưa đủ lịch sử"), KHÔNG đoán (tránh coi cả số tích luỹ nhiều tháng là "tăng trong 7 ngày").
// Lai (hybrid): bài mới luôn có số; bài cũ có số khi đã chụp đủ lịch sử, thiếu thì bỏ qua và được đếm vào `unknown`.

export type Counters = { views: number; viewers: number; reactions: number; clicks: number };
export type SnapAt = Counters & { day: string };
export type Gain = Counters & { exact: boolean };

const DAY = 86_400_000;
export const shiftDay = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const gapDays = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const sub = (a: Counters, b: Counters): Counters => ({
  views: Math.max(0, a.views - b.views), viewers: Math.max(0, a.viewers - b.viewers),
  reactions: Math.max(0, a.reactions - b.reactions), clicks: Math.max(0, a.clicks - b.clicks),
});
const ZERO: Counters = { views: 0, viewers: 0, reactions: 0, clicks: 0 };

export function gainInRange(a: {
  pubDay: string;          // ngày đăng (giờ VN) YYYY-MM-DD
  from: string; to: string; today: string;
  cur: Counters;           // số cộng dồn hiện tại (social.posts)
  end?: SnapAt | null;     // ảnh chụp mới nhất ≤ to (chỉ cần khi to < today)
  base?: SnapAt | null;    // ảnh chụp mới nhất ≤ from − 1 (chỉ cần khi bài đăng trước kỳ)
  maxLag?: number;         // ảnh chụp được chấp nhận cách mốc tối đa N ngày (làm mới luân phiên có thể trễ vài ngày)
}): Gain | null {
  const lag = a.maxLag ?? 4;
  if (a.pubDay > a.to) return null;   // đăng sau kỳ

  // Mốc cuối kỳ: kỳ chạm hôm nay → số hiện tại; kỳ đã qua → ảnh chụp gần nhất (không có thì xấp xỉ bằng số hiện tại, ghi exact=false)
  let end: Counters, exact = true;
  if (a.to >= a.today) end = a.cur;
  else if (a.end && gapDays(a.end.day, a.to) <= lag) end = a.end;
  else { end = a.cur; exact = false; }

  // Mốc đầu kỳ
  if (a.pubDay >= a.from) return { ...sub(end, ZERO), exact };
  const base = a.base && gapDays(a.base.day, shiftDay(a.from, -1)) <= lag ? a.base : null;
  if (!base) return null;
  return { ...sub(end, base), exact };
}

export type RangeTotals = Counters & { posts: number; videos: number; unknown: number; approx: number };
export const emptyTotals = (): RangeTotals => ({ ...ZERO, posts: 0, videos: 0, unknown: 0, approx: 0 });

// Cộng dồn kết quả của nhiều bài. g = null → bài cũ chưa đủ lịch sử (đếm vào unknown)
export function addGain(t: RangeTotals, g: Gain | null, opts: { published: boolean; video: boolean }) {
  if (opts.published) { t.posts += 1; if (opts.video) t.videos += 1; }
  if (!g) { t.unknown += 1; return; }
  t.views += g.views; t.viewers += g.viewers; t.reactions += g.reactions; t.clicks += g.clicks;
  if (!g.exact) t.approx += 1;
}
