import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { sb } from "@/lib/supabase/admin";
import { teamStats } from "@/lib/team-stats";
import { fmtInt, todayVN } from "@/lib/data";
import { ROLE_LABELS, normalizeRole } from "@/lib/roles";
import { tiktokConfigured } from "@/lib/tiktok/api";
import { TT_NAME_PREFIX } from "@/lib/tiktok/name";
import PageLists from "./PageLists";
import ConnectForm from "./ConnectForm";
import SourcePicker from "./SourcePicker";
import MetaAdmin from "./MetaAdmin";
import TagManager, { type TeamTag } from "./TagManager";
import TeamAdmin from "@/components/users/TeamAdmin";
import { getTeams } from "@/lib/pipeline";

type Ch = { id: string; name: string; platform: string; team_id: string | null; username?: string | null; is_rnd?: boolean };
type Member = { id: string; full_name: string; role: string; team_id: string | null; is_team_lead: boolean };
type Tab = "pages" | "members" | "tags" | "connect";

const FREE = "free";   // mục "Page chưa có team" trong danh sách team (chỉ Quản lý)
const shift = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);
const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(-2).join("").toUpperCase();

type Stats = Promise<{ views: number | null; sold: number | null }>;
async function StatValue({ stats, k }: { stats: Stats; k: "views" | "sold" }) {
  const v = (await stats)[k];
  return <>{v === null ? "—" : fmtInt(v)}</>;
}
const statTile = (stats: Stats, k: "views" | "sold") => (
  <Suspense fallback={<span className="text-ink-muted">…</span>}><StatValue stats={stats} k={k} /></Suspense>
);

function Tile({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "warn" | "accent" | "good" }) {
  const color = tone === "warn" ? "text-warn-ink" : tone === "accent" ? "text-accent" : tone === "good" ? "text-good" : "";
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="text-xs font-medium text-ink-2">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-2xs text-ink-muted" title={hint}>{hint}</div>}
    </div>
  );
}

