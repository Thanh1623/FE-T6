import "server-only";
import { sb } from "@/lib/supabase/admin";

const DAY_MS = 86_400_000;
const vnDay = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(ms));

type SnapPost = { id: string; published_at: string; views: number; reactions: number; viewers?: number; clicks?: number; comments?: number | null };

// Chụp lượt xem + bình luận cộng dồn của bài vào social.post_daily — mỗi bài 1 dòng / ngày (đồng bộ nhiều lần trong ngày thì ghi đè).
//   mặc định: chỉ bài MỚI (≤ 45 ngày) — đủ cho biểu đồ xu hướng
//   includeOld: cả bài cũ (dùng cho các bài CŨ gắn mã SP vừa được làm mới → tính "lượt xem trong N ngày" cho video đăng từ lâu)
//   date: ngày ghi (YYYY-MM-DD, giờ VN); mặc định hôm nay. Dùng để ghi MỐC TRƯỚC khi một video cũ bứt phá (xem api-videos) — Win Traffic cuốn chiếu cần mốc đó
// Win Traffic cuốn chiếu (sales.spu_traffic_gain, migration 062) = số hiện tại − ảnh chụp gần nhất ≤ (hôm nay − N ngày): đồng bộ PHẢI chụp mỗi khi chỉ số đổi.
// Chưa chạy migration 024 → bỏ qua, không làm hỏng đồng bộ. Chưa chạy 026 (thiếu cột viewers / clicks) hoặc 062 (thiếu comments) → chụp bản rút gọn.
export async function snapshotPosts(rows: SnapPost[], opts: { includeOld?: boolean; date?: string } = {}) {
  const cutoff = Date.now() - 45 * DAY_MS;
  const day = opts.date ?? vnDay(Date.now());
  const picked = opts.includeOld ? rows : rows.filter((r) => Date.parse(r.published_at) >= cutoff);
  const full = picked.map((r) => ({
    post_id: r.id, date: day, views: Number(r.views) || 0, reactions: Number(r.reactions) || 0,
    viewers: Number(r.viewers) || 0, clicks: Number(r.clicks) || 0, ...(r.comments === null || r.comments === undefined ? {} : { comments: Number(r.comments) || 0 }),
  }));
  let level: 0 | 1 | 2 = 0;   // 0 = đủ cột · 1 = thiếu comments (chưa chạy 062) · 2 = thiếu cả viewers / clicks (chưa chạy 026); các lô sau chụp luôn bản rút gọn
  for (let i = 0; i < full.length; i += 500) {
    const part = full.slice(i, i + 500);
    const shape = (l: 0 | 1 | 2) => (l === 0 ? part : l === 1 ? part.map(({ comments: _c, ...r }) => (void _c, r)) : part.map(({ post_id, date, views, reactions }) => ({ post_id, date, views, reactions })));
    for (;;) {
      const { error } = await sb.social().from("post_daily").upsert(shape(level));
      if (!error) break;
      if ((error.code !== "42703" && error.code !== "PGRST204") || level === 2) return;   // thiếu bảng hoặc lỗi tạm: số liệu xu hướng chỉ thiếu 1 ngày
      level = (level + 1) as 1 | 2;
    }
  }
}

// Dọn ảnh chụp cũ hơn 120 ngày (đủ cho cửa sổ test + bộ lọc tới ~4 tháng)
export async function pruneSnapshots() {
  await sb.social().from("post_daily").delete().lt("date", vnDay(Date.now() - 120 * DAY_MS));
}
