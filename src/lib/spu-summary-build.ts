import type { SpuRow } from "@/lib/spu-tracking";

// Dựng nội dung các bảng tổng hợp SPU từ SpuRow[] (hàm THUẦN: không đọc DB) — xem docs/KIEN-TRUC-TONG-HOP-SPU.md.
// Tách riêng khỏi spu-summary.ts để kiểm thử được (nạp dữ liệu mẫu vào Postgres cục bộ rồi so với viewOf).

const DAY = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
// Chuẩn hoá để tìm kiếm: không dấu, chữ thường (giống `norm` ở trang Theo dõi SPU)
export const normSearch = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

export type SummaryRow = {
  run_id: number; code: string; name: string; grp: string; variants: number; image: string | null;
  stock_by: Record<string, number>; stock_total: number; avail_by: Record<string, number> | null; incoming: number;
  age_days: number | null; age_approx: boolean; sold30: number | null; sold_by_team: Record<string, number>; video_teams: string[];
  search_text: string;
};
export type SalesDailyRow = { run_id: number; code: string; day: string; team: string; qty: number };
export type VideoDailyRow = { run_id: number; code: string; day: string; channel_id: string; team: string; platform: string; videos: number; views: number };

export function buildSummaryTables(rows: SpuRow[], today: string, runId: number) {
  // Win Traffic / Win Đơn hàng / Ngôi sao KHÔNG nằm trong bảng: phụ thuộc kỳ đang lọc nên tính ở lib/spu-winflags.ts
  const summary: SummaryRow[] = rows.map((r) => ({
    run_id: runId, code: r.code, name: r.name, grp: r.group, variants: r.variants, image: r.image,
    stock_by: r.stockBy, stock_total: Object.values(r.stockBy).reduce((a, b) => a + b, 0), avail_by: r.availBy,
    incoming: r.incoming, age_days: r.ageDays, age_approx: !!r.ageApprox, sold30: r.sold30,
    sold_by_team: r.soldBy, video_teams: r.teams, search_text: normSearch(`${r.code} ${r.name}`),
  }));

  // Số bán: gộp theo (ngày, team) — trong SpuRow là danh sách dòng bán có tuổi `age` (ngày cách hôm nay)
  const sales: SalesDailyRow[] = [];
  for (const r of rows) {
    const m = new Map<string, number>();
    for (const l of r.sales) { const k = `${l.age}|${l.team ?? ""}`; m.set(k, (m.get(k) ?? 0) + l.qty); }
    for (const [k, qty] of m) { const i = k.indexOf("|"); sales.push({ run_id: runId, code: r.code, day: addDays(today, -Number(k.slice(0, i))), team: k.slice(i + 1), qty }); }
  }

  // Video: gộp theo (ngày, kênh); team + nền tảng là của kênh tại thời điểm làm mới
  const videos: VideoDailyRow[] = [];
  for (const r of rows) {
    const m = new Map<string, VideoDailyRow>();
    for (const v of r.vids) {
      const day = addDays(today, -v.age), k = `${day}|${v.channelId ?? ""}`;
      const cur = m.get(k) ?? { run_id: runId, code: r.code, day, channel_id: v.channelId ?? "", team: v.team ?? "", platform: v.platform ?? "FB", videos: 0, views: 0 };
      cur.videos += 1; cur.views += v.views;
      m.set(k, cur);
    }
    videos.push(...m.values());
  }
  return { summary, sales, videos };
}
