import { NextResponse, after } from "next/server";
import { cronOnWorker, isAuthorized } from "@/lib/sync/auth";
import { syncAll } from "@/lib/sync";

export const maxDuration = 300;

const MAX_CHAIN = 6;   // tối đa 6 lô nối tiếp sau 1 lần kích hoạt (~1000 kênh / 190 giây mỗi lô là dư)

// GET /api/cron/sync?days=3&postDays=30[&full=1][&wait=1]
// Mỗi lần gọi xử lý 1 LÔ kênh (lâu chưa cập nhật nhất trước, song song, ~190 giây) rồi TRẢ LỜI NGAY (202) — việc đồng bộ chạy tiếp
// nền trong cùng hàm. Còn kênh chờ thì tự gọi lại chính nó để chạy lô kế tiếp (chuỗi), nên chỉ cần 1 lần kích hoạt cho cả 200 kênh.
// Kích hoạt: GitHub Actions (.github/workflows/sync.yml) → Nest WORKER_URL. CRON_ON_WORKER=1 → 410 (rollback: tắt cờ).
// wait=1: chạy đồng bộ và trả kết quả đầy đủ (để thử tay), không nối chuỗi.
export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (cronOnWorker()) return NextResponse.json({ error: "moved" }, { status: 410 });

  const url = new URL(req.url);
  const params = url.searchParams;
  const days = Math.min(Number(params.get("days")) || 3, 730);
  const postDays = Math.min(Number(params.get("postDays")) || 30, 365);
  // full=1: chạy cả phần nặng (số bán, hashtag, đánh giá) và đồng bộ lại cả kênh vừa cập nhật
  const full = params.get("full") === "1";
  const chain = Math.max(0, Number(params.get("chain")) || 0);
  const opts = { days, postDays, ...(full && chain === 0 ? { heavy: true as const, minAgeMin: 0 } : {}) };

  if (params.get("wait") === "1") {
    const results = await syncAll(opts);
    return NextResponse.json({ days, postDays, results });
  }

  after(async () => {
    let left = 0;
    try {
      await syncAll({ ...opts, onBatch: (b) => { left = b.left; } });
    } catch (e) {
      console.error("sync batch lỗi", e);
      return;
    }
    if (left > 0 && chain < MAX_CHAIN) {
      const next = new URL(url);
      next.searchParams.set("chain", String(chain + 1));
      next.searchParams.delete("full");   // chỉ lô đầu chạy "full"; các lô sau chỉ tiếp tục kênh còn chờ
      try {
        await fetch(next, { headers: { authorization: req.headers.get("authorization") ?? "" }, signal: AbortSignal.timeout(20_000) });
      } catch (e) { console.error("không nối được lô kế tiếp", e); }
    }
  });
  return NextResponse.json({ accepted: true, chain }, { status: 202 });
}
