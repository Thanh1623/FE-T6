"use client";

import { useState } from "react";
import TeamPicker from "./TeamPicker";
import { claimPage, deactivateChannel, releasePage, setRndPage } from "./actions";
import { PLATFORMS } from "@/lib/platforms";

type Ch = { id: string; name: string; platform: string; team_id: string | null; is_rnd?: boolean };
type Status = "all" | "free" | "mine" | "others";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();

// Nền tảng theo thứ tự hiển thị; nền tảng lạ (chưa khai báo) gom vào "Khác"
const ICON: Record<string, string> = { facebook: "📘", instagram: "📸", tiktok: "🎵", youtube: "▶️" };
const ORDER = Object.keys(PLATFORMS);
const platOf = (p: string) => (p in PLATFORMS ? p : "other");
const platLabel = (p: string) => (p in PLATFORMS ? PLATFORMS[p as keyof typeof PLATFORMS].label : "Khác");
const platColor = (p: string) => (p in PLATFORMS ? PLATFORMS[p as keyof typeof PLATFORMS].color : "var(--ink-muted)");

// Quản lý: menu "⋯" của mỗi kênh — đặt / bỏ Page R&D (video sản phẩm hiện ở trang "Thư viện SP mới") và tắt kênh đã xoá / không dùng
// (ngừng đồng bộ, ẩn khỏi danh sách; bài đăng cũ vẫn giữ). Gom vào menu để mỗi dòng chỉ còn 1 hàng: tên · chọn team · Gán · ⋯
function ChannelMenu({ c }: { c: Ch }) {
  const [open, setOpen] = useState(false);
  const item = "block w-full whitespace-nowrap rounded px-2.5 py-1.5 text-left text-xs hover:bg-grid";
  return (
    <div className="relative flex-none" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`Thao tác kênh ${c.name}`} aria-expanded={open}
        className="h-7 w-7 rounded-md border border-line text-ink-2 hover:bg-grid">⋯</button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-max min-w-40 rounded-lg border border-line bg-surface p-1 shadow-lg">
          <form action={setRndPage} onSubmit={() => setOpen(false)}>
            <input type="hidden" name="channel_id" value={c.id} />
            <input type="hidden" name="on" value={c.is_rnd ? "0" : "1"} />
            <button className={item} title="Page R&D: video sản phẩm hiện ở trang Thư viện SP mới để các team lấy source">{c.is_rnd ? "✕ Bỏ Page R&D" : "＋ Đặt làm Page R&D"}</button>
          </form>
          <form action={deactivateChannel} onSubmit={(e) => { if (!confirm(`Tắt kênh "${c.name}"?
Kênh ngừng đồng bộ và ẩn khỏi danh sách (bài đăng cũ vẫn giữ).`)) e.preventDefault(); else setOpen(false); }}>
            <input type="hidden" name="channel_id" value={c.id} />
            <button className={`${item} text-bad`} title="Kênh đã xoá / không dùng nữa: ngừng đồng bộ và ẩn khỏi danh sách (bài đăng cũ vẫn giữ)">⏻ Tắt kênh</button>
          </form>
        </div>
      )}
    </div>
  );
}

function ReleaseBtn({ id, text }: { id: string; text: string }) {
  return (
    <form action={releasePage}>
      <input type="hidden" name="channel_id" value={id} />
      <button className="rounded-md border border-line px-2.5 py-1 text-xs text-ink-2 hover:bg-grid">{text}</button>
    </form>
  );
}

