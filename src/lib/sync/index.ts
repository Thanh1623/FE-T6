import "server-only";
import { loadCodeLinks } from "@/lib/code-links";
import { GraphError, graph, graphAll } from "@/lib/meta/graph";
import { DEFAULT_RULES, parseTags, type HashtagRules } from "@/lib/tags";
import { PAGE_DAILY_COLUMNS, POST_COLUMNS, type DailyColumn, type PostColumn } from "@/lib/meta/metrics";
import { kindOf } from "@/lib/platforms";
import { fetchAll, fetchAllByKey, sb, supabaseOrders } from "@/lib/supabase/admin";
import { apiFreshFacebook } from "@/lib/sync/api-videos";
import { evaluateAll } from "@/lib/eval/engine";
import { TOKEN_LABELS, metaTokens, type TokenSource } from "@/lib/meta/token";
import { TAG, bust, bustSoft } from "@/lib/cache-tags";
import { pingRnd } from "@/lib/rnd-ping";
import { logSystem, type Actor } from "@/lib/system-log";
import { refreshProductMetrics } from "@/lib/rnd-metrics";
import { fetchApiCatalog, fetchApiSales, salesApiEnabled } from "@/lib/sales-api";
import { activeTikTok, syncTikTokChannel } from "@/lib/sync/tiktok";
import { activeYouTube, syncYouTubeChannel } from "@/lib/sync/youtube";
import { TT_NAME_PREFIX, normTikTokName } from "@/lib/tiktok/name";
import { pruneSnapshots, snapshotPosts } from "@/lib/sync/snapshots";

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 90; // Graph API giới hạn ~93 ngày mỗi request insights

type Channel = { id: string; platform: string; name: string; access_token: string; last_synced_at?: string | null };

type InsightValue = { value: number | Record<string, number>; end_time: string };
type Insight = { name: string; period?: string; values?: InsightValue[]; total_value?: { value: number | Record<string, number> } };

// Metric dạng object (vd. cảm xúc theo loại) → cộng dồn thành 1 số
function toNumber(v: number | Record<string, number> | undefined): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object") return Object.values(v).reduce((a, b) => a + b, 0);
  return 0;
}

// end_time của Meta là thời điểm KẾT THÚC ngày → lùi 1 ngày để ra ngày của số liệu
const metricDate = (endTime: string) => new Date(new Date(endTime).getTime() - DAY_MS).toISOString().slice(0, 10);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

// Tách hashtag từ nội dung bài (hỗ trợ tiếng Việt có dấu), chữ thường, bỏ trùng
export function extractHashtags(text?: string | null): string[] {
  if (!text) return [];
  const tags = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  return [...new Set(tags.map((t) => t.slice(1).toLowerCase()))];
}

async function log(job: string, channelId: string | null, status: "success" | "error", message: string, startedAt: Date) {
  await sb.core().from("sync_runs").insert({
    job, channel_id: channelId, status, message, started_at: startedAt.toISOString(), finished_at: new Date().toISOString(),
  });
  bust(TAG.sync);
}

function errMsg(e: unknown) {
  // Lỗi Supabase là object thường (không phải Error) nhưng có .message
  return e instanceof Error ? e.message : (e as { message?: string })?.message ?? JSON.stringify(e);
}

// ---------- Kênh + token ----------

// Đọc danh sách Trang mà token được giao (token cá nhân hoặc Người dùng hệ thống); lưu kênh (social.channels)
// và Page Token vĩnh viễn (kho private). Kênh không còn trong danh sách KHÔNG bị xoá — chỉ last_seen_at đứng lại.
export async function setupChannels(userToken: string, source: TokenSource = "user") {
  const pages = await graphAll<{
    id: string; name: string; access_token: string; followers_count?: number;
    instagram_business_account?: { id: string; username?: string; name?: string };
  }>("me/accounts", {
    fields: "id,name,access_token,followers_count,instagram_business_account{id,username,name}",
    access_token: userToken,
  });

  const seen = { token_source: source, last_seen_at: new Date().toISOString() };
  const fb = pages.map((p) => ({ id: p.id, platform: "facebook", name: p.name, followers_count: p.followers_count ?? null, ...seen }));
  const ig = pages.filter((p) => p.instagram_business_account).map((p) => ({
    id: p.instagram_business_account!.id, platform: "instagram",
    name: p.instagram_business_account!.name ?? p.instagram_business_account!.username ?? p.name,
    username: p.instagram_business_account!.username ?? null, parent_id: p.id, ...seen,
  }));
  // Chưa chạy migration 014 (thiếu cột token_source/last_seen_at) → lưu không kèm 2 cột đó
  const upsert = async (rows: Record<string, unknown>[]) => {
    let { error } = await sb.social().from("channels").upsert(rows);
    if (error?.code === "PGRST204") {
      ({ error } = await sb.social().from("channels").upsert(rows.map(({ token_source, last_seen_at, ...r }) => (void token_source, void last_seen_at, r))));
    }
    if (error) throw error;
  };
  await upsert(fb);
  if (ig.length) await upsert(ig);
  bust(TAG.channels);
  // Token: IG dùng chung token của Page cha
  for (const p of pages) {
    const { error: tErr } = await sb.social().rpc("save_channel_token", { p_channel_id: p.id, p_token: p.access_token });
    if (tErr) throw tErr;
    if (p.instagram_business_account) {
      await sb.social().rpc("save_channel_token", { p_channel_id: p.instagram_business_account.id, p_token: p.access_token });
    }
  }
  return [...fb, ...ig].map(({ id, platform, name }) => ({ id, platform, name }));
}

