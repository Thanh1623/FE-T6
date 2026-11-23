"use client";

import { useEffect, useMemo, useState } from "react";
import Paged from "@/components/Paged";

type Verdict = "star" | "win" | "wintraffic" | null;
type Row = { teamId: string; team: string; code: string; name: string; videos: number; winVideos: number; qty: number; verdict: Verdict };
type Group = { code: string; name: string; videos: number; winVideos: number; qty: number; verdict: Verdict; teams: Row[] };
type SortKey = "code" | "verdict" | "teams" | "videos" | "winVideos" | "qty";
type Metric = "teams" | "videos" | "winVideos" | "qty";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const th = "whitespace-nowrap px-2.5 py-2 align-bottom font-medium";
const num = "px-2.5 py-2 text-right tabular-nums";
// Đánh giá SẢN PHẨM (cấp SPU, tổng mọi team, theo kỳ lọc — quy tắc Win duy nhất ở trang KPI): Ngôi sao > Win Đơn hàng > Win Traffic
const VERDICT: Record<Exclude<Verdict, null>, { label: string; cls: string; title: string; rank: number }> = {
  star: { label: "★ Ngôi sao", cls: "bg-[color-mix(in_srgb,var(--star)_18%,transparent)] text-[var(--star)]", title: "Đạt cả Win Traffic và Win Đơn hàng", rank: 3 },
  win: { label: "Win Đơn hàng", cls: "bg-good/15 text-good", title: "Đạt Win Đơn hàng (chưa đạt Win Traffic)", rank: 2 },
  wintraffic: { label: "Win Traffic", cls: "bg-[#2a78d6]/15 text-[#2a78d6]", title: "Đạt Win Traffic (chưa đạt Win Đơn hàng)", rank: 1 },
};

