"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import ResultBadge from "@/components/rnd/ResultBadge";
import { HANDOFF_STATUS, type HandoffStatus } from "@/lib/handoff-status";
import type { Assignment, Sample } from "@/lib/handoff-overview";
// fmtInt cục bộ: "@/lib/data" kéo mã chỉ chạy ở máy chủ (cache, Supabase) vào gói trình duyệt
const fmtInt = (n: number) => Math.round(n).toLocaleString("vi-VN");

const PAGE_SIZE = 20;
const STATUS_CLS: Record<HandoffStatus, string> = {
  pending: "bg-warn-bg text-warn-ink", received: "bg-accent/15 text-accent", developing: "bg-[#7c3aed]/15 text-[#7c3aed]",
  done: "bg-good/15 text-good", returned: "bg-bad/10 text-bad",
};
const th = "whitespace-nowrap px-2.5 py-2 text-left text-2xs font-bold uppercase tracking-wide text-ink-muted";
const td = "px-2.5 py-2 align-middle";
// Bỏ dấu + chữ thường để gõ "nhan doi" cũng ra "Nhẫn đôi"
const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

// Sắp xếp: key = "code" | "result" | "teams" | "videos" | "win" | "sold" | "team:<id>" (cột của từng team); dir 1 = tăng, -1 = giảm
type Sort = { key: string; dir: 1 | -1 } | null;
const RESULT_RANK: Record<string, number> = { win: 3, win_traffic: 2, win_sp: 1 };
const STATUS_RANK: Record<HandoffStatus, number> = { done: 5, developing: 4, received: 3, pending: 2, returned: 1 };
const PRESETS: { value: string; label: string; sort: Sort }[] = [
  { value: "", label: "Mặc định (nhiều team trước)", sort: null },
  { value: "sold", label: "SL bán: cao → thấp", sort: { key: "sold", dir: -1 } },
  { value: "videos", label: "Video: nhiều → ít", sort: { key: "videos", dir: -1 } },
  { value: "win", label: "Video Win: nhiều → ít", sort: { key: "win", dir: -1 } },
  { value: "teams", label: "Số team: nhiều → ít", sort: { key: "teams", dir: -1 } },
  { value: "result", label: "Kết quả: Win trước", sort: { key: "result", dir: -1 } },
  { value: "code", label: "Mã SPU: A → Z", sort: { key: "code", dir: 1 } },
];
const sum = (s: Sample, f: (a: Assignment) => number) => s.assignments.reduce((n, a) => n + f(a), 0);
function valueOf(s: Sample, key: string): number | string {
  if (key === "code") return s.code;
  if (key === "result") return s.result ? RESULT_RANK[s.result] ?? 0 : 0;
  if (key === "teams") return s.assignments.filter((a) => a.team).length;
  if (key === "videos") return sum(s, (a) => a.videos.length);
  if (key === "win") return sum(s, (a) => a.winCount);
  if (key === "sold") return sum(s, (a) => a.sold);
  if (key.startsWith("team:")) {   // cột 1 team: có phiếu mới xếp trước; rồi SL bán → video → trạng thái
    const a = s.assignments.find((x) => x.team?.id === key.slice(5));
    return a ? 1e9 + a.sold * 1e5 + a.videos.length * 1e2 + STATUS_RANK[a.status] : -1;
  }
  return 0;
}