// Team tự kết nối Page: nhận token cá nhân CỦA NHÂN VIÊN (chỉ dùng 1 lần, KHÔNG lưu), đọc các Trang họ quản trị,
// lưu Page Token vĩnh viễn (kho private) và gán các Trang đó cho team. Trang đã thuộc team KHÁC thì bỏ qua (mỗi Trang 1 team).
export async function connectTeamPages(userToken: string, teamId: string) {
  const pages = await graphAll<{
    id: string; name: string; access_token: string; followers_count?: number;
    instagram_business_account?: { id: string; username?: string; name?: string };
  }>("me/accounts", {
    fields: "id,name,access_token,followers_count,instagram_business_account{id,username,name}",
    access_token: userToken,
  });
  const ids = pages.flatMap((p) => [p.id, p.instagram_business_account?.id].filter(Boolean) as string[]);
  const { data: existing, error: eErr } = ids.length ? await sb.social().from("channels").select("id, team_id").in("id", ids) : { data: [], error: null };
  if (eErr) throw eErr;
  const teamOf = new Map((existing ?? []).map((c) => [c.id as string, c.team_id as string | null]));
  const taken = (pageId: string) => { const t = teamOf.get(pageId); return !!t && t !== teamId; };
  const mine = pages.filter((p) => !taken(p.id));
  const skipped = pages.filter((p) => taken(p.id)).map((p) => ({ name: p.name, teamId: teamOf.get(p.id)! }));

  const seen = { token_source: "user", last_seen_at: new Date().toISOString(), team_id: teamId, is_active: true };
  const fb = mine.map((p) => ({ id: p.id, platform: "facebook", name: p.name, followers_count: p.followers_count ?? null, ...seen }));
  const ig = mine.filter((p) => p.instagram_business_account).map((p) => ({
    id: p.instagram_business_account!.id, platform: "instagram",
    name: p.instagram_business_account!.name ?? p.instagram_business_account!.username ?? p.name,
    username: p.instagram_business_account!.username ?? null, parent_id: p.id, ...seen,
  }));
  const upsert = async (rows: Record<string, unknown>[]) => {
    let { error } = await sb.social().from("channels").upsert(rows);
    if (error?.code === "PGRST204") {   // chưa chạy migration 014 (thiếu token_source / last_seen_at)
      ({ error } = await sb.social().from("channels").upsert(rows.map(({ token_source, last_seen_at, ...r }) => (void token_source, void last_seen_at, r))));
    }
    if (error) throw error;
  };
  if (fb.length) await upsert(fb);
  if (ig.length) await upsert(ig);
  for (const p of mine) {
    const { error: tErr } = await sb.social().rpc("save_channel_token", { p_channel_id: p.id, p_token: p.access_token });
    if (tErr) throw tErr;
    if (p.instagram_business_account) await sb.social().rpc("save_channel_token", { p_channel_id: p.instagram_business_account.id, p_token: p.access_token });
  }
  bust(TAG.channels);
  return { connected: [...fb, ...ig].map(({ platform, name }) => ({ platform, name })), skipped };
}

async function activeChannels(platform: string): Promise<Channel[]> {
  const channelsQ = async (cols: string) => sb.social().from("channels").select(cols).eq("is_active", true).eq("platform", platform);
  let res = await channelsQ("id, platform, name, last_synced_at");
  // Chưa chạy migration 020 (thiếu last_synced_at) → vẫn chạy được, chỉ không biết kênh nào cũ nhất
  if (res.error?.code === "42703" || res.error?.code === "PGRST204") res = await channelsQ("id, platform, name");
  const { data: tokens, error: tErr } = await sb.social().rpc("channel_tokens");
  if (res.error) throw res.error;
  if (tErr) throw tErr;
  const tokenOf = new Map((tokens as { channel_id: string; access_token: string }[]).map((t) => [t.channel_id, t.access_token]));
  return ((res.data ?? []) as unknown as Channel[]).filter((c) => tokenOf.has(c.id)).map((c) => ({ ...c, access_token: tokenOf.get(c.id)! }));
}

// ---------- Facebook: số liệu Trang theo ngày → social.channel_daily (dạng cột) ----------

async function syncChannelDaily(ch: Channel, days: number) {
  const until = new Date();
  const byDate = new Map<string, Record<string, number | string>>();
  const metrics = Object.keys(PAGE_DAILY_COLUMNS) as (keyof typeof PAGE_DAILY_COLUMNS)[];

  // Chia khoảng thời gian thành các đoạn ≤ 90 ngày
  for (let offset = 0; offset < days; offset += MAX_RANGE_DAYS) {
    const chunkUntil = new Date(until.getTime() - offset * DAY_MS);
    const chunkSince = new Date(chunkUntil.getTime() - Math.min(MAX_RANGE_DAYS, days - offset) * DAY_MS);
    const res = await graph<{ data: Insight[] }>(`${ch.id}/insights`, {
      metric: metrics.join(","), period: "day",
      since: isoDate(chunkSince), until: isoDate(chunkUntil), access_token: ch.access_token,
    });
    for (const m of res.data) {
      const col: DailyColumn | undefined = PAGE_DAILY_COLUMNS[m.name as keyof typeof PAGE_DAILY_COLUMNS];
      if (!col) continue;
      for (const v of m.values ?? []) {
        const date = metricDate(v.end_time);
        const row = byDate.get(date) ?? { channel_id: ch.id, date };
        row[col] = toNumber(v.value);
        byDate.set(date, row);
      }
    }
  }
  const rows = [...byDate.values()];
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await sb.social().from("channel_daily").upsert(rows.slice(i, i + 1000));
    if (error) throw error;
  }
  return rows.length;
}

