"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../NCPTSP/ncptsp/packages/ncptsp-core/shim/server-only.ts
var init_server_only = __esm({
  "../NCPTSP/ncptsp/packages/ncptsp-core/shim/server-only.ts"() {
    "use strict";
  }
});

// ../NCPTSP/ncptsp/packages/ncptsp-core/shim/next-server.ts
var init_next_server = __esm({
  "../NCPTSP/ncptsp/packages/ncptsp-core/shim/next-server.ts"() {
    "use strict";
  }
});

// ../NCPTSP/ncptsp/src/lib/paging.ts
async function withRetry(run) {
  let res = await run();
  for (let n = 1; n <= 3 && res.error && isTimeout(res.error); n++) {
    await new Promise((r) => setTimeout(r, 1500 * n));
    res = await run();
  }
  return res;
}
async function fetchAll(build) {
  const first = await withRetry(() => build(0, PAGE - 1));
  if (first.error) throw first.error;
  const out = [...first.data ?? []];
  if (!first.data || first.data.length < PAGE) return out;
  for (let i = PAGE; ; i += PAGE * PARALLEL) {
    const batch = await Promise.all(Array.from({ length: PARALLEL }, (_, k) => withRetry(() => build(i + k * PAGE, i + k * PAGE + PAGE - 1))));
    for (const { data, error } of batch) {
      if (error) throw error;
      out.push(...data ?? []);
      if (!data || data.length < PAGE) return out;
    }
  }
}
async function fetchAllByKey(build, keyOf, fallback) {
  const out = [];
  let after2 = null;
  for (; ; ) {
    const cur = after2;
    const res = await withRetry(() => build(cur, PAGE));
    if (res.error) throw res.error;
    const rows = res.data ?? [];
    if (rows.length < PAGE) {
      out.push(...rows);
      return out;
    }
    const lastKey = keyOf(rows[rows.length - 1]);
    let keep = rows.length;
    while (keep > 0 && keyOf(rows[keep - 1]) === lastKey) keep--;
    if (keep === 0) return fallback();
    for (let i = 0; i < keep; i++) out.push(rows[i]);
    after2 = keyOf(rows[keep - 1]);
  }
}
var PAGE_SIZE, PARALLEL, isTimeout, PAGE;
var init_paging = __esm({
  "../NCPTSP/ncptsp/src/lib/paging.ts"() {
    "use strict";
    PAGE_SIZE = 1e3;
    PARALLEL = 6;
    isTimeout = (e) => !!e && typeof e === "object" && (e.code === "57014" || /statement timeout/i.test(String(e.message ?? "")));
    PAGE = PAGE_SIZE;
  }
});

// ../NCPTSP/ncptsp/src/lib/supabase/admin.ts
function supabaseAdmin() {
  admin ??= (0, import_supabase_js.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false }
  });
  return admin;
}
function supabaseOrders() {
  return (0, import_supabase_js.createClient)(process.env.ORDERS_SUPABASE_URL, process.env.ORDERS_SUPABASE_SECRET_KEY, {
    auth: { persistSession: false }
  });
}
var import_supabase_js, admin, sb;
var init_admin = __esm({
  "../NCPTSP/ncptsp/src/lib/supabase/admin.ts"() {
    "use strict";
    init_server_only();
    import_supabase_js = require("@supabase/supabase-js");
    init_paging();
    admin = null;
    sb = {
      core: () => supabaseAdmin().schema("core"),
      social: () => supabaseAdmin().schema("social"),
      sales: () => supabaseAdmin().schema("sales"),
      rnd: () => supabaseAdmin().schema("rnd")
    };
  }
});

// ../NCPTSP/ncptsp/src/lib/date-range.ts
function resolveRange(range, today) {
  const monthStart = `${today.slice(0, 8)}01`;
  if (range === "today") return { from: today, to: today };
  if (range === "this_month") return { from: monthStart, to: today };
  if (range === "last_month") {
    const end = shiftDay(monthStart, -1);
    return { from: `${end.slice(0, 8)}01`, to: end };
  }
  const n = Number(range);
  if ([7, 30, 90, 365].includes(n)) return { from: shiftDay(today, -(n - 1)), to: today };
  return null;
}
var DAY_MS, shiftDay;
var init_date_range = __esm({
  "../NCPTSP/ncptsp/src/lib/date-range.ts"() {
    "use strict";
    DAY_MS = 864e5;
    shiftDay = (d, n) => new Date(Date.parse(d) + n * DAY_MS).toISOString().slice(0, 10);
  }
});

// ../NCPTSP/ncptsp/packages/ncptsp-core/shim/next-cache.ts
function unstable_cache(fn, _keyParts, _opts) {
  return fn;
}
function revalidateTag(_tag, _profile) {
}
var init_next_cache = __esm({
  "../NCPTSP/ncptsp/packages/ncptsp-core/shim/next-cache.ts"() {
    "use strict";
  }
});

// ../NCPTSP/ncptsp/src/lib/cache-tags.ts
function bustSoft(...tags) {
  for (const t of tags) {
    try {
      revalidateTag(t, "max");
    } catch {
    }
  }
}
var TAG;
var init_cache_tags = __esm({
  "../NCPTSP/ncptsp/src/lib/cache-tags.ts"() {
    "use strict";
    init_server_only();
    init_next_cache();
    TAG = {
      sync: "sync",
      // core.sync_runs (giờ cập nhật, lỗi đồng bộ trên sidebar)
      channels: "channels",
      // social.channels (danh sách kênh, Page ↔ team)
      metaToken: "meta-token",
      // trạng thái token Meta (debug_token)
      rndOptions: "rnd-options",
      // core.settings rnd_options (Cấu hình)
      teams: "teams",
      // core.teams
      profiles: "profiles",
      // core.profiles (danh sách người)
      spuData: "spu-data",
      // số liệu SPU đã gom (tóm tắt SKU, đơn hàng 30 ngày, danh mục) — xoá khi nhập tồn kho / đơn hàng
      handoffs: "handoffs"
      // tổng quan giao mẫu (phiếu + video + số bán) — xoá khi phân công / đổi trạng thái phiếu
    };
  }
});

// ../NCPTSP/ncptsp/src/lib/tiktok/name.ts
var normTikTokName, TT_NAME_PREFIX;
var init_name = __esm({
  "../NCPTSP/ncptsp/src/lib/tiktok/name.ts"() {
    "use strict";
    normTikTokName = (s) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
    TT_NAME_PREFIX = "ttn:";
  }
});

// ../NCPTSP/ncptsp/src/lib/daily-sales.ts
function pageOfTags(tags) {
  if (!tags) return "";
  const parts = tags.split(",").map((t) => t.trim());
  for (const t of parts) {
    const m = t.match(/^(?:page_id_)?(\d{6,})$/i);
    if (m) return m[1];
  }
  for (const t of parts) {
    const m = t.match(/^tiktok_business_(?!id_)(.+)$/i);
    if (m) return TT_NAME_PREFIX + normTikTokName(m[1]);
  }
  return "";
}
async function importWindow() {
  if (winCache && Date.now() - winCache.at < 6e4) return winCache.win;
  let win = null;
  try {
    const edge = async (asc) => {
      const { data, error } = await sb.sales().from("imported_order_lines").select("ordered_at").gt("price", 0).order("ordered_at", { ascending: asc }).limit(1);
      if (error) throw error;
      return data?.[0]?.ordered_at;
    };
    const [a, b] = await Promise.all([edge(true), edge(false)]);
    if (a && b) win = { from: vnDay(a), to: vnDay(b) };
  } catch {
    win = null;
  }
  winCache = { at: Date.now(), win };
  return win;
}
async function loadDailySales(q) {
  if (q.fresh) return loadDailySalesDb(q);
  const norm = { ...q, codes: q.codes ? [...new Set(q.codes.map((c) => c.toUpperCase()))].sort() : void 0, channels: q.channels ? [...q.channels].sort() : void 0, pageIds: q.pageIds ? [...q.pageIds].sort() : void 0 };
  return salesCached(norm, vnDay((/* @__PURE__ */ new Date()).toISOString()));
}
async function loadDailySalesDb(q) {
  const today = vnDay((/* @__PURE__ */ new Date()).toISOString());
  const to = q.to && q.to < today ? q.to : today;
  if (to < q.from) return [];
  const codes = q.codes ? [...new Set(q.codes.map((c) => c.toUpperCase()))] : null;
  if (codes && !codes.length) return [];
  const win = await importWindow();
  const fileFrom = win ? q.from > win.from ? q.from : win.from : null, fileTo = win ? to < win.to ? to : win.to : null;
  const useFile = !!(win && fileFrom && fileTo && fileFrom <= fileTo);
  const syncRanges = [];
  if (!useFile) syncRanges.push([q.from, to]);
  else {
    if (q.from < win.from) syncRanges.push([q.from, addDays(win.from, -1) < to ? addDays(win.from, -1) : to]);
    if (to > win.to) syncRanges.push([addDays(win.to, 1) > q.from ? addDays(win.to, 1) : q.from, to]);
  }
  const out = [];
  const keepCh = (ch) => q.channels?.length ? q.channels.includes(ch) : q.keepWarranty || ch !== "bao_hanh";
  const keepPage = (p) => !q.pageIds || q.pageIds.includes(p);
  const jobs = [];
  for (const [a, b] of syncRanges) {
    for (const part of codes ? chunks(codes, 100) : [null]) {
      jobs.push((async () => {
        const read = (cols) => fetchAll((x, y) => {
          let sel = sb.sales().from("daily_sales").select(cols).gte("date", a).lte("date", b);
          if (part) sel = sel.in("code", part);
          return sel.order("date").order("code").range(x, y);
        });
        const rows = await read("code, date, page_id, channel, qty_sold, qty_returned, revenue, returned_value, cost, returned_cost").catch(() => read("code, date, page_id, channel, qty_sold, qty_returned"));
        for (const r of rows) {
          const ch = r.channel ?? "khac", page = r.page_id ?? "";
          if (!keepCh(ch) || !keepPage(page)) continue;
          out.push({
            code: String(r.code).toUpperCase(),
            date: r.date,
            page_id: page,
            channel: ch,
            qty_sold: Number(r.qty_sold ?? 0),
            qty_returned: Number(r.qty_returned ?? 0),
            fromFile: false,
            revenue: Number(r.revenue ?? 0),
            returned_value: Number(r.returned_value ?? 0),
            cost: Number(r.cost ?? 0),
            returned_cost: Number(r.returned_cost ?? 0)
          });
        }
      })());
    }
  }
  if (useFile) {
    for (const part of codes ? chunks(codes, 100) : [null]) {
      jobs.push((async () => {
        const lines = await fetchAll((x, y) => {
          let sel = sb.sales().from("imported_order_lines").select("code, ordered_at, qty, price, status, source, tags").gt("price", 0).gte("ordered_at", `${fileFrom}T00:00:00+07:00`).lte("ordered_at", `${fileTo}T23:59:59+07:00`);
          if (part) sel = sel.in("code", part);
          return sel.order("order_id").order("sku").range(x, y);
        }).catch(async () => {
          return (await fetchAll((x, y) => {
            let sel = sb.sales().from("imported_order_lines").select("code, ordered_at, qty, price, status, source").gt("price", 0).gte("ordered_at", `${fileFrom}T00:00:00+07:00`).lte("ordered_at", `${fileTo}T23:59:59+07:00`);
            if (part) sel = sel.in("code", part);
            return sel.order("order_id").order("sku").range(x, y);
          })).map((l) => ({ ...l, tags: null }));
        });
        for (const l of lines) {
          if (/hủy|huỷ/i.test(l.status ?? "")) continue;
          const ch = channelOfSource(l.source), page = pageOfTags(l.tags);
          if (!keepCh(ch) || !keepPage(page)) continue;
          const qty = Number(l.qty ?? 0);
          out.push({
            code: l.code.toUpperCase(),
            date: vnDay(l.ordered_at),
            page_id: page,
            channel: ch,
            qty_sold: qty,
            qty_returned: 0,
            fromFile: true,
            revenue: Number(l.price ?? 0) * qty,
            returned_value: 0,
            cost: 0,
            returned_cost: 0
          });
        }
      })());
    }
  }
  await Promise.all(jobs);
  return out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
}
var DAY, vnDay, addDays, CHANNEL_OF_SOURCE, channelOfSource, winCache, chunks, salesCached;
var init_daily_sales = __esm({
  "../NCPTSP/ncptsp/src/lib/daily-sales.ts"() {
    "use strict";
    init_server_only();
    init_next_cache();
    init_admin();
    init_cache_tags();
    init_name();
    DAY = 864e5;
    vnDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
    addDays = (d, n) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
    CHANNEL_OF_SOURCE = [
      [/bao\s*hanh|bảo\s*hành/i, "bao_hanh"],
      [/tiktok\s*shop/i, "tiktok_shop"],
      [/tiktok/i, "tiktok"],
      [/shopee/i, "shopee"],
      [/zalo/i, "zalo"],
      [/facebook|live[-\s]*fb|messenger/i, "facebook"],
      [/instagram/i, "instagram"],
      [/pos|cửa\s*hàng|cua\s*hang|store/i, "cua_hang"],
      [/web/i, "web"]
    ];
    channelOfSource = (source) => {
      const s = String(source ?? "").normalize("NFC");
      return CHANNEL_OF_SOURCE.find(([re]) => re.test(s))?.[1] ?? "khac";
    };
    winCache = null;
    chunks = (l, n) => {
      const o2 = [];
      for (let i = 0; i < l.length; i += n) o2.push(l.slice(i, i + n));
      return o2;
    };
    salesCached = unstable_cache(
      async (q, day) => {
        void day;
        return loadDailySalesDb(q);
      },
      ["daily-sales", "v1"],
      { tags: [TAG.spuData], revalidate: 21600 }
    );
  }
});

// ../NCPTSP/ncptsp/src/lib/format.ts
function fmtCompact(n) {
  const f = (v) => v < 10 ? v.toLocaleString("vi-VN", { maximumFractionDigits: 1 }) : Math.round(v).toLocaleString("vi-VN");
  const a = Math.abs(n);
  if (a >= 999500) return `${f(n / 1e6)} Tr`;
  if (a >= 1e3) return `${f(n / 1e3)}K`;
  return Math.round(n).toLocaleString("vi-VN");
}
var fmtInt;
var init_format = __esm({
  "../NCPTSP/ncptsp/src/lib/format.ts"() {
    "use strict";
    fmtInt = (n) => Math.round(n).toLocaleString("vi-VN");
  }
});