// Thống kê đẩy hàng, gộp theo SPU R&D: mỗi SPU 1 dòng (tổng video, video Win, số bán, số team đẩy); bấm vào một số để mở cửa sổ chi tiết từng team.
// Có tìm theo mã / tên, lọc team, sắp xếp theo cột và dòng tổng (theo bộ lọc đang chọn).
export default function PushTable({ rows, videoWinText }: { rows: Row[]; videoWinText: string }) {
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "qty", dir: "desc" });
  const [detail, setDetail] = useState<{ code: string; col: Metric } | null>(null);   // SPU đang xem chi tiết + cột vừa bấm (tô đậm)
  const teams = useMemo(() => [...new Map(rows.map((r) => [r.teamId, r.team])).entries()], [rows]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const m = new Map<string, Group>();
    for (const r of rows) {
      if (team && r.teamId !== team) continue;
      if (needle && !r.code.toLowerCase().includes(needle) && !r.name.toLowerCase().includes(needle)) continue;
      const g = m.get(r.code) ?? { code: r.code, name: r.name, videos: 0, winVideos: 0, qty: 0, verdict: r.verdict, teams: [] };
      g.videos += r.videos; g.winVideos += r.winVideos; g.qty += r.qty; g.teams.push(r);
      m.set(r.code, g);
    }
    const val = (g: Group) => (sort.key === "code" ? g.code : sort.key === "teams" ? g.teams.length : sort.key === "verdict" ? (g.verdict ? VERDICT[g.verdict].rank : 0) : g[sort.key]);
    return [...m.values()].map((g) => ({ ...g, teams: [...g.teams].sort((a, b) => b.videos - a.videos) })).sort((a, b) => {
      const x = val(a), y = val(b), c = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
      return (sort.dir === "asc" ? c : -c) || b.videos - a.videos || a.code.localeCompare(b.code);
    });
  }, [rows, q, team, sort]);

  const total = groups.reduce((t, g) => ({ videos: t.videos + g.videos, win: t.win + g.winVideos, qty: t.qty + g.qty }), { videos: 0, win: 0, qty: 0 });
  const picked = detail ? groups.find((g) => g.code === detail.code) ?? null : null;
  useEffect(() => {
    if (!detail) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setDetail(null); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [detail]);
  // Số bấm được: mở cửa sổ chi tiết SPU, nhấn mạnh cột vừa bấm
  const link = (g: Group, col: Metric, text: string, cls = "") => (
    <button type="button" onClick={() => setDetail({ code: g.code, col })} title="Xem chi tiết từng team"
      className={`rounded px-1 tabular-nums underline decoration-dotted decoration-ink-muted underline-offset-4 hover:bg-accent/10 hover:text-accent ${cls}`}>{text}</button>
  );
  const sortTh = (key: SortKey, label: React.ReactNode, right = true) => {
    const on = sort.key === key;
    return (
      <th className={`${th} ${right ? "text-right" : ""}`} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => setSort({ key, dir: on && sort.dir === "desc" ? "asc" : "desc" })} className={`inline-flex items-end gap-1 hover:text-accent ${on ? "text-accent" : ""} ${right ? "text-right" : "text-left"}`}>
          <span>{label}</span><span aria-hidden className="text-2xs">{on ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
        </button>
      </th>
    );
  };

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-xs">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm mã hoặc tên SP…" aria-label="Tìm SPU"
          className="h-8 min-w-40 flex-1 rounded-md border border-line bg-page px-2.5 outline-none focus:border-accent" />
        <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Lọc team" className="h-8 rounded-md border border-line bg-page px-2 outline-none focus:border-accent">
          <option value="">Mọi team</option>
          {teams.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <span className="text-ink-muted">{fmt(groups.length)} SPU</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-sm">
          <thead className="border-b border-line bg-page text-left text-xs text-ink-2">
            <tr>
              {sortTh("code", "SPU R&D", false)}<th className={th}>Tên SP</th>{sortTh("verdict", "Đánh giá SP", false)}
              {sortTh("teams", "Số team đẩy")}{sortTh("videos", "Video đăng")}{sortTh("winVideos", "Video Win")}{sortTh("qty", "Số lượng bán")}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            <Paged size={20} cols={7} resetKey={`${q}|${team}|${sort.key}|${sort.dir}|${rows.length}`}>
              {groups.map((g) => (
                <tr key={g.code} className="hover:bg-grid/40">
                  <td className="whitespace-nowrap px-2.5 py-2 font-mono text-[15px] font-semibold">{g.code}</td>
                  <td className="max-w-[180px] truncate px-2.5 py-2" title={g.name}>{g.name}</td>
                  <td className="whitespace-nowrap px-2.5 py-2">{g.verdict
                    ? <span title={VERDICT[g.verdict].title} className={`rounded-md px-2 py-0.5 text-2xs font-semibold ${VERDICT[g.verdict].cls}`}>{VERDICT[g.verdict].label}</span>
                    : <span className="text-ink-muted" title="Chưa đạt Win Traffic và Win Đơn hàng trong kỳ">Chưa Win</span>}</td>
                  <td className={num}>{link(g, "teams", String(g.teams.length))}</td>
                  <td className={`${num} font-semibold`}>{link(g, "videos", fmt(g.videos))}</td>
                  <td className={`${num} ${g.winVideos ? "font-semibold text-good" : "text-ink-muted"}`}>{link(g, "winVideos", fmt(g.winVideos))}</td>
                  <td className={`${num} font-semibold`}>{link(g, "qty", fmt(g.qty))}</td>
                </tr>
              ))}
            </Paged>
            {groups.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-ink-muted">{rows.length ? "Không có SPU nào khớp bộ lọc." : "Chưa có video đăng cho SPU R&D trong kỳ."}</td></tr>}
          </tbody>
          {groups.length > 0 && (
            <tfoot className="border-t border-line bg-page font-semibold">
              <tr><td className="px-2.5 py-2" colSpan={4}>Tổng ({fmt(groups.length)} SPU)</td><td className={num}>{fmt(total.videos)}</td><td className={num}>{fmt(total.win)}</td><td className={num}>{fmt(total.qty)}</td></tr>
            </tfoot>
          )}
        </table>
      </div>
      {picked && detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div role="dialog" aria-modal="true" aria-label={`Chi tiết ${picked.code}`} className="w-full max-w-lg rounded-lg border border-line bg-surface p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold"><span className="font-mono">{picked.code}</span> · {picked.name}</h3>
                <p className="text-xs text-ink-2">{picked.teams.length} team đẩy · {fmt(picked.videos)} video · {fmt(picked.winVideos)} video Win · {fmt(picked.qty)} đã bán</p>
              </div>
              <button type="button" onClick={() => setDetail(null)} aria-label="Đóng" className="rounded px-2 text-ink-muted hover:bg-grid">✕</button>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-ink-2">
                <tr>
                  <th className="py-1.5 font-medium">Team</th>
                  {([["videos", "Video đăng"], ["winVideos", "Video Win"], ["qty", "Số lượng bán"]] as const).map(([k, l]) => (
                    <th key={k} className={`py-1.5 text-right font-medium ${detail.col === k ? "text-accent" : ""}`}>{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {picked.teams.map((t) => (
                  <tr key={t.teamId}>
                    <td className={`py-1.5 ${detail.col === "teams" ? "font-semibold text-accent" : ""}`}>{t.team}</td>
                    <td className={`py-1.5 text-right tabular-nums ${detail.col === "videos" ? "font-bold" : ""}`}>{fmt(t.videos)}</td>
                    <td className={`py-1.5 text-right tabular-nums ${t.winVideos ? "text-good" : "text-ink-muted"} ${detail.col === "winVideos" ? "font-bold" : ""}`}>{fmt(t.winVideos)}</td>
                    <td className={`py-1.5 text-right tabular-nums ${detail.col === "qty" ? "font-bold" : ""}`}>{fmt(t.qty)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-line font-semibold">
                <tr><td className="py-1.5">Tổng</td><td className="py-1.5 text-right tabular-nums">{fmt(picked.videos)}</td><td className="py-1.5 text-right tabular-nums">{fmt(picked.winVideos)}</td><td className="py-1.5 text-right tabular-nums">{fmt(picked.qty)}</td></tr>
              </tfoot>
            </table>
            <div className="mt-4 flex justify-end"><button type="button" onClick={() => setDetail(null)} className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-grid">Đóng</button></div>
          </div>
        </div>
      )}
      <p className="border-t border-line px-3 py-1.5 text-2xs text-ink-muted">Đánh giá SP: cấp sản phẩm, gộp mọi video và mọi team trong kỳ, theo quy tắc Win ở trang KPI (giống trang Theo dõi đẩy hàng) · Video Win (chấm riêng từng video, cài đặt ở trang KPI): {videoWinText} · Số bán: bán thuần của SPU trên các Page của team trong kỳ · Bấm vào một số để xem chi tiết từng team.</p>
    </div>
  );
}