// ---------- Facebook: bài đăng + chỉ số trọn đời → social.posts (dạng cột) ----------

async function syncPosts(ch: Channel, days: number) {
  const since = Math.floor((Date.now() - days * DAY_MS) / 1000);
  type FbPost = {
    id: string; message?: string; created_time: string; status_type?: string; permalink_url?: string; full_picture?: string;
    comments?: { summary?: { total_count?: number } }; shares?: { count?: number };
  };
  const base = "id,message,created_time,status_type,permalink_url,full_picture";
  // Trang nhiều bài + đếm bình luận có lúc vượt giới hạn dữ liệu của Meta (Graph lỗi 1 "reduce the amount of data")
  // → hỏi lại với trang nhỏ hơn (100 → 25 → 10 bài/lần)
  const fetchPosts = async (fields: string) => {
    for (const limit of ["100", "25", "10"]) {
      try {
        return await graphAll<FbPost>(`${ch.id}/published_posts`, { fields, since: String(since), limit, access_token: ch.access_token }, 100);
      } catch (e) {
        if (!(e instanceof GraphError) || e.code !== 1 || limit === "10") throw e;
      }
    }
    return [];
  };
  let withEngagement = true;
  let list: FbPost[];
  try {
    list = await fetchPosts(`${base},comments.summary(true).limit(0),shares`);
  } catch (e) {
    // Chưa cấp pages_read_user_content → vẫn đồng bộ phần còn lại (bình luận/chia sẻ để null)
    if (!(e instanceof GraphError) || e.code !== 10) throw e;
    withEngagement = false;
    list = await fetchPosts(base);
  }
  const posts = [...new Map(list.map((p) => [p.id, p])).values()];
  if (!posts.length) return 0;

  // Chỉ số trọn đời từng bài, 5 bài song song
  const stats = new Map<string, Partial<Record<PostColumn, number>>>();
  for (let i = 0; i < posts.length; i += 5) {
    await Promise.all(posts.slice(i, i + 5).map(async (p) => {
      const res = await graph<{ data: Insight[] }>(`${p.id}/insights`, {
        metric: Object.keys(POST_COLUMNS).join(","),
        period: "lifetime", // không có period, Meta trả thêm bản "day" (=0) cho vài metric
        access_token: ch.access_token,
      });
      const s: Partial<Record<PostColumn, number>> = {};
      for (const m of res.data.filter((x) => !x.period || x.period === "lifetime")) {
        const col = POST_COLUMNS[m.name as keyof typeof POST_COLUMNS];
        if (col) s[col] = toNumber(m.values?.[0]?.value ?? m.total_value?.value);
      }
      stats.set(p.id, s);
    }));
  }

  const now = new Date().toISOString();
  // Nhãn (product_codes…) KHÔNG ghi ở đây — retagPosts tính lại sau khi danh mục mã đã cập nhật
  const rows = posts.map((p) => {
    const s = stats.get(p.id);
    return {
      id: p.id, channel_id: ch.id, platform: ch.platform, published_at: p.created_time,
      kind: kindOf(p.status_type, p.permalink_url), message: p.message ?? null,
      permalink_url: p.permalink_url ?? null, thumbnail_url: p.full_picture ?? null, hashtags: extractHashtags(p.message),
      views: Number(s?.views ?? 0), viewers: Number(s?.viewers ?? 0), reactions: Number(s?.reactions ?? 0),
      clicks: Number(s?.clicks ?? 0), video_views: Number(s?.video_views ?? 0),
      ...(withEngagement ? { comments: p.comments?.summary?.total_count ?? 0, shares: p.shares?.count ?? 0 } : {}),
      stats_at: now,
    };
  });
  const { error } = await sb.social().from("posts").upsert(rows);
  if (error) throw error;
  await snapshotPosts(rows);   // ảnh chụp lượt xem + bình luận theo ngày → biểu đồ xu hướng và Win Traffic cuốn chiếu
  return posts.length;
}

