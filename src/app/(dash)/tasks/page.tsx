import Paged from "@/components/Paged";
import Link from "next/link";
import { roleLabel, requireUser } from "@/lib/session";
import { getTeams } from "@/lib/pipeline";
import { myQueue } from "@/lib/pipeline";
import { fmtDate } from "@/lib/data";

// Việc của tôi: mỗi vai trò thấy đúng phần việc cần làm (vẽ 3D, quay source, duyệt mẫu, bước tiếp theo…)
export default async function MyTasksPage() {
  const user = await requireUser();
  const team = user.team_id ? (await getTeams()).find((t) => t.id === user.team_id)?.name ?? null : null;
  const groups = await myQueue(user);
  const total = groups.reduce((n, g) => n + (g.passive ? 0 : g.items.length), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="font-semibold">Việc của tôi</h1>
        <p className="text-sm text-ink-2">
          {user.full_name} · {roleLabel(user.role, team)}{user.is_team_lead ? " · trưởng team" : ""} · {total ? `${total} việc đang chờ` : "không có việc tồn"}
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-ink-2">
          🎉 Không có việc nào đang chờ bạn.
          {(user.role === "admin" || user.role === "rnd") && <> <Link href="/rnd/new" className="text-accent hover:underline">Sưu tầm mẫu mới</Link>?</>}
          {user.role === "media" && <> <Link href="/rnd/test-codes" className="text-accent hover:underline">Tạo mã SPU test mới</Link>?</>}
        </div>
      ) : groups.map((g) => (
        <section key={g.title} className="rounded-xl border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-3 font-semibold">{g.title} <span className="text-sm font-normal text-ink-muted">({g.items.length})</span>{g.passive && <span className="ml-2 rounded-md bg-grid px-2 py-0.5 text-2xs font-normal text-ink-2">đang chờ người khác</span>}</h2>
          <ul>
            <Paged as="item" size={50}>{g.items.map((i) => (
              <li key={`${g.title}${i.id}`} className="border-b border-line last:border-0">
                <Link href={i.href ?? `/rnd/${i.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-grid">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      <span className="text-ink-muted">{i.st_code}{i.code ? ` · #${i.code}` : ""} · </span>{i.name}
                    </div>
                    <div className={`truncate text-xs ${i.tone === "bad" ? "text-bad" : i.tone === "warn" ? "text-warn-ink" : "text-ink-2"}`}>{i.what}</div>
                  </div>
                  {i.when && <span className={`flex-none text-xs ${i.tone === "bad" ? "text-bad" : "text-ink-muted"}`}>{fmtDate(i.when)}</span>}
                </Link>
              </li>
            ))}</Paged>
          </ul>
        </section>
      ))}
    </div>
  );
}
