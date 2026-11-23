"use client";

import { useState } from "react";
import Link from "next/link";
import { fmtCompact, fmtInt } from "@/lib/format";
import type { KpiRule } from "@/lib/kpi-constants";
import { ACTION_LABEL, type View } from "@/lib/spu-tracking";
import type { SpuVideo } from "@/lib/spu-videos";
import { videoWinOf } from "@/lib/video-win";
import Paged from "@/components/Paged";
import DrawerShell from "./DrawerShell";
import VideoThumb from "./VideoThumb";

import { VIEW_FILTERS, type DrawerMode, type ViewFilter } from "./drawer-filters";
const PLATFORM: Record<SpuVideo["platform"], { label: string; cls: string }> = {
  FB: { label: "FB", cls: "bg-[#1877f2] text-white" }, IG: { label: "IG", cls: "bg-[#c13584] text-white" }, TT: { label: "TT", cls: "bg-ink-1 text-page" },
};
const short = fmtCompact;
const dmy = (iso: string) => iso.split("-").reverse().join("/");
const chipCls = (on: boolean) => `rounded-md border px-2.5 py-0.5 ${on ? "border-accent bg-accent/10 font-medium text-accent" : "border-line text-ink-2 hover:bg-grid"}`;
const MODES: [DrawerMode, string][] = [["new", "Mới nhất"], ["views", "Nhiều view"], ["team", "Danh sách team"]];

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-2xs font-medium uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums leading-tight ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

// Video Win: chấm riêng video theo tiêu chí ở trang Mục tiêu (video chỉ lấy được lượt xem ở danh sách này nên các chỉ số còn lại quy theo tỉ lệ cố định)
// Video Win: chấm RIÊNG TỪNG VIDEO theo ngưỡng Video Win ở trang KPI, dựa trên số liệu N ngày đầu kể từ ngày đăng của video (first3d); chưa có thì dùng số hiện tại
const isWin = (x: SpuVideo, kpi: { rules: KpiRule[]; match: "all" | "any" }) => videoWinOf(x.first3d ?? { views: x.views }, kpi);

function VideoRow({ x, top, win }: { x: SpuVideo; top: number; win: boolean }) {
  const best = x.views === top && top > 0;
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <VideoThumb src={x.thumb} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold leading-snug">{win && <span className="mr-1.5 rounded bg-good/15 px-1.5 py-px align-middle text-2xs font-bold text-good" title="Đạt tiêu chí Video Win">WIN</span>}{x.title}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-2">
          <span className={`rounded px-1.5 py-px text-2xs font-bold ${PLATFORM[x.platform].cls}`}>{PLATFORM[x.platform].label}</span>
          <span className="truncate">{x.channel}</span><span className="text-ink-muted">· {dmy(x.date)}</span>
        </p>
      </div>
      <div className="flex-none text-right">
        <div className={`text-base font-bold tabular-nums ${best ? "text-[var(--star)]" : ""}`}>{short(x.views)}</div>
        <div className="text-2xs text-ink-muted">{best ? "★ cao nhất" : "views"}</div>
      </div>
    </li>
  );
}