// ---------- Làm mới chỉ số các bài CŨ gắn mã SP ----------
// Đồng bộ hằng ngày chỉ làm mới bài đăng trong `postDays` ngày gần nhất. Bài cũ gắn mã SP vẫn có thể bỗng nổi lên (hoặc đi kèm đợt bán mạnh),
// nên làm mới luân phiên: bài ngưng cập nhật lâu nhất làm trước, tối đa `maxPosts` bài / lần, dừng khi hết `budgetMs` (phần còn lại để lần sau).
// Mỗi bài được làm mới còn được chụp vào social.post_daily → tính "lượt xem trong N ngày" = hiệu hai ảnh chụp. Chỉ Facebook (TikTok làm mới theo kênh).
async function refreshCodedPosts(opts: { maxPosts: number; budgetMs: number; olderThanDays: number; staleHours: number }) {
  const started = Date.now();
  const olderThan = new Date(Date.now() - opts.olderThanDays * DAY_MS).toISOString();
  const staleBefore = new Date(Date.now() - opts.staleHours * 3_600_000).toISOString();
  const { data, error } = await sb.social().from("posts")
    .select("id, channel_id, platform, published_at, views, viewers, reactions, clicks, video_views, thumbnail_url")
    .neq("product_codes", "{}").eq("platform", "facebook").lt("published_at", olderThan)
    .or(`stats_at.is.null,stats_at.lt."${staleBefore}"`)
    .order("stats_at", { ascending: true, nullsFirst: true }).limit(opts.maxPosts);
  if (error) throw error;
  const todo = data ?? [];
  if (!todo.length) return "không có bài cũ cần làm mới";

  const tokens = new Map((await activeChannels("facebook")).map((c) => [c.id, c.access_token]));
  const now = new Date().toISOString();
  type Upd = {
    id: string; channel_id: string; platform: string; published_at: string; stats_at: string;
    views: number; viewers: number; reactions: number; clicks: number; video_views: number; thumbnail_url: string | null;
  };
  const updated: Upd[] = [];
  const touchedIds: string[] = [];
  let failed = 0, waiting = 0;
  for (let i = 0; i < todo.length; i += 5) {
    if (Date.now() - started > opts.budgetMs) { waiting = todo.length - i; break; }
    await Promise.all(todo.slice(i, i + 5).map(async (p) => {
      const base: Upd = {
        id: p.id as string, channel_id: p.channel_id as string, platform: p.platform as string, published_at: p.published_at as string, stats_at: now,
        views: Number(p.views ?? 0), viewers: Number(p.viewers ?? 0), reactions: Number(p.reactions ?? 0), clicks: Number(p.clicks ?? 0), video_views: Number(p.video_views ?? 0),
        thumbnail_url: (p.thumbnail_url as string | null) ?? null,
      };
      const token = tokens.get(base.channel_id);
      if (!token) { failed++; touchedIds.push(base.id); return; }
      try {
        const res = await graph<{ data: Insight[] }>(`${base.id}/insights`, {
          metric: Object.keys(POST_COLUMNS).join(","), period: "lifetime", access_token: token,
        });
        const st: Partial<Record<PostColumn, number>> = {};
        for (const m of res.data.filter((x) => !x.period || x.period === "lifetime")) {
          const col = POST_COLUMNS[m.name as keyof typeof POST_COLUMNS];
          if (col) st[col] = toNumber(m.values?.[0]?.value ?? m.total_value?.value);
        }
        // Link ảnh bìa của Facebook (scontent…fbcdn) HẾT HẠN sau vài tuần → lấy lại link mới cùng lúc (lỗi thì giữ link cũ)
        const pic = await graph<{ full_picture?: string }>(`${base.id}`, { fields: "full_picture", access_token: token }).catch(() => null);
        updated.push({ ...base, ...st, ...(pic?.full_picture ? { thumbnail_url: pic.full_picture } : {}) });
      } catch {
        // Bài đã xoá / token mất quyền: đánh dấu đã thử để không chặn đầu hàng đợi (thử lại sau staleHours)
        failed++; touchedIds.push(base.id);
      }
    }));
  }

  if (updated.length) {
    for (let i = 0; i < updated.length; i += 500) {
      const { error: uErr } = await sb.social().from("posts").upsert(updated.slice(i, i + 500));
      if (uErr) throw uErr;
    }
  }

  if (touchedIds.length) {
    for (let i = 0; i < touchedIds.length; i += 500) {
      const { error: tErr } = await sb.social().from("posts").update({ stats_at: now }).in("id", touchedIds.slice(i, i + 500));
      if (tErr) console.warn("touch stats_at failed:", tErr.message);
    }
  }

  await snapshotPosts(updated.map((u) => ({ id: u.id, published_at: u.published_at, views: u.views, reactions: u.reactions, viewers: u.viewers, clicks: u.clicks })), { includeOld: true });
  return `${updated.length}/${todo.length} bài cũ gắn mã được làm mới${failed ? `, ${failed} lỗi` : ""}${waiting ? `, còn ${waiting} bài chờ lần sau` : ""}`;
}

// ---------- Qlydonhang: số bán + danh mục ----------

// Hàm RPC bên Qlydonhang tính lại toàn bộ mỗi trang (1000 dòng) nên thi thoảng chạm giới hạn thời gian của DB
// ("canceling statement due to statement timeout") lúc DB đang bận → thử lại vài lần trước khi coi là lỗi thật.
async function withRetry<T extends { error: { message?: string } | null }>(run: () => PromiseLike<T>, tries = 3): Promise<T> {
  for (let n = 1; ; n++) {
    const res = await run();
    if (!res.error || n >= tries || !/timeout|fetch failed|ECONNRESET|50[234]/i.test(res.error.message ?? "")) return res;
    await new Promise((r) => setTimeout(r, 2000 * n));
  }
}

// Ưu tiên hàm 005 (1 lần tính, trả mảng jsonb; khoảng dài chia theo 90 ngày). Chưa chạy migration 005 → dùng cách cũ phân trang 1000 dòng.
async function fetchSalesRows<T>(since: string): Promise<T[]> {
  const out: T[] = [];
  const today = isoDate(new Date());
  for (let from = since; from <= today; ) {
    const next = isoDate(new Date(Date.parse(from) + 90 * DAY_MS));
    const last = next > today;
    // Ưu tiên hàm chỉ-số-lượng (supabase/qlydonhang/007); chưa chạy 007 → dùng hàm cũ (bỏ qua cột tiền)
    if (salesApiEnabled()) {   // REST API (SALES_API_URL) thay cho RPC Qlydonhang
      out.push(...(await fetchApiSales(from, last ? null : next) as unknown as T[]));
      if (last) break;
      from = next;
      continue;
    }
    const call = (fn: string) => withRetry(() => supabaseOrders().rpc(fn, { p_since: from, p_until: last ? null : next }));
    const missingFn = (e: { code?: string; message?: string } | null) => !!e && /PGRST202|Could not find the function/i.test(`${e.code ?? ""} ${e.message ?? ""}`);
    let { data, error } = await call("fb_product_daily_qty_json");
    if (missingFn(error)) ({ data, error } = await call("fb_product_daily_sales_json"));
    if (error) {
      if (/PGRST202|Could not find the function/i.test(`${(error as { code?: string }).code ?? ""} ${error.message ?? ""}`)) return fetchSalesRowsPaged<T>(since);
      throw error;
    }
    out.push(...((data as T[] | null) ?? []));
    if (last) break;
    from = next;
  }
  return out;
}

