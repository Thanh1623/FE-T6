import RndWorkspace from "@/components/grid/RndWorkspace";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { buildWorkspace } from "@/lib/rnd-workspace";
import { wsKeysFor, type WsKey } from "@/lib/rnd-workspace-types";

// Trang 1 bảng R&D: máy chủ chỉ dựng bảng đang mở (hiện nhanh); các bảng còn lại trình duyệt tải ngầm,
// sau đó chuyển bảng không cần gọi máy chủ (xem components/grid/RndWorkspace).
export default async function WorkspacePage({ table }: { table: WsKey }) {
  const user = await requireUser();
  if (!wsKeysFor(user.role).includes(table)) redirect("/rnd/media");   // Media chỉ xem các bảng P3–P6
  return <RndWorkspace initial={await buildWorkspace(user, [table])} />;
}
