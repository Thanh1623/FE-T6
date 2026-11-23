import "server-only";
import { unstable_cache } from "next/cache";
import { loadDailySales } from "@/lib/daily-sales";
import { TAG } from "@/lib/cache-tags";
import { sb, fetchAll } from "@/lib/supabase/admin";
import { listHandoffs, type Handoff, type HandoffStatus } from "@/lib/handoff";
import { gradeVideo, loadTrafficKpi } from "@/lib/rnd";

// Tổng quan giao mẫu cho Quản lý: mẫu nào đã giao cho team nào, team / kênh nào đã lên video, video nào đạt KPI (Win), team nào bán được bao nhiêu.
//   • Video của 1 phiếu = bài video / reel gắn mã mẫu, đăng ở kênh của team được giao, từ ngày giao việc (giống tab "Đã lên video").
//   • Video Win = đạt KPI Test Traffic mặc định theo chỉ số RIÊNG của video đó.
//   • SL bán của team = SL bán thuần (trừ hoàn, bỏ bảo hành) của mã mẫu ở các kênh / Page của team, từ ngày giao việc.

export type Video = {
  id: string; channelId: string; publishedAt: string; url: string | null; thumb: string | null; message: string | null;
  views: number; win: boolean | null; progress: number | null; kpiLines: string[];
};
export type TeamRef = { id: string; name: string };
export type ChannelRef = { id: string; name: string; platform: string; teamId: string | null };

export type Assignment = {
  handoffId: string; productId: string; team: TeamRef | null; status: HandoffStatus; deadline: string | null; createdAt: string; receivedAt: string | null; doneAt: string | null;
  note: string | null; teamNote: string | null;
  videos: Video[];
  posted: ChannelRef[]; notPosted: ChannelRef[];   // kênh của team: đã / chưa lên video cho mẫu này
  sold: number;                                    // SL bán thuần của team cho mẫu này
  soldByChannel: Record<string, number>;           // ... chia theo từng kênh / Page của team (để tính lại bảng Theo kênh khi lọc)
  views: number; winCount: number;
};
export type Sample = { productId: string; code: string; name: string; ownTeam: TeamRef | null; result: Handoff["result"]; assignments: Assignment[] };

export type TeamRow = {
  team: TeamRef; samples: number; byStatus: Record<HandoffStatus | "unassigned", number>; videos: number; winVideos: number; views: number; sold: number;
  channels: number; channelsPosted: number;
};
export type ChannelRow = { channel: ChannelRef; teamName: string | null; samples: number; videos: number; winVideos: number; views: number; sold: number };

export type Overview = {
  samples: Sample[]; teams: TeamRef[]; channels: ChannelRef[]; teamRows: TeamRow[]; channelRows: ChannelRow[];
  totals: { samples: number; assignments: number; teams: number; teamsPosted: number; channelsPosted: number; channelsTotal: number; videos: number; winVideos: number; sold: number };
};

const vnDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));

// Bảng "Theo team": thống kê CHỈ trên tập mẫu `samples` truyền vào (nên lọc theo mẫu thì số liệu team cũng chỉ tính các mẫu đó)
export function buildTeamRows(samples: Sample[], teams: TeamRef[], channels: ChannelRef[]): TeamRow[] {
  const chByTeam = new Map<string, ChannelRef[]>();
  for (const c of channels) if (c.teamId) chByTeam.set(c.teamId, [...(chByTeam.get(c.teamId) ?? []), c]);
  const live = (a: Assignment) => a.status !== "returned";
  const rows: TeamRow[] = [];
  for (const t of teams) {
    const mine = samples.flatMap((s) => s.assignments).filter((a) => a.team?.id === t.id);
    if (!mine.length) continue;
    const byStatus = { pending: 0, received: 0, developing: 0, done: 0, returned: 0, unassigned: 0 };
    for (const a of mine) byStatus[a.status] += 1;
    const ch = chByTeam.get(t.id) ?? [];
    const posted = new Set(mine.filter(live).flatMap((a) => a.posted.map((c) => c.id)));
    rows.push({
      team: t, samples: new Set(mine.map((a) => a.productId)).size, byStatus,
      videos: mine.reduce((n, a) => n + a.videos.length, 0), winVideos: mine.reduce((n, a) => n + a.winCount, 0),
      views: mine.reduce((n, a) => n + a.views, 0), sold: mine.reduce((n, a) => n + a.sold, 0), channels: ch.length, channelsPosted: posted.size,
    });
  }
  return rows.sort((a, b) => b.sold - a.sold || b.videos - a.videos);
}