async function fetchSalesRowsPaged<T>(since: string): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await withRetry(() => supabaseOrders()
      .rpc("fb_product_daily_sales", { p_since: since })
      .order("sale_date").order("product_code").order("page_id").order("channel")
      .range(from, from + 999));
    if (error) throw error;
    all.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return all;
}

async function syncSales(days: number) {
  const since = isoDate(new Date(Date.now() - days * DAY_MS));
  type Row = {
    sale_date: string; product_code: string; page_id: string; channel: string; qty_sold: number; qty_returned: number;
  };
  const all = await fetchSalesRows<Row>(since);

  // Đơn của tài khoản TikTok (tag tiktok_business_<tên>) → ghép với kênh TikTok cùng TÊN HIỂN THỊ để có số bán theo kênh
  const { data: ttChannels } = await sb.social().from("channels").select("id, name").eq("platform", "tiktok").eq("is_active", true);
  const ttByName = new Map((ttChannels ?? []).map((c) => [normTikTokName(c.name as string), c.id as string]));
  const matched = new Map<string, string>();   // 'ttn:<tên>' → ID kênh
  const resolvePage = (pid: string) => {
    if (!pid.startsWith(TT_NAME_PREFIX)) return pid;
    const id = ttByName.get(pid.slice(TT_NAME_PREFIX.length));
    if (id) matched.set(pid, id);
    return id ?? pid;
  };
  const rows = all.map((r) => ({
    code: r.product_code, date: r.sale_date, page_id: resolvePage(r.page_id ?? ""), channel: r.channel ?? "khac",
    qty_sold: r.qty_sold, qty_returned: r.qty_returned,
  }));
  // Dòng cũ còn mang khoá 'ttn:<tên>': ngày cũ hơn kỳ đồng bộ → đổi sang ID kênh; ngày trong kỳ → xoá (bản ghi mới sắp ghi thay thế, tránh tính 2 lần)
  for (const [key, id] of matched) {
    await sb.sales().from("daily_sales").update({ page_id: id }).eq("page_id", key).lt("date", since);   // lỗi trùng khoá (hiếm) được bỏ qua
    const { error } = await sb.sales().from("daily_sales").delete().eq("page_id", key).gte("date", since);
    if (error) throw error;
  }
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await sb.sales().from("daily_sales").upsert(rows.slice(i, i + 1000));
    if (error) throw error;
  }
  return rows.length;
}

async function syncCatalog() {
  type Row = { product_code: string; name: string; image_url: string | null; base_masp: string; first_seen_at?: string | null };
  const all: Row[] = salesApiEnabled() ? await fetchApiCatalog() : [];
  for (let from = 0; !salesApiEnabled(); from += 1000) {
    const { data, error } = await withRetry(() => supabaseOrders().rpc("fb_product_catalog").order("product_code").range(from, from + 999));
    if (error) throw error;
    all.push(...(data as Row[]));
    if (data.length < 1000) break;
  }
  const rows = all.map((r) => ({ code: r.product_code, name: r.name, image_url: r.image_url, base_masp: r.base_masp, first_seen_at: r.first_seen_at ?? null }));
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await sb.sales().from("catalog").upsert(rows.slice(i, i + 1000));
    if (error) throw error;
  }
  return rows.length;
}

// ---------- Tách hashtag: mã SP chỉ nhận nếu có trong catalog hoặc rnd.products ----------

