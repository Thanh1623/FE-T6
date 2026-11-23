import Link from "next/link";
import Paged from "@/components/Paged";
import ParamSearch from "@/components/ParamSearch";
import ResultBadge from "@/components/rnd/ResultBadge";
import { fmtInt } from "@/lib/data";
import type { AutoResult } from "@/lib/eval/rules";
import type { TestCodeRow } from "@/lib/test-codes";
import { TEST_CATEGORIES } from "@/lib/test-codes-shared";
import LinkSpu from "./LinkSpu";
import TestCodeCreator from "./TestCodeCreator";

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const dm = (d: string) => new Date(d).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
const th = "whitespace-nowrap px-2.5 py-2 text-left text-2xs font-bold uppercase tracking-wide text-ink-muted";
const td = "px-2.5 py-2 align-middle";

// Mã SPU test: Media / R&D / Quản lý cấp mã không trùng + danh sách mọi mã test (ai tạo, đã lên video chưa, kết quả)
export default function TestCodesView({ rows, next, sp, userName, canLink }: { rows: TestCodeRow[]; next: Record<string, string>; sp: Record<string, string | string[] | undefined>; userName: string; canLink: boolean }) {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = one("q"), cat = TEST_CATEGORIES.some((c) => c.key === one("cat")) ? one("cat") : "", mine = one("mine") === "1";
  const query = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === "string") as [string, string][]).toString();
  const words = norm(q).split(/\s+/).filter(Boolean);
  const shown = rows.filter((r) => (!cat || r.cat === cat) && (!mine || r.createdBy === userName)
    && (!words.length || words.every((w) => norm(`${r.code} ${r.name} ${r.note ?? ""} ${r.createdBy ?? ""}`).includes(w))));
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(query);
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    return p.size ? `?${p}` : "?";
  };
  const chip = (on: boolean) => `rounded-md px-2.5 py-1 ${on ? "bg-accent font-medium text-white" : "text-ink-2 hover:bg-grid"}`;
  const countBy = (k: string) => rows.filter((r) => r.cat === k).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-semibold">🏷️ Mã SPU test</h1>
        <p className="max-w-3xl text-sm text-ink-2">Mã test do Media tự thử mẫu (chưa có mã Sapo). Luồng Media chỉ lấy các mã này: bài đăng gắn hashtag mã test sẽ được hệ thống đánh giá tự động.</p>
      </div>

      <TestCodeCreator categories={TEST_CATEGORIES} next={next} />

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <ParamSearch value={q} query={query} placeholder="Tìm mã, ghi chú, người tạo…" className="w-full max-w-sm" />
          <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1 text-xs">
            <Link href={href({ cat: null })} className={chip(!cat)}>Tất cả ({rows.length})</Link>
            {TEST_CATEGORIES.filter((c) => countBy(c.key) > 0 || c.key === cat).map((c) => <Link key={c.key} href={href({ cat: c.key })} className={chip(cat === c.key)}>{c.label} ({countBy(c.key)})</Link>)}
          </div>
          <Link href={href({ mine: mine ? null : "1" })} className={`rounded-lg border px-3 py-1.5 text-xs ${mine ? "border-accent text-accent" : "border-line text-ink-2 hover:bg-grid"}`}>{mine ? "✓ " : ""}Mã tôi tạo</Link>
          <span className="ml-auto text-xs tabular-nums text-ink-2">{fmtInt(shown.length)}{shown.length !== rows.length ? ` / ${fmtInt(rows.length)}` : ""} mã</span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-max text-sm">
            <thead className="border-b border-line bg-page/60">
              <tr><th className={th}>Mã SPU test</th><th className={th}>Mẫu / ghi chú</th><th className={th}>Người tạo</th><th className={th}>Ngày tạo</th><th className={th}>Mã SPU liên kết</th><th className={th}>Video</th><th className={`${th} text-right`}>Lượt xem</th><th className={th}>Kết quả</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              <Paged as="row" cols={8} size={20} resetKey={`${q}|${cat}|${mine}`}>{shown.map((r) => (
                <tr key={r.id} className="hover:bg-grid/40">
                  <td className={td}><Link href={`/rnd/${r.id}`} className="font-mono font-bold tracking-wide text-accent hover:underline">#{r.code}</Link></td>
                  <td className={`${td} max-w-[360px]`}><span className="line-clamp-2">{r.name}</span>{r.stage && <span className="ml-1 rounded bg-grid px-1 text-2xs text-ink-2">đã vào R&amp;D</span>}</td>
                  <td className={`${td} text-xs`}>{r.createdBy ?? <span className="text-ink-muted">hệ thống (từ bài đăng)</span>}</td>
                  <td className={`${td} whitespace-nowrap text-xs text-ink-2`}>{dm(r.createdAt)}</td>
                  <td className={`${td} min-w-44`}><LinkSpu productId={r.id} links={r.links} canEdit={canLink} /></td>
                  <td className={`${td} tabular-nums`}>{r.videos > 0 ? <b>{r.videos}</b> : <span className="text-xs text-ink-muted">chưa lên video</span>}</td>
                  <td className={`${td} text-right tabular-nums`}>{r.views ? fmtInt(r.views) : <span className="text-ink-muted">·</span>}</td>
                  <td className={td}>{r.result ? <ResultBadge result={r.result as AutoResult} size="xs" /> : <span className="text-xs text-ink-muted">—</span>}</td>
                </tr>
              ))}</Paged>
              {shown.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-ink-muted">{rows.length ? "Không có mã nào khớp bộ lọc." : "Chưa có mã SPU test nào — tạo mã đầu tiên ở khung trên."}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
