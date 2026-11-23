import Link from "next/link";
import OverviewView from "@/components/saobien/OverviewView";
import { getHandoffOverview } from "@/lib/handoff-overview";
import { requireUser } from "@/lib/session";

// Tổng quan giao mẫu cho Quản lý: mẫu nào giao cho team nào, team / kênh nào đã lên video, video nào Win, team nào bán được bao nhiêu
export default async function SamplePushOverviewPage({ searchParams }: PageProps<"/sample-push/overview">) {
  await requireUser(["admin"]);
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const ch = one("ch");
  const channelFilter = ch === "posted" || ch === "none" ? ch : "all";
  const query = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]).toString();
  const data = await getHandoffOverview();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold">📊 Tổng quan giao mẫu</h1>
          <p className="max-w-3xl text-sm text-ink-2">
            Mẫu nào đã giao cho team nào · team và kênh nào đã lên video, kênh nào chưa · video nào Win (đạt KPI traffic riêng từng video) · mỗi team bán được bao nhiêu.
          </p>
        </div>
        <Link href="/sample-push" className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:border-accent hover:text-accent">← Danh sách phiếu</Link>
      </div>
      <OverviewView data={data} product={one("product")} channelFilter={channelFilter} baseQuery={query} q={one("q") ?? ""} teamSort={one("ts")} channelSort={one("cs")} />
    </div>
  );
}