export async function retagPosts() {
  const [{ data: rulesRow }, { data: rnd }, catalog] = await Promise.all([
    sb.core().from("settings").select("value").eq("key", "hashtag_rules").maybeSingle(),
    fetchAll<{ code: string | null }>((a, b) => sb.rnd().from("products").select("code").order("id").range(a, b)).then((data) => ({ data })),   // phân trang: bảng > 1.000 hồ sơ
    fetchAll<{ code: string }>((a, b) => sb.sales().from("catalog").select("code").order("code").range(a, b)),
  ]);
  const rules = { ...DEFAULT_RULES, ...((rulesRow?.value as Partial<HashtagRules>) ?? {}) };
  const known = new Set(catalog.map((c) => c.code));
  // Chỉ code (= mã Sapo). sapo_code cũ không còn là hashtag thứ 2 → không sinh mẫu tự động trùng
  for (const r of rnd ?? []) if (r.code) known.add(r.code);
  for (const l of await loadCodeLinks()) known.add(l.sku_code);   // mã SPU đã gắn cho mẫu Media test (migration 035)

  type Row = {
    id: string; channel_id: string; platform: string; published_at: string;
    views: number; viewers: number; reactions: number; clicks: number; video_views: number;
    hashtags: string[]; product_codes: string[]; unknown_codes: string[];
    content_line: string | null; concept: string | null; staff_code: string | null;
  };
  // Đọc theo id (khoá duy nhất) thay cho OFFSET: cả bảng ~53 nghìn bài, OFFSET sâu từng chiếm ~17% tổng thời gian DB (xem lib/paging.ts)
  const POST_COLS = "id, channel_id, platform, published_at, views, viewers, reactions, clicks, video_views, hashtags, product_codes, unknown_codes, content_line, concept, staff_code";
  const posts = await fetchAllByKey<Row>(
    (after, limit) => { let q = sb.social().from("posts").select(POST_COLS); if (after) q = q.gt("id", after); return q.order("id").limit(limit); },
    (r) => r.id,
    () => fetchAll<Row>((a, b) => sb.social().from("posts").select(POST_COLS).order("id").range(a, b)),
  );

  // Gắn tay từ trang "Thư viện SP mới" (social.post_links): hợp nhất với mã tách từ hashtag để lần tách này không xoá mất
  const manual = new Map<string, string[]>();
  const { data: links, error: lErr } = await sb.social().from("post_links").select("post_id, product_id");
  if (!lErr && links?.length) {
    const { data: lp } = await sb.rnd().from("products").select("id, code").in("id", [...new Set(links.map((l) => l.product_id as string))]);
    const codeOf = new Map((lp ?? []).filter((p) => p.code).map((p) => [p.id as string, String(p.code).toUpperCase()]));
    for (const l of links) { const c = codeOf.get(l.product_id as string); if (c) manual.set(l.post_id as string, [...(manual.get(l.post_id as string) ?? []), c]); }
  }

  // Mã SPU gắn tay (social.post_codes, migration 081): cũng được hợp nhất để lần tách hashtag không xoá mất
  const { data: mc, error: mcErr } = await sb.social().from("post_codes").select("post_id, code");
  if (!mcErr) for (const m of mc ?? []) manual.set(m.post_id as string, [...(manual.get(m.post_id as string) ?? []), String(m.code).toUpperCase()]);

  const changed = [];
  for (const p of posts) {
    const t = parseTags(p.hashtags, known, rules);
    for (const c of manual.get(p.id) ?? []) {
      if (!t.product_codes.includes(c)) t.product_codes.push(c);
      t.unknown_codes = t.unknown_codes.filter((u) => u !== c);
    }
    const same = t.content_line === p.content_line && t.concept === p.concept && t.staff_code === p.staff_code
      && t.product_codes.join() === p.product_codes.join() && t.unknown_codes.join() === p.unknown_codes.join();
    // upsert theo lô cần đủ cột NOT NULL (channel_id, platform, published_at, views...)
    if (!same) {
      changed.push({
        id: p.id,
        channel_id: p.channel_id,
        platform: p.platform,
        published_at: p.published_at,
        views: Number(p.views ?? 0),
        viewers: Number(p.viewers ?? 0),
        reactions: Number(p.reactions ?? 0),
        clicks: Number(p.clicks ?? 0),
        video_views: Number(p.video_views ?? 0),
        ...t,
      });
    }
  }
  for (let i = 0; i < changed.length; i += 200) {
    const part = changed.slice(i, i + 200);   // lô nhỏ + thử lại khi DB đang bận (statement timeout)
    let { error } = await sb.social().from("posts").upsert(part);
    for (let n = 1; n <= 3 && error && /statement timeout/i.test(error.message); n++) {
      await new Promise((r) => setTimeout(r, 1500 * n));
      ({ error } = await sb.social().from("posts").upsert(part));
    }
    if (error) throw error;
  }
  return changed.length;
}

// ---------- Đồng bộ toàn bộ ----------

// days: số ngày lùi lại cho số liệu theo ngày. Kênh mới / DB trống tự kéo 365 ngày.
export type SyncOptions = {
  by?: Actor;              // người bấm nút đồng bộ (có thì ghi nhật ký là thao tác của người đó; không có = chạy tự động)
  days?: number; postDays?: number;
  budgetMs?: number;       // ngừng KHỞI ĐỘNG kênh mới sau thời gian này (còn dư để kênh đang chạy kịp xong trong giới hạn 300 giây)
  concurrency?: number;    // số kênh chạy song song
  minAgeMin?: number;      // kênh vừa đồng bộ trong N phút thì bỏ qua (tránh chạy lại kênh còn mới)
  heavy?: "auto" | boolean;   // số bán / hashtag / đánh giá: auto = chỉ chạy khi lần trước cách đây > heavyEveryMin
  heavyEveryMin?: number;
  onBatch?: (b: { left: number }) => void;   // báo số kênh còn chờ sau lô này (để nối lô kế tiếp)
};

// Khoá chống chạy CHỒNG: bấm "Đồng bộ" rồi F5 bấm lại (hoặc nút bấm trùng lịch tự động) sẽ chạy 2 lần đồng bộ cùng lúc, tranh nhau DB và gây "statement timeout".
// Khoá lưu ở core.settings (key sync_lock); tự hết hạn sau 6 phút phòng khi một lần chạy bị ngắt giữa chừng (hàm tối đa 5 phút).
const SYNC_LOCK = "sync_lock", SYNC_LOCK_TTL_MS = 6 * 60_000;
export async function syncAll(opts: SyncOptions = {}) {
  const { data: cur } = await sb.core().from("settings").select("value").eq("key", SYNC_LOCK).maybeSingle();
  const at = Number((cur?.value as { at?: number } | null)?.at ?? 0);
  if (at && Date.now() - at < SYNC_LOCK_TTL_MS) {
    return [{ account: "Đồng bộ", ok: false, message: `Đang có một lần đồng bộ khác chạy (bắt đầu ${Math.round((Date.now() - at) / 1000)} giây trước) — chờ nó xong rồi bấm lại` }];
  }
  await sb.core().from("settings").upsert({ key: SYNC_LOCK, value: { at: Date.now() } });
  try {
    const t0 = Date.now(), results = await syncAllRun(opts), bad = results.filter((r) => !r.ok);
    if (results.length) await logSystem({ kind: "sync_all", ok: !bad.length, summary: `${results.length} bước, ${bad.length} lỗi${bad[0] ? ` · ${bad[0].account}: ${bad[0].message}` : ""}`,
      detail: { ms: Date.now() - t0, days: opts.days, errors: bad.slice(0, 5).map((r) => ({ account: r.account, message: r.message })) }, actor: opts.by ?? null });
    return results;
  }
  finally { await sb.core().from("settings").delete().eq("key", SYNC_LOCK); }
}

