import type { KpiRule } from "@/lib/kpi-constants";
import type { View } from "@/lib/spu-tracking";
import { spuVideos } from "@/lib/spu-videos";
import { loadVideoDetails } from "@/lib/spu-data";
import SpuDrawerView from "./SpuDrawerView";

import type { DrawerMode, ViewFilter } from "./drawer-filters";

// Ngăn "Video đã đăng của mã này": máy chủ chỉ nạp danh sách video + nội dung / link / ảnh bìa; mọi thao tác lọc chạy ở trình duyệt (SpuDrawerView.tsx)
export default async function SpuDrawer({ v, days, endAge, today, mode, team, defaultTeam, view, closeHref, postsHrefs, icon, videoWin }: {
  team: string | null; defaultTeam: string | null; view: ViewFilter; postsHrefs: Record<string, string>;
  videoWin: { rules: KpiRule[]; match: "all" | "any" }; v: View; days: number; endAge: number; today: string; mode: DrawerMode; closeHref: string; icon: string;
}) {
  const base = spuVideos(v.row, { days, endAge }, today);
  const det = await loadVideoDetails(base.map((x) => x.id));   // nội dung / link / ảnh bìa chỉ nạp cho video của SPU đang mở
  const all = base.map((x) => { const d = det.get(x.id); return d ? { ...x, title: d.title || x.title, url: d.url, thumb: d.thumb } : x; });
  const slim: View = { ...v, row: { ...v.row, vids: [] } };   // danh sách video đã nằm ở `all`, không gửi trùng sang trình duyệt
  return <SpuDrawerView v={slim} all={all} days={days} initMode={mode} initTeam={team} defaultTeam={defaultTeam} initView={view} closeHref={closeHref} postsHrefs={postsHrefs} icon={icon} videoWin={videoWin} />;
}