// Ngăn "Video đã đăng của mã này" — mở từ cột "Video đã đăng" và "Số team đăng".
// Máy chủ chỉ nạp danh sách video (SpuDrawer.tsx); chọn chế độ / team / lượt xem chạy NGAY trong trình duyệt (không tải lại cả trang), địa chỉ trang cập nhật bằng history.replaceState.
export default function SpuDrawerView({ v, all, days, initMode, initTeam, defaultTeam, initView, closeHref, postsHrefs, icon, videoWin }: {
  v: View; all: SpuVideo[]; days: number; initMode: DrawerMode; initTeam: string | null; defaultTeam: string | null; initView: ViewFilter; closeHref: string; postsHrefs: Record<string, string>; icon: string;
  videoWin: { rules: KpiRule[]; match: "all" | "any" };
}) {
  const [mode, setMode] = useState<DrawerMode>(initMode);
  const [team, setTeam] = useState<string | null>(initTeam);
  const [view, setView] = useState<ViewFilter>(initView);
  const sync = (m: DrawerMode, t: string | null, w: ViewFilter) => {   // giữ địa chỉ trang đúng với bộ lọc (gửi link / F5 vẫn đúng) mà không điều hướng
    setMode(m); setTeam(t); setView(w);
    try {
      const u = new URL(window.location.href);
      for (const [k, val] of [["mode", m === "new" ? null : m], ["dt", t ?? (defaultTeam ? "all" : null)], ["dv", w === "all" ? null : w]] as const) { if (val) u.searchParams.set(k, val); else u.searchParams.delete(k); }
      window.history.replaceState(window.history.state, "", u);
    } catch { /* không cập nhật được địa chỉ thì thôi */ }
  };
  const r = v.row, a = v.action ? ACTION_LABEL[v.action] : null;
  const allTeams = [...new Set(all.map((x) => x.team ?? "Chưa gán team"))];
  // Lọc: team (nếu chọn) và lượt xem tối thiểu hoặc chỉ Video Win
  const list = all.filter((x) => (!team || (x.team ?? "Chưa gán team") === team) && (view === "all" || (view === "win" ? isWin(x, videoWin) : x.views >= Number(view))));
  const top = list.reduce((m, x) => Math.max(m, x.views), 0);
  const winCount = list.filter((x) => isWin(x, videoWin)).length;
  const teamNames = [...new Set(list.map((x) => x.team ?? "Chưa gán team"))];
  const byTeam = teamNames.map((name) => {
    const vs = list.filter((x) => (x.team ?? "Chưa gán team") === name);
    return { name, vs, views: vs.reduce((n, x) => n + x.views, 0) };
  }).sort((x, y) => y.views - x.views);
  const flat = mode === "views" ? [...list].sort((x, y) => y.views - x.views) : list;
  return (
    <DrawerShell closeHref={closeHref} title={`Video đã đăng của ${r.code}`}>
      <header className="border-b border-line px-5 pb-4 pr-14 pt-5">
        <div className="flex items-start gap-3">
          <span className="flex h-14 w-14 flex-none items-center justify-center rounded-lg bg-grid text-2xl" aria-hidden>{icon}</span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-snug">{r.name}</h2>
            <p className="mt-0.5 text-xs text-ink-2"><span className="font-mono font-bold text-ink-1">{r.code}</span> · {r.group} · {r.variants} mã con</p>
            {a && <span className="mt-1.5 inline-block rounded-md bg-warn-bg px-2.5 py-0.5 text-2xs font-semibold text-warn-ink" title={a.hint}>{a.label}</span>}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-4">
          <Stat label="Tồn kho" value={fmtInt(v.stock)} />
          <Stat label="Thời gian tồn" value={v.stock && r.ageDays !== null ? `${r.ageApprox ? "≥ " : ""}${r.ageDays} ngày` : "—"} tone={r.ageDays !== null && r.ageDays >= 120 && v.stock ? "text-bad" : ""} />
          <Stat label={`Bán ${days} ngày`} value={v.sold === null ? "—" : fmtInt(v.sold)} />
          <Stat label="Lượt xem" value={v.views === null ? "—" : short(v.views)} tone="text-accent" />
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
        <h3 className="text-sm font-semibold">{mode === "team" ? "Team đã đăng" : "Video đã đăng"} <span className="ml-1 font-normal text-ink-muted">{fmtInt(list.length)}{list.length !== all.length ? ` / ${fmtInt(all.length)}` : ""} video · {fmtInt(winCount)} win · {fmtInt(r.teams.length && list.length ? teamNames.length : 0)} team</span></h3>
        <div className="flex gap-0.5 rounded-md bg-grid p-0.5 text-xs">
          {MODES.map(([k, l]) => <button key={k} type="button" onClick={() => sync(k, team, view)} className={`rounded px-2.5 py-1 ${mode === k ? "bg-surface font-medium shadow-sm" : "text-ink-2 hover:text-ink-1"}`}>{l}</button>)}
        </div>
      </div>

      <div className="space-y-2 border-t border-line px-5 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 flex-none text-ink-muted">Team</span>
          <button type="button" onClick={() => sync(mode, null, view)} className={chipCls(!team)}>Tất cả</button>
          {allTeams.map((t) => <button key={t} type="button" onClick={() => sync(mode, t, view)} className={chipCls(team === t)}>{t}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 flex-none text-ink-muted">Lượt xem</span>
          {VIEW_FILTERS.map(([k, l]) => <button key={k} type="button" onClick={() => sync(mode, team, k)} className={chipCls(view === k)}>{l}</button>)}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
        {mode === "team" ? (
          <ul className="divide-y divide-line">
            {byTeam.map((g) => {
              const wins = g.vs.filter((x) => isWin(x, videoWin)).length;
              const channels = new Set(g.vs.map((x) => x.channel)).size;
              return (
                <li key={g.name}>
                  <button type="button" onClick={() => sync("new", g.name, view)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-grid/60" title={`Xem video của ${g.name}`}>
                    <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-accent/10 text-sm font-bold text-accent" aria-hidden>{g.name.slice(0, 2).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{g.name}</div>
                      <div className="mt-0.5 text-xs text-ink-2">{fmtInt(g.vs.length)} video · {fmtInt(channels)} kênh{wins ? <> · <b className="text-good">{fmtInt(wins)} win</b></> : null}</div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-md bg-grid"><div className="h-full rounded-md bg-accent" style={{ width: `${Math.max(4, (g.views / Math.max(1, byTeam[0].views)) * 100)}%` }} /></div>
                    </div>
                    <div className="flex-none text-right">
                      <div className="text-base font-bold tabular-nums text-accent">{short(g.views)}</div>
                      <div className="text-2xs text-ink-muted">views</div>
                    </div>
                    <span className="text-ink-muted" aria-hidden>›</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="divide-y divide-line"><Paged as="item" size={20} resetKey={`${team}|${view}|${mode}`}>{flat.map((x, i) => <VideoRow key={i} x={x} top={top} win={isWin(x, videoWin)} />)}</Paged></ul>
        )}
        {!list.length && <p className="px-5 py-10 text-center text-sm text-ink-muted">{all.length ? "Không có video nào khớp bộ lọc." : "Chưa có video nào trong kỳ đang xem."}</p>}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-line px-5 py-3 text-xs">
        <span className="text-ink-muted">Bài đăng gắn mã SPU</span>
        <Link href={postsHrefs[`${team ?? ""}|${view}`] ?? postsHrefs["|all"]} className="font-medium text-accent hover:underline">Xem trong Bài đăng →</Link>
      </footer>
    </DrawerShell>
  );
}
