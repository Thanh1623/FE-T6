import { NextResponse, after } from "next/server";
import { cronOnWorker, isAuthorized } from "@/lib/sync/auth";
import { runApiVideoSync } from "@/lib/sync/api-videos";

export const maxDuration = 300;

// GET /api/cron/videos[?wait=1] — đọc TOÀN BỘ video từ API thống kê video và chỉ ghi phần mới / đột biến (xem lib/sync/api-videos).
// Mặc định trả lời 202 ngay và chạy nền (kết quả ghi ở core.sync_runs, job "videos_api"); wait=1: chờ và trả kết quả đầy đủ (để thử tay).
// Kích hoạt: GitHub Actions mỗi ngày (.github/workflows/videos.yml) hoặc nút "Đồng bộ ngay" ở Cài đặt.
export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (cronOnWorker()) return NextResponse.json({ error: "moved" }, { status: 410 });
  if (new URL(req.url).searchParams.get("wait") === "1") return NextResponse.json(await runApiVideoSync());
  after(async () => { await runApiVideoSync(); });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
