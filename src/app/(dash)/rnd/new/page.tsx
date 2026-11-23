import Link from "next/link";
import RndForm from "@/components/rnd/RndForm";
import CollectionForm from "@/components/pipeline/CollectionForm";
import { requireUser } from "@/lib/session";
import { getFieldSuggestions } from "@/lib/rnd";
import { getTeams } from "@/lib/pipeline";
import { createRndProduct } from "../actions";
import { createCollection } from "../pipeline-actions";

// /rnd/new           → phiếu sưu tầm mẫu mới (vào quy trình, chờ duyệt)
// /rnd/new?code=XXX  → khai báo nhanh 1 mã đã có trên bài đăng (từ danh sách "Mã chưa khai báo"), không qua quy trình
export default async function NewRndPage({ searchParams }: PageProps<"/rnd/new">) {
  const user = await requireUser(["admin", "rnd"]);
  const { code } = await searchParams;
  const [suggestions, teams] = await Promise.all([getFieldSuggestions(), getTeams(true)]);
  const declare = typeof code === "string";
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/rnd" className="text-sm text-ink-2 hover:text-ink-1">← R&amp;D</Link>
      <h1 className="font-semibold">{declare ? "Khai báo mã sản phẩm" : "Sưu tầm mẫu mới"}</h1>
      <div className="rounded-xl border border-line bg-surface p-5">
        {declare ? (
          <RndForm action={createRndProduct} suggestions={suggestions} submitLabel="Tạo mẫu" values={{ code: code.toUpperCase() }} />
        ) : (
          <CollectionForm mode="create" action={createCollection} teams={teams} suggestions={suggestions}
            values={{ team_id: user.team_id }} />
        )}
        <p className="mt-4 text-xs text-ink-muted">
          {declare ? "Ảnh được thêm ở bước tiếp theo, sau khi tạo mẫu."
            : "Mã ST (MST…) tự cấp khi lưu. Ảnh thêm ở trang mẫu. Gửi duyệt → Quản lý / trưởng team duyệt sang P0."}
        </p>
      </div>
    </div>
  );
}