// Tiêu đề cột bấm được: lần 1 = mặc định (chữ A→Z, số cao→thấp), lần 2 = đảo chiều, lần 3 = bỏ sắp xếp
function SortHead({ id, label, sort, onSort, className = "", textFirst = false }: { id: string; label: string; sort: Sort; onSort: (s: Sort) => void; className?: string; textFirst?: boolean }) {
  const on = sort?.key === id;
  const first: 1 | -1 = textFirst ? 1 : -1;
  const next = () => onSort(!on ? { key: id, dir: first } : sort!.dir === first ? { key: id, dir: (-first) as 1 | -1 } : null);
  return (
    <th className={`${className} cursor-pointer select-none`} aria-sort={on ? (sort!.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={next} title="Bấm để sắp xếp" className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink-1 ${on ? "text-accent" : ""}`}>
        {label}<span aria-hidden className={`text-[9px] ${on ? "" : "opacity-30"}`}>{on ? (sort!.dir === 1 ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

function StatusChip({ s }: { s: HandoffStatus }) {
  return <span className={`rounded-md px-2 py-0.5 text-2xs font-semibold ${STATUS_CLS[s]}`}>{HANDOFF_STATUS[s]}</span>;
}
function cellOf(a: Assignment) {
  return (
    <div className="space-y-0.5">
      <StatusChip s={a.status} />
      <div className="text-2xs tabular-nums text-ink-2">
        {a.videos.length > 0 ? <><b className="text-ink-1">{a.videos.length}</b> video{a.winCount > 0 && <span className="font-bold text-good"> · {a.winCount} Win</span>}</> : "chưa lên video"}
        {a.sold > 0 && <span> · bán <b className="text-ink-1">{fmtInt(a.sold)}</b></span>}
      </div>
    </div>
  );
}

// Bảng "Mẫu × team": thanh tìm kiếm ngay ở tiêu đề · cuộn ngang + dọc (tiêu đề cột dính) · mỗi trang tối đa 20 mẫu
export default function SampleMatrix({ samples, teams, selectedId, baseQuery, emptyText }: {
  samples: Sample[]; teams: { id: string; name: string }[]; selectedId: string | null; baseQuery: string; emptyText: string;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>(null);
  const words = norm(q).split(/\s+/).filter(Boolean);
  const shown = useMemo(() => samples.filter((s) => {
    if (!words.length) return true;
    const hay = norm([s.code, s.name, s.ownTeam?.name, ...s.assignments.map((a) => a.team?.name)].filter(Boolean).join(" "));
    return words.every((w) => hay.includes(w));
  }), [samples, q]);   // eslint-disable-line react-hooks/exhaustive-deps -- words suy ra từ q
  const sorted = useMemo(() => {
    if (!sort) return shown;
    return [...shown].sort((a, b) => {
      const x = valueOf(a, sort.key), y = valueOf(b, sort.key);
      const c = typeof x === "string" || typeof y === "string" ? String(x).localeCompare(String(y), "vi") : x - y;
      return (c || a.code.localeCompare(b.code)) * sort.dir;
    });
  }, [shown, sort]);
  const changeSort = (s: Sort) => { setSort(s); setPage(1); };
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const rows = sorted.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
  const selHref = (id: string) => { const p = new URLSearchParams(baseQuery); p.set("product", id); return `?${p}#detail`; };

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-line pb-1.5">
        <div>
          <h2 className="text-sm font-semibold">Mẫu đã giao cho team nào</h2>
          <p className="text-xs text-ink-muted">Mỗi hàng là 1 mẫu, mỗi cột là 1 team được giao. Ô = trạng thái phiếu · số video đã lên (Win) · SL bán. Bấm mẫu để xem chi tiết.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-2 tabular-nums">{fmtInt(shown.length)}{shown.length !== samples.length ? ` / ${fmtInt(samples.length)}` : ""} mẫu</span>
          <label className="flex items-center gap-1.5 text-xs text-ink-2">Sắp xếp
            <select value={PRESETS.find((p) => p.sort?.key === sort?.key && p.sort?.dir === sort?.dir)?.value ?? (sort ? "custom" : "")}
              onChange={(e) => changeSort(PRESETS.find((p) => p.value === e.target.value)?.sort ?? null)} aria-label="Sắp xếp bảng mẫu × team"
              className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent">
              {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              {sort && !PRESETS.some((p) => p.sort?.key === sort.key && p.sort?.dir === sort.dir) && <option value="custom">Theo cột đã bấm</option>}
            </select>
          </label>
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="🔍 Tìm mẫu, mã SPU, team…" aria-label="Tìm trong bảng mẫu × team"
            className="w-56 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent" />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-center text-sm text-ink-muted">{q.trim() ? "Không có mẫu nào khớp từ khoá." : emptyText}</p>
      ) : (
        <div className="max-h-[70vh] overflow-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-max text-sm">
            <thead className="sticky top-0 z-10 border-b border-line bg-surface shadow-[0_1px_0_var(--line)]">
              <tr>
                <SortHead id="code" label="Mẫu" className={th} sort={sort} onSort={changeSort} textFirst />
                <SortHead id="result" label="Kết quả" className={th} sort={sort} onSort={changeSort} />
                {teams.map((t) => <SortHead key={t.id} id={`team:${t.id}`} label={t.name} className={th} sort={sort} onSort={changeSort} />)}
                <SortHead id="teams" label="Team" className={`${th} text-right`} sort={sort} onSort={changeSort} />
                <SortHead id="videos" label="Video" className={`${th} text-right`} sort={sort} onSort={changeSort} />
                <SortHead id="win" label="Win" className={`${th} text-right`} sort={sort} onSort={changeSort} />
                <SortHead id="sold" label="SL bán" className={`${th} text-right`} sort={sort} onSort={changeSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((s) => {
                const as = s.assignments;
                const unassigned = as.filter((a) => !a.team);
                return (
                  <tr key={s.productId} className={s.productId === selectedId ? "bg-accent/5" : "hover:bg-grid/40"}>
                    <td className={td}>
                      <Link href={selHref(s.productId)} className="block max-w-[220px]">
                        <span className="font-bold text-accent">#{s.code}</span> <span className="text-ink-1">{s.name}</span>
                        {s.ownTeam && <span className="block text-2xs text-ink-muted">Team yêu cầu: {s.ownTeam.name}</span>}
                      </Link>
                    </td>
                    <td className={td}>{s.result ? <ResultBadge result={s.result} size="xs" /> : <span className="text-2xs text-ink-muted">chưa Win</span>}</td>
                    {teams.map((t) => {
                      const a = as.find((x) => x.team?.id === t.id);
                      return <td key={t.id} className={td}>{a ? cellOf(a) : <span className="text-ink-muted">—</span>}</td>;
                    })}
                    <td className={`${td} text-right tabular-nums`}>{as.filter((a) => a.team).length}{unassigned.length > 0 && <span className="block text-2xs text-warn-ink">+{unassigned.length} chờ phân công</span>}</td>
                    <td className={`${td} text-right tabular-nums`}>{as.reduce((n, a) => n + a.videos.length, 0)}</td>
                    <td className={`${td} text-right font-bold tabular-nums text-good`}>{as.reduce((n, a) => n + a.winCount, 0)}</td>
                    <td className={`${td} text-right font-bold tabular-nums`}>{fmtInt(as.reduce((n, a) => n + a.sold, 0))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav className="flex flex-wrap items-center justify-between gap-2 text-sm" aria-label="Phân trang bảng mẫu × team">
          <span className="text-xs text-ink-2 tabular-nums">Hiện {(cur - 1) * PAGE_SIZE + 1}–{Math.min(cur * PAGE_SIZE, sorted.length)} / {fmtInt(sorted.length)} mẫu</span>
          <span className="flex items-center gap-1">
            <button type="button" disabled={cur === 1} onClick={() => setPage(1)} className="rounded-md px-2 py-1 text-ink-2 hover:bg-grid disabled:opacity-40">« Đầu</button>
            <button type="button" disabled={cur === 1} onClick={() => setPage(cur - 1)} className="rounded-md border border-line px-3 py-1 hover:bg-grid disabled:opacity-40">‹ Trước</button>
            <span className="px-2 tabular-nums text-ink-2">Trang <b className="text-ink-1">{cur}</b> / {pages}</span>
            <button type="button" disabled={cur === pages} onClick={() => setPage(cur + 1)} className="rounded-md border border-line px-3 py-1 hover:bg-grid disabled:opacity-40">Sau ›</button>
            <button type="button" disabled={cur === pages} onClick={() => setPage(pages)} className="rounded-md px-2 py-1 text-ink-2 hover:bg-grid disabled:opacity-40">Cuối »</button>
          </span>
        </nav>
      )}
    </section>
  );
}
