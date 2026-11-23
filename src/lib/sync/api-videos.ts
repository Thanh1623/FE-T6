import "server-only";
import { fetchAll, fetchAllByKey, sb } from "@/lib/supabase/admin";
import { logSystem, type Actor } from "@/lib/system-log";

// Các phần kéo theo nhiều mã (gắn nhãn, chụp lịch sử, xoá bộ đệm) nạp khi cần — chạy thử (dryRun) không phải nạp chúng
const lazy = {
  retag: async () => (await import("@/lib/sync")).retagPosts(),
  snap: async (rows: Parameters<typeof import("@/lib/sync/snapshots").snapshotPosts>[0], includeOld = false, date?: string) => (await import("@/lib/sync/snapshots")).snapshotPosts(rows, { includeOld, date }),
  bust: async (...tags: ("channels" | "spuData" | "sync")[]) => { const m = await import("@/lib/cache-tags"); m.bustSoft(...tags.map((k) => m.TAG[k])); },
  spu: async () => (await import("@/lib/spu-data")).invalidateSpuRows(true),
  video: async () => (await import("@/lib/video-daily")).refreshVideoDaily(),   // Pha B: nạp bảng video dựng trong SQL song song với đường cũ (chưa ai đọc)
};

// Đồng bộ video Facebook + TikTok từ API thống kê video (VIDEOS_API_URL, mặc định https://channel-traffic.fastapicloud.dev).
// ĐỌC TOÀN BỘ mỗi lần (Facebook ~66.000 video, TikTok ~38.700; ~10 MB / 10.000 video) nhưng CHỈ GHI phần cần thiết vào social.posts:
//   • video MỚI (chưa có trong app) — chỉ video có hashtag là MÃ SP (không phải mã nhân sự K301, tuyến A1…) và đăng trong STORE_DAYS ngày gần nhất,
//   • video đăng trong RECENT_DAYS ngày gần nhất: ghi khi có bất kỳ chỉ số nào đổi (cho biểu đồ xu hướng / chấm Win),
//   • video CŨ bỗng nổi (viral): lượt xem tăng ≥ VIRAL_ABS và ≥ VIRAL_PCT so với số đang lưu,
//   • video có link ảnh bìa sắp hết hạn mà API đã có link MỚI hơn → lấy link mới.
// Video không có mã SP bị bỏ qua (không gắn được vào SPU). Kênh chưa có trong app được tạo (đang bật, chưa gắn team); kênh đã bị tắt thì bỏ qua video của nó.
const BASE = (process.env.VIDEOS_API_URL ?? "https://channel-traffic.fastapicloud.dev").replace(/\/$/, "");
export const VIDEO_SYNC = { storeDays: 400, recentDays: 45, viralAbs: 1000, viralPct: 0.2, thumbMarginDays: 7 };
const PAGE = 10_000;

