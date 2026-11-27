import { NextResponse, after } from "next/server";
import { cronOnWorker, isAuthorized } from "@/lib/sync/auth";
import { checkSpuSummary, refreshSpuSummary, summaryNeedsRefresh } from "@/lib/spu-summary";
import { checkSpuParity } from "@/lib/spu-parity";
import { checkVideoDaily, refreshVideoDaily } from "@/lib/video-daily";
import { refreshTeamLines } from "@/lib/team-lines";

export const maxDuration = 300;

// GET /api/cron/spu-summary           → làm mới bảng tổng hợp SPU ở nền (trả 202 ngay)
// GET /api/cron/spu-summary?wait=1    → làm mới và trả kết quả đầy đủ (để thử tay)
// GET /api/cron/spu-summary?ifchanged=1 → CHỐT sau đồng bộ: chỉ làm mới (ở nền, 202) nếu bảng tổng hợp cũ hơn dữ liệu nguồn; không thì trả { skipped } — gọi bởi .github/workflows/summary.yml
// GET /api/cron/spu-summary?check=1   → KHÔNG ghi gì; đối chiếu bảng tổng hợp với số tính trực tiếp (xem docs/KIEN-TRUC-TONG-HOP-SPU.md)
// GET /api/cron/spu-summary?check=2   → KHÔNG ghi gì; đối chiếu kết quả hàm SQL (spu_query, spu_dash) với đường tính trực tiếp trên nhiều bộ lọc
// GET /api/cron/spu-summary?check=3   → KHÔNG ghi gì; đối chiếu bảng video dựng trong SQL (migration 089) với bảng cũ spu_video_daily
// GET /api/cron/spu-summary?video=inc  → nạp tăng dần bảng video SQL (video=full: dựng lại cả 360 ngày, lần đầu / bản dựng đêm)
export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (cronOnWorker()) return NextResponse.json({ error: "moved" }, { status: 410 });
  const params = new URL(req.url).searchParams;
  if (params.get("check") === "1") return NextResponse.json(await checkSpuSummary());
  if (params.get("check") === "2") return NextResponse.json(await checkSpuParity());
  if (params.get("lines") === "refresh") return NextResponse.json(await refreshTeamLines(true));   // dựng lại bảng tr_lines của QLHH (migration 093)
  if (params.get("check") === "3") return NextResponse.json(await checkVideoDaily());
  if (params.get("video") === "inc" || params.get("video") === "full") return NextResponse.json(await refreshVideoDaily({ full: params.get("video") === "full" }));
  if (params.get("ifchanged") === "1") {
    const need = await summaryNeedsRefresh();
    if (!need.yes) return NextResponse.json({ skipped: true, reason: need.reason });
    console.log("[spu-summary] chốt sau đồng bộ — làm mới vì:", need.reason);
  }
  if (params.get("wait") === "1") return NextResponse.json(await refreshSpuSummary());
  after(async () => {
    const r = await refreshSpuSummary();
    if (!r.ok) console.error("làm mới bảng tổng hợp SPU lỗi:", r.error);
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