// Bảng "Theo kênh": kênh của các team trong `teamRows`, thống kê chỉ trên tập mẫu `samples`
export function buildChannelRows(samples: Sample[], teamRows: TeamRow[], teams: TeamRef[], channels: ChannelRef[]): ChannelRow[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const assignedTeams = new Set(teamRows.map((r) => r.team.id));
  const assignments = samples.flatMap((s) => s.assignments);
  return channels.filter((c) => c.teamId && assignedTeams.has(c.teamId)).map((c) => {
    const vids = assignments.flatMap((a) => a.videos.filter((v) => v.channelId === c.id).map((v) => ({ v, productId: a.productId })));
    const sold = assignments.filter((a) => a.team?.id === c.teamId).reduce((n, a) => n + (a.soldByChannel[c.id] ?? 0), 0);
    return { channel: c, teamName: c.teamId ? teamById.get(c.teamId)?.name ?? null : null, samples: new Set(vids.map((x) => x.productId)).size, videos: vids.length,
      winVideos: vids.filter((x) => x.v.win).length, views: vids.reduce((t, x) => t + x.v.views, 0), sold };
  }).sort((a, b) => b.videos - a.videos || a.channel.name.localeCompare(b.channel.name));
}

export async function handoffOverview(): Promise<Overview> {
  const handoffs = await listHandoffs();
  const [{ data: teamsRaw }, { data: chRaw }, kpi] = await Promise.all([
    sb.core().from("teams").select("id, name").eq("is_active", true).order("name"),
    sb.social().from("channels").select("id, name, platform, team_id").eq("is_active", true).order("name"),
    loadTrafficKpi(),
  ]);
  const teams = (teamsRaw ?? []) as TeamRef[];
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const channels: ChannelRef[] = ((chRaw ?? []) as { id: string; name: string; platform: string; team_id: string | null }[]).map((c) => ({ id: c.id, name: c.name, platform: c.platform, teamId: c.team_id }));
  const chByTeam = new Map<string, ChannelRef[]>();
  for (const c of channels) if (c.teamId) chByTeam.set(c.teamId, [...(chByTeam.get(c.teamId) ?? []), c]);

  const codes = [...new Set(handoffs.map((h) => h.product?.code).filter(Boolean) as string[])];
  const { data: prods } = codes.length ? await sb.rnd().from("products").select("id, code, sapo_code, team_id").in("code", codes) : { data: [] };
  const prodByCode = new Map((prods ?? []).map((p) => [p.code as string, p as { id: string; code: string; sapo_code: string | null; team_id: string | null }]));

  const posts = codes.length ? await fetchAll<{ id: string; channel_id: string; published_at: string; product_codes: string[]; permalink_url: string | null; thumbnail_url: string | null; message: string | null; views: number; viewers: number; reactions: number; clicks: number }>((a, b) =>
    sb.social().from("posts").select("id, channel_id, published_at, product_codes, permalink_url, thumbnail_url, message, views, viewers, reactions, clicks")
      .overlaps("product_codes", codes).in("kind", ["video", "reel"]).order("published_at", { ascending: false }).order("id").range(a, b)) : [];

  const salesCodes = [...new Set([...prodByCode.values()].map((p) => (p.sapo_code ?? p.code).toUpperCase()))];
  const minDate = handoffs.length ? vnDay(handoffs.map((h) => h.created_at).sort()[0]) : null;
  const sales = salesCodes.length && minDate ? await loadDailySales({ codes: salesCodes, from: minDate }) : [];   // file đơn hàng đã nhập + số đồng bộ cho ngày ngoài khoảng file

  // ---- Phiếu → Assignment
  const samplesMap = new Map<string, Sample>();
  for (const h of handoffs) {
    const code = h.product?.code;
    if (!code) continue;
    const prod = prodByCode.get(code);
    const team = h.team_id ? teamById.get(h.team_id) ?? (h.teamName ? { id: h.team_id, name: h.teamName } : null) : null;
    const teamCh = h.team_id ? chByTeam.get(h.team_id) ?? [] : [];
    const chIds = new Set(teamCh.map((c) => c.id));
    const videos: Video[] = posts
      .filter((p) => p.product_codes.includes(code) && chIds.has(p.channel_id) && p.published_at >= h.created_at)
      .map((p) => {
        const g = gradeVideo({ views: Number(p.views), viewers: Number(p.viewers), reactions: Number(p.reactions), clicks: Number(p.clicks) }, kpi);
        return { id: p.id, channelId: p.channel_id, publishedAt: p.published_at, url: p.permalink_url, thumb: p.thumbnail_url, message: p.message, views: Number(p.views),
          win: g.trafficPass, progress: g.kpiProgress, kpiLines: g.kpiLines };
      });
    const postedIds = new Set(videos.map((v) => v.channelId));
    const sapo = ((prod?.sapo_code ?? code) as string).toUpperCase(), since = vnDay(h.created_at);
    const sold = h.team_id ? sales.filter((r) => r.code === sapo && r.date >= since && chIds.has(r.page_id)).reduce((t, r) => t + Number(r.qty_sold) - Number(r.qty_returned), 0) : 0;
    const soldByChannel: Record<string, number> = {};
    if (h.team_id) for (const c of teamCh) soldByChannel[c.id] = sales.filter((r) => r.code === sapo && r.date >= since && r.page_id === c.id).reduce((t, r) => t + Number(r.qty_sold) - Number(r.qty_returned), 0);
    const a: Assignment = {
      handoffId: h.id, productId: h.product_id, team, status: h.status, deadline: h.deadline, createdAt: h.created_at, receivedAt: h.received_at, doneAt: h.done_at,
      note: h.rnd_note, teamNote: h.saobien_note, videos,
      posted: teamCh.filter((c) => postedIds.has(c.id)), notPosted: teamCh.filter((c) => !postedIds.has(c.id)),
      sold, soldByChannel, views: videos.reduce((t, v) => t + v.views, 0), winCount: videos.filter((v) => v.win).length,
    };
    const s = samplesMap.get(h.product_id) ?? { productId: h.product_id, code, name: h.product?.name ?? code, ownTeam: h.product?.team_id ? teamById.get(h.product.team_id) ?? null : null, result: h.result, assignments: [] };
    s.assignments.push(a);
    samplesMap.set(h.product_id, s);
  }
  const samples = [...samplesMap.values()].sort((a, b) => b.assignments.length - a.assignments.length || a.code.localeCompare(b.code));

  const teamRows = buildTeamRows(samples, teams, channels);
  const channelRows = buildChannelRows(samples, teamRows, teams, channels);

  const all = samples.flatMap((s) => s.assignments);
  return {
    samples, teams, channels, teamRows, channelRows,
    totals: {
      samples: samples.length, assignments: all.filter((a) => a.team).length, teams: teamRows.length,
      teamsPosted: teamRows.filter((r) => r.videos > 0).length, channelsPosted: channelRows.filter((r) => r.videos > 0).length, channelsTotal: channelRows.length,
      videos: all.reduce((n, a) => n + a.videos.length, 0), winVideos: all.reduce((n, a) => n + a.winCount, 0), sold: all.reduce((n, a) => n + a.sold, 0),
    },
  };
}

// Bản có cache dùng chung (60 giây, hoặc xoá ngay khi phân công / đổi trạng thái phiếu): dựng dữ liệu mất ~1 giây (nhiều truy vấn), nên
// tìm kiếm / sắp xếp / chuyển trang lặp lại không phải truy vấn lại.
export const getHandoffOverview = unstable_cache(handoffOverview, ["handoff-overview-v2"], { tags: [TAG.handoffs, TAG.channels, TAG.teams], revalidate: 60 });
