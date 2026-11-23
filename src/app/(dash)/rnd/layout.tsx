import RndTabs from "@/components/grid/RndTabs";
import RndShell from "@/components/grid/RndShell";
import { requireUser } from "@/lib/session";
import { sb } from "@/lib/supabase/admin";

// Mọi trang R&D dùng chung thanh bảng; số bên cạnh = số mẫu đã đi qua bước đó (gồm cả mẫu đã sang bước sau)
export default async function RndLayout({ children }: LayoutProps<"/rnd">) {
  const user = await requireUser();
  const head = { count: "exact" as const, head: true };
  const reached = (stages: string[]) => sb.rnd().from("products").select("*", head).in("stage", stages);   // số mẫu ĐÃ ĐI QUA bước (mốc đó trở đi)
  const [col, ap, d, m, t, w, c] = await Promise.all([
    reached(["p0", "p1", "p2", "p3", "p4", "p5", "p6"]),
    reached(["p1", "p2", "p3", "p4", "p5", "p6"]),
    sb.rnd().from("design_tasks").select("*", head),
    reached(["p3", "p4", "p5", "p6"]),
    reached(["p4", "p5", "p6"]),
    reached(["p5", "p6"]),
    reached(["p6"]),
  ]);
  const counts = {
    "/rnd": col.count ?? 0, "/rnd/approved": ap.count ?? 0, "/rnd/design-3d": d.count ?? 0, "/rnd/orders": 0,
    "/rnd/media": m.count ?? 0, "/rnd/traffic": t.count ?? 0, "/rnd/win": w.count ?? 0, "/rnd/commercial": c.count ?? 0,
  };
  return (
    // RndShell: trang bảng bỏ lề dưới chung (bảng kéo sát đáy màn hình); trang khác giữ lề
    <RndShell>
      <RndTabs counts={counts} role={user.role} />
      {children}
    </RndShell>
  );
}
