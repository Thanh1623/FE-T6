"use client";

import { useState } from "react";
import { claimPage, releasePage } from "./actions";
import { PLATFORMS } from "@/lib/platforms";

type Ch = { id: string; name: string; platform: string; team_id: string | null };
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();
const ICON: Record<string, string> = { facebook: "📘", instagram: "📸", tiktok: "🎵", youtube: "▶️" };
const platOf = (p: string) => (p in PLATFORMS ? p : "other");
const platLabel = (p: string) => (p in PLATFORMS ? PLATFORMS[p as keyof typeof PLATFORMS].label : "Khác");

// Chọn nguồn traffic (Page Facebook, kênh Instagram, TikTok) cho MỘT team: bên trái là nguồn đã liên kết, bên phải là nguồn còn trống để thêm.
// channels chỉ gồm kênh của team này + kênh chưa có team (kênh team khác không gửi xuống).
export default function SourcePicker({ channels, teamId, canPick }: { channels: Ch[]; teamId: string; canPick: boolean }) {
  const [q, setQ] = useState("");
  const [plat, setPlat] = useState("all");
  const plats = [...Object.keys(PLATFORMS), "other"].filter((p) => channels.some((c) => platOf(c.platform) === p));
  const match = (c: Ch) => (plat === "all" || platOf(c.platform) === plat) && (!q.trim() || norm(c.name).includes(norm(q.trim())));
  const mine = channels.filter((c) => c.team_id === teamId && match(c));
  const free = channels.filter((c) => !c.team_id && match(c));
  const total = (p: string, mineOnly: boolean) => channels.filter((c) => platOf(c.platform) === p && (mineOnly ? c.team_id === teamId : !c.team_id)).length;
  const chip = (on: boolean) => `flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${on ? "bg-surface font-medium shadow-sm" : "text-ink-2 hover:text-ink-1"}`;

  const row = (c: Ch, joined: boolean) => (
    <li key={c.id} className="flex items-center gap-3 px-4 py-2 text-sm">
      <span aria-hidden>{ICON[c.platform] ?? "🌐"}</span>
      <span className="min-w-0 flex-1 truncate" title={c.name}>{c.name}</span>
      <span className="flex-none text-2xs text-ink-muted">{platLabel(platOf(c.platform))}</span>
      {canPick && (joined ? (
        <form action={releasePage}>
          <input type="hidden" name="channel_id" value={c.id} />
          <button className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-2 hover:bg-grid">Bỏ liên kết</button>
        </form>
      ) : (
        <form action={claimPage}>
          <input type="hidden" name="channel_id" value={c.id} />
          <input type="hidden" name="team_id" value={teamId} />
          <button className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white">Liên kết</button>
        </form>
      ))}
    </li>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Tìm tên Page / kênh…"
          className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent sm:w-72" />
        <div className="flex flex-wrap gap-0.5 rounded-lg bg-grid p-0.5">
          <button type="button" onClick={() => setPlat("all")} className={chip(plat === "all")}>Tất cả</button>
          {plats.map((p) => (
            <button key={p} type="button" onClick={() => setPlat(p)} className={chip(plat === p)}>
              {ICON[p] ?? "🌐"} {platLabel(p)} <span className="text-ink-muted">{total(p, true)}/{total(p, false) + total(p, true)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-line bg-surface">
          <header className="border-b border-line px-4 py-2.5 text-sm font-semibold">Đã liên kết với team <span className="font-normal text-ink-muted">· {mine.length}</span></header>
          {mine.length ? <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto">{mine.map((c) => row(c, true))}</ul>
            : <p className="px-4 py-8 text-center text-sm text-ink-muted">Chưa liên kết nguồn nào{plat !== "all" || q ? " khớp bộ lọc" : ""}.</p>}
        </section>
        <section className="overflow-hidden rounded-xl border border-line bg-surface">
          <header className="border-b border-line px-4 py-2.5 text-sm font-semibold">Chưa thuộc team nào <span className="font-normal text-ink-muted">· {free.length}</span></header>
          {free.length ? <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto">{free.map((c) => row(c, false))}</ul>
            : <p className="px-4 py-8 text-center text-sm text-ink-muted">Không còn nguồn trống{plat !== "all" || q ? " khớp bộ lọc" : ""}. Cần thêm? Dùng mục “Kết nối thêm” bên dưới.</p>}
        </section>
      </div>
      {!canPick && <p className="text-xs text-ink-muted">Chỉ trưởng team hoặc Quản lý được thêm / bỏ nguồn.</p>}
    </div>
  );
}
