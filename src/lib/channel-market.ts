import "server-only";
import { unstable_cache } from "next/cache";
import { sb } from "@/lib/supabase/admin";
import { TAG } from "@/lib/cache-tags";

// Thị trường của kênh: trong nước ("vn") / nước ngoài ("intl"). Bảng sales.channel_market do hàm SQL refresh_channel_market dựng (migration 102):
// kênh đặt tay (social.channels.market) → team Thái Lan / Mỹ / Nhật Bản / Global → tên kênh có chữ Thái / Nhật / Trung / Hàn → ngôn ngữ bài đăng → mặc định trong nước.
export type Market = "all" | "vn" | "intl";   // "all" = tất cả thị trường
export const DEFAULT_MARKET: Market = "vn";   // không có tham số market trên URL = Trong nước
export const MARKET_OPTIONS = [{ value: "all", label: "Tất cả" }, { value: "vn", label: "Trong nước" }, { value: "intl", label: "Nước ngoài" }] as const;
export const parseMarket = (v: string | undefined | null): Market => (v === "all" || v === "intl" || v === "vn" ? v : DEFAULT_MARKET);
// Giá trị gửi cho hàm SQL: "" = không lọc
export const marketForSql = (m: Market | undefined): "" | "vn" | "intl" => (m === "vn" || m === "intl" ? m : "");

// Lỗi (chưa chạy migration 102…) thì ném lỗi để KHÔNG bị lưu đệm rỗng; nơi gọi bắt lỗi và coi mọi kênh là trong nước
const cached = unstable_cache(async (): Promise<Record<string, "vn" | "intl">> => {
  const { data, error } = await sb.sales().from("channel_market").select("channel_id, market").limit(5000);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.channel_id as string, r.market as "vn" | "intl"]));
}, ["channel-market", "v1"], { tags: [TAG.channels, TAG.spuData], revalidate: 3600 });

export async function loadChannelMarkets(): Promise<Record<string, "vn" | "intl">> {
  try { return await cached(); } catch { return {}; }
}