async function syncAllRun({ days = 3, postDays = 30, budgetMs = 190_000, concurrency = 4, minAgeMin = 45, heavy = "auto", heavyEveryMin = 180, onBatch }: SyncOptions = {}) {
  const startedMs = Date.now();
  const results: { account: string; ok: boolean; message: string }[] = [];
  const step = async (job: string, label: string, fn: () => Promise<string>, channelId: string | null = null, report = true) => {
    const startedAt = new Date();
    try {
      const msg = await fn();
      await log(job, channelId, "success", msg, startedAt);
      if (report) results.push({ account: label, ok: true, message: msg });
    } catch (e) {
      await log(job, channelId, "error", errMsg(e), startedAt);
      results.push({ account: label, ok: false, message: errMsg(e) });
    }
  };

  // Quyết định có chạy phần "nặng" (số bán, hashtag, đánh giá) lần này không
  const lastHeavy = await sb.core().from("sync_runs").select("finished_at").eq("job", "evaluate").eq("status", "success")
    .order("finished_at", { ascending: false }).limit(1).maybeSingle();
  const lastHeavyAt = lastHeavy.data?.finished_at ? Date.parse(lastHeavy.data.finished_at) : 0;
  const runHeavy = heavy === true || (heavy === "auto" && Date.now() - lastHeavyAt > heavyEveryMin * 60_000);

  // Tự phát hiện kênh mới qua từng token (cá nhân, Người dùng hệ thống). Token hết hạn/lỗi thì bỏ qua —
  // các kênh cũ vẫn chạy bằng Page Token vĩnh viễn đã lưu. Chỉ làm khi chạy phần nặng (không cần mỗi lô).
  if (runHeavy) {
    for (const t of metaTokens()) {
      await step("setup", `Danh sách Trang (${TOKEN_LABELS[t.source]})`,
        async () => `${(await setupChannels(t.token, t.source)).length} kênh`, `token:${t.source}`, false);
    }
  }

  // Theo lô: kênh CHƯA TỪNG đồng bộ trước, rồi kênh cũ nhất; bỏ kênh vừa đồng bộ gần đây; dừng khởi động kênh mới khi hết ngân sách thời gian.
  // Hàng đợi chung cho mọi nền tảng (Facebook + TikTok); mỗi kênh chạy bộ nối của nền tảng mình.
  type Job = { id: string; name: string; platform: "facebook" | "tiktok" | "youtube"; last_synced_at?: string | null; run: () => Promise<string> };
  // Page có trong API video VÀ API còn cập nhật → dữ liệu video lấy từ API (cron /api/cron/videos), KHÔNG đồng bộ trực tiếp qua Meta Graph nữa; Page không có trong API (hoặc API đứng yên) vẫn đồng bộ trực tiếp.
  // Hệ quả: số liệu cấp Page theo ngày (social.channel_daily: lượt xem Page, follow…) của các Page đó không còn cập nhật — API video không có loại số liệu này.
  const fbToken = await activeChannels("facebook");
  const fbFromApi = await apiFreshFacebook(fbToken.map((c) => c.id));
  const fbAll = fbToken.filter((c) => !fbFromApi.has(c.id));
  // Page lấy từ API không còn được đồng bộ trực tiếp nên KHÔNG còn bản ghi mới nào trong nhật ký → lỗi cũ (vd Graph 190) là bản ghi mới nhất của kênh và hiện mãi trên banner.
  // Ghi một bản ghi THÀNH CÔNG cho kênh nào đang có lỗi là bản ghi mới nhất (kênh không lỗi thì không ghi, tránh làm rối nhật ký).
  if (fbFromApi.size) {
    const { data: recent } = await sb.core().from("sync_runs").select("channel_id, status, started_at").eq("job", "channel").in("channel_id", [...fbFromApi])
      .order("started_at", { ascending: false }).limit(400);
    const latest = new Map<string, string>();
    for (const r of recent ?? []) if (!latest.has(r.channel_id as string)) latest.set(r.channel_id as string, r.status as string);
    const stamp = new Date().toISOString();
    const rows = [...latest].filter(([, st]) => st === "error").map(([channel_id]) => ({ job: "channel", channel_id, status: "success", message: "Lấy video từ API (không đồng bộ trực tiếp qua Meta)", started_at: stamp, finished_at: stamp }));
    if (rows.length) await sb.core().from("sync_runs").insert(rows);
  }
  const ttAll = await activeTikTok();
  const ytAll = await activeYouTube();   // trống khi chưa cấu hình YOUTUBE_API_KEY
  const all: Job[] = [
    ...fbAll.map((ch): Job => ({
      id: ch.id, name: ch.name, platform: "facebook", last_synced_at: ch.last_synced_at,
      run: async () => {
        const { count } = await sb.social().from("channel_daily").select("*", { count: "exact", head: true }).eq("channel_id", ch.id);
        const isNew = !count;
        const d = await syncChannelDaily(ch, isNew ? Math.max(days, 365) : days);
        const p = await syncPosts(ch, isNew ? Math.max(postDays, 90) : postDays);
        return `${isNew ? "Kênh mới, " : ""}${d} ngày số liệu, ${p} bài đăng`;
      },
    })),
    ...ttAll.map((ch): Job => ({
      id: ch.id, name: ch.name, platform: "tiktok", last_synced_at: ch.last_synced_at,
      run: async () => {
        const r = await syncTikTokChannel(ch, Math.max(postDays, 30), extractHashtags);
        return `TikTok: ${r.posts} video, +${r.newViews} lượt xem mới`;
      },
    })),
    ...ytAll.map((ch): Job => ({
      id: ch.id, name: ch.name, platform: "youtube", last_synced_at: ch.last_synced_at,
      run: async () => {
        const r = await syncYouTubeChannel(ch, Math.max(postDays, 30), extractHashtags);
        return `YouTube: ${r.posts} video, +${r.newViews} lượt xem mới`;
      },
    })),
  ];
  const ageOk = (c: Job) => !c.last_synced_at || Date.now() - Date.parse(c.last_synced_at) > minAgeMin * 60_000;
  const queue = all.filter(ageOk).sort((x, y) => (x.last_synced_at ? Date.parse(x.last_synced_at) : 0) - (y.last_synced_at ? Date.parse(y.last_synced_at) : 0));
  const eligible = queue.length;
  let done = 0, cut = false;
  const worker = async () => {
    for (;;) {
      if (Date.now() - startedMs > budgetMs) { cut = true; return; }
      const ch = queue.shift();
      if (!ch) return;
      await step("channel", ch.name, ch.run, ch.id);
      done++;
      // Cả khi lỗi cũng ghi mốc thời gian để kênh hỏng không chặn đầu hàng đợi (lỗi vẫn hiện ở nhật ký)
      await sb.social().from("channels").update({ last_synced_at: new Date().toISOString() }).eq("id", ch.id);   // chưa chạy migration 020 → lỗi được bỏ qua
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  const left = queue.length;
  results.push({
    account: "Đồng bộ theo lô", ok: true,
    message: `${done}/${eligible} kênh đến lượt đã đồng bộ${fbFromApi.size ? ` · ${fbFromApi.size} Page lấy video từ API (không đồng bộ trực tiếp)` : ""}${left ? ` · còn ${left} kênh chờ lượt sau (bấm lại hoặc chờ lần tự động)` : ""}`
      + `${all.length - eligible > 0 ? ` · ${all.length - eligible} kênh còn mới nên bỏ qua` : ""}${cut ? " · dừng sớm vì hết thời gian" : ""}`,
  });
  // Chỉ xoá bộ đệm + làm mới bảng tổng hợp SPU khi dữ liệu THẬT SỰ đổi (làm mới tốn 35–100 giây CPU database mỗi lần):
  //  • lượt có phần nặng (đổi danh mục / số bán / đánh giá) → làm mới MỘT lần ở cuối lượt, sau khi phần nặng xong (xem dưới)
  //  • lượt chỉ đồng bộ bài đăng → chỉ làm khi có bài / video gắn mã được ghi lại kể từ lần làm mới trước
  bustSoft(TAG.sync);
  const heavyWillRun = runHeavy && Date.now() - startedMs <= 215_000;
  if (!heavyWillRun) {
    void import("@/lib/spu-summary").then(async (m) => {
      if (done > 0 && (await m.postsChangedSinceSummary())) { bustSoft(TAG.spuData); m.scheduleSpuSummaryRefresh(); }
    }).catch(() => {});
  }
  // Chưa chạy migration 020 (không có last_synced_at) thì không nối lô: lô sau sẽ lặp lại đúng các kênh đã làm
  onBatch?.({ left: all.length && "last_synced_at" in all[0] ? left : 0 });

  // Phần nặng chỉ chạy khi còn đủ thời gian (khoảng 60 giây)
  if (!runHeavy || Date.now() - startedMs > 215_000) {
    pingRnd();
    return results;
  }

  if (process.env.ORDERS_SUPABASE_URL) {
    // Danh mục trước số bán / tách hashtag (mã SP được nhận diện theo danh mục)
    await step("catalog", "Danh mục sản phẩm", async () => `${await syncCatalog()} mã sản phẩm`, null, false);
    await step("sales", "Số bán (Qlydonhang)", async () => {
      const { count } = await sb.sales().from("daily_sales").select("*", { count: "exact", head: true });
      // DB trống → 1 năm; còn lại lùi ≥ 30 ngày vì đơn cũ có thể huỷ/hoàn muộn
      return `${await syncSales(count ? Math.max(days, 30) : 365)} dòng số bán`;
    });
  }

  await step("retag", "Tách hashtag", async () => `${await retagPosts()} bài cập nhật nhãn`, null, false);
  // Bài cũ gắn mã: làm mới + chụp ảnh trước khi chấm điểm (chừa ~45 giây cho bước chấm, giới hạn ~70 giây cho bước này)
  await step("old_posts", "Làm mới bài cũ gắn mã", async () => {
    const budget = Math.min(70_000, 285_000 - (Date.now() - startedMs) - 45_000);
    if (budget < 8_000) return "bỏ qua (hết thời gian) — làm ở lần sau";
    return refreshCodedPosts({ maxPosts: 600, budgetMs: budget, olderThanDays: postDays, staleHours: 20 });
  }, null, false);
  await step("evaluate", "Đánh giá tự động", async () => {
    const r = await evaluateAll();
    return `${r.evaluated} mã được đánh giá${r.created ? `, tự tạo ${r.created} mẫu` : ""}`;
  });
  await step("metrics", "Kéo số liệu mẫu R&D", refreshProductMetrics);
  // Phần nặng đã đổi danh mục / số bán / kết quả đánh giá → xoá bộ đệm chung và làm mới bảng tổng hợp SPU một lần
  bustSoft(TAG.spuData);
  void import("@/lib/spu-summary").then((m) => m.scheduleSpuSummaryRefresh()).catch(() => {});

  // Dọn nhật ký cũ hơn 90 ngày
  await sb.core().rpc("prune_sync_runs", { keep_days: 30 });
  await pruneSnapshots();
  pingRnd();   // số liệu video / số bán / đánh giá vừa đổi → bảng R&D đang mở tự tải lại
  return results;
}
