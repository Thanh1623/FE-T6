import "server-only";
import { unstable_cache } from "next/cache";
import { fetchAll, sb } from "@/lib/supabase/admin";
import { TAG } from "@/lib/cache-tags";
import { loadDailySales } from "@/lib/daily-sales";
import { canonOf, canonPosts, expandCodes, loadSpuAliases } from "@/lib/spu-alias";
import { isSystemTestCode, isTestCode } from "@/lib/tags";
import type { WinFlags, WinRules } from "@/lib/spu-tracking";
import { videoWinOf, type VideoWinRule } from "@/lib/video-win";
import { loadFirstDays } from "@/lib/video-win-data";

// Thống kê video theo team / bảng đẩy hàng / trạng thái tồn của video cho Dashboard.
// Win Traffic / Win Đơn hàng / Ngôi sao (S2–S4) KHÔNG tính ở đây: quy tắc Win duy nhất nằm ở lib/spu-winflags.ts (cài đặt ở trang KPI) và dùng chung với trang Theo dõi đẩy hàng.
// "SPU Win Traffic" của bảng team dùng quy tắc Win (đánh giá cấp SPU). "Video Win" của bảng đẩy hàng là chấm RIÊNG TỪNG VIDEO theo cài đặt Video Win ở trang KPI, dựa trên số liệu N ngày đầu kể từ NGÀY ĐĂNG của chính video (khác quy tắc Win cấp SPU).

const DAY = 86_400_000;
const vnDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);

type Post = { id: string; viewers: number | null; channel_id: string; published_at: string; kind: string; product_codes: string[]; views: number | null; comments: number | null };
export type TeamVideoRow = { id: string; name: string; videos: number; codes: number; views: number; winCodes: number; winRate: number | null };
// Bảng thống kê video theo team: tổng video gắn mã SP, theo trạng thái tồn kho của SPU (bad / slow / hot — số mẫu), mã test, mã R&D
export type TeamBreakdownRow = { id: string; name: string; total: number; bad: number; slow: number; hot: number; test: number; rnd: number };
// Bảng đẩy hàng: mỗi (team, SPU R&D) — số video đăng, số video Win (đạt cài đặt Video Win ở trang KPI), số bán thuần trong kỳ của các Page của team
// verdict = đánh giá SẢN PHẨM (cấp SPU, tổng mọi team, theo kỳ lọc) bằng quy tắc Win duy nhất ở trang KPI — giống nút Win / Ngôi sao ở trang Theo dõi đẩy hàng
export type Verdict = "star" | "win" | "wintraffic" | null;
export type PushRow = { teamId: string; team: string; code: string; name: string; videos: number; winVideos: number; qty: number; verdict: Verdict };
export type StockStatus = "bad" | "slow" | "hot";
export type SpuWin = {
  s1: { newCodes: number; oldCodes: number };   // trong số SPU của thẻ S1 (SPU Active có video trong kỳ): bao nhiêu mã mới (R&D / test / đánh giá "mới"), bao nhiêu cũ
  teams: TeamVideoRow[];
  breakdown: TeamBreakdownRow[];
  push: PushRow[];
};

