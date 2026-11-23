import "server-only";
import { unstable_cache } from "next/cache";
import { sb } from "@/lib/supabase/admin";
import { TAG } from "@/lib/cache-tags";
import type { ApiStale } from "@/lib/sync/api-videos";

// Kênh Facebook có trong API video nhưng API đã đứng yên (xem lib/sync/api-videos: syncApiVideos ghi core.settings 'api_stale_channels' mỗi lần kéo API).
// Bản ghi quá 3 ngày (cron kéo API ngừng chạy) thì không hiện — tránh cảnh báo cũ. Danh sách rỗng = không có gì để cảnh báo.
export const loadApiStale = unstable_cache(async (): Promise<ApiStale | null> => {
  const { data } = await sb.core().from("settings").select("value").eq("key", "api_stale_channels").maybeSingle();
  const v = data?.value as ApiStale | undefined;
  if (!v?.channels?.length || Date.now() - Date.parse(v.at) > 3 * 86_400_000) return null;
  return v;
}, ["api-stale", "v1"], { tags: [TAG.sync], revalidate: 600 });