// Danh sách kênh của trang Team, chia theo NỀN TẢNG (Facebook / Instagram / TikTok / YouTube).
// Lọc nền tảng + trạng thái (chưa có team / team tôi / team khác) + tìm theo tên kênh hoặc tên team (gõ không dấu cũng được).
// scopeTeamId: team đang xem ("Team này"); null = màn "Page chưa có team" của Quản lý (onlyFree: chỉ hiện Page chưa có team, gán bằng cách chọn team)
export default function PageLists({ channels, teams, scopeTeamId, isAdmin, canPick, onlyFree = false }: {
  channels: Ch[]; teams: { id: string; name: string }[]; scopeTeamId: string | null; isAdmin: boolean; canPick: boolean; onlyFree?: boolean;
}) {
  const myTeamId = scopeTeamId;
  const [q, setQ] = useState("");
  const [plat, setPlat] = useState<string>("all");
  const [status, setStatus] = useState<Status>(onlyFree ? "free" : scopeTeamId ? "mine" : "all");   // xem team nào thì mặc định chỉ hiện Page của team đó
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const statusOf = (c: Ch): Exclude<Status, "all"> => (!c.team_id ? "free" : c.team_id === myTeamId ? "mine" : "others");

  const hit = (c: Ch) => !q.trim() || norm(`${c.name} ${platLabel(platOf(c.platform))} ${c.team_id ? teamName.get(c.team_id) ?? "" : ""}`).includes(norm(q.trim()));
  const searched = channels.filter(hit);
  const inPlat = searched.filter((c) => plat === "all" || platOf(c.platform) === plat);

  // Nền tảng có kênh (theo thứ tự khai báo, "Khác" cuối)
  const plats = [...ORDER, "other"].filter((p) => channels.some((c) => platOf(c.platform) === p));
  const count = (p: string) => searched.filter((c) => platOf(c.platform) === p).length;
  const statusCount = (s: Exclude<Status, "all">) => inPlat.filter((c) => statusOf(c) === s).length;
  const STATUSES: [Status, string][] = onlyFree ? [["free", "Chưa có team"]] : [
    ["mine", "Team này"], ["free", "Chưa có team"], ["others", "Team khác"], ["all", "Tất cả"],
  ];
  const statusMatch = (c: Ch, s: Status) => s === "all" || statusOf(c) === s;
  const shown = inPlat.filter((c) => statusMatch(c, status));
  const chip = (on: boolean) => `flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${on ? "bg-surface font-medium shadow-sm" : "text-ink-2 hover:text-ink-1"}`;
  const rank = { mine: 0, free: 1, others: 2 } as const;   // Page của team đang xem lên đầu, rồi Page chưa có team

  return (
    <>
      {/* Thanh lọc: tìm · nền tảng · trạng thái */}
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`🔍 Tìm kênh… (${channels.length} kênh)`}
          className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent sm:w-72" />
        <div className="flex flex-wrap gap-0.5 rounded-lg bg-grid p-0.5">
          <button type="button" onClick={() => setPlat("all")} className={chip(plat === "all")}>Mọi nền tảng <span className="text-ink-muted">{searched.length}</span></button>
          {plats.map((p) => (
            <button key={p} type="button" onClick={() => setPlat(p)} className={chip(plat === p)}>
              <span className="h-2 w-2 rounded-full" style={{ background: platColor(p) }} />{platLabel(p)} <span className="text-ink-muted">{count(p)}</span>
            </button>
          ))}
        </div>
        {!onlyFree && <div className="flex flex-wrap gap-0.5 rounded-lg bg-grid p-0.5">
          {STATUSES.map(([s, l]) => (
            <button key={s} type="button" onClick={() => setStatus(s)} className={chip(status === s)}>
              {l}{s !== "all" && <span className={s === "free" && statusCount("free") ? "text-warn-ink" : "text-ink-muted"}>
                {statusCount(s as Exclude<Status, "all">)}</span>}
            </button>
          ))}
        </div>}
        {(q || plat !== "all") && (
          <button type="button" onClick={() => { setQ(""); setPlat("all"); }} className="text-xs text-ink-2 hover:underline">Xoá lọc</button>
        )}
      </div>

      {shown.length === 0 && (
        <p className="rounded-xl border border-line bg-surface px-4 py-6 text-center text-sm text-ink-muted">Không có kênh phù hợp với bộ lọc.</p>
      )}

      {/* Mỗi nền tảng 1 khung; trong khung: chưa có team → team tôi → team khác */}
      <div className="grid gap-3 xl:grid-cols-2">
        {plats.map((p) => {
          const list = shown.filter((c) => platOf(c.platform) === p)
            .sort((a, b) => rank[statusOf(a)] - rank[statusOf(b)] || a.name.localeCompare(b.name, "vi"));
          if (!list.length) return null;
          const all = channels.filter((c) => platOf(c.platform) === p);
          const free = all.filter((c) => !c.team_id).length;
          return (
            <section key={p} className="overflow-hidden rounded-xl border border-line bg-surface">
              <header className="flex items-center gap-2 border-b border-line px-4 py-2.5" style={{ boxShadow: `inset 3px 0 0 ${platColor(p)}` }}>
                <span aria-hidden>{ICON[p] ?? "🌐"}</span>
                <h2 className="text-sm font-semibold">{platLabel(p)}</h2>
                <span className="text-xs text-ink-muted">{all.length} kênh</span>
                {free > 0 && <span className="ml-auto rounded-md bg-warn-bg px-2 py-0.5 text-2xs font-medium text-warn-ink">{free} chưa có team</span>}
              </header>
              <ul className="divide-y divide-line">
                {list.map((c) => {
                  const st = statusOf(c);
                  return (
                    <li key={c.id} className="flex items-center gap-2 px-4 py-1.5 text-sm">
                      {/* Một hàng: tên kênh (nhãn R&D nếu là Page R&D) · chọn team / team đang gán · ⋯ thao tác khác */}
                      <span className="flex min-w-0 flex-1 items-center gap-1.5" title={c.name}>
                        <span className="truncate font-medium">{c.name}</span>
                        {c.is_rnd && <span className="flex-none rounded-md bg-accent px-1.5 py-px text-2xs font-semibold text-white">R&amp;D</span>}
                      </span>
                      <span className="flex flex-none items-center gap-1.5">
                      {st === "free" ? (
                        canPick ? (
                          <form action={claimPage} className="flex flex-none items-center gap-2">
                            <input type="hidden" name="channel_id" value={c.id} />
                            {isAdmin && (scopeTeamId ? <input type="hidden" name="team_id" value={scopeTeamId} /> : <TeamPicker teams={teams} className="w-40" />)}
                            <button className="h-7 whitespace-nowrap rounded-md bg-accent px-2.5 text-xs font-medium text-white">{isAdmin ? (scopeTeamId ? "Thêm vào team" : "Gán") : "Chọn theo dõi"}</button>
                          </form>
                        ) : <span className="flex-none text-xs text-ink-muted">Chỉ trưởng team chọn được</span>
                      ) : (
                        <span className="flex flex-none items-center gap-2">
                          <span className={`rounded-md px-2 py-0.5 text-2xs ${st === "mine" ? "bg-accent text-white" : "bg-grid text-ink-2"}`}>
                            {teamName.get(c.team_id!) ?? "—"}{st === "mine" && !isAdmin ? " · team tôi" : ""}
                          </span>
                          {(isAdmin || (st === "mine" && canPick)) && <ReleaseBtn id={c.id} text={isAdmin ? "Gỡ" : "Bỏ theo dõi"} />}
                        </span>
                      )}
                      {isAdmin && <ChannelMenu c={c} />}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