// Bài đăng gắn mã trong kỳ: lưu đệm DÙNG CHUNG theo từng TUẦN (lưới cố định 7 ngày → các kỳ lọc khác nhau dùng lại cùng đoạn; mỗi đoạn dưới giới hạn 2 MB của đệm, dạng mảng gọn), 5 phút, xoá khi đồng bộ / nhập file (TAG.spuData)
type PostTuple = [string, number | null, string, string, string, string[], number | null, number | null];
const WEEK = 7 * DAY;
const postWeek = unstable_cache(async (fromDay: string, toDay: string, pageIds: string[] | null): Promise<PostTuple[]> => {
  const rows = await fetchAll<Post>((a, b) => {
    let q = sb.social().from("posts").select("id, viewers, channel_id, published_at, kind, product_codes, views, comments")
      .neq("product_codes", "{}").gte("published_at", `${fromDay}T00:00:00+07:00`).lte("published_at", `${toDay}T23:59:59+07:00`);
    if (pageIds) q = q.in("channel_id", pageIds.length ? pageIds : ["-"]);
    return q.order("published_at").order("id").range(a, b);
  });
  return rows.map((r) => [r.id, r.viewers, r.channel_id, r.published_at, r.kind, r.product_codes, r.views, r.comments]);
}, ["spu-win-posts", "v1"], { tags: [TAG.spuData], revalidate: 21_600 });
async function loadPostsCached(from: string, to: string, pageIds: string[] | null): Promise<Post[]> {
  const ids = pageIds ? [...pageIds].sort() : null;
  const start = Math.floor(Date.parse(from) / WEEK) * WEEK, end = Date.parse(to);
  const parts: Promise<PostTuple[]>[] = [];
  for (let t = start; t <= end; t += WEEK) parts.push(postWeek(new Date(t).toISOString().slice(0, 10), new Date(t + WEEK - DAY).toISOString().slice(0, 10), ids));
  const lo = Date.parse(`${from}T00:00:00+07:00`), hi = Date.parse(`${to}T23:59:59+07:00`);
  const out: Post[] = [];
  for (const part of await Promise.all(parts)) for (const r of part) { const ms = Date.parse(r[3]); if (ms >= lo && ms <= hi) out.push({ id: r[0], viewers: r[1], channel_id: r[2], published_at: r[3], kind: r[4], product_codes: r[5], views: r[6], comments: r[7] }); }
  return out;
}

// Mỗi mã SPU: ngày bài đầu tiên + view / bình luận trong cửa sổ N ngày đầu (N theo quy tắc Win ở trang KPI)
function trafficOf(posts: Post[], wr: WinRules) {
  const first = new Map<string, string>();
  for (const p of posts) for (const c of p.product_codes) { const d = vnDay(p.published_at); if (!first.has(c) || d < first.get(c)!) first.set(c, d); }
  const out = new Map<string, { first: string; views: number; comments: number; win: boolean }>();
  for (const [c, d] of first) out.set(c, { first: d, views: 0, comments: 0, win: false });
  for (const p of posts) {
    const d = vnDay(p.published_at);
    for (const c of p.product_codes) {
      const o = out.get(c)!;
      if (d <= addDays(o.first, wr.traffic.days - 1)) { o.views += Number(p.views ?? 0); o.comments += Number(p.comments ?? 0); }
    }
  }
  for (const o of out.values()) o.win = o.views >= wr.traffic.views && o.comments >= wr.traffic.comments;
  return out;
}