// NGUỒN DỮ LIỆU: API video là nguồn chính cho Page Facebook nào CÓ TRONG API và API CÒN CẬP NHẬT; Page không có trong API (hoặc API đã đứng yên) vẫn đồng bộ trực tiếp qua Meta Graph.
// Kiểm tra từng Page bằng một yêu cầu nhẹ (limit=1, video mới nhất): có video và updated_at (API cập nhật theo từng đợt quét của cả kênh) trong maxAgeHours giờ gần nhất.
// Đo 21/11/2026: 34/141 kênh Facebook trong API không được cập nhật hơn 7 ngày — nếu bỏ đồng bộ trực tiếp chỉ vì "có trong API" thì các Page đó sẽ đóng băng. API lỗi / quá hạn → coi như không có trong API (vẫn đồng bộ trực tiếp).
export async function apiFreshFacebook(ids: string[], maxAgeHours = 72): Promise<Set<string>> {
  const fresh = new Set<string>();
  const check = async (id: string) => {
    try {
      const res = await fetch(`${BASE}/facebook/videos?limit=1&offset=0&channel_id=${encodeURIComponent(id)}`, { headers: { accept: "application/json", "user-agent": "ncptsp-sync/1.0" }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { total?: number; videos?: { updated_at?: string }[] };
      const at = j.videos?.[0]?.updated_at ? Date.parse(j.videos[0].updated_at) : NaN;
      if ((j.total ?? 0) > 0 && Number.isFinite(at) && Date.now() - at <= maxAgeHours * 3_600_000) fresh.add(id);
    } catch { /* API lỗi / quá hạn → vẫn đồng bộ trực tiếp */ }
  };
  for (let i = 0; i < ids.length; i += 6) await Promise.all(ids.slice(i, i + 6).map(check));
  return fresh;
}
const DAY = 86_400_000;

// Hashtag là MÃ SP ứng viên: đã khai báo (catalog / R&D), mã test, hoặc dạng chữ + ≥ 3 số — loại mã nhân sự (#K301), tuyến (#A1…) giống lib/tags
const STAFF = /^k[0-9]{3}$/i, LINE = /^a[1-5]$/i, SHAPE3 = /^[a-z]{1,4}[0-9]{3,}$/i, TEST = /^t(?:[1-9][0-9]{4,}|[a-z]{1,2}[0-9]+)$/i;
const hashtagsOf = (m: string | null | undefined) => [...new Set((m ?? "").match(/#[\p{L}\p{N}_]+/gu)?.map((t) => t.slice(1).toLowerCase()) ?? [])];
export function hasProductCode(message: string | null | undefined, known: Set<string>) {
  return hashtagsOf(message).some((t) => {
    const u = t.toUpperCase();
    return known.has(u) || (u.startsWith("M") && known.has(u.slice(1))) || TEST.test(t) || (SHAPE3.test(t) && !STAFF.test(t) && !LINE.test(t));
  });
}

export type Platform = "facebook" | "tiktok";
type Vid = {
  id: string; channelId: string; channelName: string; publishedAt: string; kind: "reel" | "video"; message: string | null;
  thumb: string | null; permalink: string | null; views: number; viewers: number; reactions: number; comments: number; shares: number; statsAt: string | null;
};
type Stored = { id: string; views: number; viewers: number; reactions: number; comments: number | null; shares: number | null; thumbnail_url: string | null };
const n0 = (x: unknown) => Number(x ?? 0) || 0;

// Chuẩn hoá một dòng của API về dạng chung. Nhận cả hai kiểu trả về của API TikTok (kiểu chung có video_id / published_at, và kiểu gốc của TikTok: id, username, create_time…)
function normFacebook(v: Record<string, unknown>): Vid | null {
  if (!v.video_id || !v.channel_id || !v.published_at) return null;
  return { id: String(v.video_id), channelId: String(v.channel_id), channelName: String(v.channel ?? ""), publishedAt: String(v.published_at), kind: v.kind === "reel" ? "reel" : "video",
    message: (v.message as string | null) ?? null, thumb: (v.thumbnail_url as string | null) ?? null, permalink: (v.permalink_url as string | null) ?? null,
    views: n0(v.views), viewers: n0(v.viewers), reactions: n0(v.reactions), comments: n0(v.comments), shares: n0(v.shares), statsAt: (v.updated_at as string | null) ?? null };
}
// Mã kênh TikTok lấy theo tên tài khoản (username) viết thường: "ttu:huyk.jewelry" (khác "ttn:" của kênh suy từ tag đơn Sapo)
const tiktokChannel = (username: string) => `ttu:${username.normalize("NFC").trim().toLowerCase()}`;
function normTikTok(v: Record<string, unknown>): Vid | null {
  const username = String(v.username ?? (v.channel as string | undefined) ?? "").trim();
  const rawId = v.video_id ?? v.id;
  const at = v.published_at ?? (v.create_time ? new Date(Number(v.create_time) * 1000).toISOString() : null);
  if (!rawId || !(username || v.channel_id) || !at) return null;
  const idStr = String(rawId);
  return { id: idStr.startsWith("tt:") ? idStr : `tt:${idStr}`,   // cùng dạng mã bài với đồng bộ TikTok chính thức (tt:<id>) → không nhân đôi
    channelId: username ? tiktokChannel(username) : String(v.channel_id), channelName: username ? `@${username.replace(/^@/, "")}` : String(v.channel ?? ""),
    publishedAt: String(at), kind: "video", message: ((v.video_description ?? v.message) as string | null) ?? null,
    thumb: ((v.cover_image_url ?? v.thumbnail_url) as string | null) ?? null, permalink: ((v.share_url ?? v.permalink_url) as string | null) ?? null,
    views: n0(v.view_count ?? v.views), viewers: n0(v.viewers), reactions: n0(v.like_count ?? v.reactions), comments: n0(v.comment_count ?? v.comments), shares: n0(v.share_count ?? v.shares),
    statsAt: (v.updated_at as string | null) ?? null };
}
const SOURCE: Record<Platform, { path: string; norm: (v: Record<string, unknown>) => Vid | null }> = {
  facebook: { path: "/facebook/videos", norm: normFacebook },
  tiktok: { path: "/tiktok/videos", norm: normTikTok },
};

export type VideoSyncResult = {
  platform: Platform; apiTotal: number; read: number; candidates: number; written: number; created: number; recent: number; viral: number; thumbs: number;
  newChannels: number; skippedInactive: number; seconds: number;
  staleApi?: number;   // Facebook: số kênh đang bật CÓ trong API nhưng API không cập nhật > API_STALE_DAYS ngày
};

// Cảnh báo "API đứng yên": kênh Facebook đang bật, có video trong API nhưng lần cập nhật gần nhất của API (updated_at mới nhất của kênh) đã quá API_STALE_DAYS ngày.
// Lưu ở core.settings (key api_stale_channels) mỗi lần kéo API để banner trong app đọc (không phải gọi API thêm). Danh sách rỗng = hết cảnh báo.
// Chỉ cảnh báo kênh CÒN ĐĂNG BÀI (video mới nhất trong API không cũ hơn API_ACTIVE_DAYS ngày): kênh đã ngừng hoạt động thì API ngừng quét là bình thường, cảnh báo chỉ gây nhiễu
// (đo 21/11/2026: 11/16 kênh đứng yên có bài mới nhất từ trước 22/09, có kênh từ 2025). Số kênh bị bỏ qua ghi ở `quiet`. Muốn tắt hẳn một kênh đã ngừng: tắt kênh ở trang Team (is_active = false).
export const API_STALE_DAYS = 7;   // API không cập nhật kênh quá số ngày này → coi là đứng yên
export const API_ACTIVE_DAYS = 60;
export type ApiStale = { at: string; days: number; activeDays: number; quiet: number; channels: { id: string; name: string; days: number; direct: boolean }[] };

async function getPage(path: string, offset: number): Promise<{ total: number; videos: Record<string, unknown>[] }> {
  let lastErr: unknown;
  for (let n = 1; n <= 3; n++) {
    try {
      const res = await fetch(`${BASE}${path}?limit=${PAGE}&offset=${offset}`, { headers: { accept: "application/json", "user-agent": "ncptsp-sync/1.0" }, signal: AbortSignal.timeout(120_000), cache: "no-store" });
      if (!res.ok) throw new Error(`API video ${path} trả ${res.status}`);
      return (await res.json()) as { total: number; videos: Record<string, unknown>[] };
    } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 2000 * n)); }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// Giờ hết hạn của link ảnh bìa: Facebook tham số oe= (giây Unix, hex), TikTok tham số x-expires= (giây Unix); không đọc được → 0
function thumbExpiresAt(url: string | null) {
  const fb = url?.match(/[?&]oe=([0-9A-Fa-f]+)/);
  if (fb) return parseInt(fb[1], 16) * 1000;
  const tt = url?.match(/[?&]x-expires=(\d+)/);
  return tt ? Number(tt[1]) * 1000 : 0;
}

// Mã SP đã khai báo (catalog + R&D) — để nhận ra hashtag là mã SP
async function loadKnownCodes() {
  const [catalog, rnd] = await Promise.all([
    fetchAll<{ code: string }>((a, b) => sb.sales().from("catalog").select("code").order("code").range(a, b)),
    fetchAll<{ code: string | null }>((a, b) => sb.rnd().from("products").select("code").order("id").range(a, b)).then((data) => ({ data })),   // phân trang: bảng > 1.000 hồ sơ
  ]);
  return new Set([...catalog.map((c) => c.code.toUpperCase()), ...((rnd.data ?? []).map((p) => String(p.code ?? "").toUpperCase()).filter(Boolean))]);
}

export async function syncApiVideos(platform: Platform, opts: { dryRun?: boolean; known?: Set<string> } = {}): Promise<VideoSyncResult> {   // dryRun: chỉ đọc + tính, KHÔNG ghi (để kiểm tra)
  const t0 = Date.now(), cfg = VIDEO_SYNC, src = SOURCE[platform];
  const now = Date.now(), storeFrom = now - cfg.storeDays * DAY, recentFrom = now - cfg.recentDays * DAY;
  const known = opts.known ?? (await loadKnownCodes());

  // 1) Đọc toàn bộ: trang đầu cho biết tổng, các trang sau tải song song (tối đa 3 trang cùng lúc); chỉ giữ video có mã SP trong cửa sổ lưu
  const first = await getPage(src.path, 0);
  const pages = [first.videos];
  const offsets = Array.from({ length: Math.max(0, Math.ceil(first.total / PAGE) - 1) }, (_, i) => (i + 1) * PAGE);
  for (let i = 0; i < offsets.length; i += 3) pages.push(...(await Promise.all(offsets.slice(i, i + 3).map((o) => getPage(src.path, o).then((p) => p.videos)))));
  let read = 0;
  const candidates: Vid[] = [];
  const apiUpdated = new Map<string, number>();   // kênh → updated_at mới nhất của API (mọi video, không chỉ video có mã)
  const apiNewest = new Map<string, number>();    // kênh → ngày đăng của video mới nhất trong API
  for (const page of pages) for (const raw of page) {
    read++;
    const v = src.norm(raw);
    if (v?.statsAt) { const t = Date.parse(v.statsAt); if (Number.isFinite(t) && t > (apiUpdated.get(v.channelId) ?? 0)) apiUpdated.set(v.channelId, t); }
    if (v) { const t = Date.parse(v.publishedAt); if (Number.isFinite(t) && t > (apiNewest.get(v.channelId) ?? 0)) apiNewest.set(v.channelId, t); }
    if (!v || Date.parse(v.publishedAt) < storeFrom || !hasProductCode(v.message, known)) continue;
    candidates.push(v);
  }

  // 2) So với số đang lưu trong app
  const [stored, channels] = await Promise.all([
    fetchAllByKey<Stored>(   // theo id (khoá duy nhất) thay cho OFFSET — xem lib/paging.ts
      (after, limit) => { let q = sb.social().from("posts").select("id, views, viewers, reactions, comments, shares, thumbnail_url").eq("platform", platform); if (after) q = q.gt("id", after); return q.order("id").limit(limit); },
      (r) => r.id,
      () => fetchAll<Stored>((a, b) => sb.social().from("posts").select("id, views, viewers, reactions, comments, shares, thumbnail_url").eq("platform", platform).order("id").range(a, b)),
    ),
    fetchAll<{ id: string; name: string; platform: string; is_active: boolean; last_synced_at: string | null }>((a, b) => sb.social().from("channels").select("id, name, platform, is_active, last_synced_at").order("id").range(a, b)),
  ]);
  const have = new Map(stored.map((p) => [p.id, p]));
  const chan = new Map(channels.map((c) => [c.id, c.is_active]));

  const res: VideoSyncResult = { platform, apiTotal: first.total, read, candidates: candidates.length, written: 0, created: 0, recent: 0, viral: 0, thumbs: 0, newChannels: 0, skippedInactive: 0, seconds: 0 };
  if (platform === "facebook" && apiUpdated.size) {
    const staleMs = Date.now() - API_STALE_DAYS * DAY;
    const activeFrom = Date.now() - API_ACTIVE_DAYS * DAY;
    const idle = channels.filter((c) => c.is_active && c.platform === "facebook" && apiUpdated.has(c.id) && apiUpdated.get(c.id)! < staleMs);
    const quiet = idle.filter((c) => (apiNewest.get(c.id) ?? 0) < activeFrom).length;   // đứng yên nhưng đã lâu không đăng → không cảnh báo
    const stale = idle.filter((c) => (apiNewest.get(c.id) ?? 0) >= activeFrom)
      .map((c) => ({ id: c.id, name: c.name.trim(), days: Math.floor((Date.now() - apiUpdated.get(c.id)!) / DAY), direct: !!c.last_synced_at }))
      .sort((a, b) => b.days - a.days);
    res.staleApi = stale.length;
    if (!opts.dryRun) {
      const value: ApiStale = { at: new Date().toISOString(), days: API_STALE_DAYS, activeDays: API_ACTIVE_DAYS, quiet, channels: stale };
      await sb.core().from("settings").upsert({ key: "api_stale_channels", value }, { onConflict: "key" });   // lỗi ghi không làm hỏng đồng bộ
    }
  }
  const toWrite: Vid[] = [], viralIds = new Set<string>();
  for (const v of candidates) {
    if (chan.get(v.channelId) === false) { res.skippedInactive++; continue; }   // kênh bị tắt trong app → bỏ qua
    const cur = have.get(v.id);
    let why: "new" | "recent" | "viral" | "thumb" | null = null;
    if (!cur) why = "new";
    else {
      const dv = v.views - n0(cur.views);
      if (Date.parse(v.publishedAt) >= recentFrom) {
        if (dv || v.viewers !== n0(cur.viewers) || v.reactions !== n0(cur.reactions) || v.comments !== n0(cur.comments) || v.shares !== n0(cur.shares)) why = "recent";
      } else if (dv >= cfg.viralAbs && dv >= cfg.viralPct * Math.max(n0(cur.views), 1)) why = "viral";
      // Ảnh bìa: chỉ khi link đang lưu sắp hết hạn VÀ link của API còn hạn lâu hơn (API cũng hết hạn thì ghi lại cũng vô ích)
      if (!why && v.thumb && thumbExpiresAt(cur.thumbnail_url) < now + cfg.thumbMarginDays * DAY && thumbExpiresAt(v.thumb) > thumbExpiresAt(cur.thumbnail_url) && thumbExpiresAt(v.thumb) > now) why = "thumb";
    }
    if (!why) continue;
    toWrite.push(v);
    if (why === "new") res.created++; else if (why === "recent") res.recent++; else if (why === "viral") { res.viral++; viralIds.add(v.id); } else res.thumbs++;
  }

  // 3) Kênh chưa có trong app: tạo (đang bật, chưa gắn team, không có token nên đồng bộ chính thức bỏ qua)
  const newCh = new Map<string, string>();
  for (const v of toWrite) if (!chan.has(v.channelId)) newCh.set(v.channelId, (v.channelName || `Kênh ${v.channelId}`).trim().slice(0, 200));
  if (newCh.size && !opts.dryRun) {
    const { error } = await sb.social().from("channels").upsert([...newCh].map(([id, name]) => ({ id, platform, name, is_active: true })), { onConflict: "id", ignoreDuplicates: true });
    if (error) throw error;
    await lazy.bust("channels");
  }
  res.newChannels = newCh.size;

  // 4) Ghi (cột chỉ số + nội dung; nhãn mã SP / team do retagPosts tính sau, KHÔNG ghi ở đây nên không xoá nhãn đã có)
  const rows = toWrite.map((v) => ({
    id: v.id, channel_id: v.channelId, platform, published_at: v.publishedAt, kind: v.kind, message: v.message, permalink_url: v.permalink, thumbnail_url: v.thumb,
    hashtags: hashtagsOf(v.message), views: v.views, viewers: v.viewers, reactions: v.reactions, comments: v.comments, shares: v.shares,
    stats_at: v.statsAt ?? new Date().toISOString(),
  }));
  for (let i = 0; !opts.dryRun && i < rows.length; i += 1000) {
    const { error } = await sb.social().from("posts").upsert(rows.slice(i, i + 1000), { onConflict: "id" });
    if (error) throw error;
  }
  res.written = rows.length;
  if (opts.dryRun) { res.seconds = Math.round((Date.now() - t0) / 1000); return res; }

  // 5) Chụp lịch sử lượt xem hôm nay: video ≤ 45 ngày (mặc định) + video cũ đang nổi (viral) — video cũ mới nhập lần đầu KHÔNG chụp (tránh hàng chục nghìn dòng vô ích)
  const snap = (r: (typeof rows)[number]) => ({ id: r.id, published_at: r.published_at, views: r.views, reactions: r.reactions, viewers: r.viewers, clicks: 0, comments: r.comments });
  if (rows.length) {
    await lazy.snap(rows.map(snap));
    if (viralIds.size) {
      // Video CŨ bứt phá: ghi thêm MỐC TRƯỚC khi bứt phá (số đang lưu trước lần ghi này, gắn ngày hôm qua) — không có mốc này thì Win Traffic cuốn chiếu không biết video đã tăng bao nhiêu
      const yesterday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(Date.now() - DAY));
      await lazy.snap(rows.filter((r) => viralIds.has(r.id)).flatMap((r) => { const cur = have.get(r.id); return cur ? [{ id: r.id, published_at: r.published_at, views: n0(cur.views), reactions: n0(cur.reactions), viewers: n0(cur.viewers), clicks: 0, comments: cur.comments }] : []; }), true, yesterday);
      await lazy.snap(rows.filter((r) => viralIds.has(r.id)).map(snap), true);
    }
  }
  res.seconds = Math.round((Date.now() - t0) / 1000);
  return res;
}

export type VideoRunResult = { ok: true; results: VideoSyncResult[] } | { ok: false; error: string; results: VideoSyncResult[] };

// Chạy cả hai nền tảng + gắn nhãn mã SP cho video mới + ghi nhật ký (core.sync_runs, job "videos_api") để hiện ở "Độ mới của dữ liệu" và cảnh báo lỗi trên thanh bên
export async function runApiVideoSync(platforms: Platform[] = ["facebook", "tiktok"], by: Actor = null): Promise<VideoRunResult> {
  const started = new Date();
  const results: VideoSyncResult[] = [];
  const errors: string[] = [];
  const msg = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message ?? JSON.stringify(e));
  try {
    const known = await loadKnownCodes();
    for (const p of platforms) {
      try { results.push(await syncApiVideos(p, { known })); }
      catch (e) { errors.push(`${p}: ${msg(e)}`); }
    }
    if (results.some((r) => r.created)) await lazy.retag();   // video mới → gắn nhãn mã SP / mã chưa khai báo
    if (results.some((r) => r.written)) { await lazy.spu(); await lazy.video().catch(() => null); await lazy.bust("spuData"); }
  } catch (e) { errors.push(msg(e)); }
  const summary = results.map((r) => `${r.platform === "facebook" ? "FB" : "TT"}: đọc ${r.read} · ghi ${r.written} (mới ${r.created}, đang đăng ${r.recent}, viral ${r.viral}, ảnh ${r.thumbs}) · kênh mới ${r.newChannels}${r.staleApi ? ` · ⚠ ${r.staleApi} kênh API đứng yên > ${API_STALE_DAYS} ngày` : ""} · ${r.seconds}s`).join(" | ");
  const message = [summary, ...errors].filter(Boolean).join(" | ").slice(0, 900);
  await sb.core().from("sync_runs").insert({ job: "videos_api", status: errors.length && !results.length ? "error" : "success", message, started_at: started.toISOString(), finished_at: new Date().toISOString() });
  await lazy.bust("sync");
  const w = results.reduce((n, r) => n + r.written, 0), c = results.reduce((n, r) => n + r.created, 0);
  await logSystem({ kind: "sync_videos", ok: !errors.length, summary: errors.length ? errors.join(" | ") : `Ghi ${w.toLocaleString("vi-VN")} video (mới ${c.toLocaleString("vi-VN")}) từ ${results.length} nền tảng`,
    detail: { results: results.map((r) => ({ platform: r.platform, read: r.read, written: r.written, created: r.created, seconds: r.seconds })), errors }, actor: by });
  return errors.length ? { ok: false, error: errors.join(" | "), results } : { ok: true, results };
}