// Trang Team: Quản lý thấy mọi team (danh sách bên trái + chi tiết từng team); trưởng team / thành viên chỉ thấy team của mình.
// Nghiệp vụ: mỗi team sở hữu một tập Page + tag Sapo; số traffic và số bán của team = số của các Page / tag đó. Mỗi Page / tag chỉ thuộc 1 team.
//   Quản lý: gán / gỡ Page và tag cho bất kỳ team · đánh dấu Page R&D · xem mọi team
//   Trưởng team: chọn Page CHƯA có team, bỏ Page của team mình, thêm / gỡ tag, kết nối Page cho team mình
//   Thành viên (R&D…): chỉ xem
export default async function TeamPage({ searchParams }: PageProps<"/team">) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const ttOk = one("tiktok_ok"), ttErr = one("tiktok_error");
  const user = await requireUser(["admin", "rnd"]);
  const isAdmin = user.role === "admin";

  const [{ data: chRaw }, { data: teamsRaw }, { data: memRaw }] = await Promise.all([
    // is_rnd (migration 022): chưa chạy migration thì đọc lại không có cột đó
    (async () => {
      const q = (cols: string) => sb.social().from("channels").select(cols).eq("is_active", true).order("platform").order("name");
      const r = await q("id, name, platform, team_id, username, is_rnd");
      return r.error?.code === "42703" ? await q("id, name, platform, team_id, username") : r;
    })(),
    sb.core().from("teams").select("id, name").eq("is_active", true).order("name"),
    (() => {
      const q = sb.core().from("profiles").select("id, full_name, role, team_id, is_team_lead").eq("is_active", true).order("full_name");
      return isAdmin ? q : user.team_id ? q.eq("team_id", user.team_id) : Promise.resolve({ data: [] as Member[] });
    })(),
  ]);
  // Quản lý: danh sách đầy đủ (kể cả team đã ngừng) + người dùng để thêm / đổi tên / ngừng team
  const adminTeams = isAdmin ? await getTeams() : [];
  const adminUsers = isAdmin ? ((await sb.core().from("profiles").select("id, email, full_name, role, is_active, team_id, is_team_lead").order("full_name")).data ?? []).map((u) => ({
    id: u.id as string, email: u.email as string, full_name: u.full_name as string, role: normalizeRole(u.role), is_active: !!u.is_active, team_id: (u.team_id ?? null) as string | null, is_team_lead: !!u.is_team_lead,
  })) : [];
  const all = (chRaw ?? []) as unknown as Ch[];
  const teams = (teamsRaw ?? []) as { id: string; name: string }[];
  const members = ((memRaw ?? []) as Member[]).map((m) => ({ ...m, role: normalizeRole(m.role) }));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));

  // Kênh dạng "tag thủ công" (id ttn:…) tách riêng khỏi danh sách Page thật
  const isTag = (c: Ch) => c.id.startsWith(TT_NAME_PREFIX);
  const channels = all.filter((c) => !isTag(c));
  const tags: TeamTag[] = all.filter((c) => isTag(c) && c.team_id).map((c) => ({
    id: c.id, name: c.name, platform: c.platform, raw: c.username ?? null, teamId: c.team_id!, teamName: teamName.get(c.team_id!) ?? "—",
  }));
  const freeCount = channels.filter((c) => !c.team_id).length;

  // Team đang xem: Quản lý chọn ở danh sách (?t=), mặc định team của mình hoặc team đầu tiên; người khác luôn là team của mình
  const wanted = one("t");
  const sel = isAdmin
    ? (wanted === FREE ? FREE : teams.some((t) => t.id === wanted) ? wanted! : user.team_id && teamName.has(user.team_id) ? user.team_id : teams[0]?.id ?? null)
    : user.team_id;
  const isFree = sel === FREE;
  const team = sel && !isFree ? { id: sel, name: teamName.get(sel) ?? "—" } : null;
  const canPick = isAdmin || (user.is_team_lead && !!user.team_id && user.team_id === team?.id);   // được chọn / bỏ Page, tag, kết nối
  const tab: Tab = (["pages", "members", "tags", "connect"] as const).find((t) => t === one("tab") && (t !== "connect" || canPick)) ?? "pages";
  const href = (t?: string | null, tb?: Tab) => { const p = new URLSearchParams(); if (t) p.set("t", t); if (tb && tb !== "pages") p.set("tab", tb); const s = p.toString(); return `/team${s ? `?${s}` : ""}`; };

  // ----- Số liệu của team đang xem -----
  const teamMembers = team ? members.filter((m) => m.team_id === team.id) : [];
  const leads = teamMembers.filter((m) => m.is_team_lead);
  const teamCh = team ? channels.filter((c) => c.team_id === team.id) : [];
  const teamTags = team ? tags.filter((t) => t.teamId === team.id) : [];
  const byPlat = (p: string) => teamCh.filter((c) => c.platform === p).length;

  // Traffic + số bán 30 ngày gần nhất của team (các Page + tag của team). Lỗi đọc số liệu thì chỉ bỏ ô này, không làm hỏng trang.
  // Không await ở đây: 2 ô số này tải sau (Suspense), phần còn lại của trang hiện ngay.
  const statsP = team && (teamCh.length || teamTags.length)
    ? (() => {
        const to = todayVN(), from = shift(to, -29);
        const chIds = teamCh.map((c) => c.id).sort();
        return teamStats(chIds, [...chIds, ...teamTags.map((t) => t.id)].sort(), from, to);
      })()
    : Promise.resolve({ views: null, sold: null } as { views: number | null; sold: number | null });

  // ----- Thông tin từng team cho danh sách bên trái -----
  const rail = teams.map((t) => ({
    id: t.id, name: t.name,
    members: members.filter((m) => m.team_id === t.id).length,
    lead: members.find((m) => m.team_id === t.id && m.is_team_lead)?.full_name ?? null,
    pages: channels.filter((c) => c.team_id === t.id).length,
    tags: tags.filter((x) => x.teamId === t.id).length,
  }));

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "pages", label: "Kênh & Page", count: teamCh.length },
    { id: "members", label: "Thành viên", count: teamMembers.length },
    { id: "tags", label: "Tag Sapo", count: teamTags.length },
    ...(canPick ? [{ id: "connect" as const, label: "Kết nối nguồn" }] : []),
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">{isAdmin ? "Quản lý team" : "Team của tôi"}</h1>
          <p className="text-sm text-ink-2">
            {isAdmin ? "Gán Page và tag cho từng team, xem thành viên và kết quả traffic · số bán của mỗi team."
              : team ? "Page và tag mà team theo dõi traffic và số bán." : "Bạn chưa thuộc team nào — nhờ Quản lý gán team."}
          </p>
        </div>
        <p className="max-w-sm text-right text-2xs text-ink-muted">Mỗi Page / tag chỉ thuộc 1 team nên số liệu các team không cộng trùng. Team chỉ thấy số liệu của mình.</p>
      </header>

      {ttOk && <p className="rounded-lg bg-grid px-3 py-2 text-sm text-good">✓ Đã kết nối TikTok “{ttOk}”. Số liệu về sau lần đồng bộ kế tiếp.</p>}
      {ttErr && <p className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-ink">⛔ TikTok: {ttErr}</p>}

      <div className={isAdmin ? "grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]" : ""}>
        {/* Danh sách team (Quản lý) */}
        {isAdmin && (
          <nav aria-label="Danh sách team" className="space-y-1.5 lg:sticky lg:top-3 lg:self-start">
            <div className="px-1 text-2xs font-bold uppercase tracking-wide text-ink-muted">Team · {teams.length}</div>
            {rail.map((t) => {
              const on = t.id === sel;
              return (
                <Link key={t.id} href={href(t.id, tab)} aria-current={on ? "page" : undefined}
                  className={`block rounded-xl border px-3 py-2.5 transition ${on ? "border-accent bg-accent/5 shadow-sm" : "border-line bg-surface hover:border-accent/60"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg text-2xs font-bold ${on ? "bg-accent text-white" : "bg-grid text-ink-2"}`}>{initials(t.name)}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${on ? "font-semibold text-accent" : "font-medium"}`}>{t.name}</span>
                      <span className="block truncate text-2xs text-ink-muted">{t.lead ? `Trưởng team: ${t.lead}` : "Chưa có trưởng team"}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 flex gap-3 pl-9 text-2xs text-ink-2 tabular-nums">
                    <span title="Thành viên">👤 {t.members}</span><span title="Page theo dõi">📄 {t.pages}</span><span title="Tag Sapo">🏷 {t.tags}</span>
                    {t.pages + t.tags === 0 && <span className="text-warn-ink">chưa có kênh</span>}
                  </div>
                </Link>
              );
            })}
            <Link href={href(FREE)} aria-current={isFree ? "page" : undefined}
              className={`flex items-center justify-between rounded-xl border border-dashed px-3 py-2.5 text-sm transition ${isFree ? "border-accent bg-accent/5 font-semibold text-accent" : "border-line text-ink-2 hover:border-accent/60"}`}>
              <span>Page chưa có team</span>
              <span className={`rounded-md px-2 py-0.5 text-2xs font-semibold tabular-nums ${freeCount ? "bg-warn-bg text-warn-ink" : "bg-grid text-ink-muted"}`}>{freeCount}</span>
            </Link>
          </nav>
        )}

        <div className="min-w-0 space-y-4">
          {/* ===== Page chưa có team (Quản lý) ===== */}
          {isFree && (
            <section className="space-y-3">
              <div>
                <h2 className="text-base font-semibold">Page chưa có team</h2>
                <p className="text-xs text-ink-muted">Page vừa kết nối hoặc đã gỡ khỏi team. Chọn team rồi bấm “Gán” — từ đó traffic và số bán của Page tính cho team đó.</p>
              </div>
              <PageLists channels={channels} teams={teams} scopeTeamId={null} isAdmin canPick onlyFree />
            </section>
          )}

          {/* ===== Không có team để hiển thị ===== */}
          {!isFree && !team && (
            <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-10 text-center text-sm text-ink-muted">
              {isAdmin ? "Chưa có team nào — thêm team ở mục “Thêm / đổi tên / ngừng team” bên dưới." : "Bạn chưa thuộc team nào — nhờ Quản lý gán team."}
            </p>
          )}

          {/* ===== Chi tiết team ===== */}
          {team && (
            <>
              <section className="rounded-xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-accent text-sm font-bold text-white">{initials(team.name)}</span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold">Team {team.name}</h2>
                    <p className="truncate text-xs text-ink-2">
                      {leads.length ? <>Trưởng team: <b className="text-ink-1">{leads.map((l) => l.full_name).join(", ")}</b></> : <span className="text-warn-ink">Chưa có trưởng team — chỉ Quản lý chọn được Page cho team này</span>}
                      {" · "}{teamMembers.length} thành viên
                    </p>
                  </div>
                  {isAdmin && <Link href="/users" className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink-2 hover:bg-grid">Quản lý người dùng →</Link>}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Tile label="Page theo dõi" value={teamCh.length} tone={teamCh.length ? undefined : "warn"}
                    hint={teamCh.length ? `FB ${byPlat("facebook")} · IG ${byPlat("instagram")} · TikTok ${byPlat("tiktok")}` : "Chưa chọn Page nào"} />
                  <Tile label="Tag Sapo" value={teamTags.length} hint="Số bán theo tag đơn hàng" />
                  <Tile label="Lượt xem 30 ngày" value={statTile(statsP, "views")} tone="accent" hint="Tổng các Page của team · Page chưa kết nối: lượt xem các video có gắn mã SP" />
                  <Tile label="SL bán 30 ngày" value={statTile(statsP, "sold")} tone="good" hint="Thuần (trừ hoàn) · Page + tag" />
                </div>
              </section>

              <div role="tablist" aria-label="Nội dung team" className="flex gap-1 overflow-x-auto border-b border-line">
                {tabs.map((t) => (
                  <Link key={t.id} href={href(isAdmin ? team.id : null, t.id)} role="tab" aria-selected={tab === t.id} scroll={false}
                    className={`flex items-center gap-1.5 whitespace-nowrap rounded-t-md border-b-[3px] px-3 py-2 text-sm transition ${tab === t.id ? "border-accent bg-accent/10 font-bold text-accent" : "border-transparent text-ink-2 hover:bg-grid hover:text-ink-1"}`}>
                    {t.label}{t.count !== undefined && <span className={`rounded-md px-1.5 text-2xs font-semibold tabular-nums ${tab === t.id ? "bg-accent text-white" : "bg-grid text-ink-2"}`}>{t.count}</span>}
                  </Link>
                ))}
              </div>

              {tab === "pages" && (
                <PageLists channels={channels} teams={teams} scopeTeamId={team.id} isAdmin={isAdmin} canPick={canPick} />
              )}

              {tab === "members" && (
                <section className="overflow-hidden rounded-xl border border-line bg-surface">
                  {teamMembers.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-ink-muted">Team chưa có thành viên{isAdmin ? " — gán ở trang Người dùng." : "."}</p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {[...teamMembers].sort((a, b) => Number(b.is_team_lead) - Number(a.is_team_lead) || a.full_name.localeCompare(b.full_name, "vi")).map((m) => (
                        <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                          <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-2xs font-bold ${m.is_team_lead ? "bg-accent text-white" : "bg-grid text-ink-2"}`}>{initials(m.full_name)}</span>
                          <span className="min-w-0 flex-1 truncate font-medium">{m.full_name}</span>
                          <span className="text-xs text-ink-2">{ROLE_LABELS[m.role as keyof typeof ROLE_LABELS] ?? m.role}</span>
                          <span className={`w-24 rounded-md px-2 py-0.5 text-center text-2xs font-medium ${m.is_team_lead ? "bg-accent/10 text-accent" : "bg-grid text-ink-muted"}`}>{m.is_team_lead ? "Trưởng team" : "Thành viên"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="border-t border-line bg-page px-4 py-2 text-2xs text-ink-muted">Trưởng team chọn Page, tag và kết nối nguồn cho team; thành viên chỉ xem số liệu.</p>
                </section>
              )}

              {tab === "tags" && (
                <TagManager tags={tags} canPick={canPick} teamId={team.id} />
              )}

              {tab === "connect" && canPick && (
                <div className="space-y-3">
                  <section className="space-y-2">
                    <div>
                      <h2 className="text-base font-semibold">Chọn Page, Instagram, TikTok của team</h2>
                      <p className="text-xs text-ink-muted">Nguồn có sẵn trong hệ thống: bấm “Liên kết” để tính traffic của nguồn đó cho team {team.name}. Chưa thấy nguồn cần tìm thì kết nối mới ở bên dưới.</p>
                    </div>
                    <SourcePicker channels={channels.filter((c) => !c.team_id || c.team_id === team.id)} teamId={team.id} canPick={canPick} />
                  </section>
                  <ConnectForm teams={null} fixedTeamName={team.name} teamId={isAdmin ? team.id : undefined} />
                  <section className="space-y-2 rounded-xl border border-line bg-surface p-4 text-sm">
                    <h2 className="font-medium">🎵 Kết nối TikTok của team</h2>
                    <p className="text-xs text-ink-muted">
                      Chủ tài khoản TikTok (cá nhân hoặc Business) bấm nút, đăng nhập TikTok và đồng ý cấp quyền đọc video + số liệu cơ bản. Mỗi tài khoản kết nối một lần,
                      hệ thống tự gia hạn. TikTok chỉ trả số liệu cộng dồn của từng video nên số liệu theo ngày tính từ lúc kết nối.
                    </p>
                    {tiktokConfigured() ? (
                      <form method="get" action="/api/tiktok/connect" className="flex flex-wrap items-center gap-2">
                        {isAdmin && <input type="hidden" name="team" value={team.id} />}
                        <button className="rounded-lg bg-accent px-4 py-2 font-medium text-white hover:opacity-90">Kết nối TikTok cho team {team.name}</button>
                      </form>
                    ) : (
                      <p className="text-xs text-warn-ink">Chưa cấu hình TikTok: cần đặt TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REDIRECT_URI trên Vercel.</p>
                    )}
                  </section>
                  {isAdmin && <MetaAdmin />}
                </div>
              )}
            </>
          )}

          {/* ===== Quản lý danh sách team (chỉ Quản lý): thêm, đổi tên, ngừng / kích hoạt ===== */}
          {isAdmin && (
            <details className="group rounded-xl border border-line bg-surface">
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">Thêm / đổi tên / ngừng team <span className="font-normal text-ink-muted">· {adminTeams.length} team</span></summary>
              <div className="border-t border-line p-3"><TeamAdmin teams={adminTeams} users={adminUsers} /></div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