// ../NCPTSP/ncptsp/src/lib/data.ts
var data_exports = {};
__export(data_exports, {
  CHANNELS: () => CHANNELS,
  OVERVIEW_METRICS: () => OVERVIEW_METRICS,
  RANGE_PRESETS: () => RANGE_PRESETS,
  addDays: () => addDays2,
  daysBetween: () => daysBetween,
  fmtCompact: () => fmtCompact,
  fmtDate: () => fmtDate,
  fmtDateTime: () => fmtDateTime,
  fmtInt: () => fmtInt,
  fmtMoney: () => fmtMoney,
  fmtMoneyShort: () => fmtMoneyShort,
  getAccounts: () => getAccounts,
  getDailyMetrics: () => getDailyMetrics,
  getLatestSyncLogs: () => getLatestSyncLogs,
  getPosts: () => getPosts,
  getPostsPage: () => getPostsPage,
  getPostsPageCached: () => getPostsPageCached,
  getProductInfo: () => getProductInfo,
  getSalesByChannel: () => getSalesByChannel,
  limitByTeams: () => limitByTeams,
  parseFilters: () => parseFilters,
  previousPeriod: () => previousPeriod,
  scopePageIds: () => scopePageIds,
  todayVN: () => todayVN
});
function todayVN() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(/* @__PURE__ */ new Date());
}
function addDays2(date, n) {
  return new Date(Date.parse(date) + n * DAY_MS2).toISOString().slice(0, 10);
}
function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS2) + 1;
}
function parseFilters(sp) {
  let range = one(sp.range) ?? "30";
  let from, to;
  if (range === "custom" && isDate(one(sp.from)) && isDate(one(sp.to))) {
    from = one(sp.from);
    to = one(sp.to);
    if (from > to) [from, to] = [to, from];
  } else {
    let r = resolveRange(range, todayVN());
    if (!r) {
      range = "30";
      r = resolveRange("30", todayVN());
    }
    ({ from, to } = r);
  }
  const channels = (one(sp.channels) ?? "").split(",").filter((c) => c in CHANNELS);
  const teams = (one(sp.team) ?? "").split(",").filter(Boolean);
  return { from, to, range, scope: one(sp.scope) ?? "all", teams, channels };
}
function scopePageIds(f, myPageIds) {
  if (f.teams.length) {
    const picked = !f.scope || f.scope === "all" || f.scope === "mine" ? myPageIds : f.scope.split(",").filter((id) => myPageIds.includes(id));
    return picked.length ? picked : ["__none__"];
  }
  if (!f.scope || f.scope === "all") return null;
  if (f.scope === "mine") return myPageIds;
  return f.scope.split(",").filter(Boolean);
}
function previousPeriod(f) {
  const n = daysBetween(f.from, f.to);
  return { from: addDays2(f.from, -n), to: addDays2(f.from, -1) };
}
async function getDailyMetrics(channelIds, from, to) {
  const rows = await fetchAll((a, b) => sb.social().from("channel_daily").select("channel_id, date, views, viewers, new_follows, engagements, video_views").in("channel_id", channelIds).gte("date", from).lte("date", to).order("date").order("channel_id").range(a, b));
  return rows.flatMap((r) => Object.keys(OVERVIEW_METRICS).map((m) => ({ account_id: r.channel_id, metric: m, date: r.date, value: Number(r[m]) })));
}
async function getSalesByChannel(code, from, to) {
  const rows = await loadDailySales({ codes: [code], from, to, keepWarranty: true });
  const by = /* @__PURE__ */ new Map();
  for (const r of rows) by.set(r.channel, (by.get(r.channel) ?? 0) + r.qty_sold - r.qty_returned);
  return [...by].map(([channel, qty_net]) => ({ channel, qty_net })).sort((a, b) => b.qty_net - a.qty_net);
}
async function getPosts(channelIds, from, to) {
  return fetchAll((a, b) => sb.social().from("posts").select("id, channel_id, published_at, kind, message, hashtags, product_codes, unknown_codes, content_line, concept, staff_code, permalink_url, thumbnail_url, views, viewers, reactions, comments, shares, clicks, video_views").in("channel_id", channelIds).gte("published_at", `${from}T00:00:00+07:00`).lte("published_at", `${to}T23:59:59+07:00`).order("published_at", { ascending: false }).range(a, b));
}
async function getPostsPage(channelIds, from, to, sort, page, size, sku = "all", kind = "all", codes, minViews, search) {
  const first = (page - 1) * size;
  let q = sb.social().from("posts").select("id, channel_id, published_at, kind, message, hashtags, product_codes, unknown_codes, content_line, concept, staff_code, permalink_url, thumbnail_url, views, viewers, reactions, comments, shares, clicks, video_views", { count: "exact" }).in("channel_id", channelIds).gte("published_at", `${from}T00:00:00+07:00`).lte("published_at", `${to}T23:59:59+07:00`);
  if (sku === "with") q = q.neq("product_codes", "{}");
  else if (sku === "without") q = q.eq("product_codes", "{}");
  else if (sku === "unknown") q = q.neq("unknown_codes", "{}");
  if (kind === "video") q = q.in("kind", ["video", "reel"]);
  if (codes) {
    if (!codes.length) return { posts: [], total: 0 };
    q = q.overlaps("product_codes", codes);
  }
  const term = (search ?? "").replace(/[,()"'\\%*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (term) {
    const conds = [`message.ilike.*${term}*`];
    if (/^#?[A-Za-z]{1,4}\d{3,}$/.test(term)) conds.push(`product_codes.cs.{${term.replace(/^#/, "").toUpperCase()}}`);
    if (term.length >= 2) {
      const [{ data: named }, { data: namedOwn }] = await Promise.all([
        sb.sales().from("catalog").select("code").ilike("name", `%${term}%`).limit(60),
        sb.sales().from("spu_images").select("code").ilike("name", `%${term}%`).limit(60)
        // tên từ file Sapo (migration 054)
      ]);
      const codes2 = [...new Set([...named ?? [], ...namedOwn ?? []].map((r) => String(r.code).toUpperCase().split("-")[0]))];
      if (codes2.length) conds.push(`product_codes.ov.{${codes2.join(",")}}`);
    }
    q = q.or(conds.join(","));
  }
  if (typeof minViews === "number") q = q.gte("views", minViews);
  else if (minViews) {
    const cols = { views: "views", viewers: "viewers", reactions: "reactions", clicks: "clicks" };
    const conds = minViews.rules.filter((r) => r.op === ">=" && r.metric in cols);
    if (minViews.match === "any" && conds.length) q = q.or(conds.map((r) => `${cols[r.metric]}.gte.${r.value}`).join(","));
    else for (const r of conds) q = q.gte(cols[r.metric], r.value);
  }
  const { data, count, error } = await q.order(sort, { ascending: false, nullsFirst: false }).order("published_at", { ascending: false }).order("id").range(first, first + size - 1);
  if (error) throw error;
  return { posts: data ?? [], total: count ?? 0 };
}
async function getProductInfo(codes) {
  const unique = [...new Set(codes.map((c) => c.toUpperCase()))];
  if (!unique.length) return {};
  const out = {};
  const missing2 = [];
  for (const c of unique) {
    const cached6 = catalogCache.get(c);
    if (cached6) out[c] = cached6;
    else missing2.push(c);
  }
  if (missing2.length) {
    const chunks2 = [];
    for (let i = 0; i < missing2.length; i += 200) chunks2.push(missing2.slice(i, i + 200));
    const [results, own] = await Promise.all([
      Promise.all(chunks2.map((c) => sb.sales().from("catalog").select("code, name, image_url").in("code", c))),
      Promise.all(chunks2.map(async (c) => {
        const r = await sb.sales().from("spu_images").select("code, image_url, name").in("code", c);
        return r.error ? sb.sales().from("spu_images").select("code, image_url").in("code", c) : r;
      }))
    ]);
    const ownImg = /* @__PURE__ */ new Map();
    for (const { data } of own) for (const r of data ?? []) ownImg.set(String(r.code).toUpperCase(), { image_url: r.image_url ?? null, name: r.name ?? null });
    for (const { data, error } of results) {
      if (error) {
        console.error("getProductInfo:", error.message);
        continue;
      }
      for (const p of data) {
        const o2 = ownImg.get(String(p.code).toUpperCase());
        const item = { product_code: p.code, name: o2?.name || p.name, image_url: o2?.image_url ?? p.image_url };
        catalogCache.set(p.code, item);
        out[p.code] = item;
      }
    }
  }
  return out;
}
function fmtMoneyShort(n) {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} t\u1EF7`;
  if (a >= 1e6) return `${(n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  return fmtMoney(n);
}
var DAY_MS2, RANGE_PRESETS, CHANNELS, one, isDate, limitByTeams, getAccounts, OVERVIEW_METRICS, getPostsPageCached, catalogCache, getLatestSyncLogs, fmtMoney, fmtDate, fmtDateTime;
var init_data = __esm({
  "../NCPTSP/ncptsp/src/lib/data.ts"() {
    "use strict";
    init_server_only();
    init_date_range();
    init_daily_sales();
    init_next_cache();
    init_admin();
    init_cache_tags();
    init_format();
    DAY_MS2 = 864e5;
    RANGE_PRESETS = [7, 30, 90, 365];
    CHANNELS = {
      facebook: "Facebook",
      tiktok_shop: "TikTok Shop",
      tiktok: "TikTok",
      shopee: "Shopee",
      web: "Web",
      cua_hang: "C\u1EEDa h\xE0ng",
      zalo: "Zalo",
      instagram: "Instagram",
      khac: "Kh\xE1c",
      bao_hanh: "B\u1EA3o h\xE0nh"
    };
    one = (v) => Array.isArray(v) ? v[0] : v;
    isDate = (v) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
    limitByTeams = (accounts, f) => f.teams.length ? accounts.filter((a) => !!a.team_id && f.teams.includes(a.team_id)) : accounts;
    getAccounts = unstable_cache(async () => {
      const { data, error } = await sb.social().from("channels").select("id, name, platform, team_id").eq("is_active", true).order("created_at").order("id");
      if (error) throw error;
      return data.map((a, i) => ({ ...a, color: `var(--series-${i % 8 + 1})` }));
    }, ["accounts"], { tags: [TAG.channels], revalidate: 3600 });
    OVERVIEW_METRICS = {
      views: "L\u01B0\u1EE3t xem",
      viewers: "Ng\u01B0\u1EDDi xem",
      new_follows: "Theo d\xF5i m\u1EDBi",
      engagements: "T\u01B0\u01A1ng t\xE1c",
      video_views: "L\u01B0\u1EE3t xem video"
    };
    getPostsPageCached = unstable_cache(getPostsPage, ["posts-page", "v1"], { tags: [TAG.sync], revalidate: 21600 });
    catalogCache = /* @__PURE__ */ new Map();
    getLatestSyncLogs = unstable_cache(async () => {
      const { data, error } = await sb.core().from("sync_runs").select("job, channel_id, status, message, finished_at").order("started_at", { ascending: false }).limit(200);
      if (error) throw error;
      const seen = /* @__PURE__ */ new Map();
      for (const l of data) {
        const key = `${l.job}|${l.channel_id ?? ""}`;
        if (!seen.has(key)) seen.set(key, l);
      }
      return [...seen.values()];
    }, ["sync-logs"], { tags: [TAG.sync], revalidate: 600 });
    fmtMoney = (n) => `${Math.round(n).toLocaleString("vi-VN")}\u0111`;
    fmtDate = (d) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(typeof d === "string" ? new Date(d.length === 10 ? `${d}T12:00:00+07:00` : d) : d);
    fmtDateTime = (d) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
  }
});

// ../NCPTSP/ncptsp/src/lib/db-gate.ts
async function heavyRpc(fn, retries = 1, waitMs = 1500) {
  let res = await heavyQuery(async () => await fn());
  for (let a = 0; a < retries && isTimeout2(res.error); a++) {
    await new Promise((r) => setTimeout(r, waitMs * (a + 1)));
    res = await heavyQuery(async () => await fn());
  }
  return res;
}
async function heavyQuery(fn) {
  if (running >= MAX) await new Promise((go) => waiting.push(go));
  else running++;
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}
var MAX, running, waiting, isTimeout2;
var init_db_gate = __esm({
  "../NCPTSP/ncptsp/src/lib/db-gate.ts"() {
    "use strict";
    MAX = 3;
    running = 0;
    waiting = [];
    isTimeout2 = (e) => !!e && (e.code === "57014" || /statement timeout|canceling statement/i.test(e.message ?? ""));
  }
});

// ../NCPTSP/ncptsp/src/lib/sku-overrides.ts
async function loadSkuOverrides() {
  try {
    return new Map((await cached()).map((r) => [r.sku.toUpperCase(), r.spu_code]));
  } catch {
    return /* @__PURE__ */ new Map();
  }
}
var cached;
var init_sku_overrides = __esm({
  "../NCPTSP/ncptsp/src/lib/sku-overrides.ts"() {
    "use strict";
    init_server_only();
    init_next_cache();
    init_admin();
    init_cache_tags();
    cached = unstable_cache(
      async () => fetchAll((a, b) => sb.sales().from("sku_spu_overrides").select("sku, spu_code").order("sku").range(a, b)),
      ["sku-overrides", "v2"],
      { tags: [TAG.spuData], revalidate: 21600 }
    );
  }
});

// ../NCPTSP/ncptsp/src/lib/spu-alias.ts
async function loadSpuAliases() {
  try {
    return new Map((await cached2()).map((r) => [r.old_code.toUpperCase(), r.new_code.toUpperCase()]));
  } catch {
    return /* @__PURE__ */ new Map();
  }
}
function expandCodes(aliases, codes) {
  if (!aliases.size) return codes;
  const want = new Set(codes.map((c) => c.toUpperCase()));
  const out = new Set(codes);
  for (const [o2, n] of aliases) if (want.has(n)) out.add(o2);
  return [...out];
}
function canonPosts(aliases, posts) {
  if (!aliases.size) return posts;
  const canon2 = canonOf(aliases);
  return posts.map((p) => ({ ...p, product_codes: [...new Set(p.product_codes.map(canon2))] }));
}
var cached2, canonOf;
var init_spu_alias = __esm({
  "../NCPTSP/ncptsp/src/lib/spu-alias.ts"() {
    "use strict";
    init_server_only();
    init_next_cache();
    init_admin();
    init_cache_tags();
    cached2 = unstable_cache(
      async () => fetchAll((a, b) => sb.sales().from("spu_aliases").select("old_code, new_code").order("old_code").range(a, b)),
      ["spu-aliases", "v1"],
      { tags: [TAG.spuData], revalidate: 21600 }
    );
    canonOf = (aliases) => (code) => aliases.get(code.toUpperCase()) ?? code;
  }
});

// ../NCPTSP/ncptsp/src/lib/staff-teams.ts
function buildStaffMatcher(profiles) {
  const ps = profiles.map((p) => ({ ...p, tk: nameTokens(p.name), code: p.teamCode ?? p.team, kd: shiftOf(p.name) }));
  const cache2 = /* @__PURE__ */ new Map();
  return (sapoName) => {
    const key = (sapoName ?? "").trim();
    if (!key) return null;
    if (cache2.has(key)) return cache2.get(key);
    const a = nameTokens(key), hint = hintOf(key);
    let out = null;
    if (a.length >= 2 || a.length === 1 && hint) {
      let cand = ps.filter((p) => a.every((w) => p.tk.includes(w)));
      if (!cand.length) cand = ps.filter((p) => p.tk.length >= 2 && p.tk.every((w) => a.includes(w)));
      if (hint) cand = cand.filter((p) => p.code === hint || p.team === hint);
      const kd = shiftOf(key);
      if (kd) {
        const same2 = cand.filter((p) => p.kd === kd);
        if (same2.length) cand = same2;
      }
      const teams = [...new Set(cand.map((p) => p.team))];
      if (teams.length === 1) out = teams[0];
    }
    cache2.set(key, out);
    return out;
  };
}
async function loadStaffTeams() {
  if (cached3 && Date.now() - cached3.at < 6e5) return cached3.fn;
  let fn = () => null;
  try {
    const db = supabaseOrders();
    const [{ data: teams, error: e1 }, { data: people, error: e2 }] = await Promise.all([
      db.from("teams").select("id, code, name, department"),
      db.from("profiles").select("full_name, team_id")
    ]);
    if (e1 || e2) throw e1 ?? e2;
    const team = new Map((teams ?? []).filter((t) => t.department === "kinh_doanh").map((t) => [t.id, t]));
    const profiles = (people ?? []).flatMap((p) => {
      const t = p.team_id ? team.get(p.team_id) : void 0;
      return t && p.full_name ? [{ name: String(p.full_name), team: TEAM_ALIAS[t.code] ?? String(t.name), teamCode: String(t.code) }] : [];
    });
    fn = buildStaffMatcher(profiles);
  } catch (e) {
    console.error("loadStaffTeams:", e);
  }
  cached3 = { at: Date.now(), fn };
  return fn;
}
async function loadStaffLookup() {
  const live = await loadStaffTeams();
  let saved = /* @__PURE__ */ new Map();
  try {
    const { data } = await sb.sales().from("staff_teams").select("sapo_name, team").not("team", "is", null);
    saved = new Map((data ?? []).map((r) => [String(r.sapo_name).trim(), String(r.team)]));
  } catch {
  }
  return (n) => {
    const k = (n ?? "").trim();
    return k ? saved.get(k) ?? live(k) : null;
  };
}
var TEAM_ALIAS, SUFFIX_TEAM, NOISE, fold, words, nameTokens, hintOf, shiftOf, cached3;
var init_staff_teams = __esm({
  "../NCPTSP/ncptsp/src/lib/staff-teams.ts"() {
    "use strict";
    init_server_only();
    init_admin();
    TEAM_ALIAS = { HN: "H\u1ED3ng Ng\u1ECDc", "T\u0110Q": "\u0110\xE1 qu\xFD", GB: "Global" };
    SUFFIX_TEAM = { tmdt: "TM\u0110T", store: "SHOP", nlb: "NLB", hlb: "HLB", tav: "TAV", ntd: "NT\u0110", global: "GB", dvl: "\u0110VL" };
    NOISE = /* @__PURE__ */ new Set(["kd1", "kd2", "kd3", "kho", "demo", "test", "admin", "sale", "sales", "nv", "ql", "thi", "van"]);
    fold = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
    words = (s) => fold(s).replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
    nameTokens = (s) => words(s).filter((w) => !NOISE.has(w) && !(w in SUFFIX_TEAM));
    hintOf = (s) => words(s).map((w) => SUFFIX_TEAM[w]).find(Boolean) ?? null;
    shiftOf = (s) => words(s).find((w) => /^kd[123]$/.test(w)) ?? null;
    cached3 = null;
  }
});

// ../NCPTSP/ncptsp/src/lib/tags.ts
var init_tags = __esm({
  "../NCPTSP/ncptsp/src/lib/tags.ts"() {
    "use strict";
  }
});

// ../NCPTSP/ncptsp/src/lib/roles.ts
var ROLE_LABELS, ROLES;
var init_roles = __esm({
  "../NCPTSP/ncptsp/src/lib/roles.ts"() {
    "use strict";
    ROLE_LABELS = {
      admin: "Qu\u1EA3n l\xFD",
      rnd: "R&D",
      design3d: "Thi\u1EBFt k\u1EBF 3D",
      media: "Media"
    };
    ROLES = Object.keys(ROLE_LABELS);
  }
});

// ../NCPTSP/ncptsp/packages/ncptsp-core/shim/session-worker.ts
var init_session_worker = __esm({
  "../NCPTSP/ncptsp/packages/ncptsp-core/shim/session-worker.ts"() {
    "use strict";
    init_roles();
  }
});

// ../NCPTSP/ncptsp/src/lib/spu-code.ts
function isNonProduct(name, code) {
  if (/TRUNGGIAN/i.test(code)) return true;
  const t = fold2(String(name ?? "")).replace(/^(\s*[\(\[][^\)\]]*[\)\]])+\s*/, "").trim();
  return NON_PRODUCT_NAME.test(t) || /^hop(\s|$)/.test(t);
}
function groupOfProduct(name, code) {
  const t = fold2(String(name ?? "")).replace(/^(\s*[\(\[][^\)\]]*[\)\]])+\s*/, "");
  let best = null;
  for (const [re, g] of KEYWORDS) {
    const m = re.exec(t);
    if (m && (best === null || m.index < best.at)) best = { at: m.index, g };
  }
  if (best) return best.g;
  return PREFIX_GROUP.find(([re]) => re.test(code))?.[1] ?? "Kh\xE1c";
}
var spuOf, fold2, KEYWORDS, PREFIX_GROUP, NON_PRODUCT_NAME;
var init_spu_code = __esm({
  "../NCPTSP/ncptsp/src/lib/spu-code.ts"() {
    "use strict";
    spuOf = (sku) => String(sku ?? "").replace(/^#/, "").trim().toUpperCase().split("-")[0].trim();
    fold2 = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
    KEYWORDS = [
      [/(^|\s)(set|combo|bo trang suc)(\s|$)/, "Set"],
      [/day chuyen/, "D\xE2y chuy\u1EC1n"],
      [/nhan/, "Nh\u1EABn"],
      [/lac tay|lac chan/, "L\u1EAFc tay"],
      [/vong co/, "Ki\u1EC1ng"],
      [/vong tay|vong chan|vong dau|(^|\s)vong(\s|$)/, "V\xF2ng tay"],
      [/bong tai|khuyen tai|hoa tai/, "B\xF4ng tai"],
      [/kieng/, "Ki\u1EC1ng"],
      [/mat day|mat chuyen/, "M\u1EB7t d\xE2y"]
    ];
    PREFIX_GROUP = [
      [/^N[0-9]/, "Nh\u1EABn"],
      [/^NM[0-9]/, "Nh\u1EABn"],
      [/^NT[0-9]/, "Nh\u1EABn"],
      [/^D[0-9]/, "D\xE2y chuy\u1EC1n"],
      [/^DT[0-9]/, "D\xE2y chuy\u1EC1n"],
      [/^L[0-9]/, "L\u1EAFc tay"],
      [/^LT[0-9]/, "L\u1EAFc tay"],
      [/^B[0-9]/, "B\xF4ng tai"],
      [/^BT[0-9]/, "B\xF4ng tai"],
      [/^K[0-9]/, "Ki\u1EC1ng"],
      [/^M[0-9]/, "M\u1EB7t d\xE2y"],
      [/^V[0-9]/, "V\xF2ng tay"],
      [/^S[0-9]/, "Set"]
    ];
    NON_PRODUCT_NAME = /nuoc rua bac|khan lau bac|bo do ni|cong cu|dung cu|giay dam bao|trung gian|(^|\s)danh sang(\s|$)/;
  }
});

// ../NCPTSP/ncptsp/src/lib/code-links.ts
var init_code_links = __esm({
  "../NCPTSP/ncptsp/src/lib/code-links.ts"() {
    "use strict";
    init_server_only();
    init_admin();
    init_daily_sales();
    init_session_worker();
    init_tags();
    init_spu_code();
  }
});

// ../NCPTSP/ncptsp/src/lib/rnd-options.ts
var CYCLE, o, DEFAULT_OPTIONS;
var init_rnd_options = __esm({
  "../NCPTSP/ncptsp/src/lib/rnd-options.ts"() {
    "use strict";
    CYCLE = [1, 13, 3, 15, 9, 16, 4, 12, 7, 14, 2, 17];
    o = (values) => values.map((value, i) => ({ value, color: CYCLE[i % CYCLE.length] }));
    DEFAULT_OPTIONS = {
      line: o(["Nh\u1EABn", "D\xE2y chuy\u1EC1n", "L\u1EAFc", "M\u1EB7t d\xE2y", "B\xF4ng tai", "Ki\u1EC1ng", "Charm"]),
      material: o(["B\u1EA1c S925", "B\u1EA1c S999", "V\xE0ng 10K", "V\xE0ng 14K", "V\xE0ng 18K"]),
      stone: o(["Moissanite", "CZ", "Sapphire", "Ruby", "Aquamarine", "Ng\u1ECDc trai", "Th\u1EA1ch anh", "Kh\xF4ng \u0111\xE1"]),
      color: o(["Xi v\xE0ng tr\u1EAFng", "Xi v\xE0ng v\xE0ng", "Xi v\xE0ng h\u1ED3ng"]),
      unit: o(["Chi\u1EBFc", "\u0110\xF4i", "B\u1ED9"]),
      supplier: o(["ENSHIDO"]),
      ref_platform: o(["Instagram", "Facebook", "TikTok", "Douyin", "Pinterest", "Etsy", "Shopee", "Website", "Kh\xE1c"]),
      source_status: [{ value: "Ch\u01B0a c\xF3", color: 18 }, { value: "\u0110\xE3 c\xF3 source", color: 2 }],
      order_status: [
        { value: "Ch\u01B0a \u0111\u1EB7t", color: 18, flag: "draft" },
        { value: "\u0110\xE3 \u0111\u1EB7t h\xE0ng", color: 4 },
        // đã có sẵn 3D nên đặt xưởng = chốt đúc luôn (tên cũ "Chốt đúc")
        { value: "Ho\xE0n th\xE0nh m\u1EABu", color: 1, flag: "done" },
        { value: "Hu\u1EF7", color: 8, flag: "cancel" }
      ],
      media_type: o(["Quay video tr\xEAn tay", "Quay ch\u1EBF t\xE1c", "Quay s\u1EA3n ph\u1EA9m", "Ch\u1EE5p s\u1EA3n ph\u1EA9m", "Quay review"]),
      kill_reason: o(["Tr\xF9ng m\u1EABu", "Gi\xE1 v\u1ED1n cao", "Kh\xF3 s\u1EA3n xu\u1EA5t", "3D kh\xF4ng \u0111\u1EA1t", "Kh\xF4ng c\xF3 ngu\u1ED3n \u0111\xE1", "Traffic th\u1EA5p", "Kh\xE1c"]),
      review: [{ value: "T\u1ED1t", color: 2 }, { value: "Trung b\xECnh", color: 3 }, { value: "K\xE9m", color: 5 }]
    };
  }
});

// ../NCPTSP/ncptsp/src/lib/pipeline-constants.ts
var PRODUCT_GROUPS, APPROVAL_FROM_LABEL, APPROVAL_TO_LABEL, GROUP_OPTS;
var init_pipeline_constants = __esm({
  "../NCPTSP/ncptsp/src/lib/pipeline-constants.ts"() {
    "use strict";
    PRODUCT_GROUPS = { gmv: "GMV", traffic: "Traffic", profit: "Profit", return: "Return" };
    APPROVAL_FROM_LABEL = { "B\u1EA3n nh\xE1p": "draft", "Ch\u1EDD duy\u1EC7t": "pending", "\u0110\xE3 duy\u1EC7t": "approved", "T\u1EEB ch\u1ED1i": "rejected" };
    APPROVAL_TO_LABEL = Object.fromEntries(Object.entries(APPROVAL_FROM_LABEL).map(([k, v]) => [v, k]));
    GROUP_OPTS = Object.entries(PRODUCT_GROUPS).map(([, v], i) => ({ value: v, color: i + 1 }));
  }
});

// ../NCPTSP/ncptsp/src/lib/pipeline.ts
async function getTeams(activeOnly = false) {
  const all = await allTeams();
  return activeOnly ? all.filter((t) => t.is_active) : all;
}
var allTeams, getAllProfiles, rndOptionsRaw;
var init_pipeline = __esm({
  "../NCPTSP/ncptsp/src/lib/pipeline.ts"() {
    "use strict";
    init_server_only();
    init_next_cache();
    init_admin();
    init_cache_tags();
    init_tags();
    init_code_links();
    init_session_worker();
    init_rnd_options();
    init_pipeline_constants();
    allTeams = unstable_cache(async () => {
      const { data, error } = await sb.core().from("teams").select("id, name, is_active").order("name");
      if (error) throw error;
      return data;
    }, ["teams"], { tags: [TAG.teams], revalidate: 3600 });
    getAllProfiles = unstable_cache(async () => {
      const { data, error } = await sb.core().from("profiles").select("id, full_name, role, is_active, team_id").order("full_name");
      if (error) throw error;
      return data;
    }, ["profiles-basic", "v2"], { tags: [TAG.profiles], revalidate: 3600 });
    rndOptionsRaw = unstable_cache(async () => {
      const { data } = await sb.core().from("settings").select("value").eq("key", "rnd_options").maybeSingle();
      return data?.value ?? {};
    }, ["rnd-options"], { tags: [TAG.rndOptions], revalidate: 3600 });
  }
});

// ../NCPTSP/ncptsp/src/lib/spu-data.ts
async function loadSpuMeta() {
  await loadSpuRows();
  return cache.meta;
}
async function loadSpuRows() {
  if (cache && Date.now() - cache.at < 3e5) return cache.rows;
  return (await computeSpuRows(false)).rows;
}
async function computeSpuRows(light) {
  const today = todayVN();
  const since = addDays3(today, -29);
  const [accounts, teams, staffTeam] = await Promise.all([getAccounts(), getTeams(), loadStaffLookup()]);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const chanById = new Map(accounts.map((a) => [a.id, a]));
  const chanByTikTok = new Map(accounts.filter((a) => a.platform === "tiktok").map((a) => [normTikTokName(a.name), a]));
  const teamOfChannel = (id) => {
    const a = id ? chanById.get(id) : void 0;
    return a?.team_id ? teamName.get(a.team_id) ?? null : null;
  };
  const teamOfTags = (tags) => {
    if (!tags) return null;
    const parts = tags.split(",").map((t) => t.trim());
    for (const t of parts) {
      const m = t.match(/^(?:page_id_)?(\d{6,})$/i);
      if (m) {
        const tm = teamOfChannel(m[1]);
        if (tm) return tm;
      }
    }
    for (const t of parts) {
      const m = t.match(/^tiktok_business_(?!id_)(.+)$/i);
      if (m) {
        const n = normTikTokName(m[1]);
        const a = chanByTikTok.get(n) ?? chanById.get(TT_NAME_PREFIX + n);
        const tm = a?.team_id ? teamName.get(a.team_id) ?? null : null;
        if (tm) return tm;
      }
    }
    return null;
  };
  const canon2 = canonOf(await loadSpuAliases());
  const [skuSum, stockRaw0, catalog, sold, posts, ownImages, skuOv, ownNames, receipts, excluded] = await Promise.all([
    loadSkuSummary(),
    loadStock(),
    loadCatalog(),
    // ~11.000 dòng: bộ đệm chung chia đoạn 3.000 dòng (mỗi mục < 2 MB)
    loadSold30(since, today, (staff, tags) => isAdsTags(tags) || teamOfTags(tags) === ADS_TEAM ? ADS_TEAM : staffTeam(staff) ?? teamOfTags(tags), teamOfChannel, canon2),
    light ? Promise.resolve([]) : loadVideoPosts(today),
    // ~30.000 video gắn mã: bộ đệm chung chia đoạn theo thời gian (nội dung / link / ảnh bìa chỉ nạp khi mở ngăn video — loadVideoDetails)
    loadOwnImages(),
    loadSkuOverrides(),
    loadOwnNames(),
    loadReceipts(),
    loadExcluded()
  ]);
  const stockRaw = stockRaw0.map((s) => ({ ...s, code: canon2(s.code) }));
  const splitCodes = new Set([...skuOv.values()].flatMap((c) => [c, c.slice(0, -1)]));
  const sales30 = sold.map;
  const variants = /* @__PURE__ */ new Map();
  for (const k of skuSum) {
    const c = canon2(k.code);
    variants.set(c, (variants.get(c) ?? 0) + k.variants);
  }
  for (const s of stockRaw) if (!variants.has(s.code)) variants.set(s.code, 1);
  for (const c of sales30.keys()) if (c && !variants.has(c)) variants.set(c, 1);
  const stockHasAvail = stockRaw.some((s) => s.available !== null);
  const availBy = /* @__PURE__ */ new Map();
  const stockBy = /* @__PURE__ */ new Map(), incoming = /* @__PURE__ */ new Map(), ageW = /* @__PURE__ */ new Map();
  for (const s of stockRaw) {
    const m = stockBy.get(s.code) ?? {};
    if (s.stock > 0) m[s.warehouse] = (m[s.warehouse] ?? 0) + s.stock;
    stockBy.set(s.code, m);
    incoming.set(s.code, (incoming.get(s.code) ?? 0) + s.incoming);
    if (s.available !== null) {
      const am = availBy.get(s.code) ?? {};
      am[s.warehouse] = (am[s.warehouse] ?? 0) + s.available;
      availBy.set(s.code, am);
    }
    if (!receipts.bySku.size && s.stock > 0 && s.start_date) {
      const a = ageW.get(s.code) ?? { w: 0, d: 0 };
      a.w += s.stock;
      a.d += s.stock * Math.max(0, dayDiff(s.start_date, today));
      ageW.set(s.code, a);
    }
  }
  const ageApprox = /* @__PURE__ */ new Set();
  if (receipts.bySku.size && receipts.first) {
    const floorAge = Math.max(0, dayDiff(receipts.first, today));
    const perSku = /* @__PURE__ */ new Map();
    for (const s of stockRaw) if (s.stock > 0 && s.sku) {
      const k = s.sku.toUpperCase(), c = perSku.get(k) ?? { code: s.code, total: 0 };
      c.total += s.stock;
      perSku.set(k, c);
    }
    for (const [sku, { code, total }] of perSku) {
      let need = total;
      const a = ageW.get(code) ?? { w: 0, d: 0 };
      for (const [date, qty] of receipts.bySku.get(sku) ?? []) {
        if (need <= 0) break;
        const take = Math.min(qty, need);
        a.w += take;
        a.d += take * Math.max(0, dayDiff(date, today));
        need -= take;
      }
      if (need > 0) {
        a.w += need;
        a.d += need * floorAge;
        ageApprox.add(code);
      }
      ageW.set(code, a);
    }
  }
  const skuName = /* @__PURE__ */ new Map();
  for (const k of skuSum) if (k.name && !skuName.has(k.code) && canon2(k.code) === k.code) skuName.set(k.code, k.name);
  const info = /* @__PURE__ */ new Map();
  for (const c of catalog) {
    const k = spuOf(c.code);
    const cur = info.get(k);
    if (!cur || c.code.toUpperCase() === k && !cur.name) info.set(k, { name: c.name, image: c.image_url });
  }
  for (const [c, url] of ownImages) info.set(c, { name: info.get(c)?.name ?? null, image: url });
  const chan = new Map(accounts.map((a) => [a.id, a]));
  const vidsBy = /* @__PURE__ */ new Map();
  for (const p of posts) {
    const ch = chan.get(p.channel_id);
    if (!ch) continue;
    const vid = {
      id: p.id,
      channelId: p.channel_id,
      age: Math.max(0, dayDiff(vnDay2(p.published_at), today)),
      views: Number(p.views ?? 0),
      platform: ch ? PLATFORM[ch.platform] ?? "FB" : "FB",
      channel: ch?.name ?? "\u2014",
      team: ch?.team_id ? teamName.get(ch.team_id) ?? null : null
    };
    for (const c of new Set((p.product_codes ?? []).map((x) => canon2(spuOf(x))))) (vidsBy.get(c) ?? vidsBy.set(c, []).get(c)).push(vid);
  }
  const rows = [];
  for (const [code, n] of variants) {
    if (!code) continue;
    const stock = stockBy.get(code) ?? {};
    const a = ageW.get(code), vids = vidsBy.get(code) ?? [];
    const i = info.get(code);
    const own = ownNames.get(code);
    const catName = splitCodes.has(code) ? null : i?.name;
    const name = pickName([own, catName, skuName.get(code), i?.name], code);
    if (excluded.has(code) || isNonProduct(name, code)) continue;
    rows.push({
      code,
      name,
      group: groupOfProduct(own || catName || skuName.get(code) || i?.name, code),
      variants: n,
      image: i?.image ?? null,
      stockBy: stock,
      availBy: stockHasAvail ? availBy.get(code) ?? {} : null,
      incoming: incoming.get(code) ?? 0,
      ageDays: a && a.w > 0 ? Math.round(a.d / a.w) : null,
      ageApprox: ageApprox.has(code),
      sold30: sales30.has(code) ? sales30.get(code) : sales30.size ? 0 : null,
      soldBy: sold.byTeam.get(code) ?? {},
      sales: sold.saleLines.get(code) ?? [],
      vids,
      footage: null,
      teams: [...new Set(vids.map((v) => v.team).filter((t) => !!t))]
    });
  }
  const meta = { salesSource: sold.source, salesLines: sold.lines, salesQty: sold.qty, salesFrom: sold.from, salesTo: sold.to, skus: skuSum.reduce((n, k) => n + k.variants, 0), teamQty: sold.teamQty };
  if (!light) cache = { at: Date.now(), rows, meta };
  return { rows, meta };
}
async function loadVideoPosts(today) {
  const edges = [1, -29, -79, -129, -194, -259, -329, -(VIDEO_DAYS - 1)].map((n) => `${addDays3(today, n)}T00:00:00+07:00`);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const parts = await Promise.all(edges.slice(0, -1).map((hi, i) => (i === 0 ? recentVideos : olderVideos)(edges[i + 1], hi)));
      return parts.flat().sort((a, b) => a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0).map(([id, channel_id, published_at, views, product_codes]) => ({ id, channel_id, published_at, views, product_codes }));
    } catch (e) {
      console.error("loadVideoPosts l\u1ED7i:", e instanceof Error ? e.message : e);
      if (attempt === 0) await new Promise((r) => setTimeout(r, 2e3));
    }
  }
  return [];
}
async function loadSkuSummary() {
  try {
    return await skuSummaryCached();
  } catch {
  }
  const out = /* @__PURE__ */ new Map();
  for (const k of await loadSkus()) {
    const c = spuOf(k.code || k.sku), cur = out.get(c) ?? { code: c, variants: 0, name: null };
    cur.variants += 1;
    if (k.name && !cur.name) cur.name = k.name;
    out.set(c, cur);
  }
  return [...out.values()];
}
async function loadExcluded() {
  try {
    return new Set(await excludedCached());
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function pickName(cands, fallback) {
  const list = cands.map((c) => c?.trim()).filter((c) => !!c);
  return list.find((c) => !isCraftName(c)) ?? list[0] ?? fallback;
}
async function loadOwnNames() {
  try {
    return new Map(await ownNamesCached());
  } catch {
    return /* @__PURE__ */ new Map();
  }
}
async function loadOwnImages() {
  try {
    return (await ownImagesCached()).map(([c, u]) => [c, u.startsWith("http") ? u : IMG_BASE + u]);
  } catch {
    return [];
  }
}
async function loadSkus() {
  const q = (cols) => fetchAll((a, b) => sb.sales().from("inventory_skus").select(cols).order("sku").range(a, b));
  try {
    return await q("sku, code, name");
  } catch {
    try {
      return await q("sku, code");
    } catch {
      return [];
    }
  }
}
async function loadReceipts() {
  const bySku = /* @__PURE__ */ new Map();
  let first = null;
  try {
    for (const [sku, d, q] of await receiptsCached()) {
      (bySku.get(sku) ?? bySku.set(sku, []).get(sku)).push([d, q]);
      if (!first || d < first) first = d;
    }
  } catch {
  }
  return { bySku, first };
}
async function loadCatalog() {
  try {
    return (await Promise.all(Array.from({ length: CATALOG_CHUNKS }, (_, i) => catalogChunk(i)))).flat();
  } catch {
    return [];
  }
}
async function loadStock() {
  try {
    return await stockCached();
  } catch {
    return loadStockFresh();
  }
}
async function loadStockFresh() {
  const q = (cols) => fetchAll((a, b) => sb.sales().from("inventory_stock").select(cols).order("sku").order("warehouse").range(a, b));
  for (const cols of ["sku, code, warehouse, stock, incoming, available, start_date", "sku, code, warehouse, stock, incoming, available", "sku, code, warehouse, stock, incoming, start_date", "sku, code, warehouse, stock, incoming"]) {
    try {
      return (await q(cols)).map((r) => ({ ...r, incoming: Number(r.incoming ?? 0), available: r.available === null || r.available === void 0 ? null : Number(r.available), start_date: r.start_date ?? null }));
    } catch {
    }
  }
  return [];
}
async function loadSold30(since, today, teamOfLine, teamOfChannel, canon2 = (c) => c) {
  const out = /* @__PURE__ */ new Map(), byTeam = /* @__PURE__ */ new Map(), saleLines = /* @__PURE__ */ new Map();
  const add = (code, qty, team, day) => {
    out.set(code, (out.get(code) ?? 0) + qty);
    (saleLines.get(code) ?? saleLines.set(code, []).get(code)).push({ age: Math.max(0, dayDiff(day, today)), qty, team });
    if (team) {
      const m = byTeam.get(code) ?? {};
      m[team] = (m[team] ?? 0) + qty;
      byTeam.set(code, m);
    }
  };
  const none = { map: out, byTeam, saleLines, source: "none", lines: 0, qty: 0, teamQty: 0, from: null, to: null };
  try {
    const groups = await orderGroupsCached(since);
    if (groups.length) {
      let qty = 0, teamQty = 0, lines = 0;
      const days = [];
      for (const g of groups) {
        lines += Number(g.lines);
        if (/hủy|huỷ/i.test(g.status ?? "")) continue;
        const n = Number(g.qty), team = teamOfLine(g.staff ?? null, g.tags ?? null);
        days.push(g.day);
        add(canon2(spuOf(g.code)), n, team, g.day);
        qty += n;
        if (team) teamQty += n;
      }
      days.sort();
      return { map: out, byTeam, saleLines, source: "orders", lines, qty, teamQty, from: days[0] ?? null, to: days[days.length - 1] ?? null };
    }
  } catch {
  }
  const q = (cols) => fetchAll((a, b) => sb.sales().from("imported_order_lines").select(cols).gt("price", 0).gte("ordered_at", `${since}T00:00:00+07:00`).order("order_id").order("sku").range(a, b));
  try {
    let rows;
    try {
      rows = await q("code, qty, status, ordered_at, tags, staff");
    } catch {
      try {
        rows = await q("code, qty, status, ordered_at, tags");
      } catch {
        rows = await q("code, qty, status, ordered_at");
      }
    }
    if (rows.length) {
      let qty = 0, teamQty = 0;
      const days = [];
      for (const r of rows) {
        if (/hủy|huỷ/i.test(r.status ?? "")) continue;
        const n = Number(r.qty ?? 0), team = teamOfLine(r.staff ?? null, r.tags ?? null);
        days.push(vnDay2(r.ordered_at));
        add(canon2(spuOf(r.code)), n, team, vnDay2(r.ordered_at));
        qty += n;
        if (team) teamQty += n;
      }
      days.sort();
      return { map: out, byTeam, saleLines, source: "orders", lines: rows.length, qty, teamQty, from: days[0] ?? null, to: days[days.length - 1] ?? null };
    }
  } catch {
  }
  try {
    const rows = await fetchAll((a, b) => sb.sales().from("daily_sales").select("code, qty_sold, page_id, date").gte("date", since).neq("channel", "bao_hanh").order("date").order("code").range(a, b));
    let qty = 0, teamQty = 0;
    for (const r of rows) {
      const n = Number(r.qty_sold ?? 0), team = teamOfChannel(r.page_id);
      add(canon2(spuOf(r.code)), n, team, r.date);
      qty += n;
      if (team) teamQty += n;
    }
    if (rows.length) return { map: out, byTeam, saleLines, source: "sapo", lines: rows.length, qty, teamQty, from: since, to: null };
  } catch {
  }
  return none;
}
var DAY2, vnDay2, dayDiff, addDays3, PLATFORM, ADS_TEAM, ADS_TAGS, isAdsTags, VIDEO_DAYS, cache, loadSpuRowsLight, videoChunk, recentVideos, olderVideos, skuSummaryCached, IMG_BASE, ownImagesCached, ownNamesCached, excludedCached, isCraftName, receiptsCached, CATALOG_CHUNK, CATALOG_CHUNKS, catalogChunk, stockCached, orderGroupsCached;
var init_spu_data = __esm({
  "../NCPTSP/ncptsp/src/lib/spu-data.ts"() {
    "use strict";
    init_server_only();
    init_next_cache();
    init_admin();
    init_db_gate();
    init_cache_tags();
    init_sku_overrides();
    init_spu_alias();
    init_data();
    init_name();
    init_staff_teams();
    init_pipeline();
    init_spu_code();
    DAY2 = 864e5;
    vnDay2 = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
    dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY2);
    addDays3 = (d, n) => new Date(Date.parse(d) + n * DAY2).toISOString().slice(0, 10);
    PLATFORM = { facebook: "FB", instagram: "IG", tiktok: "TT" };
    ADS_TEAM = "ADS";
    ADS_TAGS = ["page_id_1659994180936411", "page_HuyK - Trang s\u1EE9c thi\u1EBFt k\u1EBF"].map((t) => t.toLowerCase());
    isAdsTags = (tags) => !!tags && tags.split(",").some((t) => ADS_TAGS.includes(t.trim().toLowerCase()));
    VIDEO_DAYS = 360;
    cache = null;
    loadSpuRowsLight = () => computeSpuRows(true);
    videoChunk = (revalidate) => unstable_cache(
      async (fromIso, toIso) => {
        const fast = await heavyRpc(() => sb.sales().rpc("video_posts_chunk", { p_from: fromIso, p_to: toIso }), 2, 2e3);
        if (!fast.error && Array.isArray(fast.data)) return fast.data;
        const rows = await fetchAll((a, b) => sb.social().from("posts").select("id, channel_id, published_at, views, product_codes").in("kind", ["video", "reel"]).neq("product_codes", "{}").gte("published_at", fromIso).lt("published_at", toIso).order("published_at").order("id").range(a, b));
        return rows.map((r) => [r.id, r.channel_id, r.published_at, r.views, r.product_codes]);
      },
      ["spu-video-chunk", `v3-${revalidate}`],
      { tags: [TAG.spuData], revalidate }
    );
    recentVideos = videoChunk(600);
    olderVideos = videoChunk(21600);
    skuSummaryCached = unstable_cache(
      async () => fetchAll((a, b) => sb.sales().rpc("spu_sku_summary").range(a, b)),
      ["spu-sku-summary", "v2"],
      { tags: [TAG.spuData], revalidate: 21600 }
    );
    IMG_BASE = "https://bizweb.dktcdn.net/100/561/898/products/";
    ownImagesCached = unstable_cache(async () => {
      const rows = await fetchAll((a, b) => sb.sales().from("spu_images").select("code, image_url").not("image_url", "is", null).order("code").range(a, b));
      return rows.map((r) => [r.code, r.image_url.startsWith(IMG_BASE) ? r.image_url.slice(IMG_BASE.length) : r.image_url]);
    }, ["spu-own-images", "v2"], { tags: [TAG.spuData], revalidate: 21600 });
    ownNamesCached = unstable_cache(
      async () => (await fetchAll((a, b) => sb.sales().from("spu_images").select("code, name").not("name", "is", null).order("code").range(a, b))).map((r) => [r.code, r.name]),
      ["spu-own-names", "v2"],
      { tags: [TAG.spuData], revalidate: 21600 }
    );
    excludedCached = unstable_cache(
      async () => (await fetchAll((a, b) => sb.sales().from("spu_excluded").select("code").order("code").range(a, b))).map((r) => r.code.toUpperCase()),
      ["spu-excluded", "v1"],
      { tags: [TAG.spuData], revalidate: 21600 }
    );
    isCraftName = (n) => /^\s*[(\[]?\s*chế\s*tác/i.test(String(n ?? "").normalize("NFC"));
    receiptsCached = unstable_cache(
      async () => (await fetchAll((a, b) => sb.sales().from("stock_receipts").select("sku, received_on, qty").order("sku").order("received_on", { ascending: false }).range(a, b))).map((r) => [r.sku.toUpperCase(), r.received_on, Number(r.qty)]),
      ["stock-receipts", "v2"],
      { tags: [TAG.spuData], revalidate: 21600 }
    );
    CATALOG_CHUNK = 3e3;
    CATALOG_CHUNKS = 8;
    catalogChunk = unstable_cache(
      async (i) => fetchAll((a, b) => {
        const from = i * CATALOG_CHUNK + a, to = Math.min(i * CATALOG_CHUNK + b, (i + 1) * CATALOG_CHUNK - 1);
        if (from > to) return Promise.resolve({ data: [], error: null });
        return sb.sales().from("catalog").select("code, name, image_url").order("code").range(from, to);
      }),
      ["spu-catalog-chunk", "v1"],
      { tags: [TAG.spuData], revalidate: 21600 }
    );
    stockCached = unstable_cache(async () => loadStockFresh(), ["spu-stock", "v1"], { tags: [TAG.spuData], revalidate: 21600 });
    orderGroupsCached = unstable_cache(
      async (since) => fetchAll((a, b) => sb.sales().rpc("spu_order_groups", { p_since: `${since}T00:00:00+07:00` }).range(a, b)),
      ["spu-order-groups", "v2"],
      { tags: [TAG.spuData], revalidate: 21600 }
    );
  }
});

// ../NCPTSP/ncptsp/src/lib/video-daily.ts
async function refreshVideoDaily(opts = {}) {
  const t0 = Date.now();
  try {
    const db = sb.sales();
    let fact = null;
    if (opts.full) {
      const today = dayStr(new Date(Date.now() + 7 * 36e5));
      const startedAt = (/* @__PURE__ */ new Date()).toISOString();
      const parts = [];
      for (let lo = -359; lo <= 0; lo += 60) {
        const last = lo + 60 > 0;
        const { data, error } = await db.rpc("refresh_video_fact", { p_from: addDay(today, lo), p_to: addDay(today, Math.min(lo + 60, 1)), ...last ? { p_mark_at: startedAt } : {} });
        if (error) return missing(error) ? { ok: false, skipped: true, error: "Ch\u01B0a ch\u1EA1y migration 089", ms: Date.now() - t0 } : { ok: false, error: `refresh_video_fact: ${error.message}`, ms: Date.now() - t0 };
        parts.push(data);
      }
      fact = parts;
    } else {
      const { data, error } = await db.rpc("refresh_video_fact");
      if (error) return missing(error) ? { ok: false, skipped: true, error: "Ch\u01B0a ch\u1EA1y migration 089", ms: Date.now() - t0 } : { ok: false, error: `refresh_video_fact: ${error.message}`, ms: Date.now() - t0 };
      fact = data;
      if (data?.skipped) return { ok: false, skipped: true, error: "Ch\u01B0a d\u1EF1ng \u0111\u1EA7y \u0111\u1EE7 l\u1EA7n \u0111\u1EA7u \u2014 b\u1EA5m \u201CD\u1EF1ng \u0111\u1EA7y \u0111\u1EE7\u201D tr\u01B0\u1EDBc", fact, ms: Date.now() - t0 };
    }
    const d = await db.rpc("refresh_video_daily");
    if (d.error) return { ok: false, error: `refresh_video_daily: ${d.error.message}`, fact, ms: Date.now() - t0 };
    const g = await db.rpc("refresh_video_views");
    return { ok: true, fact, daily: d.data, growth: g.error ? { error: g.error.message } : g.data, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
  }
}
async function checkVideoDaily() {
  const { data, error } = await sb.sales().rpc("video_parity");
  if (error) return { ok: false, error: missing(error) ? "Ch\u01B0a ch\u1EA1y migration 089" : error.message };
  const p = data;
  return { ok: p.only_old === 0 && p.only_new === 0 && p.diff_videos === 0, ...p };
}
var missing, dayStr, addDay;
var init_video_daily = __esm({
  "../NCPTSP/ncptsp/src/lib/video-daily.ts"() {
    "use strict";
    init_server_only();
    init_admin();
    missing = (e) => !!e && (e.code === "PGRST202" || e.code === "42883" || e.code === "42P01" || /could not find the function|does not exist/i.test(e.message ?? ""));
    dayStr = (d) => d.toISOString().slice(0, 10);
    addDay = (s, n) => dayStr(new Date(Date.parse(`${s}T00:00:00Z`) + n * 864e5));
  }
});

// ../NCPTSP/ncptsp/src/lib/team-lines.ts
async function refreshTeamLines(force = false) {
  try {
    const db = sb.sales();
    if (!force) {
      const m = await db.from("team_lines_meta").select("dirty").eq("id", 1).maybeSingle();
      if (m.error) return { ok: false, error: m.error.message };
      if (m.data && m.data.dirty === false) return { ok: true, skipped: true };
    }
    const begin = await db.rpc("team_lines_begin");
    if (begin.error) return { ok: false, error: begin.error.message };
    const teams = await db.rpc("team_lines_teams");
    if (teams.error) return { ok: false, error: teams.error.message };
    const list = teams.data ?? [];
    for (const team of list) {
      let res = await db.rpc("team_lines_part", { p_team: team });
      for (let a = 0; a < 2 && res.error && isTimeout3(res.error.message); a++) {
        await new Promise((r) => setTimeout(r, 1500 * (a + 1)));
        res = await db.rpc("team_lines_part", { p_team: team });
      }
      if (res.error) return { ok: false, error: `team_lines_part(${team}): ${res.error.message}`, teams: list.length };
    }
    const fin = await db.rpc("team_lines_finish", { p_started: begin.data });
    if (fin.error) return { ok: false, error: fin.error.message };
    const d = fin.data;
    return { ok: true, clean: !!d?.clean, rows: d?.rows, teams: list.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
var isTimeout3;
var init_team_lines = __esm({
  "../NCPTSP/ncptsp/src/lib/team-lines.ts"() {
    "use strict";
    init_server_only();
    init_admin();
    isTimeout3 = (m) => /timeout|canceling statement/i.test(m ?? "");
  }
});

// ../NCPTSP/ncptsp/src/lib/spu-summary-build.ts
function buildSummaryTables(rows, today, runId) {
  const summary = rows.map((r) => ({
    run_id: runId,
    code: r.code,
    name: r.name,
    grp: r.group,
    variants: r.variants,
    image: r.image,
    stock_by: r.stockBy,
    stock_total: Object.values(r.stockBy).reduce((a, b) => a + b, 0),
    avail_by: r.availBy,
    incoming: r.incoming,
    age_days: r.ageDays,
    age_approx: !!r.ageApprox,
    sold30: r.sold30,
    sold_by_team: r.soldBy,
    video_teams: r.teams,
    search_text: normSearch(`${r.code} ${r.name}`)
  }));
  const sales = [];
  for (const r of rows) {
    const m = /* @__PURE__ */ new Map();
    for (const l of r.sales) {
      const k = `${l.age}|${l.team ?? ""}`;
      m.set(k, (m.get(k) ?? 0) + l.qty);
    }
    for (const [k, qty] of m) {
      const i = k.indexOf("|");
      sales.push({ run_id: runId, code: r.code, day: addDays4(today, -Number(k.slice(0, i))), team: k.slice(i + 1), qty });
    }
  }
  const videos = [];
  for (const r of rows) {
    const m = /* @__PURE__ */ new Map();
    for (const v of r.vids) {
      const day = addDays4(today, -v.age), k = `${day}|${v.channelId ?? ""}`;
      const cur = m.get(k) ?? { run_id: runId, code: r.code, day, channel_id: v.channelId ?? "", team: v.team ?? "", platform: v.platform ?? "FB", videos: 0, views: 0 };
      cur.videos += 1;
      cur.views += v.views;
      m.set(k, cur);
    }
    videos.push(...m.values());
  }
  return { summary, sales, videos };
}
var DAY3, addDays4, normSearch;
var init_spu_summary_build = __esm({
  "../NCPTSP/ncptsp/src/lib/spu-summary-build.ts"() {
    "use strict";
    DAY3 = 864e5;
    addDays4 = (d, n) => new Date(Date.parse(d) + n * DAY3).toISOString().slice(0, 10);
    normSearch = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
  }
});

// ../NCPTSP/ncptsp/src/lib/system-log.ts
async function logSystem(e) {
  try {
    const { error } = await sb.core().from("system_logs").insert({
      kind: e.kind,
      ok: e.ok,
      summary: e.summary.slice(0, 500),
      detail: e.detail ?? null,
      actor_id: e.actor?.id ?? null,
      actor_name: e.actor?.name ?? null,
      source: e.actor ? "user" : "auto"
    });
    if (error) {
      if (!/system_logs|schema cache|does not exist/i.test(error.message)) console.error("[system-log]", error.message);
      return;
    }
    if (Math.random() < 0.02) await sb.core().from("system_logs").delete().lt("at", new Date(Date.now() - 180 * 864e5).toISOString());
  } catch (err) {
    console.error("[system-log]", err);
  }
}
var init_system_log = __esm({
  "../NCPTSP/ncptsp/src/lib/system-log.ts"() {
    "use strict";
    init_server_only();
    init_admin();
    init_session_worker();
  }
});

// ../NCPTSP/ncptsp/src/lib/kpi-constants.ts
function parseRules(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return "C\u1EA7n \xEDt nh\u1EA5t 1 \u0111i\u1EC1u ki\u1EC7n KPI";
  const out = [];
  for (const r of raw) {
    const metric = r?.metric, op = r?.op, value = Number(r?.value);
    if (!(metric in KPI_METRICS)) return `Ch\u1EC9 s\u1ED1 kh\xF4ng h\u1EE3p l\u1EC7: ${metric}`;
    if (!(op in KPI_OPS)) return `Ph\xE9p so s\xE1nh kh\xF4ng h\u1EE3p l\u1EC7: ${op}`;
    if (!Number.isFinite(value) || value < 0) return `Ng\u01B0\u1EE1ng c\u1EE7a "${KPI_METRICS[metric].label}" ph\u1EA3i l\xE0 s\u1ED1 \u2265 0`;
    out.push({ metric, op, value });
  }
  return out;
}
var KPI_METRICS, KPI_OPS;
var init_kpi_constants = __esm({
  "../NCPTSP/ncptsp/src/lib/kpi-constants.ts"() {
    "use strict";
    KPI_METRICS = {
      views: { label: "L\u01B0\u1EE3t xem", unit: "", group: "traffic", hint: "T\u1ED5ng l\u01B0\u1EE3t xem c\xE1c b\xE0i g\u1EAFn m\xE3" },
      viewers: { label: "Ng\u01B0\u1EDDi xem", unit: "", group: "traffic", hint: "C\u1ED9ng d\u1ED3n ng\u01B0\u1EDDi xem c\xE1c b\xE0i" },
      reactions: { label: "C\u1EA3m x\xFAc", unit: "", group: "traffic", hint: "Like, love... tr\xEAn c\xE1c b\xE0i" },
      clicks: { label: "L\u01B0\u1EE3t nh\u1EA5p", unit: "", group: "traffic", hint: "Nh\u1EA5p v\xE0o b\xE0i/link" },
      engagement_rate: { label: "T\u1EC9 l\u1EC7 t\u01B0\u01A1ng t\xE1c", unit: "%", group: "traffic", hint: "(C\u1EA3m x\xFAc + l\u01B0\u1EE3t nh\u1EA5p) \xF7 ng\u01B0\u1EDDi xem" },
      ctr: { label: "CTR", unit: "%", group: "traffic", hint: "L\u01B0\u1EE3t nh\u1EA5p \xF7 l\u01B0\u1EE3t xem" },
      qty_net: { label: "SL b\xE1n thu\u1EA7n", unit: "", group: "sales", hint: "S\u1ED1 l\u01B0\u1EE3ng b\xE1n tr\u1EEB ho\xE0n, theo ph\u1EA1m vi c\u1EE7a phi\xEAn" },
      conversion: { label: "Chuy\u1EC3n \u0111\u1ED5i", unit: "%", group: "sales", hint: "SL b\xE1n thu\u1EA7n \xF7 ng\u01B0\u1EDDi xem" }
    };
    KPI_OPS = { ">=": "\u2265", "<=": "\u2264" };
  }
});

// ../NCPTSP/ncptsp/src/lib/spu-tracking.ts
function saleFlags(stock, sl, R) {
  const inStock = stock > 0;
  return {
    inStock,
    active: inStock || sl !== null && sl > 0,
    other: sl !== null && sl < 0,
    bad: inStock && sl !== null && sl === 0,
    slow: sl !== null && sl > 0 && sl < R.sales.slowBelow,
    normal: sl !== null && sl >= R.sales.slowBelow && sl < R.sales.normalBelow,
    hot: sl !== null && sl >= R.sales.normalBelow
  };
}
function actionOf(i, R) {
  const { stock, inStock, sl30, sold, videos, flags: f } = i;
  const k = i.days / 30;
  const lowStock = stock <= R.restock.minUnits || sl30 !== null && stock < sl30 * R.restock.coverDays / 30;
  const strong = f.star || f.win || sold !== null && sold >= R.restock.minSold * k;
  return strong && lowStock ? "produce" : f.star || f.win ? "traffic" : f.winTraffic ? "convert" : f.bad ? "bad" : inStock && videos <= R.push.maxVideos && (stock >= R.push.minStock || i.ageDays !== null && i.ageDays >= R.push.minAgeDays) ? i.footage === 0 && videos === 0 ? "shoot" : "video" : inStock && f.slow ? "slow" : null;
}
function viewOf(row, opt) {
  const end = opt.endAge ?? 0;
  const inWin = row.vids.filter((v) => v.age >= end && v.age < end + opt.days && (!opt.teams?.length || !!v.team && opt.teams.includes(v.team)) && (!opt.pageIds || !!v.channelId && opt.pageIds.includes(v.channelId)));
  const stock = opt.wh ? row.stockBy[opt.wh] ?? 0 : Object.values(row.stockBy).reduce((a, b) => a + b, 0);
  const teams = opt.teams ?? [];
  const mine = (l) => !teams.length || l.team !== null && teams.includes(l.team);
  const sold = row.sold30 === null ? null : row.sales.filter((l) => l.age >= end && l.age < end + opt.days && mine(l)).reduce((n, l) => n + l.qty, 0);
  const sl30 = row.sold30 === null ? null : teams.length && !opt.companyClass ? row.sales.filter((l) => l.age < 30 && mine(l)).reduce((n, l) => n + l.qty, 0) : row.sold30;
  const videos = inWin.length;
  const views = videos ? inWin.reduce((n, v) => n + v.views, 0) : null;
  const R = opt.rules ?? DEFAULT_SPU_RULES;
  const { inStock, other, bad, slow, normal, hot, active } = saleFlags(stock, sl30, R);
  const age = row.ageDays;
  const winTraffic = !!opt.win?.wt.has(row.code), win = !!opt.win?.order.has(row.code), star = winTraffic && win;
  const hasVideo = videos > 0;
  const flags = { active, inStock, hot, normal, other, slow, bad, star, win, winTraffic, hasVideo };
  const action = actionOf({ stock, inStock, sl30, sold, videos, ageDays: age, footage: row.footage, days: opt.days, flags: { star, win, winTraffic, bad, slow } }, R);
  const available = row.availBy === null ? null : opt.wh ? row.availBy[opt.wh] ?? 0 : Object.values(row.availBy).reduce((a, b) => a + b, 0);
  return { row, stock, available, sold, videos, views, flags, action };
}
var DEFAULT_SPU_RULES, STATUS_FILTERS;
var init_spu_tracking = __esm({
  "../NCPTSP/ncptsp/src/lib/spu-tracking.ts"() {
    "use strict";
    DEFAULT_SPU_RULES = {
      // Phân loại bán THEO SỐ LƯỢNG BÁN 30 NGÀY GẦN NHẤT (SL) (kể cả SPU hết hàng vẫn bán; Tồn xấu chỉ tính SPU còn hàng):
      //   SL < 0 → Khác · SL = 0 → Tồn xấu · SL < slowBelow → Bán chậm · SL < normalBelow → Bán thường · còn lại → Bán chạy
      sales: { slowBelow: 20, normalBelow: 60 },
      // QUY TẮC WIN DUY NHẤT (biên bản họp R&D × ĐVKD 21/10/2026), dùng chung cho Dashboard và trang Theo dõi đẩy hàng — chỉnh ở trang KPI.
      // "Ngày đầu" = bài (video) ĐẦU TIÊN của SPU trong kỳ đang lọc. Win Traffic: lượt xem VÀ bình luận cộng dồn các bài trong `traffic.days` ngày đầu;
      // Win Đơn hàng: số sản phẩm bán (thuần) trong `order.days` ngày kể từ bài đầu tiên; Ngôi sao = đạt cả hai.
      win: { traffic: { days: 3, views: 1e5, comments: 0 }, order: { days: 7, qty: 30 } },
      // comments = 0: không xét bình luận (chỉ còn lượt xem trong N ngày); đặt > 0 ở Cài đặt nếu muốn xét lại
      // Video Win: tiêu chí chấm RIÊNG TỪNG VIDEO (chỉ số của chính video đó) — dùng ở danh sách video của mẫu, Đẩy mẫu ĐVKD và ngăn video của SPU
      video: { rules: [{ metric: "views", op: ">=", value: 3e4 }, { metric: "viewers", op: ">=", value: 3e3 }], match: "all" },
      // Gợi ý "Đẩy video": còn hàng, tồn nhiều / tồn lâu mà số video còn ít
      // Gợi ý "Cần lên video": còn hàng nhiều (hoặc tồn lâu) mà ít / chưa có video
      push: { minStock: 40, minAgeDays: 60, maxVideos: 2 },
      // Hết / sắp hết hàng: tồn thấp hơn số ngày bán dự trữ (tính theo tốc độ bán 30 ngày) hoặc dưới số lượng tối thiểu
      // minSold: SPU thường (chưa Win) cũng được gợi ý đẩy SX nếu bán từ mức này / 30 ngày mà sắp hết hàng
      restock: { coverDays: 15, minUnits: 10, minSold: 20 }
    };
    STATUS_FILTERS = [
      { id: "all", label: "SPU Active", test: () => true },
      // phạm vi bảng đã chỉ gồm SPU Active (còn tồn hoặc có đơn trong 30 ngày)
      { id: "instock", label: "C\xF2n h\xE0ng", test: (f) => f.inStock },
      { id: "outstock", label: "H\u1EBFt h\xE0ng c\xF3 \u0111\u01A1n", test: (f) => !f.inStock },
      // phạm vi bảng chỉ gồm SPU Active → không còn tồn nghĩa là có đơn trong 30 ngày (số "hết hàng có đơn" ở thẻ S0 Dashboard; migration 095)
      { id: "hot", label: "B\xE1n ch\u1EA1y", test: (f) => f.hot },
      // còn hàng, SL bán 30 ngày từ mốc "bán thường" trở lên (không cần traffic); cùng cách tính ở thẻ S0 của dashboard
      { id: "normal", label: "B\xE1n th\u01B0\u1EDDng", test: (f) => f.normal },
      { id: "slow", label: "B\xE1n ch\u1EADm", test: (f) => f.slow },
      { id: "bad", label: "T\u1ED3n x\u1EA5u", test: (f) => f.bad },
      { id: "star", label: "Ng\xF4i sao", test: (f) => f.star },
      { id: "win", label: "Win \u0110\u01A1n h\xE0ng", test: (f) => f.win },
      { id: "wintraffic", label: "Win Traffic", test: (f) => f.winTraffic },
      { id: "novideo", label: "Ch\u01B0a c\xF3 video", test: (f) => !f.hasVideo },
      { id: "video", label: "\u0110\xE3 c\xF3 video", test: (f) => f.hasVideo }
    ];
  }
});

// ../NCPTSP/ncptsp/src/lib/spu-rules.ts
var spu_rules_exports = {};
__export(spu_rules_exports, {
  SPU_RULES_KEY: () => SPU_RULES_KEY,
  loadSpuRules: () => loadSpuRules,
  loadVideoWinRules: () => loadVideoWinRules,
  mergeSpuRules: () => mergeSpuRules
});
function salesRules(v) {
  const d = DEFAULT_SPU_RULES.sales;
  const slowBelow = Math.max(1, Math.round(num(v?.slowBelow, d.slowBelow)));
  const normalBelow = Math.round(num(v?.normalBelow, d.normalBelow));
  return normalBelow > slowBelow ? { slowBelow, normalBelow } : d;
}
function winRules(v) {
  const d = DEFAULT_SPU_RULES.win;
  const t = v?.traffic ?? {}, o2 = v?.order ?? {};
  const int = (x, def, min, max = 1e9) => Math.min(max, Math.max(min, Math.round(num(x, def, min))));
  return {
    traffic: { days: int(t?.days, d.traffic.days, 1, 30), views: int(t?.views, d.traffic.views, 1), comments: int(t?.comments, d.traffic.comments, 0) },
    order: { days: int(o2?.days, d.order.days, 1, 30), qty: int(o2?.qty, d.order.qty, 1) }
  };
}
function mergeSpuRules(saved) {
  const s = saved ?? {};
  const d = DEFAULT_SPU_RULES;
  const videoRules = parseRules(s.video?.rules);
  return {
    ...d,
    sales: salesRules(s.sales),
    win: winRules(s.win),
    video: { rules: typeof videoRules === "string" ? d.video.rules : videoRules, match: s.video?.match === "any" ? "any" : "all" }
  };
}
async function loadSpuRules() {
  const { data } = await sb.core().from("settings").select("value").eq("key", SPU_RULES_KEY).maybeSingle();
  return mergeSpuRules(data?.value);
}
async function loadVideoWinRules() {
  const { data } = await sb.core().from("settings").select("value").eq("key", SPU_RULES_KEY).maybeSingle();
  return mergeSpuRules(data?.value).video;
}
var SPU_RULES_KEY, num;
var init_spu_rules = __esm({
  "../NCPTSP/ncptsp/src/lib/spu-rules.ts"() {
    "use strict";
    init_server_only();
    init_admin();
    init_kpi_constants();
    init_spu_tracking();
    SPU_RULES_KEY = "spu_rules";
    num = (v, d, min = 0) => typeof v === "number" && Number.isFinite(v) && v >= min ? v : d;
  }
});

// ../NCPTSP/ncptsp/src/lib/spu-winflags.ts
var spu_winflags_exports = {};
__export(spu_winflags_exports, {
  EMPTY_WIN: () => EMPTY_WIN,
  computeWinFlags: () => computeWinFlags,
  loadLaunchWinFlags: () => loadLaunchWinFlags,
  loadLaunchWinFlagsByMarket: () => loadLaunchWinFlagsByMarket,
  loadRollingWin: () => loadRollingWin,
  loadRollingWinByMarket: () => loadRollingWinByMarket
});
function computeWinFlags(posts, sales, rules, saleCode = (c) => c) {
  const first = /* @__PURE__ */ new Map();
  const byCode = /* @__PURE__ */ new Map();
  for (const p of posts) {
    const day = vnDay3(p.published_at);
    for (const c of new Set(p.product_codes.map((x) => x.toUpperCase()))) {
      if (!first.has(c) || day < first.get(c)) first.set(c, day);
      const l = byCode.get(c);
      const e = { day, views: Number(p.views ?? 0), comments: Number(p.comments ?? 0) };
      if (l) l.push(e);
      else byCode.set(c, [e]);
    }
  }
  const wt = /* @__PURE__ */ new Set();
  for (const [c, f] of first) {
    const end = addDays5(f, rules.traffic.days - 1);
    let v = 0, cm = 0;
    for (const e of byCode.get(c)) if (e.day <= end) {
      v += e.views;
      cm += e.comments;
    }
    if (v >= rules.traffic.views && cm >= rules.traffic.comments) wt.add(c);
  }
  const bySale = /* @__PURE__ */ new Map();
  for (const r of sales) {
    const l = bySale.get(r.code);
    if (l) l.push(r);
    else bySale.set(r.code, [r]);
  }
  const order = /* @__PURE__ */ new Set();
  for (const [c, f] of first) {
    const end = addDays5(f, rules.order.days - 1);
    const qty = (bySale.get(saleCode(c)) ?? []).filter((r) => r.date >= f && r.date <= end).reduce((n, r) => n + Number(r.qty_sold) - Number(r.qty_returned), 0);
    if (qty >= rules.order.qty) order.add(c);
  }
  return { wt: [...wt].sort(), order: [...order].sort() };
}
async function computeFromDb(a) {
  const want = a.codes ? [...new Set(a.codes.map((c) => c.toUpperCase()))] : null;
  const [{ data: ch }, { data: prod }, aliases] = await Promise.all([
    sb.social().from("channels").select("id").eq("is_active", true),
    sb.rnd().from("products").select("code, sapo_code").not("sapo_code", "is", null),
    // mã R&D có mã Sapo riêng (số bán nằm ở mã Sapo)
    loadSpuAliases()
    // quy đổi mã SPU cũ → mới (migration 066)
  ]);
  const canon2 = canonOf(aliases);
  const sapo = new Map((prod ?? []).filter((p) => p.code && p.sapo_code).map((p) => [String(p.code).toUpperCase(), String(p.sapo_code).toUpperCase()]));
  const saleCode = (c) => canon2(sapo.get(c) ?? c);
  const loadSales = (codes) => codes.length ? loadDailySales({
    codes: expandCodes(aliases, [...new Set(codes.map(saleCode))]),
    from: a.from,
    to: addDays5(a.to, a.rules.order.days),
    channels: a.channels.length ? a.channels : void 0,
    pageIds: a.pageIds ? a.pageIds.length ? a.pageIds : ["-"] : void 0
  }) : Promise.resolve([]);
  const postsQuery = () => {
    let q = sb.social().from("posts").select("channel_id, published_at, product_codes, views, comments").in("kind", ["video", "reel"]).neq("product_codes", "{}").gte("published_at", `${a.from}T00:00:00+07:00`).lte("published_at", `${a.to}T23:59:59+07:00`);
    if (a.pageIds) q = q.in("channel_id", a.pageIds.length ? a.pageIds : ["-"]);
    if (want) {
      const ex = expandCodes(aliases, want);
      q = q.overlaps("product_codes", [.../* @__PURE__ */ new Set([...ex, ...ex.map((c) => c.toLowerCase())])]);
    }
    return q;
  };
  const loadPosts = () => fetchAllByKey(
    (after2, limit) => {
      let q = postsQuery();
      if (after2) q = q.gt("published_at", after2);
      return q.order("published_at").order("id").limit(limit);
    },
    (r) => r.published_at,
    () => fetchAll((x, y) => postsQuery().order("published_at").order("id").range(x, y))
  );
  const active = new Set((ch ?? []).map((c) => c.id));
  let posts, sales;
  if (want) [posts, sales] = await Promise.all([loadPosts(), loadSales(want)]);
  else {
    posts = await loadPosts();
    sales = await loadSales([...new Set(posts.filter((p) => active.has(p.channel_id)).flatMap((p) => p.product_codes.map((c) => c.toUpperCase())))]);
  }
  const kept = canonPosts(aliases, posts.filter((p) => active.has(p.channel_id)));
  const salesC = aliases.size ? sales.map((r) => ({ ...r, code: canon2(r.code) })) : sales;
  return computeWinFlags(kept, salesC, a.rules, saleCode);
}
async function loadLaunchWinFlags(a) {
  const norm = { ...a, codes: a.codes ? [...new Set(a.codes.map((c) => c.toUpperCase()))].sort() : void 0, pageIds: a.pageIds ? [...a.pageIds].sort() : null, channels: [...a.channels].sort() };
  let out;
  try {
    out = await cached4(norm);
  } catch {
    out = await computeFromDb(norm);
  }
  return { wt: new Set(out.wt), order: new Set(out.order) };
}
async function rollingFromDb(a) {
  const [gainRes, sales] = await Promise.all([
    heavyQuery(async () => sb.sales().rpc("spu_traffic_gain", { p: { today: a.today, days: a.rules.traffic.days, ...a.pageIds ? { channels: a.pageIds } : {} } })),
    loadDailySales({
      from: addDays5(a.today, -(a.rules.order.days - 1)),
      to: a.today,
      channels: a.channels.length ? a.channels : void 0,
      pageIds: a.pageIds ? a.pageIds.length ? a.pageIds : ["-"] : void 0
    })
  ]);
  const wt = [];
  let meta = { base: addDays5(a.today, -a.rules.traffic.days), trafficReady: false, videos: 0, unknownVideos: 0 };
  if (!gainRes.error && gainRes.data) {
    const g = gainRes.data;
    for (const r of g.rows) if (Number(r.views) >= a.rules.traffic.views && Number(r.comments) >= a.rules.traffic.comments) wt.push(r.code.toUpperCase());
    meta = { base: g.base, trafficReady: true, videos: g.videos, unknownVideos: g.unknown };
  }
  const canon2 = canonOf(await loadSpuAliases());
  const net = /* @__PURE__ */ new Map();
  for (const r of sales) {
    const c = canon2(r.code);
    net.set(c, (net.get(c) ?? 0) + Number(r.qty_sold) - Number(r.qty_returned));
  }
  const order = [...net].filter(([, q]) => q >= a.rules.order.qty).map(([c]) => c).sort();
  return { wt: wt.sort(), order, meta };
}
async function loadRollingWin(a) {
  const today = a.today ?? vnDay3((/* @__PURE__ */ new Date()).toISOString());
  const norm = { today, pageIds: a.pageIds ? [...a.pageIds].sort() : null, channels: [...a.channels].sort(), rules: a.rules };
  let out;
  try {
    out = await rollingCached(norm);
  } catch {
    out = await rollingFromDb(norm);
  }
  return { wt: new Set(out.wt), order: new Set(out.order), meta: out.meta };
}
async function loadRollingWinByMarket(a) {
  const base = { channels: a.channels, rules: a.rules, today: a.today };
  if (a.market !== "all") return loadRollingWin({ ...base, pageIds: idsOf(a, a.market) });
  const [all, vn, intl] = await Promise.all([
    loadRollingWin({ ...base, pageIds: a.pageIds }),
    loadRollingWin({ ...base, pageIds: idsOf(a, "vn") }),
    loadRollingWin({ ...base, pageIds: idsOf(a, "intl") })
  ]);
  return {
    wt: union(vn.wt, intl.wt),
    order: all.order,
    meta: { ...all.meta, trafficReady: all.meta.trafficReady && vn.meta.trafficReady && intl.meta.trafficReady }
  };
}
async function loadLaunchWinFlagsByMarket(a) {
  const { pageIds: _p, poolIds: _o, markets: _m, market: _k, ...rest } = a;
  void _p;
  void _o;
  void _m;
  void _k;
  if (a.market !== "all") return loadLaunchWinFlags({ ...rest, pageIds: idsOf(a, a.market) });
  const [all, vn, intl] = await Promise.all([
    loadLaunchWinFlags({ ...rest, pageIds: a.pageIds }),
    loadLaunchWinFlags({ ...rest, pageIds: idsOf(a, "vn") }),
    loadLaunchWinFlags({ ...rest, pageIds: idsOf(a, "intl") })
  ]);
  return { wt: union(vn.wt, intl.wt), order: all.order };
}
var DAY4, addDays5, vnDay3, cached4, EMPTY_WIN, rollingCached, idsOf, union;
var init_spu_winflags = __esm({
  "../NCPTSP/ncptsp/src/lib/spu-winflags.ts"() {
    "use strict";
    init_server_only();
    init_next_cache();
    init_admin();
    init_cache_tags();
    init_daily_sales();
    init_spu_alias();
    init_db_gate();
    DAY4 = 864e5;
    addDays5 = (d, n) => new Date(Date.parse(d) + n * DAY4).toISOString().slice(0, 10);
    vnDay3 = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
    cached4 = unstable_cache(async (a) => computeFromDb(a), ["spu-winflags", "v3"], { tags: [TAG.spuData], revalidate: 21600 });
    EMPTY_WIN = { wt: /* @__PURE__ */ new Set(), order: /* @__PURE__ */ new Set() };
    rollingCached = unstable_cache(async (a) => {
      const r = await rollingFromDb(a);
      if (!r.meta.trafficReady) throw new Error("spu_traffic_gain ch\u01B0a t\xEDnh \u0111\u01B0\u1EE3c");
      return r;
    }, ["spu-rollingwin", "v2"], { tags: [TAG.spuData], revalidate: 21600 });
    idsOf = (a, m) => (a.pageIds ?? a.poolIds).filter((id) => (a.markets[id] ?? "vn") === m);
    union = (x, y) => /* @__PURE__ */ new Set([...x, ...y]);
  }
});

// ../NCPTSP/ncptsp/src/lib/channel-market.ts
var channel_market_exports = {};
__export(channel_market_exports, {
  DEFAULT_MARKET: () => DEFAULT_MARKET,
  MARKET_OPTIONS: () => MARKET_OPTIONS,
  loadChannelMarkets: () => loadChannelMarkets,
  marketForSql: () => marketForSql,
  parseMarket: () => parseMarket
});
async function loadChannelMarkets() {
  try {
    return await cached5();
  } catch {
    return {};
  }
}
var DEFAULT_MARKET, MARKET_OPTIONS, parseMarket, marketForSql, cached5;
var init_channel_market = __esm({
  "../NCPTSP/ncptsp/src/lib/channel-market.ts"() {
    "use strict";
    init_server_only();
    init_next_cache();
    init_admin();
    init_cache_tags();
    DEFAULT_MARKET = "vn";
    MARKET_OPTIONS = [{ value: "all", label: "T\u1EA5t c\u1EA3" }, { value: "vn", label: "Trong n\u01B0\u1EDBc" }, { value: "intl", label: "N\u01B0\u1EDBc ngo\xE0i" }];
    parseMarket = (v) => v === "all" || v === "intl" || v === "vn" ? v : DEFAULT_MARKET;
    marketForSql = (m) => m === "vn" || m === "intl" ? m : "";
    cached5 = unstable_cache(async () => {
      const { data, error } = await sb.sales().from("channel_market").select("channel_id, market").limit(5e3);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r) => [r.channel_id, r.market]));
    }, ["channel-market", "v1"], { tags: [TAG.channels, TAG.spuData], revalidate: 3600 });
  }
});

// ../NCPTSP/ncptsp/src/lib/video-win-data.ts
var init_video_win_data = __esm({
  "../NCPTSP/ncptsp/src/lib/video-win-data.ts"() {
    "use strict";
    init_server_only();
    init_admin();
  }
});

// ../NCPTSP/ncptsp/src/lib/spu-query.ts
function queryLegacy(allRows, q) {
  const { days, endAge, group, words: words2, teams, rules: R, win } = q;
  const warehouses = [...new Set(allRows.flatMap((r) => Object.keys(r.stockBy)))].sort();
  const wh = warehouses.includes(q.wh) ? q.wh : "";
  const search = (r) => `${r.code} ${r.name}`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
  const inFilter = (r) => (!group || r.group === group) && (!wh || (r.stockBy[wh] ?? 0) > 0) && (!words2.length || words2.every((w) => search(r).includes(w)));
  const base = allRows.filter(inFilter).map((r) => viewOf(r, { wh: wh || null, days, endAge, rules: R, win })).filter((v) => v.flags.active);
  const scope = teams.length ? allRows.filter(inFilter).map((r) => viewOf(r, { wh: wh || null, days, endAge, rules: R, teams, win, companyClass: true })).filter((v) => v.flags.active) : base;
  const hasTeamVideo = (v) => !teams.length || v.row.vids.some((x) => x.age >= endAge && x.age < endAge + days && !!x.team && teams.includes(x.team));
  const vidsOf = (v) => v.row.vids.filter((x) => x.age >= endAge && x.age < endAge + days && (!teams.length || !!x.team && teams.includes(x.team))).length;
  const periodTeams = (v) => [...new Set(v.row.vids.filter((x) => x.age >= endAge && x.age < endAge + days && !!x.team && (!teams.length || teams.includes(x.team))).map((x) => x.team))];
  const count = (f) => {
    const withVideo = base.filter((v) => f(v) && v.flags.hasVideo && hasTeamVideo(v));
    return { all: base.filter(f).length, video: withVideo.length, vids: withVideo.reduce((n, v) => n + vidsOf(v), 0) };
  };
  const cards = { active: count(() => true), instock: count((v) => v.flags.inStock), hot: count((v) => v.flags.hot), normal: count((v) => v.flags.normal), slow: count((v) => v.flags.slow), bad: count((v) => v.flags.bad) };
  const statusCounts = Object.fromEntries(STATUS_FILTERS.map((s) => [s.id, scope.filter((v) => s.test(v.flags)).length]));
  const test = STATUS_FILTERS.find((s) => s.id === q.status).test;
  const dirMul = q.dir === "asc" ? 1 : -1;
  const val = (v) => q.sort === "stock" ? v.stock : q.sort === "available" ? v.available : q.sort === "incoming" ? v.row.incoming : q.sort === "age" ? v.row.ageDays : q.sort === "sold" ? v.sold : q.sort === "videos" ? v.videos : q.sort === "teams" ? v.videos > 0 ? periodTeams(v).length : 0 : q.sort === "views3" ? v.views3 ?? null : v.views;
  const filtered = scope.filter((v) => test(v.flags)).sort((a, b) => {
    const x = val(a), y = val(b);
    if (x === null && y === null) return cmpStr(a.row.code, b.row.code);
    if (x === null) return 1;
    if (y === null) return -1;
    return (x - y) * dirMul || cmpStr(a.row.code, b.row.code);
  });
  const pages = Math.max(1, Math.ceil(filtered.length / q.pageSize));
  const page = Math.min(q.page, pages);
  const sum = (f) => filtered.reduce((n, v) => n + (f(v) ?? 0), 0);
  const totals = {
    stock: sum((v) => v.stock),
    available: sum((v) => v.available),
    incoming: sum((v) => v.row.incoming),
    sold: sum((v) => v.sold),
    videos: sum((v) => v.videos),
    views: sum((v) => v.views),
    teams: new Set(filtered.flatMap(periodTeams)).size
  };
  return { wh, spus: allRows.length, warehouses, cards, statusCounts, total: filtered.length, page, pages, totals, rows: filtered.slice((page - 1) * q.pageSize, page * q.pageSize).map((v) => ({ ...v, row: { ...v.row, teams: periodTeams(v) } })) };
}
function rpcParams(q) {
  return {
    today: q.today,
    days: q.days,
    end_age: q.endAge,
    teams: q.teams,
    wh: q.wh,
    grp: q.group,
    words: q.words,
    slow_below: q.rules.sales.slowBelow,
    normal_below: q.rules.sales.normalBelow,
    status: q.status,
    sort: q.sort,
    dir: q.dir,
    page: q.page,
    page_size: q.pageSize,
    wt: [...q.win.wt],
    ord: [...q.win.order],
    market: marketForSql(q.market)
  };
}
function viewFromSql(r, q) {
  const sf = saleFlags(r.stock, r.sl30, q.rules);
  const flags = { active: sf.active, inStock: sf.inStock, hot: sf.hot, normal: sf.normal, other: sf.other, slow: sf.slow, bad: sf.bad, star: r.star, win: r.win, winTraffic: r.wt, hasVideo: r.videos > 0 };
  const row = {
    code: r.code,
    name: r.name,
    group: r.grp,
    variants: r.variants ?? 1,
    image: r.image ?? null,
    stockBy: {},
    availBy: null,
    incoming: r.incoming,
    ageDays: r.age_days,
    ageApprox: r.age_approx,
    sold30: r.sold30,
    sales: [],
    soldBy: {},
    vids: [],
    footage: null,
    teams: r.video_teams
  };
  const action = actionOf({ stock: r.stock, inStock: sf.inStock, sl30: r.sl30, sold: r.sold, videos: r.videos, ageDays: r.age_days, footage: null, days: q.days, flags: { star: r.star, win: r.win, winTraffic: r.wt, bad: sf.bad, slow: sf.slow } }, q.rules);
  return { row, stock: r.stock, available: r.available ?? null, sold: r.sold, videos: r.videos, views: r.views, views3: r.views3 ?? null, flags, action };
}
var cmpStr, spuReadMode;
var init_spu_query = __esm({
  "../NCPTSP/ncptsp/src/lib/spu-query.ts"() {
    "use strict";
    init_server_only();
    init_admin();
    init_db_gate();
    init_spu_data();
    init_data();
    init_pipeline();
    init_channel_market();
    init_video_win_data();
    init_spu_tracking();
    cmpStr = (a, b) => a < b ? -1 : a > b ? 1 : 0;
    spuReadMode = () => process.env.SPU_READ_MODE === "legacy" ? "legacy" : "sql";
  }
});

// ../NCPTSP/ncptsp/src/lib/spu-videos.ts
function spuVideos(row, opt, today) {
  const end = opt.endAge ?? 0;
  return row.vids.filter((v) => v.age >= end && v.age < end + opt.days).map((v) => ({
    id: v.id ?? "",
    title: v.title?.trim() || "(kh\xF4ng c\xF3 n\u1ED9i dung)",
    platform: v.platform ?? "FB",
    channel: v.channel ?? "\u2014",
    team: v.team ?? null,
    date: new Date(Date.parse(today) - v.age * 864e5).toISOString().slice(0, 10),
    views: v.views,
    url: v.url ?? null,
    thumb: v.thumb ?? null,
    first3d: v.first3d
  })).sort((a, b) => b.date.localeCompare(a.date));
}
var init_spu_videos = __esm({
  "../NCPTSP/ncptsp/src/lib/spu-videos.ts"() {
    "use strict";
  }
});

// ../NCPTSP/ncptsp/src/lib/spu-dash.ts
var spu_dash_exports = {};
__export(spu_dash_exports, {
  DASH_GROUPS: () => DASH_GROUPS,
  dashFromSql: () => dashFromSql,
  dashLegacy: () => dashLegacy,
  dashRpcParams: () => dashRpcParams,
  loadDashSpu: () => loadDashSpu,
  warmDashSpu: () => warmDashSpu
});
function dashLegacy(rows, q) {
  const { days, endAge, teams, rules: R, win } = q;
  const period = rows.map((r) => viewOf(r, { wh: null, days, endAge, rules: R, teams, pageIds: q.pageIds ?? void 0, win }));
  const company = rows.map((r) => viewOf(r, { wh: null, days, endAge, rules: R, win }));
  const stockStatus = /* @__PURE__ */ new Map();
  for (const v of period) {
    if (v.flags.bad) stockStatus.set(v.row.code, "bad");
    else if (v.flags.slow) stockStatus.set(v.row.code, "slow");
    else if (v.flags.hot) stockStatus.set(v.row.code, "hot");
  }
  const videoCats = [...period.reduce((m, v) => m.set(v.row.group, (m.get(v.row.group) ?? 0) + v.videos), /* @__PURE__ */ new Map())].map(([name, posted]) => ({ name, posted })).filter((c) => c.posted > 0).sort((a, b) => b.posted - a.posted || (a.name < b.name ? -1 : 1));
  const picks = [(v) => v.flags.active, (v) => v.flags.inStock, (v) => v.flags.slow, (v) => v.flags.bad, (v) => v.flags.hot];
  const videoGroups = DASH_GROUPS.map(([label, tone], i) => {
    const inGroup = new Set(company.filter(picks[i]).map((v) => v.row.code));
    const vs = period.filter((v) => inGroup.has(v.row.code));
    return { label, tone, spu: inGroup.size, withVideo: vs.filter((v) => v.videos > 0).length, posted: vs.reduce((n, v) => n + v.videos, 0) };
  });
  const act = company.filter((v) => v.flags.active);
  const s0 = { active: act.length, hot: act.filter((v) => v.flags.hot).length, normal: act.filter((v) => v.flags.normal).length, slow: act.filter((v) => v.flags.slow).length, bad: act.filter((v) => v.flags.bad).length, noStockSold: act.filter((v) => !v.flags.inStock).length };
  const s1Codes = new Set(period.filter((v, i) => company[i].flags.active && v.videos > 0).map((v) => v.row.code));
  const s1 = { total: s1Codes.size };
  const winNow = { wt: act.filter((v) => v.flags.winTraffic).length, win: act.filter((v) => v.flags.win).length, star: act.filter((v) => v.flags.star).length };
  const alertViews = company.filter((v) => !teams.length || v.row.teams.some((n) => teams.includes(n)));
  const vids = alertViews.filter((v) => v.flags.inStock && v.videos > 0).flatMap((v) => spuVideos(v.row, { days, endAge }, q.today).map((x) => ({ x, code: v.row.code }))).sort((a, b) => b.x.views - a.x.views);
  return { s0, s1, winNow, s1Codes, videoCats, videoGroups, stockStatus, activeCodes: new Set(act.map((v) => v.row.code)), alertViews, vids: { total: vids.length, items: vids.slice(0, q.limit) } };
}
async function dashFromSql(d, q) {
  const accounts = await getAccounts();
  const chan = new Map(accounts.map((a) => [a.id, a]));
  const vnDay4 = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
  const PLATFORM2 = { facebook: "FB", instagram: "IG", tiktok: "TT" };
  const items = d.alerts.top_videos.map((t) => {
    const ch = chan.get(t.channel_id);
    return { code: t.code, x: { id: t.id, title: "(kh\xF4ng c\xF3 n\u1ED9i dung)", platform: ch ? PLATFORM2[ch.platform] ?? "FB" : "FB", channel: ch?.name ?? "\u2014", team: null, date: vnDay4(t.published_at), views: Number(t.views), url: null, thumb: null } };
  });
  const stockStatus = /* @__PURE__ */ new Map();
  for (const k of ["hot", "slow", "bad"]) for (const c of d.stock_status[k]) stockStatus.set(c, k);
  const tones = new Map(DASH_GROUPS);
  return {
    s0: { active: d.s0.active, hot: d.s0.hot, normal: d.s0.normal, slow: d.s0.slow, bad: d.s0.bad, noStockSold: d.s0.no_stock_sold },
    s1: d.s1,
    winNow: d.win,
    s1Codes: new Set(d.s1_codes),
    videoCats: d.cats,
    videoGroups: d.groups.map((g) => ({ label: g.label, tone: tones.get(g.label) ?? "var(--ink-1)", spu: g.spu, withVideo: g.with_video, posted: g.posted })),
    stockStatus,
    activeCodes: new Set(d.active_codes),
    alertViews: d.alerts.rows.map((r) => viewFromSql(r, { days: q.days, rules: q.rules })),
    vids: { total: Number(d.alerts.vids_total), items }
  };
}
async function warmDashSpu(q) {
  try {
    await dashRpc(dashRpcParams(q));
  } catch {
  }
}
async function loadDashSpu(q) {
  if (spuReadMode() === "sql") {
    let data = null, error = null;
    try {
      data = await dashRpc(dashRpcParams(q));
    } catch (e) {
      error = { message: e instanceof Error ? e.message : String(e) };
    }
    if (!error && data && data.s0 && data.refreshed_at) return { ...await dashFromSql(data, q), source: "sql" };
    if (error) console.error("spu_dash l\u1ED7i:", error.message);
  }
  return { ...dashLegacy(await loadSpuRows(), q), source: "legacy" };
}
var DASH_GROUPS, dashRpcParams, dashRpc;
var init_spu_dash = __esm({
  "../NCPTSP/ncptsp/src/lib/spu-dash.ts"() {
    "use strict";
    init_server_only();
    init_next_cache();
    init_db_gate();
    init_admin();
    init_cache_tags();
    init_data();
    init_spu_data();
    init_spu_query();
    init_spu_tracking();
    init_spu_videos();
    DASH_GROUPS = [["SPU Active", "var(--ink-1)"], ["SPU c\xF2n h\xE0ng", "var(--good)"], ["SPU b\xE1n ch\u1EADm", "var(--warn-ink)"], ["SPU t\u1ED3n x\u1EA5u", "var(--bad)"], ["SPU b\xE1n ch\u1EA1y", "var(--star)"]];
    dashRpcParams = (q) => ({
      today: q.today,
      days: q.days,
      end_age: q.endAge,
      teams: q.teams,
      channels: q.pageIds,
      slow_below: q.rules.sales.slowBelow,
      normal_below: q.rules.sales.normalBelow,
      alert_limit: q.limit,
      wt: [...q.win.wt],
      ord: [...q.win.order]
    });
    dashRpc = unstable_cache(async (p) => {
      const { data, error } = await heavyRpc(() => sb.sales().rpc("spu_dash", { p }));
      if (error) throw new Error(error.message);
      return data;
    }, ["spu-dash-rpc", "v1"], { tags: [TAG.spuData], revalidate: 21600 });
  }
});

// ../NCPTSP/ncptsp/src/lib/spu-summary.ts
async function refreshSpuSummary() {
  const r = await refreshSpuSummaryRun();
  await logSystem({
    kind: "refresh_summary",
    ok: r.ok,
    summary: r.ok ? `${r.spus.toLocaleString("vi-VN")} SPU, ${r.salesRows.toLocaleString("vi-VN")} d\xF2ng b\xE1n, ${r.videoRows.toLocaleString("vi-VN")} d\xF2ng video \xB7 ${(r.ms / 1e3).toFixed(1)} gi\xE2y` : r.error,
    detail: r.ok ? { spus: r.spus, salesRows: r.salesRows, videoRows: r.videoRows, ms: r.ms } : void 0
  });
  return r;
}
async function refreshSpuSummaryRun() {
  const t0 = Date.now();
  const db = sb.sales();
  const probe = await db.from("spu_summary_meta").select("run_id").eq("id", 1).maybeSingle();
  if (probe.error) return { ok: false, error: isMissing(probe.error) ? MIGRATION_MSG : probe.error.message };
  const today = todayVN();
  void refreshTeamLines().catch(() => null);
  let useSql = process.env.SPU_VIDEO_SOURCE !== "posts";
  if (useSql) {
    const probe2 = await db.rpc("fill_summary_videos", { p_run: 0 });
    if (probe2.error) useSql = false;
  }
  if (useSql) {
    const vd = await refreshVideoDaily();
    if (!vd.ok) useSql = false;
  }
  const [rows, meta] = useSql ? await loadSpuRowsLight().then((x) => [x.rows, x.meta]) : await Promise.all([loadSpuRows(), loadSpuMeta()]);
  const runId = Date.now();
  const { summary, sales, videos } = buildSummaryTables(rows, today, runId);
  if (!useSql && !videos.length) return { ok: false, error: "Kh\xF4ng t\u1EA3i \u0111\u01B0\u1EE3c video g\u1EAFn m\xE3 (c\xF3 th\u1EC3 DB \u0111ang b\u1EADn) \u2014 gi\u1EEF nguy\xEAn b\u1EA3ng t\u1ED5ng h\u1EE3p c\u0169" };
  const insert = async (table, data) => {
    for (let i = 0; i < data.length; i += CHUNK) {
      const { error } = await db.from(table).insert(data.slice(i, i + CHUNK));
      if (error) return error;
    }
    return null;
  };
  let videoRows = videos.length;
  try {
    for (const [table, data] of useSql ? [["spu_summary", summary], ["spu_sales_daily", sales]] : [["spu_summary", summary], ["spu_sales_daily", sales], ["spu_video_daily", videos]]) {
      const error = await insert(table, data);
      if (error) {
        await Promise.all(["spu_summary", "spu_sales_daily", "spu_video_daily"].map((t) => db.from(t).delete().eq("run_id", runId)));
        return { ok: false, error: isMissing(error) ? MIGRATION_MSG : `Ghi ${table} l\u1ED7i: ${error.message}` };
      }
    }
    if (useSql) {
      const PARTS = 6;
      let total = 0, failure = "";
      for (let part = 0; part < PARTS && !failure; part++) {
        let res = await db.rpc("fill_summary_videos", { p_run: runId, p_part: part, p_parts: PARTS });
        for (let a = 0; a < 2 && res.error && /timeout/i.test(res.error.message); a++) {
          await new Promise((r) => setTimeout(r, 1500 * (a + 1)));
          res = await db.rpc("fill_summary_videos", { p_run: runId, p_part: part, p_parts: PARTS });
        }
        if (res.error) failure = `fill_summary_videos ph\u1EA7n ${part + 1}/${PARTS} l\u1ED7i: ${res.error.message}`;
        else total += res.data?.rows ?? 0;
      }
      if (failure || !total) {
        await Promise.all(["spu_summary", "spu_sales_daily", "spu_video_daily"].map((t) => db.from(t).delete().eq("run_id", runId)));
        return { ok: false, error: failure || "B\u1EA3ng video_daily r\u1ED7ng \u2014 gi\u1EEF nguy\xEAn b\u1EA3ng t\u1ED5ng h\u1EE3p c\u0169" };
      }
      videoRows = total;
    }
    const { error: e2 } = await db.from("spu_summary_meta").update({
      run_id: runId,
      refreshed_at: (/* @__PURE__ */ new Date()).toISOString(),
      duration_ms: Date.now() - t0,
      spus: summary.length,
      sales_rows: sales.length,
      video_rows: videoRows,
      sales_source: meta.salesSource,
      sales_lines: meta.salesLines,
      sales_qty: meta.salesQty,
      sales_from: meta.salesFrom,
      sales_to: meta.salesTo,
      skus: meta.skus,
      team_qty: meta.teamQty
    }).eq("id", 1);
    if (e2) return { ok: false, error: isMissing(e2) ? MIGRATION_MSG : `Chuy\u1EC3n l\u01B0\u1EE3t l\u1ED7i: ${e2.message}` };
    await Promise.all(["spu_summary", "spu_sales_daily", "spu_video_daily"].map((t) => db.from(t).delete().neq("run_id", runId)));
  } catch (e) {
    const err = e;
    return { ok: false, error: isMissing(err) ? MIGRATION_MSG : err.message ?? "L\u1ED7i kh\xF4ng r\xF5" };
  }
  bustSoft(TAG.spuData);
  try {
    const [{ loadSpuRules: loadSpuRules2 }, { loadRollingWinByMarket: loadRollingWinByMarket2 }, { warmDashSpu: warmDashSpu2 }, { loadChannelMarkets: loadChannelMarkets2 }, { getAccounts: getAccounts2, parseFilters: parseFilters2, daysBetween: daysBetween2, todayVN: todayVN2 }] = await Promise.all([Promise.resolve().then(() => (init_spu_rules(), spu_rules_exports)), Promise.resolve().then(() => (init_spu_winflags(), spu_winflags_exports)), Promise.resolve().then(() => (init_spu_dash(), spu_dash_exports)), Promise.resolve().then(() => (init_channel_market(), channel_market_exports)), Promise.resolve().then(() => (init_data(), data_exports))]);
    const [rules, markets, accounts] = await Promise.all([loadSpuRules2(), loadChannelMarkets2(), getAccounts2()]);
    const poolIds = accounts.map((a) => a.id);
    const win = await loadRollingWinByMarket2({ pageIds: null, poolIds, markets, market: "vn", channels: [], rules: rules.win });
    const f = parseFilters2({}), today2 = todayVN2();
    await warmDashSpu2({
      today: today2,
      days: Math.max(1, daysBetween2(f.from, f.to)),
      endAge: Math.max(0, daysBetween2(f.to, today2) - 1),
      teams: [],
      pageIds: poolIds.filter((id) => (markets[id] ?? "vn") === "vn"),
      rules,
      limit: 8,
      win
    });
  } catch {
  }
  return { ok: true, runId, spus: summary.length, salesRows: sales.length, videoRows, ms: Date.now() - t0 };
}
async function checkSpuSummary() {
  const db = sb.sales();
  try {
    const [rows, { data: m, error: em }, sum, sales, vids] = await Promise.all([
      loadSpuRows(),
      db.from("spu_summary_meta").select("refreshed_at").eq("id", 1).maybeSingle(),
      fetchAll((a, b) => db.from("v_spu_summary").select("stock_total, avail_by, sold30").order("code").range(a, b)),
      fetchAll((a, b) => db.from("v_spu_sales_daily").select("qty").order("code").order("day").order("team").range(a, b)),
      fetchAll((a, b) => db.from("v_spu_video_daily").select("videos, views").order("code").order("day").order("channel_id").range(a, b))
    ]);
    if (em) return { error: isMissing(em) ? MIGRATION_MSG : em.message };
    const n = (v) => Number(v ?? 0);
    const lines = [
      ["S\u1ED1 SPU", rows.length, sum.length],
      ["T\u1ED5ng t\u1ED3n kho", rows.reduce((a, r) => a + Object.values(r.stockBy).reduce((x, y) => x + y, 0), 0), sum.reduce((a, r) => a + n(r.stock_total), 0)],
      ["T\u1ED5ng c\xF3 th\u1EC3 b\xE1n", rows.reduce((a, r) => a + Object.values(r.availBy ?? {}).reduce((x, y) => x + y, 0), 0), sum.reduce((a, r) => a + Object.values(r.avail_by ?? {}).reduce((x, y) => x + n(y), 0), 0)],
      ["T\u1ED5ng b\xE1n 30 ng\xE0y", rows.reduce((a, r) => a + n(r.sold30), 0), sum.reduce((a, r) => a + n(r.sold30), 0)],
      ["T\u1ED5ng s\u1ED1 b\xE1n theo ng\xE0y", rows.reduce((a, r) => a + r.sales.reduce((x, l) => x + l.qty, 0), 0), sales.reduce((a, r) => a + n(r.qty), 0)],
      ["S\u1ED1 video", rows.reduce((a, r) => a + r.vids.length, 0), vids.reduce((a, r) => a + n(r.videos), 0)],
      ["T\u1ED5ng l\u01B0\u1EE3t xem video", rows.reduce((a, r) => a + r.vids.reduce((x, v) => x + v.views, 0), 0), vids.reduce((a, r) => a + n(r.views), 0)]
    ].map(([name, live, summary]) => ({ name, live, summary, ok: live === summary }));
    return { ok: lines.every((l) => l.ok), refreshedAt: m?.refreshed_at ?? null, lines };
  } catch (e) {
    const err = e;
    return { error: isMissing(err) ? MIGRATION_MSG : err.message ?? "L\u1ED7i kh\xF4ng r\xF5" };
  }
}
async function summaryNeedsRefresh() {
  try {
    const { data: meta } = await sb.sales().from("spu_summary_meta").select("refreshed_at").limit(1).maybeSingle();
    if (!meta?.refreshed_at) return { yes: true, reason: "ch\u01B0a l\xE0m m\u1EDBi l\u1EA7n n\xE0o" };
    if (await postsChangedSinceSummary()) return { yes: true, reason: "b\xE0i g\u1EAFn m\xE3 \u0111\xE3 \u0111\u1ED5i k\u1EC3 t\u1EEB l\u1EA7n l\xE0m m\u1EDBi" };
    const { data: runs } = await sb.core().from("sync_runs").select("job").in("job", ["catalog", "sales", "retag", "videos_api"]).eq("status", "success").gt("finished_at", meta.refreshed_at).limit(1);
    if (runs?.length) return { yes: true, reason: `b\u01B0\u1EDBc \u0111\u1ED3ng b\u1ED9 "${runs[0].job}" xong sau l\u1EA7n l\xE0m m\u1EDBi` };
    return { yes: false, reason: "ch\u01B0a c\xF3 g\xEC \u0111\u1ED5i k\u1EC3 t\u1EEB l\u1EA7n l\xE0m m\u1EDBi" };
  } catch {
    return { yes: true, reason: "kh\xF4ng ki\u1EC3m tra \u0111\u01B0\u1EE3c n\xEAn l\xE0m m\u1EDBi cho ch\u1EAFc" };
  }
}
async function postsChangedSinceSummary() {
  try {
    const { data: meta, error: mErr } = await sb.sales().from("spu_summary_meta").select("refreshed_at").limit(1).maybeSingle();
    if (mErr || !meta?.refreshed_at) return true;
    const { data: last, error: pErr } = await sb.social().from("posts").select("updated_at").in("kind", ["video", "reel"]).neq("product_codes", "{}").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (pErr) return true;
    return !!last?.updated_at && Date.parse(last.updated_at) > Date.parse(meta.refreshed_at);
  } catch {
    return true;
  }
}
var CHUNK, MIGRATION_MSG, isMissing;
var init_spu_summary = __esm({
  "../NCPTSP/ncptsp/src/lib/spu-summary.ts"() {
    "use strict";
    init_server_only();
    init_next_server();
    init_admin();
    init_data();
    init_cache_tags();
    init_spu_data();
    init_video_daily();
    init_team_lines();
    init_spu_summary_build();
    init_system_log();
    CHUNK = 1e3;
    MIGRATION_MSG = "Ch\u01B0a ch\u1EA1y migration 059 trong Supabase (b\u1EA3ng t\u1ED5ng h\u1EE3p SPU ch\u01B0a c\xF3)";
    isMissing = (e) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /spu_summary|spu_sales_daily|spu_video_daily/.test(e.message ?? ""));
  }
});

// ../NCPTSP/ncptsp/packages/ncptsp-core/entries/spu-summary.handlers.ts
var spu_summary_handlers_exports = {};
__export(spu_summary_handlers_exports, {
  checkSpuParity: () => checkSpuParity,
  checkSpuSummary: () => checkSpuSummary,
  checkVideoDaily: () => checkVideoDaily,
  refreshSpuSummary: () => refreshSpuSummary,
  refreshTeamLines: () => refreshTeamLines,
  refreshVideoDaily: () => refreshVideoDaily,
  summaryNeedsRefresh: () => summaryNeedsRefresh
});
module.exports = __toCommonJS(spu_summary_handlers_exports);
init_spu_summary();

// ../NCPTSP/ncptsp/src/lib/spu-parity.ts
init_server_only();
init_admin();
init_pipeline();
init_data();
init_spu_data();
init_spu_rules();
init_spu_winflags();
init_spu_dash();
init_spu_query();
var canon = (x) => Array.isArray(x) ? x.map(canon) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])])) : x;
var same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
async function checkSpuParity() {
  try {
    const [rows, rules, teams] = await Promise.all([loadSpuRows(), loadSpuRules(), getTeams(true)]);
    const today = todayVN(), db = sb.sales();
    const teamNames = teams.map((t) => t.name);
    const whs = [...new Set(rows.flatMap((r) => Object.keys(r.stockBy)))].sort();
    const win = await loadRollingWin({ pageIds: null, channels: [], rules: rules.win });
    const base = { today, days: 30, endAge: 0, teams: [], wh: "", group: "", words: [], status: "all", sort: "stock", dir: "desc", page: 1, pageSize: 50, rules, win };
    const sets = [["m\u1EB7c \u0111\u1ECBnh", {}], ["s\u1EAFp x\u1EBFp b\xE1n t\u0103ng", { sort: "sold", dir: "asc" }], ["s\u1EAFp x\u1EBFp l\u01B0\u1EE3t xem", { sort: "views" }], ["trang 2", { page: 2 }], ["7 ng\xE0y", { days: 7 }], ["th\xE1ng tr\u01B0\u1EDBc", { days: 30, endAge: 30 }]];
    for (const s of ["instock", "outstock", "hot", "normal", "slow", "bad", "star", "win", "wintraffic", "novideo", "video"]) sets.push([`tr\u1EA1ng th\xE1i ${s}`, { status: s }]);
    for (const t of teamNames.slice(0, 3)) sets.push([`team ${t}`, { teams: [t] }]);
    for (const w of whs.slice(0, 2)) sets.push([`kho ${w}`, { wh: w }]);
    sets.push(["nh\xF3m Nh\u1EABn", { group: "Nh\u1EABn" }], ["t\xECm 'nhan'", { words: ["nhan"] }]);
    const cases = [];
    for (const [name, over] of sets) {
      const q = { ...base, ...over };
      const L = queryLegacy(rows, q);
      const { data, error } = await db.rpc("spu_query", { p: rpcParams(q) });
      if (error) {
        cases.push({ name: `query \xB7 ${name}`, ok: false, diffs: [`spu_query l\u1ED7i: ${error.message}`] });
        continue;
      }
      const S = data;
      const diffs = [];
      const eq = (label, a, b) => {
        if (!same(a, b)) diffs.push(`${label}: c\u0169=${JSON.stringify(canon(a)).slice(0, 160)} nhanh=${JSON.stringify(canon(b)).slice(0, 160)}`);
      };
      const sc = { ...S.status_counts }, lc = { ...L.statusCounts };
      const { n: _n, ...tot } = S.totals;
      void _n;
      eq("kho", L.warehouses, S.warehouses);
      eq("th\u1EBB", L.cards, S.cards);
      eq("s\u1ED1 tr\xEAn n\xFAt l\u1ECDc", lc, sc);
      eq("t\u1ED5ng s\u1ED1 / trang", [L.total, L.page, L.pages], [S.total, S.page, S.pages]);
      eq("d\xF2ng t\u1ED5ng", L.totals, tot);
      {
        const sv = S.rows.map((r) => viewFromSql(r, q));
        eq("m\xE3 theo th\u1EE9 t\u1EF1", L.rows.map((v) => v.row.code), sv.map((v) => v.row.code));
        const pick = (v) => ({ s: v.stock, a: v.available, so: v.sold, vi: v.videos, vw: v.views, inc: v.row.incoming, age: v.row.ageDays, act: v.action });
        eq("gi\xE1 tr\u1ECB t\u1EEBng d\xF2ng", L.rows.map(pick), sv.map(pick));
      }
      cases.push({ name: `query \xB7 ${name}`, ok: diffs.length === 0, diffs });
    }
    const dbase = { today, days: 30, endAge: 0, teams: [], pageIds: null, rules, limit: 8, win };
    const dsets = [["m\u1EB7c \u0111\u1ECBnh", {}], ["7 ng\xE0y", { days: 7 }], ["90 ng\xE0y", { days: 90 }]];
    for (const t of teamNames.slice(0, 2)) dsets.push([`team ${t}`, { teams: [t] }]);
    for (const [name, over] of dsets) {
      const q = { ...dbase, ...over };
      const L = dashLegacy(rows, q);
      const { data, error } = await db.rpc("spu_dash", { p: dashRpcParams(q) });
      if (error) {
        cases.push({ name: `dashboard \xB7 ${name}`, ok: false, diffs: [`spu_dash l\u1ED7i: ${error.message}`] });
        continue;
      }
      const S = await dashFromSql(data, q);
      const diffs = [];
      const eq = (label, a, b) => {
        if (!same(a, b)) diffs.push(`${label}: c\u0169=${JSON.stringify(canon(a)).slice(0, 160)} nhanh=${JSON.stringify(canon(b)).slice(0, 160)}`);
      };
      const byName = (x) => [...x].sort((a, b) => a.name < b.name ? -1 : 1);
      eq("th\u1EBB S0", L.s0, S.s0);
      eq("th\u1EBB S1", L.s1, S.s1);
      eq("th\u1EBB S2\u2013S4 (\u0111ang Win)", L.winNow, S.winNow);
      eq("c\u01A1 c\u1EA5u theo d\xF2ng SP", byName(L.videoCats), byName(S.videoCats));
      eq("c\u01A1 c\u1EA5u theo tr\u1EA1ng th\xE1i t\u1ED3n", L.videoGroups, S.videoGroups);
      eq("tr\u1EA1ng th\xE1i t\u1ED3n t\u1EEBng SPU", [...L.stockStatus].sort(), [...S.stockStatus].sort());
      eq("SPU Active", [...L.activeCodes].sort(), [...S.activeCodes].sort());
      eq("c\u1EA3nh b\xE1o: SPU c\xF3 g\u1EE3i \xFD", L.alertViews.filter((v) => v.action).map((v) => v.row.code).sort(), S.alertViews.filter((v) => v.action).map((v) => v.row.code).sort());
      eq("video ti\u1EC1m n\u0103ng: t\u1ED5ng + top l\u01B0\u1EE3t xem", [L.vids.total, L.vids.items.map((i) => i.x.views)], [S.vids.total, S.vids.items.map((i) => i.x.views)]);
      cases.push({ name: `dashboard \xB7 ${name}`, ok: diffs.length === 0, diffs });
    }
    return { ok: cases.every((c) => c.ok), cases };
  } catch (e) {
    const err = e;
    return { error: err.message ?? "L\u1ED7i kh\xF4ng r\xF5" };
  }
}

// ../NCPTSP/ncptsp/packages/ncptsp-core/entries/spu-summary.handlers.ts
init_video_daily();
init_team_lines();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  checkSpuParity,
  checkSpuSummary,
  checkVideoDaily,
  refreshSpuSummary,
  refreshTeamLines,
  refreshVideoDaily,
  summaryNeedsRefresh
});
//# sourceMappingURL=spu-summary-bundle.cjs.map
