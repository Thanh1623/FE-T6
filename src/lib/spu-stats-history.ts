import "server-only";
import { sb } from "@/lib/supabase/admin";
import { todayVN } from "@/lib/data";

// Số SPU toàn công ty theo ngày (sales.spu_daily_stats, migration 058) — nguồn của biểu đồ xu hướng cạnh các thẻ ở trang Theo dõi SPU.
export const SPU_STAT_KEYS = ["active", "inStock", "hot", "normal", "slow", "bad"] as const;
export type SpuStatKey = (typeof SPU_STAT_KEYS)[number];
export type SpuStats = Record<SpuStatKey, number>;
export type SpuStatPoint = { day: string } & SpuStats;

const DAYS = 30;

// Lịch sử DAYS ngày gần nhất, cũ → mới; chưa chạy migration thì trả mảng rỗng (không lỗi)
export async function loadSpuStatsHistory(): Promise<SpuStatPoint[]> {
  const { data, error } = await sb.sales().from("spu_daily_stats").select("day, active, in_stock, hot, normal, slow, bad").order("day", { ascending: false }).limit(DAYS);
  if (error) return [];
  return (data ?? []).reverse().map((r) => ({ day: String(r.day), active: Number(r.active), inStock: Number(r.in_stock), hot: Number(r.hot), normal: Number(r.normal), slow: Number(r.slow), bad: Number(r.bad) }));
}

// Ghi (ghi đè) số của hôm nay; lỗi thì bỏ qua — chỉ là số phụ cho biểu đồ
export async function recordSpuStats(s: SpuStats): Promise<void> {
  try {
    await sb.sales().from("spu_daily_stats").upsert({ day: todayVN(), active: s.active, in_stock: s.inStock, hot: s.hot, normal: s.normal, slow: s.slow, bad: s.bad, updated_at: new Date().toISOString() }, { onConflict: "day" });
  } catch { /* bỏ qua */ }
}