// pageIds: Page đang lọc (null = toàn hệ thống; đã gộp lọc team + quyền) · channels: kênh bán tính số bán (rỗng = mọi kênh trừ bảo hành) · teams: team đang lọc (chỉ để lọc bảng theo team)
export async function spuWinStats(f: { from: string; to: string; teams: string[]; pageIds: string[] | null; channels: string[]; winRules: WinRules; videoWin: VideoWinRule; winFlags?: (codes: string[]) => Promise<WinFlags>; stockInfo?: Promise<{ stockStatus: Map<string, StockStatus>; s1Codes: Set<string> }> }): Promise<SpuWin> {   // stockInfo: lib/spu-dash (chỉ cần cho thẻ S1 và bảng theo team — chờ ở cuối để không kéo dài các truy vấn trên)
  // Bốn nhóm truy vấn KHÔNG phụ thuộc nhau (kênh + team · bài đăng · đánh giá + mẫu R&D) → bắt đầu cùng lúc, trước đây nối đuôi nhau 3 bước (~0,9 giây)
  const refsP = Promise.all([
    sb.social().from("channels").select("id, team_id").eq("is_active", true),
    sb.core().from("teams").select("id, name").eq("is_active", true).order("name"),
  ]);
  // Hai bảng nhỏ (đánh giá ~vài trăm dòng, mẫu R&D ~vài chục dòng): đọc cả bảng song song 1 lượt rồi lọc theo mã có trong kỳ
  const tablesP = Promise.all([
    fetchAll<{ code: string; age: string | null }>((a, b) => sb.rnd().from("evaluations").select("code, age").order("code").range(a, b)),
    fetchAll<{ code: string; name: string | null; sapo_code: string | null; stage: string | null; created_by: string | null }>((a, b) => sb.rnd().from("products").select("code, name, sapo_code, stage, created_by").not("code", "is", null).order("code").range(a, b)),
  ]);
  const teamChannels = f.pageIds;
  const allP = loadPostsCached(f.from, f.to, teamChannels);
  const [[{ data: chRaw }, { data: teamRaw }], allRaw, [evAll, prAll], aliases] = await Promise.all([refsP, allP, tablesP, loadSpuAliases()]);
  const canon = canonOf(aliases);
  const all = canonPosts(aliases, allRaw);   // mã SPU cũ đã đổi → gộp vào SPU mới (bảng quy đổi, migration 066)
  const chTeam = new Map((chRaw ?? []).map((c) => [c.id as string, (c.team_id as string | null) ?? null]));

  const traffic = trafficOf(all, f.winRules);
  const codes = [...traffic.keys()];

  // Mã mới / cũ: mẫu R&D (đang trong quy trình), mã test, hoặc hệ thống đánh giá là "new"
  const sysTest = new Set<string>(prAll.filter((p) => isSystemTestCode(p.code, p.created_by)).map((p) => p.code));   // mã test tạo trên hệ thống (mã đồ da / hồ sơ tự sinh không tính)
  const newCodes = new Set<string>(codes.filter((c) => sysTest.has(c)));
  const sapo = new Map<string, string>();
  const info = new Map<string, { name: string; rnd: boolean }>();
  for (const e of evAll) if (e.age === "new" && traffic.has(e.code)) newCodes.add(e.code);
  for (const p of prAll) {
    if (!traffic.has(p.code)) continue;
    info.set(p.code, { name: String(p.name ?? p.code), rnd: !!p.stage && !isTestCode(p.code) });
    if (p.stage) newCodes.add(p.code);
    if (p.sapo_code) sapo.set(p.code, String(p.sapo_code).toUpperCase());
  }
  const salesCode = (c: string) => sapo.get(c) ?? c.toUpperCase();

  // Theo team (team đăng video): số video, số SPU có video, lượt xem, SPU Win Traffic và tỉ lệ Win
  const teams: TeamVideoRow[] = (teamRaw ?? []).map((t) => {
    const mine = all.filter((p) => chTeam.get(p.channel_id) === t.id);
    const vids = mine.filter((p) => p.kind === "video" || p.kind === "reel");
    const tr = trafficOf(mine, f.winRules);
    const withVideo = new Set(vids.flatMap((p) => p.product_codes));
    const winCodes = [...withVideo].filter((c) => tr.get(c)?.win).length;
    return {
      id: t.id as string, name: t.name as string, videos: vids.length, codes: withVideo.size,
      views: vids.reduce((n, p) => n + Number(p.views ?? 0), 0), winCodes, winRate: withVideo.size ? winCodes / withVideo.size : null,
    };
  }).filter((t) => (f.teams.length ? f.teams.includes(t.id) : true)).sort((a, b) => b.videos - a.videos);

  // Bảng theo team: phân loại video theo mã SPU (một video có nhiều mã được tính vào mỗi nhóm có mã đó)
  const stockCtx = await f.stockInfo;   // chờ ở đây: các truy vấn nặng ở trên đã chạy song song với việc tải số liệu SPU
  const st = stockCtx?.stockStatus ?? new Map<string, StockStatus>();
  const teamName = new Map((teamRaw ?? []).map((t) => [t.id as string, t.name as string]));
  const teamOrder = (teamRaw ?? []).map((t) => t.id as string).filter((id) => (f.teams.length ? f.teams.includes(id) : true));
  const isVideo = (p: Post) => p.kind === "video" || p.kind === "reel";
  const isRnd = (c: string) => !!info.get(c)?.rnd;
  const breakdown: TeamBreakdownRow[] = teamOrder.map((id) => {
    const vids = all.filter((p) => isVideo(p) && chTeam.get(p.channel_id) === id);
    const has = (fn: (c: string) => boolean) => vids.filter((p) => p.product_codes.some(fn)).length;
    return { id, name: teamName.get(id)!, total: vids.length, bad: has((c) => st.get(c) === "bad"), slow: has((c) => st.get(c) === "slow"), hot: has((c) => st.get(c) === "hot"), test: has((c) => sysTest.has(c)), rnd: has(isRnd) };
  }).sort((a, b) => b.total - a.total);

  const push = new Map<string, PushRow>();
  // Video Win từng video: số liệu N ngày đầu kể từ ngày đăng (lib/video-win-data); thiếu thì dùng số hiện tại
  const pushVideos = all.filter((p) => { const tid = chTeam.get(p.channel_id); return isVideo(p) && !!tid && teamOrder.includes(tid) && p.product_codes.some(isRnd); });
  const first3d = await loadFirstDays(pushVideos.map((p) => p.id), f.winRules.traffic.days);
  for (const p of pushVideos) {
    const tid = chTeam.get(p.channel_id)!;
    const d = first3d.get(p.id);
    const win = videoWinOf(d ?? { views: Number(p.views ?? 0), viewers: p.viewers }, f.videoWin);
    for (const c of new Set(p.product_codes)) {
      if (!isRnd(c)) continue;
      const k = `${tid}\u0000${c}`, r = push.get(k) ?? { teamId: tid, team: teamName.get(tid)!, code: c.toUpperCase(), name: info.get(c)!.name, videos: 0, winVideos: 0, qty: 0, verdict: null };
      r.videos += 1; if (win) r.winVideos += 1;
      push.set(k, r);
    }
  }
  const pushCodes = [...new Set([...push.values()].map((r) => r.code))];
  if (pushCodes.length) {
    const rows = await loadDailySales({
      codes: expandCodes(aliases, [...new Set(pushCodes.map((c) => canon(salesCode(c))))]), from: f.from, to: f.to,
      channels: f.channels.length ? f.channels : undefined, pageIds: teamChannels ? (teamChannels.length ? teamChannels : ["-"]) : undefined,
    });
    const net = new Map<string, number>();   // team|mã bán → số bán thuần của các Page của team
    for (const r of rows) { const t = chTeam.get(r.page_id), c = canon(r.code); if (t) net.set(`${t}\u0000${c}`, (net.get(`${t}\u0000${c}`) ?? 0) + Number(r.qty_sold) - Number(r.qty_returned)); }
    for (const r of push.values()) r.qty = net.get(`${r.teamId}\u0000${canon(salesCode(r.code))}`) ?? 0;
  }
  const wf = await f.winFlags?.(pushCodes);   // đánh giá cấp SPU (tổng mọi team): Ngôi sao = đạt cả Win Traffic và Win Đơn hàng
  for (const r of push.values()) { const wt = !!wf?.wt.has(r.code), od = !!wf?.order.has(r.code); r.verdict = wt && od ? "star" : od ? "win" : wt ? "wintraffic" : null; }
  const order = new Map(teamOrder.map((id, i) => [id, i]));
  const pushRows = [...push.values()].sort((a, b) => (order.get(a.teamId)! - order.get(b.teamId)!) || b.videos - a.videos || b.qty - a.qty);

  return {
    // S1 = SPU Active có video trong kỳ (stockCtx.s1Codes, lib/spu-dash); chia mới / cũ theo đánh giá + quy trình R&D + mã test
    s1: (() => {
      const list = stockCtx ? [...stockCtx.s1Codes] : codes;
      const fresh = list.filter((c) => newCodes.has(c)).length;
      return { newCodes: fresh, oldCodes: list.length - fresh };
    })(),
    teams, breakdown, push: pushRows,
  };
}
