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

// packages/ncptsp-core/shim/server-only.ts
var init_server_only = __esm({
  "packages/ncptsp-core/shim/server-only.ts"() {
    "use strict";
  }
});

// src/lib/paging.ts
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
  "src/lib/paging.ts"() {
    "use strict";
    PAGE_SIZE = 1e3;
    PARALLEL = 6;
    isTimeout = (e) => !!e && typeof e === "object" && (e.code === "57014" || /statement timeout/i.test(String(e.message ?? "")));
    PAGE = PAGE_SIZE;
  }
});

// src/lib/supabase/admin.ts
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
  "src/lib/supabase/admin.ts"() {
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

// packages/ncptsp-core/shim/next-cache.ts
function unstable_cache(fn, _keyParts, _opts) {
  return fn;
}
function revalidateTag(tag, profile) {
  const base = process.env.APP_URL?.replace(/\/$/, "");
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) return;
  void fetch(`${base}/api/internal/revalidate`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ tags: [tag], profile: profile ?? { expire: 0 } }),
    signal: AbortSignal.timeout(1e4)
  }).catch((e) => console.error("revalidate webhook l\u1ED7i", tag, e));
}
var init_next_cache = __esm({
  "packages/ncptsp-core/shim/next-cache.ts"() {
    "use strict";
  }
});

// src/lib/cache-tags.ts
function bustSoft(...tags) {
  for (const t of tags) {
    try {
      revalidateTag(t, "max");
    } catch {
    }
  }
}
function bust(...tags) {
  for (const t of tags) {
    try {
      revalidateTag(t, { expire: 0 });
    } catch {
    }
  }
}
var TAG;
var init_cache_tags = __esm({
  "src/lib/cache-tags.ts"() {
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

// src/lib/tiktok/name.ts
var normTikTokName, TT_NAME_PREFIX;
var init_name = __esm({
  "src/lib/tiktok/name.ts"() {
    "use strict";
    normTikTokName = (s) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
    TT_NAME_PREFIX = "ttn:";
  }
});

// src/lib/daily-sales.ts
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
  "src/lib/daily-sales.ts"() {
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

// src/lib/roles.ts
var ROLE_LABELS, ROLES;
var init_roles = __esm({
  "src/lib/roles.ts"() {
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

// packages/ncptsp-core/shim/session-worker.ts
var init_session_worker = __esm({
  "packages/ncptsp-core/shim/session-worker.ts"() {
    "use strict";
    init_roles();
  }
});

// src/lib/tags.ts
function parseTestCode(code) {
  const c = code.toUpperCase();
  let m = c.match(/^T([1-9])(\d{4,})$/);
  if (m) return { cat: m[1], num: parseInt(m[2], 10), legacy: false };
  m = c.match(/^T([A-Z]{1,2})(\d+)$/);
  if (m) return { cat: LEGACY_LETTER[m[1]] ?? m[1], num: parseInt(m[2], 10), legacy: true };
  return null;
}
function testCodeProductName(code) {
  const p = parseTestCode(code);
  if (!p) return null;
  const cat = TEST_CATEGORY_NAMES[p.cat] ?? `M\u1EABu test ${p.cat}`;
  return `${cat} ${code.toUpperCase()} (#${p.num})`;
}
function parseTags(tags, known, rules = DEFAULT_RULES) {
  const staff = new RegExp(rules.staff_pattern, "i"), line = new RegExp(rules.line_pattern, "i");
  const out = { product_codes: [], unknown_codes: [], content_line: null, concept: null, staff_code: null };
  for (const raw of tags) {
    const t = raw.toLowerCase();
    if (staff.test(t)) {
      out.staff_code ??= t.toUpperCase();
      continue;
    }
    if (line.test(t)) {
      out.content_line ??= t.toUpperCase();
      continue;
    }
    if (t in rules.concept) {
      out.concept ??= rules.concept[t];
      continue;
    }
    if (!CODE_SHAPE.test(t)) continue;
    let code = t.toUpperCase();
    if (!known.has(code) && code.startsWith("M") && known.has(code.slice(1))) code = code.slice(1);
    if (known.has(code) || TEST_SHAPE.test(t)) {
      if (!out.product_codes.includes(code)) out.product_codes.push(code);
    } else if (!out.unknown_codes.includes(code)) out.unknown_codes.push(code);
  }
  return out;
}
var DEFAULT_RULES, CODE_SHAPE, TEST_SHAPE, isTestCode, TEST_CATEGORY_NAMES, LEGACY_LETTER;
var init_tags = __esm({
  "src/lib/tags.ts"() {
    "use strict";
    DEFAULT_RULES = { staff_pattern: "^k[0-9]{3}$", line_pattern: "^a[1-5]$", concept: { c: "old", m: "new" } };
    CODE_SHAPE = /^[a-z]{1,4}[0-9]{1,}$/;
    TEST_SHAPE = /^t(?:[1-9][0-9]{4,}|[a-z]{1,2}[0-9]+)$/;
    isTestCode = (code) => TEST_SHAPE.test(code.toLowerCase());
    TEST_CATEGORY_NAMES = {
      1: "Nh\u1EABn test",
      2: "L\u1EAFc tay test",
      3: "D\xE2y chuy\u1EC1n test",
      4: "B\xF4ng tai test",
      5: "Ki\u1EC1ng test",
      6: "M\u1EB7t d\xE2y test",
      7: "V\xF2ng test",
      8: "C\xE0i \xE1o test",
      9: "Set test"
    };
    LEGACY_LETTER = { N: "1", L: "2", D: "3", B: "4", K: "5", M: "6", V: "7", C: "8", S: "9" };
  }
});

// src/lib/spu-code.ts
function isNonProduct(name, code) {
  if (/TRUNGGIAN/i.test(code)) return true;
  const t = fold(String(name ?? "")).replace(/^(\s*[\(\[][^\)\]]*[\)\]])+\s*/, "").trim();
  return NON_PRODUCT_NAME.test(t) || /^hop(\s|$)/.test(t);
}
function groupOfProduct(name, code) {
  const t = fold(String(name ?? "")).replace(/^(\s*[\(\[][^\)\]]*[\)\]])+\s*/, "");
  let best = null;
  for (const [re, g] of KEYWORDS) {
    const m = re.exec(t);
    if (m && (best === null || m.index < best.at)) best = { at: m.index, g };
  }
  if (best) return best.g;
  return PREFIX_GROUP.find(([re]) => re.test(code))?.[1] ?? "Kh\xE1c";
}
var spuOf, fold, KEYWORDS, PREFIX_GROUP, NON_PRODUCT_NAME;
var init_spu_code = __esm({
  "src/lib/spu-code.ts"() {
    "use strict";
    spuOf = (sku) => String(sku ?? "").replace(/^#/, "").trim().toUpperCase().split("-")[0].trim();
    fold = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
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

// src/lib/code-links.ts
async function loadCodeLinks() {
  const { data, error } = await sb.rnd().from("product_code_links").select("id, product_id, test_code, sku_code, launch_date, note, created_at").order("created_at");
  if (error) return [];
  return data ?? [];
}
function linkIndex(links) {
  const bySku = new Map(links.map((l) => [l.sku_code, l]));
  const byTest = /* @__PURE__ */ new Map();
  for (const l of links) byTest.set(l.test_code, [...byTest.get(l.test_code) ?? [], l]);
  return { bySku, byTest };
}
function testPhaseCodes(codes, publishedAt, links) {
  if (!links.length) return codes;
  const { bySku, byTest } = linkIndex(links);
  const day = vnDate(publishedAt);
  const out = /* @__PURE__ */ new Set();
  for (const c of codes) {
    const l = bySku.get(c) ?? byTest.get(c)?.[0];
    if (!l) {
      out.add(c);
      continue;
    }
    if (day < l.launch_date) out.add(l.test_code);
  }
  return [...out];
}
var vnDate;
var init_code_links = __esm({
  "src/lib/code-links.ts"() {
    "use strict";
    init_server_only();
    init_admin();
    init_daily_sales();
    init_session_worker();
    init_tags();
    init_spu_code();
    vnDate = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
  }
});

// src/lib/meta/graph.ts
function appSecretProof(token) {
  const secret = process.env.FB_APP_SECRET;
  return secret ? (0, import_node_crypto.createHmac)("sha256", secret).update(token).digest("hex") : null;
}
async function graph(path, params, retries = 3) {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const proof = params.access_token ? appSecretProof(params.access_token) : null;
  if (proof) url.searchParams.set("appsecret_proof", proof);
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (json.error) {
    if (RATE_LIMIT_CODES.has(json.error.code) && retries > 0) {
      await new Promise((r) => setTimeout(r, (4 - retries) * 5e3));
      return graph(path, params, retries - 1);
    }
    if ((TRANSIENT_CODES.has(json.error.code) || json.error.is_transient === true) && retries > 1) {
      await new Promise((r) => setTimeout(r, (4 - retries) * 2e3 + 1500));
      return graph(path, params, retries - 1);
    }
    throw new GraphError(json.error.code, json.error.message);
  }
  return json;
}
async function graphAll(path, params, maxPages = 20) {
  const out = [];
  let page = await graph(path, params);
  out.push(...page.data);
  for (let i = 1; i < maxPages && page.paging?.next && page.paging.cursors?.after; i++) {
    page = await graph(path, { ...params, after: page.paging.cursors.after });
    out.push(...page.data);
  }
  return out;
}
var import_node_crypto, GRAPH_VERSION, GRAPH, GraphError, RATE_LIMIT_CODES, TRANSIENT_CODES;
var init_graph = __esm({
  "src/lib/meta/graph.ts"() {
    "use strict";
    init_server_only();
    import_node_crypto = require("node:crypto");
    GRAPH_VERSION = "v26.0";
    GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
    GraphError = class extends Error {
      constructor(code, message) {
        super(`Graph ${code}: ${message}`);
        this.code = code;
      }
    };
    RATE_LIMIT_CODES = /* @__PURE__ */ new Set([4, 17, 32, 613]);
    TRANSIENT_CODES = /* @__PURE__ */ new Set([1, 2]);
  }
});

// src/lib/meta/metrics.ts
var PAGE_DAILY_COLUMNS, POST_COLUMNS;
var init_metrics = __esm({
  "src/lib/meta/metrics.ts"() {
    "use strict";
    PAGE_DAILY_COLUMNS = {
      page_media_view: "views",
      page_total_media_view_unique: "viewers",
      page_post_engagements: "engagements",
      page_daily_follows_unique: "new_follows",
      page_daily_unfollows_unique: "unfollows",
      page_views_total: "page_views",
      page_video_views: "video_views"
    };
    POST_COLUMNS = {
      post_media_view: "views",
      post_total_media_view_unique: "viewers",
      post_reactions_by_type_total: "reactions",
      post_clicks: "clicks",
      post_video_views: "video_views"
    };
  }
});

// src/lib/platforms.ts
function kindOf(type, permalink) {
  if (permalink?.includes("/reel/") || permalink?.includes("/shorts/")) return "reel";
  if (type === "added_video") return "video";
  if (type === "added_photos") return "photo";
  if (type === "mobile_status_update") return "status";
  return "other";
}
var init_platforms = __esm({
  "src/lib/platforms.ts"() {
    "use strict";
  }
});

// src/lib/system-log.ts
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
  "src/lib/system-log.ts"() {
    "use strict";
    init_server_only();
    init_admin();
    init_session_worker();
  }
});

// src/lib/sync/api-videos.ts
async function apiFreshFacebook(ids, maxAgeHours = 72) {
  const fresh = /* @__PURE__ */ new Set();
  const check = async (id) => {
    try {
      const res = await fetch(`${BASE}/facebook/videos?limit=1&offset=0&channel_id=${encodeURIComponent(id)}`, { headers: { accept: "application/json", "user-agent": "ncptsp-sync/1.0" }, signal: AbortSignal.timeout(15e3), cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      const at = j.videos?.[0]?.updated_at ? Date.parse(j.videos[0].updated_at) : NaN;
      if ((j.total ?? 0) > 0 && Number.isFinite(at) && Date.now() - at <= maxAgeHours * 36e5) fresh.add(id);
    } catch {
    }
  };
  for (let i = 0; i < ids.length; i += 6) await Promise.all(ids.slice(i, i + 6).map(check));
  return fresh;
}
var BASE;
var init_api_videos = __esm({
  "src/lib/sync/api-videos.ts"() {
    "use strict";
    init_server_only();
    init_admin();
    init_system_log();
    BASE = (process.env.VIDEOS_API_URL ?? "https://channel-traffic.fastapicloud.dev").replace(/\/$/, "");
  }
});

// src/lib/eval/views-window.ts
function gainInRange(a) {
  const lag = a.maxLag ?? 4;
  if (a.pubDay > a.to) return null;
  let end, exact = true;
  if (a.to >= a.today) end = a.cur;
  else if (a.end && gapDays(a.end.day, a.to) <= lag) end = a.end;
  else {
    end = a.cur;
    exact = false;
  }
  if (a.pubDay >= a.from) return { ...sub(end, ZERO), exact };
  const base = a.base && gapDays(a.base.day, shiftDay(a.from, -1)) <= lag ? a.base : null;
  if (!base) return null;
  return { ...sub(end, base), exact };
}
function addGain(t, g, opts) {
  if (opts.published) {
    t.posts += 1;
    if (opts.video) t.videos += 1;
  }
  if (!g) {
    t.unknown += 1;
    return;
  }
  t.views += g.views;
  t.viewers += g.viewers;
  t.reactions += g.reactions;
  t.clicks += g.clicks;
  if (!g.exact) t.approx += 1;
}
var DAY2, shiftDay, gapDays, sub, ZERO, emptyTotals;
var init_views_window = __esm({
  "src/lib/eval/views-window.ts"() {
    "use strict";
    DAY2 = 864e5;
    shiftDay = (d, n) => new Date(Date.parse(d) + n * DAY2).toISOString().slice(0, 10);
    gapDays = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY2);
    sub = (a, b) => ({
      views: Math.max(0, a.views - b.views),
      viewers: Math.max(0, a.viewers - b.viewers),
      reactions: Math.max(0, a.reactions - b.reactions),
      clicks: Math.max(0, a.clicks - b.clicks)
    });
    ZERO = { views: 0, viewers: 0, reactions: 0, clicks: 0 };
    emptyTotals = () => ({ ...ZERO, posts: 0, videos: 0, unknown: 0, approx: 0 });
  }
});

// src/lib/post-views.ts
async function snapshotsAt(postIds, day) {
  const out = /* @__PURE__ */ new Map();
  if (!postIds.length) return out;
  const chunks2 = [];
  for (let i = 0; i < postIds.length; i += 800) chunks2.push(postIds.slice(i, i + 800));
  const results = await Promise.all(chunks2.map((ids) => sb.social().rpc("post_stats_at", { p_post_ids: ids, p_day: day })));
  for (const { data, error } of results) {
    if (error) continue;
    for (const r of data ?? []) {
      out.set(r.post_id, { day: r.day, views: Number(r.views), viewers: Number(r.viewers), reactions: Number(r.reactions), clicks: Number(r.clicks) });
    }
  }
  return out;
}
async function codeViewsInRange(posts, from, to) {
  const today = vnDay2(Date.now());
  const pubDay = new Map(posts.map((p) => [p.id, vnDay2(Date.parse(p.published_at))]));
  const old = posts.filter((p) => pubDay.get(p.id) < from).map((p) => p.id);
  const [endSnaps, baseSnaps] = await Promise.all([
    to < today ? snapshotsAt(posts.filter((p) => pubDay.get(p.id) <= to).map((p) => p.id), to) : /* @__PURE__ */ new Map(),
    old.length ? snapshotsAt(old, shiftDay(from, -1)) : /* @__PURE__ */ new Map()
  ]);
  const out = /* @__PURE__ */ new Map();
  for (const p of posts) {
    const d = pubDay.get(p.id);
    if (d > to) continue;
    const g = gainInRange({
      pubDay: d,
      from,
      to,
      today,
      cur: { views: Number(p.views), viewers: Number(p.viewers), reactions: Number(p.reactions), clicks: Number(p.clicks) },
      end: endSnaps.get(p.id),
      base: baseSnaps.get(p.id)
    });
    const published = d >= from;
    for (const c of p.product_codes) {
      const t = out.get(c) ?? emptyTotals();
      addGain(t, g, { published, video: p.kind === "video" || p.kind === "reel" });
      out.set(c, t);
    }
  }
  return out;
}
var vnDay2;
var init_post_views = __esm({
  "src/lib/post-views.ts"() {
    "use strict";
    init_server_only();
    init_admin();
    init_views_window();
    vnDay2 = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(ms));
  }
});

// src/lib/eval/rules.ts
function buildMetrics(raw) {
  return {
    ...raw,
    ctr: raw.views > 0 ? raw.clicks / raw.views * 100 : null,
    engagement_rate: raw.viewers > 0 ? (raw.reactions + raw.clicks) / raw.viewers * 100 : null,
    conversion: raw.viewers > 0 ? raw.qty_net / raw.viewers * 100 : null
  };
}
function checkRules(rules, m) {
  return rules.map((r) => {
    const actual = m[r.metric];
    const pass = actual !== null && (r.op === ">=" ? actual >= r.value : actual <= r.value);
    const progress = actual === null ? 0 : r.op === ">=" ? r.value > 0 ? Math.min(1, actual / r.value) : 1 : pass ? 1 : 0;
    return { metric: r.metric, op: r.op, target: r.value, actual, pass, progress };
  });
}
function groupStatus(checks, match, enoughData) {
  if (rulesPass(checks, match)) return "pass";
  if (!enoughData) return "not_enough";
  const avg = checks.reduce((s, c) => s + c.progress, 0) / Math.max(1, checks.length);
  const best = Math.max(0, ...checks.map((c) => c.progress));
  return (match === "all" ? avg : best) >= 0.5 ? "partial" : "weak";
}
function decideAuto(salesPass, trafficPass, windowOver) {
  if (salesPass) return "win";
  if (trafficPass) return "win_traffic";
  return windowOver ? "fail" : "testing";
}
var rulesPass;
var init_rules = __esm({
  "src/lib/eval/rules.ts"() {
    "use strict";
    init_tags();
    rulesPass = (checks, match) => checks.length > 0 && (match === "all" ? checks.every((c) => c.pass) : checks.some((c) => c.pass));
  }
});

// src/lib/pipeline-constants.ts
var trafficFrom, PRODUCT_GROUPS, APPROVAL_FROM_LABEL, APPROVAL_TO_LABEL, GROUP_OPTS;
var init_pipeline_constants = __esm({
  "src/lib/pipeline-constants.ts"() {
    "use strict";
    trafficFrom = (p) => p.stage && p.created_at ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(p.created_at)) : null;
    PRODUCT_GROUPS = { gmv: "GMV", traffic: "Traffic", profit: "Profit", return: "Return" };
    APPROVAL_FROM_LABEL = { "B\u1EA3n nh\xE1p": "draft", "Ch\u1EDD duy\u1EC7t": "pending", "\u0110\xE3 duy\u1EC7t": "approved", "T\u1EEB ch\u1ED1i": "rejected" };
    APPROVAL_TO_LABEL = Object.fromEntries(Object.entries(APPROVAL_FROM_LABEL).map(([k, v]) => [v, k]));
    GROUP_OPTS = Object.entries(PRODUCT_GROUPS).map(([, v], i) => ({ value: v, color: i + 1 }));
  }
});

// src/lib/kpi-constants.ts
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
  "src/lib/kpi-constants.ts"() {
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

// src/lib/spu-tracking.ts
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
var DEFAULT_SPU_RULES;
var init_spu_tracking = __esm({
  "src/lib/spu-tracking.ts"() {
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
  }
});

// src/lib/spu-rules.ts
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
  "src/lib/spu-rules.ts"() {
    "use strict";
    init_server_only();
    init_admin();
    init_kpi_constants();
    init_spu_tracking();
    SPU_RULES_KEY = "spu_rules";
    num = (v, d, min = 0) => typeof v === "number" && Number.isFinite(v) && v >= min ? v : d;
  }
});

// src/lib/rnd-options.ts
var CYCLE, o, DEFAULT_OPTIONS, DRAFT_ORDER, PLACED_ORDER, normOrderStatus, flagged;
var init_rnd_options = __esm({
  "src/lib/rnd-options.ts"() {
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
    DRAFT_ORDER = "Ch\u01B0a \u0111\u1EB7t";
    PLACED_ORDER = "\u0110\xE3 \u0111\u1EB7t h\xE0ng";
    normOrderStatus = (s) => s === "\u0110\u1EB7t h\xE0ng" ? DRAFT_ORDER : s === "Ch\u1ED1t \u0111\xFAc" ? PLACED_ORDER : s === "Ho\xE0n th\xE0nh" ? "Ho\xE0n th\xE0nh m\u1EABu" : s;
    flagged = (opts, flag) => opts.filter((x) => x.flag === flag).map((x) => x.value);
  }
});

// src/lib/pipeline.ts
async function getTeams(activeOnly = false) {
  const all = await allTeams();
  return activeOnly ? all.filter((t) => t.is_active) : all;
}
async function getRndOptions() {
  const o2 = { ...DEFAULT_OPTIONS, ...await rndOptionsRaw() };
  const hadDraft = o2.order_status.some((x) => x.flag === "draft");
  const list = o2.order_status.map((x) => !hadDraft && x.value === "\u0110\u1EB7t h\xE0ng" ? { value: DRAFT_ORDER, color: 18, flag: "draft" } : { ...x, value: normOrderStatus(x.value) });
  o2.order_status = list.some((x) => x.flag === "draft") ? list : [{ value: DRAFT_ORDER, color: 18, flag: "draft" }, ...list];
  return o2;
}
var allTeams, getAllProfiles, rndOptionsRaw;
var init_pipeline = __esm({
  "src/lib/pipeline.ts"() {
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

// src/lib/eval/engine.ts
async function inChunks(keys, read, size = 200) {
  const out = [];
  for (let i = 0; i < keys.length; i += size * 4) {
    const batch = await Promise.all(Array.from({ length: 4 }, (_, k) => keys.slice(i + k * size, i + (k + 1) * size)).filter((c) => c.length).map((c) => read(c)));
    for (const { data, error } of batch) {
      if (error) throw error;
      out.push(...data ?? []);
    }
  }
  return out;
}
async function evaluateAll() {
  const today = vnDate2(/* @__PURE__ */ new Date());
  const [{ data: settings }, { data: defaults, error: tErr }] = await Promise.all([
    sb.core().from("settings").select("value").eq("key", "evaluation").maybeSingle(),
    sb.rnd().from("kpi_templates").select("goal_code, rules, match, min_days, min_views").eq("is_default", true).in("goal_code", ["sales", "traffic"])
  ]);
  if (tErr) throw tErr;
  const s = settings?.value ?? null;
  const salesKpi = defaults?.find((d) => d.goal_code === "sales");
  const trafficKpi = defaults?.find((d) => d.goal_code === "traffic");
  if (!s || !salesKpi || !trafficKpi) throw new Error("Thi\u1EBFu c\xE0i \u0111\u1EB7t \u0111\xE1nh gi\xE1 ho\u1EB7c m\u1EABu KPI m\u1EB7c \u0111\u1ECBnh c\u1EE7a Test Sales/Test Traffic");
  const EVAL_COLS = "id, channel_id, published_at, kind, product_codes, permalink_url, thumbnail_url, views, viewers, reactions, clicks";
  const posts = await fetchAllByKey(
    (after2, limit) => {
      let q = sb.social().from("posts").select(EVAL_COLS).neq("product_codes", "{}");
      if (after2) q = q.gt("published_at", after2);
      return q.order("published_at").order("id").limit(limit);
    },
    (r) => r.published_at,
    () => fetchAll((a, b) => sb.social().from("posts").select(EVAL_COLS).neq("product_codes", "{}").order("published_at").order("id").range(a, b))
  );
  const links = await loadCodeLinks();
  if (links.length) for (const p of posts) p.product_codes = testPhaseCodes(p.product_codes, p.published_at, links);
  const byCode = /* @__PURE__ */ new Map();
  for (const p of posts) for (const code of p.product_codes) byCode.set(code, [...byCode.get(code) ?? [], p]);
  for (const c of [...byCode.keys()]) if (!/^[A-Z]{1,4}[0-9]{3,}$/.test(c)) byCode.delete(c);
  if (!byCode.size) return { evaluated: 0, created: 0 };
  const allCodes = [...byCode.keys()];
  const existing = await inChunks(allCodes, (c) => sb.rnd().from("products").select("id, code, sapo_code, age_override, status, stage, origin, created_at, entry_source").in("code", c));
  const prodByCode = new Map(existing.map((p) => [p.code, p]));
  const catalog = await inChunks([.../* @__PURE__ */ new Set([...allCodes, ...existing.map((p) => p.sapo_code).filter(Boolean)])], (c) => sb.sales().from("catalog").select("code, name, first_seen_at").in("code", c));
  const cat = new Map(catalog.map((c) => [c.code, c]));
  const missing2 = allCodes.filter((c) => !prodByCode.has(c));
  if (missing2.length) {
    const { error: error2 } = await sb.rnd().from("products").upsert(missing2.map((code) => ({
      code,
      name: cat.get(code)?.name ?? (isTestCode(code) ? testCodeProductName(code) : `M\u1EABu ${code}`),
      status: "testing",
      origin: "auto"
      // rnd.products.origin chỉ nhận manual / auto (products_origin_check) — mã test nhận ra qua dạng mã (isTestCode), không qua origin
    })), { onConflict: "code", ignoreDuplicates: true });
    if (error2) throw new Error(`${error2.message} (m\xE3: ${missing2.slice(0, 15).join(", ")}${missing2.length > 15 ? "\u2026" : ""})`);
    const made = await inChunks(missing2, (c) => sb.rnd().from("products").select("id, code, sapo_code, age_override, status, stage, origin, created_at, entry_source").in("code", c));
    for (const p of made) prodByCode.set(p.code, p);
  }
  const rndSamples = [...prodByCode.values()].filter((p) => p.stage && p.entry_source !== "media");
  const sampleFrom = /* @__PURE__ */ new Map();
  if (rndSamples.length) {
    const opts = await getRndOptions();
    const cancelled = flagged(opts.order_status, "cancel"), doneSt = flagged(opts.order_status, "done");
    const { data: ords } = await sb.rnd().from("sample_orders").select("product_id, status, ordered_at, received_at").in("product_id", rndSamples.map((p) => p.id));
    const byP = /* @__PURE__ */ new Map();
    for (const o2 of ords ?? []) if (!cancelled.includes(o2.status)) byP.set(o2.product_id, [...byP.get(o2.product_id) ?? [], o2]);
    for (const [pid, os] of byP) {
      const recv = os.map((o2) => o2.received_at?.slice(0, 10)).filter((x) => !!x).sort()[0];
      const doneOrdered = os.filter((o2) => doneSt.includes(o2.status) || o2.status === "Ho\xE0n th\xE0nh").map((o2) => o2.ordered_at?.slice(0, 10)).filter((x) => !!x).sort()[0];
      sampleFrom.set(pid, recv ?? doneOrdered ?? "9999-12-31");
    }
  }
  const stale = [];
  for (const code of allCodes) {
    const prod = prodByCode.get(code);
    if (!prod) {
      byCode.delete(code);
      continue;
    }
    const base = trafficFrom(prod), made = sampleFrom.get(prod.id);
    const from = base && made ? made > base ? made : base : base;
    if (!from) continue;
    const kept = byCode.get(code).filter((p) => vnDate2(p.published_at) >= from);
    if (kept.length) byCode.set(code, kept);
    else {
      byCode.delete(code);
      stale.push(code);
    }
  }
  if (stale.length) await sb.rnd().from("evaluations").delete().in("code", stale);
  const codes = allCodes.filter((c) => byCode.has(c));
  if (!codes.length) return { evaluated: 0, created: missing2.length };
  const productIds = [...prodByCode.values()].map((p) => p.id);
  const sessionsRaw = (await inChunks(productIds, (c) => sb.rnd().from("test_sessions").select("*").in("product_id", c))).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const sessionOf = /* @__PURE__ */ new Map();
  for (const ss of sessionsRaw ?? []) if (!sessionOf.has(ss.product_id)) sessionOf.set(ss.product_id, ss);
  const sessionIds = [...sessionOf.values()].map((x) => x.id);
  const { data: decided } = sessionIds.length ? await sb.rnd().from("decisions").select("session_id, result, decided_at").in("session_id", sessionIds).order("decided_at", { ascending: false }) : { data: [] };
  const sessionResult = /* @__PURE__ */ new Map();
  for (const d of decided ?? []) if (!sessionResult.has(d.session_id)) sessionResult.set(d.session_id, d.result);
  const salesCodeOf = (code) => (prodByCode.get(code)?.sapo_code ?? code).toUpperCase();
  const firstDate = (code) => vnDate2(byCode.get(code)[0].published_at);
  const earliest = codes.map((c) => shift(firstDate(c), -s.new_lookback_days)).sort()[0];
  const salesCodes = [...new Set(codes.map(salesCodeOf))];
  const sales = await loadDailySales({ codes: salesCodes, from: earliest, keepWarranty: true, fresh: true });
  const recentFrom = shift(today, -(s.window_days - 1));
  const recentViews = await codeViewsInRange(posts, recentFrom, today);
  const WIN_RANK = { win: 4, win_traffic: 3, win_sp: 3, testing: 1, fail: 0 };
  const sell = (await loadSpuRules()).win.traffic;
  const sellRule = [{ metric: "views", op: ">=", value: sell.views }];
  const recentFromSell = shift(today, -(sell.days - 1));
  const recentViewsSell = await codeViewsInRange(posts, recentFromSell, today);
  const rows = [];
  for (const code of codes) {
    const product = prodByCode.get(code);
    const D = firstDate(code);
    const session = sessionOf.get(product.id);
    const wStart = session?.start_date ?? D;
    const wEnd = session?.end_date ?? shift(D, s.window_days - 1);
    const windowOver = today > wEnd || session?.status === "ended";
    const totalDays = daysIncl(wStart, wEnd);
    const elapsed = Math.max(0, Math.min(daysIncl(wStart, today), totalDays));
    const inWin = byCode.get(code).filter((p) => {
      const d = vnDate2(p.published_at);
      return d >= wStart && d <= wEnd && (session?.sales_scope !== "pages" || session.page_ids.includes(p.channel_id));
    });
    const traffic = inWin.reduce((t, p) => ({
      views: t.views + Number(p.views),
      viewers: t.viewers + Number(p.viewers),
      reactions: t.reactions + Number(p.reactions),
      clicks: t.clicks + Number(p.clicks)
    }), { views: 0, viewers: 0, reactions: 0, clicks: 0 });
    const sc = salesCodeOf(code);
    const inScope = (r) => !session || session.sales_scope === "all" ? r.channel !== "bao_hanh" : session.sales_scope === "pages" ? session.page_ids.includes(r.page_id) : session.channels.includes(r.channel);
    const winSales = sales.filter((r) => r.code === sc && r.date >= wStart && r.date <= wEnd && inScope(r));
    const qty = winSales.reduce((t, r) => t + r.qty_sold - r.qty_returned, 0);
    const m = buildMetrics({ ...traffic, qty_net: qty, posts: inWin.length, videos: inWin.filter((p) => p.kind === "video" || p.kind === "reel").length });
    const isTest = !!session || isTestCode(code) || !!product.stage && product.stage !== "p6";
    const sellStart = D, sellEnd = shift(D, sell.days - 1);
    const sellPosts = isTest ? [] : byCode.get(code).filter((p) => {
      const d = vnDate2(p.published_at);
      return d >= sellStart && d <= sellEnd;
    });
    const sellFirst = sellPosts.reduce((t, p) => ({ views: t.views + Number(p.views), viewers: t.viewers + Number(p.viewers), reactions: t.reactions + Number(p.reactions), clicks: t.clicks + Number(p.clicks) }), { views: 0, viewers: 0, reactions: 0, clicks: 0 });
    const sellQty = isTest ? 0 : sales.filter((r) => r.code === sc && r.date >= sellStart && r.date <= sellEnd && r.channel !== "bao_hanh").reduce((t, r) => t + r.qty_sold - r.qty_returned, 0);
    const mSell = buildMetrics({ ...sellFirst, qty_net: sellQty, posts: sellPosts.length, videos: sellPosts.filter((p) => p.kind === "video" || p.kind === "reel").length });
    const enough = (k) => elapsed >= k.min_days && traffic.views >= k.min_views;
    const trafficMatch = isTest ? trafficKpi.match : "all";
    const trafficEnough = isTest ? enough(trafficKpi) : elapsed >= sell.days;
    const salesChecks = checkRules(salesKpi.rules, m), trafficChecks = isTest ? checkRules(trafficKpi.rules, m) : checkRules(sellRule, mSell);
    const salesPass = rulesPass(salesChecks, salesKpi.match) && traffic.views >= salesKpi.min_views;
    const trafficPass = rulesPass(trafficChecks, trafficMatch);
    let result = session && sessionResult.get(session.id) || decideAuto(salesPass, trafficPass, windowOver);
    let checks = [{ group: "sales", items: salesChecks }, { group: "traffic", items: trafficChecks }];
    let shownM = m, shownSalesChecks = salesChecks, shownSalesPass = salesPass;
    let shownTrafficChecks = trafficChecks;
    let winInfo = { kind: "first", from: wStart, to: wEnd };
    let recentUnknown = 0;
    if (!isTest && !salesPass && trafficPass) {
      shownM = mSell;
      winInfo = { kind: "first", from: sellStart, to: sellEnd };
    }
    if (!session) {
      const rg = recentViews.get(code) ?? emptyTotals();
      recentUnknown = rg.unknown;
      const rs = sales.filter((r) => r.code === sc && r.date >= recentFrom && r.date <= today && r.channel !== "bao_hanh");
      const rm = buildMetrics({
        views: rg.views,
        viewers: rg.viewers,
        reactions: rg.reactions,
        clicks: rg.clicks,
        posts: rg.posts,
        videos: rg.videos,
        qty_net: rs.reduce((t, r) => t + r.qty_sold - r.qty_returned, 0)
      });
      const rg3 = recentViewsSell.get(code) ?? emptyTotals();
      const rm3 = buildMetrics({
        views: rg3.views,
        viewers: rg3.viewers,
        reactions: rg3.reactions,
        clicks: rg3.clicks,
        posts: rg3.posts,
        videos: rg3.videos,
        qty_net: sales.filter((r) => r.code === sc && r.date >= recentFromSell && r.date <= today && r.channel !== "bao_hanh").reduce((t, r) => t + r.qty_sold - r.qty_returned, 0)
      });
      const rSalesChecks = checkRules(salesKpi.rules, rm), rTrafficChecks = isTest ? checkRules(trafficKpi.rules, rm) : checkRules(sellRule, rm3);
      const rSalesPass = rulesPass(rSalesChecks, salesKpi.match) && rg.views >= salesKpi.min_views;
      const rTrafficPass = rulesPass(rTrafficChecks, trafficMatch);
      if (rSalesPass || rTrafficPass) {
        const rResult = decideAuto(rSalesPass, rTrafficPass, true);
        if (WIN_RANK[rResult] > WIN_RANK[result]) {
          const byTraffic = !isTest && !rSalesPass;
          result = rResult;
          shownM = byTraffic ? rm3 : rm;
          shownSalesChecks = rSalesChecks;
          shownTrafficChecks = rTrafficChecks;
          shownSalesPass = rSalesPass;
          checks = [{ group: "sales", items: rSalesChecks }, { group: "traffic", items: rTrafficChecks }];
          winInfo = { kind: "recent", from: byTraffic ? recentFromSell : recentFrom, to: today };
        }
      }
    }
    const lookFrom = shift(D, -s.new_lookback_days);
    const before = sales.filter((r) => r.code === sc && r.date >= lookFrom && r.date < D && r.channel !== "bao_hanh").reduce((t, r) => t + r.qty_sold - r.qty_returned, 0);
    const firstSeen = cat.get(sc)?.first_seen_at ? vnDate2(cat.get(sc).first_seen_at) : null;
    let age, ageReason, ageReliable = true;
    if (product.age_override) {
      age = product.age_override;
      ageReason = "override";
    } else if (isTestCode(code) || product.origin === "media") {
      age = "new";
      ageReason = "media_test";
    } else if (product.stage || product.origin === "manual") {
      age = "new";
      ageReason = "rnd";
    } else if (before > s.new_max_qty) {
      age = "old";
      ageReason = before >= s.old_hot_qty ? "old_hot" : "old_slow";
    } else if (firstSeen && firstSeen < shift(D, -s.new_catalog_days)) {
      age = "old";
      ageReason = "old_catalog";
    } else if (!firstSeen || firstSeen > D) {
      age = "new";
      ageReason = "not_in_sapo";
    } else if (firstSeen >= s.catalog_trusted_from && firstSeen >= shift(D, -s.new_catalog_days)) {
      age = "new";
      ageReason = "new_listing";
    } else if (before <= s.new_max_qty) {
      age = "new";
      ageReason = "no_sales";
      ageReliable = lookFrom >= s.history_trusted_from;
    } else {
      age = "old";
      ageReason = before >= s.old_hot_qty ? "old_hot" : "old_slow";
    }
    let forecast = null;
    if (!windowOver && elapsed > 0 && winInfo.kind === "first") {
      const k = totalDays / elapsed;
      const pm = buildMetrics({
        ...traffic,
        views: traffic.views * k,
        viewers: traffic.viewers * k,
        reactions: traffic.reactions * k,
        clicks: traffic.clicks * k,
        qty_net: qty * k,
        posts: m.posts,
        videos: m.videos
      });
      const pSales = rulesPass(checkRules(salesKpi.rules, pm), salesKpi.match) && pm.views >= salesKpi.min_views;
      const pTraffic = isTest ? rulesPass(checkRules(trafficKpi.rules, pm), trafficKpi.match) : (elapsed < sell.days ? sellFirst.views * sell.days / Math.max(elapsed, 1) : sellFirst.views) >= sell.views;
      forecast = {
        views: Math.round(pm.views),
        viewers: Math.round(pm.viewers),
        qty_net: Math.round(pm.qty_net),
        predicted: decideAuto(pSales, pTraffic, true),
        days_left: totalDays - elapsed
      };
    }
    const videoSource = winInfo.kind === "recent" ? byCode.get(code).filter((p) => vnDate2(p.published_at) >= recentFrom) : inWin;
    const videos = videoSource.map((p) => ({
      id: p.id,
      channel_id: p.channel_id,
      date: vnDate2(p.published_at),
      url: p.permalink_url,
      thumb: p.thumbnail_url,
      views: Number(p.views),
      viewers: Number(p.viewers),
      ctr: Number(p.views) > 0 ? Number(p.clicks) / Number(p.views) * 100 : null
    })).sort((a, b) => b.views - a.views);
    rows.push({
      code,
      product_id: product.id,
      first_post_date: D,
      window_end: wEnd,
      days_elapsed: elapsed,
      age,
      age_reason: ageReason,
      age_reliable: ageReliable,
      source: session ? "session" : "auto",
      session_id: session?.id ?? null,
      result,
      // Điều kiện bán đã đạt nhưng chưa đủ lượt xem tối thiểu → "chưa đủ dữ liệu", không phải "đạt"
      sales_status: shownSalesPass ? "pass" : rulesPass(shownSalesChecks, salesKpi.match) ? "not_enough" : groupStatus(shownSalesChecks, salesKpi.match, enough(salesKpi)),
      traffic_status: groupStatus(shownTrafficChecks, trafficMatch, trafficEnough),
      // window = cửa sổ tạo ra kết quả; first = số liệu cửa sổ đầu (để so sánh); recent_unknown = số bài cũ chưa đủ lịch sử ảnh chụp
      metrics: { ...shownM, window: winInfo, first: { views: m.views, qty_net: m.qty_net }, recent_unknown: recentUnknown },
      checks,
      forecast,
      videos,
      evaluated_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (!session && product.status !== (windowOver ? "ended" : "testing")) {
      await sb.rnd().from("products").update({ status: windowOver ? "ended" : "testing" }).eq("id", product.id);
    }
  }
  const { error } = await sb.rnd().from("evaluations").upsert(rows);
  if (error) throw error;
  await advanceToWin(rows);
  return { evaluated: rows.length, created: missing2.length };
}
async function advanceToWin(results) {
  const winCodes = results.filter((r) => r.result === "win" || r.result === "win_traffic");
  if (!winCodes.length) return;
  const { data, error } = await sb.rnd().from("products").select("id, code").in("code", winCodes.map((r) => r.code)).eq("stage", "p4").is("killed_at", null).or("entry_source.is.null,entry_source.neq.media");
  if (error || !data?.length) return;
  const at = (/* @__PURE__ */ new Date()).toISOString();
  await sb.rnd().from("products").update({ stage: "p5", stage_at: at }).in("id", data.map((p) => p.id));
  await sb.rnd().from("product_events").insert(data.map((p) => ({
    product_id: p.id,
    actor_id: null,
    action: "stage_changed",
    changes: { stage: ["p4", "p5"], note: [null, `T\u1EF1 \u0111\u1ED9ng: h\u1EC7 th\u1ED1ng \u0111\xE1nh gi\xE1 ${winCodes.find((r) => r.code === p.code)?.result === "win" ? "WIN" : "WIN TRAFFIC"}`] }
  })));
}
var DAY3, vnDate2, shift, daysIncl;
var init_engine = __esm({
  "src/lib/eval/engine.ts"() {
    "use strict";
    init_server_only();
    init_admin();
    init_daily_sales();
    init_post_views();
    init_views_window();
    init_rules();
    init_pipeline_constants();
    init_tags();
    init_code_links();
    init_spu_rules();
    init_pipeline();
    init_rnd_options();
    DAY3 = 864e5;
    vnDate2 = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
    shift = (d, n) => new Date(Date.parse(d) + n * DAY3).toISOString().slice(0, 10);
    daysIncl = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY3) + 1;
  }
});

// src/lib/meta/token.ts
function metaTokens() {
  const out = [];
  if (process.env.FB_USER_TOKEN) out.push({ source: "user", token: process.env.FB_USER_TOKEN });
  if (process.env.FB_SYSTEM_TOKEN) out.push({ source: "system", token: process.env.FB_SYSTEM_TOKEN });
  return out;
}
async function inspectToken(source, token) {
  const base = { source, owner: null, expiresAt: null, daysLeft: null, scopes: [], missing: REQUIRED_SCOPES };
  try {
    const appToken = process.env.FB_APP_ID && process.env.FB_APP_SECRET ? `${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}` : token;
    const dbg = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/debug_token`);
    dbg.searchParams.set("input_token", token);
    dbg.searchParams.set("access_token", appToken);
    const me = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me`);
    me.searchParams.set("fields", "name");
    me.searchParams.set("access_token", token);
    const proof = appSecretProof(token);
    if (proof) me.searchParams.set("appsecret_proof", proof);
    const [d, m] = await Promise.all([
      fetch(dbg, { next: { revalidate: 3600 } }).then((r) => r.json()),
      fetch(me, { next: { revalidate: 3600 } }).then((r) => r.json()).catch(() => ({}))
    ]);
    if (d.error && [4, 17, 32, 613].includes(d.error.code)) return { ...base, valid: true, missing: [], error: d.error.message };
    if (d.error) return { ...base, valid: false, error: d.error.message };
    const data = d.data ?? {};
    const exp = Math.min(...[data.expires_at, data.data_access_expires_at].filter((x) => !!x), Infinity);
    const scopes = data.scopes ?? [];
    return {
      source,
      valid: !!data.is_valid,
      error: data.error?.message,
      owner: m?.name ?? null,
      expiresAt: Number.isFinite(exp) ? new Date(exp * 1e3) : null,
      daysLeft: Number.isFinite(exp) ? Math.floor((exp * 1e3 - Date.now()) / DAY_MS) : null,
      scopes,
      missing: REQUIRED_SCOPES.filter((s) => !scopes.includes(s))
    };
  } catch (e) {
    return { ...base, valid: false, error: e instanceof Error ? e.message : String(e) };
  }
}
var TOKEN_LABELS, REQUIRED_SCOPES, DAY_MS, cachedStatuses;
var init_token = __esm({
  "src/lib/meta/token.ts"() {
    "use strict";
    init_server_only();
    init_next_cache();
    init_graph();
    init_cache_tags();
    TOKEN_LABELS = { system: "Ng\u01B0\u1EDDi d\xF9ng h\u1EC7 th\u1ED1ng", user: "Token c\xE1 nh\xE2n" };
    REQUIRED_SCOPES = ["pages_show_list", "pages_read_engagement", "read_insights", "pages_read_user_content"];
    DAY_MS = 864e5;
    cachedStatuses = unstable_cache(
      async (fingerprint) => {
        void fingerprint;
        return Promise.all(metaTokens().map((t) => inspectToken(t.source, t.token)));
      },
      ["meta-token-status"],
      { tags: [TAG.metaToken], revalidate: 3600 }
    );
  }
});

// packages/ncptsp-core/shim/next-server.ts
function after(task) {
  void Promise.resolve().then(() => task());
}
var init_next_server = __esm({
  "packages/ncptsp-core/shim/next-server.ts"() {
    "use strict";
  }
});

// src/lib/rnd-workspace-types.ts
var RND_CHANNEL;
var init_rnd_workspace_types = __esm({
  "src/lib/rnd-workspace-types.ts"() {
    "use strict";
    RND_CHANNEL = "rnd-changes";
  }
});

// src/lib/rnd-ping.ts
function pingRnd() {
  const send = async () => {
    try {
      const r = await supabaseAdmin().channel(RND_CHANNEL).httpSend("changed", { at: Date.now() });
      if (!r.success) console.error("pingRnd:", r.error);
    } catch (e) {
      console.error("pingRnd:", e);
    }
  };
  try {
    after(send);
  } catch {
    void send();
  }
}
var init_rnd_ping = __esm({
  "src/lib/rnd-ping.ts"() {
    "use strict";
    init_server_only();
    init_next_server();
    init_admin();
    init_rnd_workspace_types();
  }
});

// src/lib/rnd-code-stats.ts
async function rndCodeStats(items) {
  if (!items.length) return /* @__PURE__ */ new Map();
  const payload = items.map((i) => ({ id: i.id, codes: [...new Set(i.codes.map((c) => c.toUpperCase()))].join(","), d_from: i.from ?? null, d_to: i.to ?? null }));
  const { data, error } = await sb.social().rpc("rnd_code_stats", { p_items: payload });
  if (error) return null;
  const out = /* @__PURE__ */ new Map();
  for (const r of data ?? []) {
    out.set(String(r.id), {
      first: r.first_day ?? null,
      posts: Number(r.posts ?? 0),
      videos: Number(r.videos ?? 0),
      views: Number(r.views ?? 0),
      viewers: Number(r.viewers ?? 0),
      reactions: Number(r.reactions ?? 0),
      comments: Number(r.comments ?? 0),
      shares: Number(r.shares ?? 0),
      clicks: Number(r.clicks ?? 0),
      topUrl: r.top_url ?? null
    });
  }
  return out;
}
var init_rnd_code_stats = __esm({
  "src/lib/rnd-code-stats.ts"() {
    "use strict";
    init_server_only();
    init_admin();
  }
});

// src/lib/rnd-constants.ts
var RND_BUCKET;
var init_rnd_constants = __esm({
  "src/lib/rnd-constants.ts"() {
    "use strict";
    RND_BUCKET = "rnd-images";
  }
});

// src/lib/media.ts
var import_cloudinary;
var init_media = __esm({
  "src/lib/media.ts"() {
    "use strict";
    init_server_only();
    import_cloudinary = require("cloudinary");
    init_admin();
    init_rnd_constants();
  }
});

// src/lib/rnd.ts
async function getCardStats(input) {
  const out = {};
  const products = input.filter((p) => !!p.code);
  if (!products.length) return out;
  const today = vnToday();
  const skuOf = /* @__PURE__ */ new Map();
  for (const l of await loadCodeLinks()) skuOf.set(l.test_code, [...skuOf.get(l.test_code) ?? [], l.sku_code]);
  const codesOf = (p) => [p.code.toUpperCase(), ...skuOf.get(p.code.toUpperCase()) ?? []];
  const codes = [...new Set(products.flatMap(codesOf))];
  for (const p of products) {
    out[p.code] = {
      since: null,
      days: null,
      posts: 0,
      videos: 0,
      views: 0,
      viewers: 0,
      reactions: 0,
      clicks: 0,
      ctr: null,
      qtyNet: 0,
      conversion: null,
      daily: Array(30).fill(0),
      trendPct: null
    };
  }
  const dbStats = await rndCodeStats(products.map((p) => ({ id: p.code, codes: codesOf(p), from: trafficFrom(p) ?? null })));
  let posts = [];
  if (dbStats) {
    for (const p of products) {
      const r = dbStats.get(p.code), s = out[p.code];
      if (r) {
        s.posts = r.posts;
        s.videos = r.videos;
        s.views = r.views;
        s.viewers = r.viewers;
        s.reactions = r.reactions;
        s.clicks = r.clicks;
        s.since = r.first;
      }
    }
  } else {
    const { data, error } = await sb.social().from("posts").select("published_at, kind, product_codes, views, viewers, reactions, clicks").overlaps("product_codes", codes);
    if (error) throw error;
    posts = data ?? [];
  }
  for (const post of posts) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(post.published_at));
    for (const p of products) {
      if (!codesOf(p).some((c) => post.product_codes.includes(c))) continue;
      const from2 = trafficFrom(p);
      if (from2 && day < from2) continue;
      const s = out[p.code];
      s.posts += 1;
      if (post.kind === "video" || post.kind === "reel") s.videos += 1;
      s.views += Number(post.views);
      s.viewers += Number(post.viewers);
      s.reactions += Number(post.reactions);
      s.clicks += Number(post.clicks);
      if (!s.since || day < s.since) s.since = day;
    }
  }
  const salesCodes = (p) => skuOf.get(p.code.toUpperCase()) ?? [(p.sapo_code ?? p.code).toUpperCase()];
  const earliest = Object.values(out).map((s) => s.since).filter(Boolean).sort()[0];
  const from = earliest && earliest < shift2(today, -29) ? earliest : shift2(today, -29);
  const rows = await loadDailySales({ codes: [...new Set(products.flatMap(salesCodes))], from });
  for (const p of products) {
    const s = out[p.code], mine = salesCodes(p);
    const add = (date, qty) => {
      if (s.since && date >= s.since) s.qtyNet += qty;
      const idx = 29 - Math.round((Date.parse(today) - Date.parse(date)) / DAY_MS2);
      if (idx >= 0 && idx < 30) s.daily[idx] += qty;
    };
    for (const r of rows) {
      if (!mine.includes(r.code)) continue;
      add(r.date, r.qty_sold - r.qty_returned);
    }
    s.days = s.since ? Math.round((Date.parse(today) - Date.parse(s.since)) / DAY_MS2) + 1 : null;
    s.ctr = s.views > 0 ? s.clicks / s.views * 100 : null;
    s.conversion = s.viewers > 0 ? s.qtyNet / s.viewers * 100 : null;
    const last7 = s.daily.slice(23).reduce((a, b) => a + b, 0), prev7 = s.daily.slice(16, 23).reduce((a, b) => a + b, 0);
    s.trendPct = prev7 > 0 ? (last7 - prev7) / prev7 * 100 : last7 > 0 ? null : 0;
  }
  return out;
}
var SIGN_TTL, REUSE_MS, THUMB, sharedThumb, DAY_MS2, vnToday, shift2;
var init_rnd = __esm({
  "src/lib/rnd.ts"() {
    "use strict";
    init_server_only();
    init_next_cache();
    init_admin();
    init_daily_sales();
    init_rnd_code_stats();
    init_session_worker();
    init_media();
    init_rnd_constants();
    init_pipeline_constants();
    init_code_links();
    init_spu_rules();
    init_rules();
    init_kpi_constants();
    init_rnd_constants();
    SIGN_TTL = 6 * 3600;
    REUSE_MS = 5 * 36e5;
    THUMB = { width: 360, height: 360, resize: "cover", quality: 70 };
    sharedThumb = unstable_cache(async (path) => {
      const { data } = await supabaseAdmin().storage.from(RND_BUCKET).createSignedUrl(path, SIGN_TTL, { transform: THUMB });
      return data?.signedUrl ?? null;
    }, ["rnd-thumb-v1"], { revalidate: REUSE_MS / 1e3 });
    DAY_MS2 = 864e5;
    vnToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(/* @__PURE__ */ new Date());
    shift2 = (d, n) => new Date(Date.parse(d) + n * DAY_MS2).toISOString().slice(0, 10);
  }
});

// src/lib/rnd-metrics.ts
async function refreshProductMetrics() {
  const products = await fetchAll((a, b) => sb.rnd().from("products").select("id, code, sapo_code, stage, created_at").not("code", "is", null).order("id").range(a, b));
  if (!products.length) return "kh\xF4ng c\xF3 m\u1EABu n\xE0o c\xF3 m\xE3";
  const stats = await getCardStats(products);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const rows = products.flatMap((p) => {
    const s = stats[p.code];
    return s ? [{
      product_id: p.id,
      code: p.code,
      since: s.since,
      posts: s.posts,
      videos: s.videos,
      views: s.views,
      viewers: s.viewers,
      reactions: s.reactions,
      clicks: s.clicks,
      qty_net: s.qtyNet,
      daily_qty: s.daily,
      refreshed_at: now
    }] : [];
  });
  if (!rows.length) return "0 m\u1EABu c\xF3 s\u1ED1 li\u1EC7u";
  const { error: e2 } = await sb.rnd().from("product_metrics").upsert(rows, { onConflict: "product_id" });
  if (e2) {
    if (e2.code === "42P01" || e2.code === "PGRST205") return "b\u1ECF qua (ch\u01B0a ch\u1EA1y migration 031)";
    throw e2;
  }
  return `${rows.length} m\u1EABu`;
}
var init_rnd_metrics = __esm({
  "src/lib/rnd-metrics.ts"() {
    "use strict";
    init_admin();
    init_rnd();
  }
});

// src/lib/sales-api.ts
async function get(path, params) {
  const url = new URL(`${process.env.SALES_API_URL.replace(/\/+$/, "")}/${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== null) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...process.env.SALES_API_KEY ? { Authorization: `Bearer ${process.env.SALES_API_KEY}` } : {} },
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`Sales API ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  if (!Array.isArray(body)) throw new Error(`Sales API ${path}: ph\u1EA3n h\u1ED3i kh\xF4ng ph\u1EA3i m\u1EA3ng JSON`);
  return body;
}
async function fetchApiCatalog() {
  const out = [];
  for (let offset = 0; ; offset += 1e3) {
    const rows = await get("catalog", { offset, limit: 1e3 });
    out.push(...rows);
    if (rows.length < 1e3) return out;
  }
}
var salesApiEnabled, fetchApiSales;
var init_sales_api = __esm({
  "src/lib/sales-api.ts"() {
    "use strict";
    init_server_only();
    salesApiEnabled = () => !!process.env.SALES_API_URL;
    fetchApiSales = (since, until) => get("daily-sales", { since, until });
  }
});

// src/lib/tiktok/api.ts
async function tokenRequest(body) {
  const res = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY, client_secret: process.env.TIKTOK_CLIENT_SECRET, ...body })
  });
  const json = await res.json();
  if (json.error || !json.access_token) throw new TikTokError(String(json.error ?? res.status), json.error_description ?? "kh\xF4ng l\u1EA5y \u0111\u01B0\u1EE3c token");
  return json;
}
async function call(path, token, init) {
  const res = await fetch(`${API}${path}`, {
    cache: "no-store",
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers ?? {} }
  });
  const json = await res.json();
  if (json.error && json.error.code !== "ok") throw new TikTokError(json.error.code, json.error.message);
  return json.data;
}
async function getUser(token) {
  const d = await call("/user/info/?fields=open_id,display_name,avatar_url,follower_count,likes_count,video_count", token);
  return d.user;
}
async function listVideos(token, sinceSec, maxPages = 10) {
  const out = [];
  let cursor;
  for (let page = 0; page < maxPages; page++) {
    const d = await call(`/video/list/?fields=${VIDEO_FIELDS}`, token, {
      method: "POST",
      body: JSON.stringify({ max_count: 20, ...cursor !== void 0 ? { cursor } : {} })
    });
    const vids = d.videos ?? [];
    out.push(...vids.filter((v) => v.create_time >= sinceSec));
    if (!d.has_more || !vids.length || vids[vids.length - 1].create_time < sinceSec) break;
    cursor = d.cursor;
  }
  return out;
}
var API, TikTokError, refreshToken, VIDEO_FIELDS;
var init_api = __esm({
  "src/lib/tiktok/api.ts"() {
    "use strict";
    init_server_only();
    API = "https://open.tiktokapis.com/v2";
    TikTokError = class extends Error {
      constructor(code, message) {
        super(`TikTok ${code}: ${message}`);
        this.code = code;
      }
    };
    refreshToken = (refresh) => tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
    VIDEO_FIELDS = "id,create_time,title,video_description,cover_image_url,share_url,like_count,comment_count,share_count,view_count";
  }
});

// src/lib/tiktok/delta.ts
function dailyDelta(prev, now, nowMs) {
  const d = { views: 0, engagements: 0 };
  for (const v of now) {
    const old = prev.get(v.id);
    if (old) {
      d.views += Math.max(0, v.views - old.views);
      d.engagements += Math.max(0, v.reactions - old.reactions) + Math.max(0, v.comments - old.comments) + Math.max(0, v.shares - old.shares);
    } else if (nowMs - v.createdSec * 1e3 <= FRESH_HOURS * 36e5) {
      d.views += v.views;
      d.engagements += v.reactions + v.comments + v.shares;
    }
  }
  return d;
}
function followDelta(prev, cur) {
  if (prev === null || prev === void 0 || cur === void 0) return { gained: 0, lost: 0 };
  return { gained: Math.max(0, cur - prev), lost: Math.max(0, prev - cur) };
}
var FRESH_HOURS;
var init_delta = __esm({
  "src/lib/tiktok/delta.ts"() {
    "use strict";
    FRESH_HOURS = 48;
  }
});

// src/lib/sync/snapshots.ts
async function snapshotPosts(rows, opts = {}) {
  const cutoff = Date.now() - 45 * DAY_MS3;
  const day = opts.date ?? vnDay3(Date.now());
  const picked = opts.includeOld ? rows : rows.filter((r) => Date.parse(r.published_at) >= cutoff);
  const full = picked.map((r) => ({
    post_id: r.id,
    date: day,
    views: Number(r.views) || 0,
    reactions: Number(r.reactions) || 0,
    viewers: Number(r.viewers) || 0,
    clicks: Number(r.clicks) || 0,
    ...r.comments === null || r.comments === void 0 ? {} : { comments: Number(r.comments) || 0 }
  }));
  let level = 0;
  for (let i = 0; i < full.length; i += 500) {
    const part = full.slice(i, i + 500);
    const shape = (l) => l === 0 ? part : l === 1 ? part.map(({ comments: _c, ...r }) => (void _c, r)) : part.map(({ post_id, date, views, reactions }) => ({ post_id, date, views, reactions }));
    for (; ; ) {
      const { error } = await sb.social().from("post_daily").upsert(shape(level));
      if (!error) break;
      if (error.code !== "42703" && error.code !== "PGRST204" || level === 2) return;
      level = level + 1;
    }
  }
}
async function pruneSnapshots() {
  await sb.social().from("post_daily").delete().lt("date", vnDay3(Date.now() - 120 * DAY_MS3));
}
var DAY_MS3, vnDay3;
var init_snapshots = __esm({
  "src/lib/sync/snapshots.ts"() {
    "use strict";
    init_server_only();
    init_admin();
    DAY_MS3 = 864e5;
    vnDay3 = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(ms));
  }
});

// src/lib/sync/tiktok.ts
async function activeTikTok() {
  const [{ data: ch, error }, { data: toks, error: tErr }] = await Promise.all([
    sb.social().from("channels").select("id, platform, name, last_synced_at").eq("is_active", true).eq("platform", "tiktok"),
    sb.social().rpc("tiktok_tokens")
  ]);
  if (error || tErr) return [];
  const tokenOf = new Map(toks.map((t) => [t.channel_id, t]));
  return (ch ?? []).filter((c) => tokenOf.has(c.id)).map((c) => ({ ...c, token: tokenOf.get(c.id) }));
}
async function freshAccess(ch) {
  const t = ch.token;
  if (Date.parse(t.refresh_expires_at) < Date.now()) throw new Error("Refresh token TikTok \u0111\xE3 h\u1EBFt h\u1EA1n \u2014 ch\u1EE7 t\xE0i kho\u1EA3n c\u1EA7n k\u1EBFt n\u1ED1i l\u1EA1i");
  if (Date.parse(t.access_expires_at) - Date.now() > 30 * 6e4) return t.access_token;
  const n = await refreshToken(t.refresh_token);
  const { error } = await sb.social().rpc("save_tiktok_token", {
    p_channel_id: ch.id,
    p_open_id: n.open_id ?? t.open_id,
    p_access: n.access_token,
    p_refresh: n.refresh_token ?? t.refresh_token,
    p_access_exp: new Date(Date.now() + n.expires_in * 1e3).toISOString(),
    p_refresh_exp: new Date(Date.now() + (n.refresh_expires_in ?? 365 * 86400) * 1e3).toISOString(),
    p_scope: n.scope ?? t.scope
  });
  if (error) throw error;
  return n.access_token;
}
async function syncTikTokChannel(ch, postDays, extractHashtags2) {
  const access = await freshAccess(ch);
  const nowMs = Date.now();
  const { count: have } = await sb.social().from("posts").select("*", { count: "exact", head: true }).eq("channel_id", ch.id);
  const sinceSec = Math.floor((nowMs - (have ? postDays : Math.max(postDays, 90)) * DAY_MS4) / 1e3);
  const [user, videos, { data: prevCh }] = await Promise.all([
    getUser(access),
    listVideos(access, sinceSec),
    sb.social().from("channels").select("followers_count").eq("id", ch.id).maybeSingle()
  ]);
  const ids = videos.map((v) => `tt:${v.id}`);
  const prev = /* @__PURE__ */ new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await sb.social().from("posts").select("id, views, reactions, comments, shares").in("id", ids.slice(i, i + 100));
    for (const r of data ?? []) prev.set(r.id, { views: Number(r.views), reactions: Number(r.reactions), comments: Number(r.comments ?? 0), shares: Number(r.shares ?? 0) });
  }
  const now = videos.map((v) => ({ id: `tt:${v.id}`, createdSec: v.create_time, views: v.view_count ?? 0, reactions: v.like_count ?? 0, comments: v.comment_count ?? 0, shares: v.share_count ?? 0 }));
  const delta = dailyDelta(prev, now, nowMs);
  const fol = followDelta(prevCh?.followers_count, user.follower_count);
  if (videos.length) {
    const stamp = (/* @__PURE__ */ new Date()).toISOString();
    const rows = videos.map((v) => {
      const text = v.video_description || v.title || null;
      return {
        id: `tt:${v.id}`,
        channel_id: ch.id,
        platform: "tiktok",
        published_at: new Date(v.create_time * 1e3).toISOString(),
        kind: "video",
        message: text,
        permalink_url: v.share_url ?? null,
        thumbnail_url: v.cover_image_url ?? null,
        hashtags: extractHashtags2(text),
        views: v.view_count ?? 0,
        viewers: 0,
        reactions: v.like_count ?? 0,
        comments: v.comment_count ?? 0,
        shares: v.share_count ?? 0,
        clicks: 0,
        video_views: v.view_count ?? 0,
        stats_at: stamp
      };
    });
    const { error } = await sb.social().from("posts").upsert(rows);
    if (error) throw error;
    await snapshotPosts(rows);
  }
  const today = vnDay4(nowMs);
  if (delta.views || delta.engagements || fol.gained || fol.lost) {
    const { data: cur } = await sb.social().from("channel_daily").select("*").eq("channel_id", ch.id).eq("date", today).maybeSingle();
    const { error } = await sb.social().from("channel_daily").upsert({
      channel_id: ch.id,
      date: today,
      views: Number(cur?.views ?? 0) + delta.views,
      video_views: Number(cur?.video_views ?? 0) + delta.views,
      engagements: Number(cur?.engagements ?? 0) + delta.engagements,
      new_follows: Number(cur?.new_follows ?? 0) + fol.gained,
      unfollows: Number(cur?.unfollows ?? 0) + fol.lost,
      viewers: Number(cur?.viewers ?? 0),
      page_views: Number(cur?.page_views ?? 0),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (error) throw error;
  } else {
    await sb.social().from("channel_daily").upsert({ channel_id: ch.id, date: today }, { ignoreDuplicates: true });
  }
  await sb.social().from("channels").update({
    followers_count: user.follower_count ?? null,
    ...user.display_name ? { name: user.display_name } : {},
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", ch.id);
  return { posts: videos.length, newViews: delta.views };
}
var DAY_MS4, vnDay4;
var init_tiktok = __esm({
  "src/lib/sync/tiktok.ts"() {
    "use strict";
    init_server_only();
    init_admin();
    init_api();
    init_delta();
    init_snapshots();
    DAY_MS4 = 864e5;
    vnDay4 = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(ms));
  }
});

// src/lib/youtube/api.ts
async function call2(path, params) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("Ch\u01B0a c\u1EA5u h\xECnh YOUTUBE_API_KEY");
  const url = new URL(BASE2 + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", key);
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(3e4) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = json.error?.errors?.[0]?.reason;
    throw new Error(`YouTube API ${res.status}${reason ? ` (${reason})` : ""}: ${json.error?.message ?? "l\u1ED7i kh\xF4ng r\xF5"}`);
  }
  return json;
}
async function channelSubscribers(channelId) {
  const r = await call2("/channels", { part: "statistics", id: channelId });
  const s = r.items?.[0]?.statistics;
  return s && !s.hiddenSubscriberCount && s.subscriberCount ? Number(s.subscriberCount) : null;
}
async function listUploadIds(playlistId, sinceMs, maxPages = 40) {
  const ids = [];
  let pageToken = "";
  for (let i = 0; i < maxPages; i++) {
    const r = await call2(
      "/playlistItems",
      { part: "contentDetails", playlistId, maxResults: "50", ...pageToken ? { pageToken } : {} }
    );
    for (const it of r.items ?? []) {
      const at = it.contentDetails.videoPublishedAt ? Date.parse(it.contentDetails.videoPublishedAt) : NaN;
      if (Number.isFinite(at) && at < sinceMs) return ids;
      ids.push(it.contentDetails.videoId);
    }
    if (!r.nextPageToken) break;
    pageToken = r.nextPageToken;
  }
  return ids;
}
async function getVideos(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await call2("/videos", { part: "snippet,statistics,contentDetails", id: ids.slice(i, i + 50).join(",") });
    for (const v of r.items ?? []) {
      const th = v.snippet.thumbnails ?? {};
      out.push({
        id: v.id,
        title: v.snippet.title,
        description: v.snippet.description ?? "",
        tags: v.snippet.tags ?? [],
        publishedAt: v.snippet.publishedAt,
        thumbnail: (th.maxres ?? th.standard ?? th.high ?? th.medium ?? th.default)?.url ?? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
        // link YouTube cố định, không hết hạn
        views: Number(v.statistics?.viewCount ?? 0),
        likes: v.statistics?.likeCount !== void 0 ? Number(v.statistics.likeCount) : null,
        comments: v.statistics?.commentCount !== void 0 ? Number(v.statistics.commentCount) : null,
        seconds: durationSec(v.contentDetails?.duration ?? ""),
        liveOrUpcoming: (v.snippet.liveBroadcastContent ?? "none") !== "none"
      });
    }
  }
  return out;
}
var BASE2, youtubeConfigured, uploadsOf, durationSec;
var init_api2 = __esm({
  "src/lib/youtube/api.ts"() {
    "use strict";
    init_server_only();
    BASE2 = "https://www.googleapis.com/youtube/v3";
    youtubeConfigured = () => !!process.env.YOUTUBE_API_KEY;
    uploadsOf = (channelId) => `UU${channelId.slice(2)}`;
    durationSec = (iso) => {
      const m = iso.match(/^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
      return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
    };
  }
});

// src/lib/sync/youtube.ts
async function activeYouTube() {
  if (!youtubeConfigured()) return [];
  const { data, error } = await sb.social().from("channels").select("id, platform, name, last_synced_at").eq("is_active", true).eq("platform", "youtube");
  return error ? [] : data ?? [];
}
async function syncYouTubeChannel(ch, postDays, extractHashtags2) {
  if (!ch.id.startsWith("yt:")) throw new Error("ID k\xEAnh YouTube ph\u1EA3i c\xF3 d\u1EA1ng yt:UC\u2026");
  const channelId = ch.id.slice(3), nowMs = Date.now();
  const { count: have } = await sb.social().from("posts").select("*", { count: "exact", head: true }).eq("channel_id", ch.id);
  const since = nowMs - (have ? postDays : Math.max(postDays, YT_INITIAL_DAYS)) * DAY_MS5;
  const [ids, subs, { data: prevCh }] = await Promise.all([
    listUploadIds(uploadsOf(channelId), since),
    channelSubscribers(channelId),
    sb.social().from("channels").select("followers_count").eq("id", ch.id).maybeSingle()
  ]);
  const videos = (await getVideos(ids)).filter((v) => !v.liveOrUpcoming);
  const keys = videos.map((v) => `yt:${v.id}`);
  const prev = /* @__PURE__ */ new Map();
  for (let i = 0; i < keys.length; i += 100) {
    const { data } = await sb.social().from("posts").select("id, views, reactions, comments, shares").in("id", keys.slice(i, i + 100));
    for (const r of data ?? []) prev.set(r.id, { views: Number(r.views), reactions: Number(r.reactions), comments: Number(r.comments ?? 0), shares: Number(r.shares ?? 0) });
  }
  const now = videos.map((v) => ({ id: `yt:${v.id}`, createdSec: Date.parse(v.publishedAt) / 1e3, views: v.views, reactions: v.likes ?? 0, comments: v.comments ?? 0, shares: 0 }));
  const delta = dailyDelta(prev, now, nowMs);
  const fol = followDelta(prevCh?.followers_count, subs ?? void 0);
  if (videos.length) {
    const stamp = (/* @__PURE__ */ new Date()).toISOString();
    const rows = videos.map((v) => {
      const short = v.seconds > 0 && v.seconds <= 180;
      const tagText = v.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ");
      return {
        id: `yt:${v.id}`,
        channel_id: ch.id,
        platform: "youtube",
        published_at: v.publishedAt,
        kind: short ? "reel" : "video",
        message: v.title,
        permalink_url: short ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`,
        thumbnail_url: v.thumbnail,
        hashtags: [.../* @__PURE__ */ new Set([...extractHashtags2(`${v.title}
${v.description}`), ...extractHashtags2(tagText)])],
        views: v.views,
        viewers: 0,
        reactions: v.likes ?? 0,
        comments: v.comments,
        shares: null,
        clicks: 0,
        video_views: v.views,
        stats_at: stamp
      };
    });
    const { error } = await sb.social().from("posts").upsert(rows);
    if (error) throw error;
    await snapshotPosts(rows);
  }
  const today = vnDay5(nowMs);
  if (delta.views || delta.engagements || fol.gained || fol.lost) {
    const { data: cur } = await sb.social().from("channel_daily").select("*").eq("channel_id", ch.id).eq("date", today).maybeSingle();
    const { error } = await sb.social().from("channel_daily").upsert({
      channel_id: ch.id,
      date: today,
      views: Number(cur?.views ?? 0) + delta.views,
      video_views: Number(cur?.video_views ?? 0) + delta.views,
      engagements: Number(cur?.engagements ?? 0) + delta.engagements,
      new_follows: Number(cur?.new_follows ?? 0) + fol.gained,
      unfollows: Number(cur?.unfollows ?? 0) + fol.lost,
      viewers: Number(cur?.viewers ?? 0),
      page_views: Number(cur?.page_views ?? 0),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (error) throw error;
  } else {
    await sb.social().from("channel_daily").upsert({ channel_id: ch.id, date: today }, { ignoreDuplicates: true });
  }
  await sb.social().from("channels").update({ followers_count: subs ?? null, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", ch.id);
  return { posts: videos.length, newViews: delta.views };
}
var DAY_MS5, vnDay5, YT_INITIAL_DAYS;
var init_youtube = __esm({
  "src/lib/sync/youtube.ts"() {
    "use strict";
    init_server_only();
    init_admin();
    init_api2();
    init_delta();
    init_snapshots();
    DAY_MS5 = 864e5;
    vnDay5 = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(ms));
    YT_INITIAL_DAYS = 90;
  }
});

// src/lib/date-range.ts
function resolveRange(range, today) {
  const monthStart = `${today.slice(0, 8)}01`;
  if (range === "today") return { from: today, to: today };
  if (range === "this_month") return { from: monthStart, to: today };
  if (range === "last_month") {
    const end = shiftDay2(monthStart, -1);
    return { from: `${end.slice(0, 8)}01`, to: end };
  }
  const n = Number(range);
  if ([7, 30, 90, 365].includes(n)) return { from: shiftDay2(today, -(n - 1)), to: today };
  return null;
}
var DAY_MS6, shiftDay2;
var init_date_range = __esm({
  "src/lib/date-range.ts"() {
    "use strict";
    DAY_MS6 = 864e5;
    shiftDay2 = (d, n) => new Date(Date.parse(d) + n * DAY_MS6).toISOString().slice(0, 10);
  }
});

// src/lib/format.ts
function fmtCompact(n) {
  const f = (v) => v < 10 ? v.toLocaleString("vi-VN", { maximumFractionDigits: 1 }) : Math.round(v).toLocaleString("vi-VN");
  const a = Math.abs(n);
  if (a >= 999500) return `${f(n / 1e6)} Tr`;
  if (a >= 1e3) return `${f(n / 1e3)}K`;
  return Math.round(n).toLocaleString("vi-VN");
}
var fmtInt;
var init_format = __esm({
  "src/lib/format.ts"() {
    "use strict";
    fmtInt = (n) => Math.round(n).toLocaleString("vi-VN");
  }
});

// src/lib/data.ts
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
  return new Date(Date.parse(date) + n * DAY_MS7).toISOString().slice(0, 10);
}
function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS7) + 1;
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
var DAY_MS7, RANGE_PRESETS, CHANNELS, one, isDate, limitByTeams, getAccounts, OVERVIEW_METRICS, getPostsPageCached, catalogCache, getLatestSyncLogs, fmtMoney, fmtDate, fmtDateTime;
var init_data = __esm({
  "src/lib/data.ts"() {
    "use strict";
    init_server_only();
    init_date_range();
    init_daily_sales();
    init_next_cache();
    init_admin();
    init_cache_tags();
    init_format();
    DAY_MS7 = 864e5;
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

// src/lib/db-gate.ts
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
  "src/lib/db-gate.ts"() {
    "use strict";
    MAX = 3;
    running = 0;
    waiting = [];
    isTimeout2 = (e) => !!e && (e.code === "57014" || /statement timeout|canceling statement/i.test(e.message ?? ""));
  }
});

// src/lib/sku-overrides.ts
async function loadSkuOverrides() {
  try {
    return new Map((await cached()).map((r) => [r.sku.toUpperCase(), r.spu_code]));
  } catch {
    return /* @__PURE__ */ new Map();
  }
}
var cached;
var init_sku_overrides = __esm({
  "src/lib/sku-overrides.ts"() {
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

// src/lib/spu-alias.ts
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
  const canon = canonOf(aliases);
  return posts.map((p) => ({ ...p, product_codes: [...new Set(p.product_codes.map(canon))] }));
}
var cached2, canonOf;
var init_spu_alias = __esm({
  "src/lib/spu-alias.ts"() {
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

// src/lib/staff-teams.ts
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
        const same = cand.filter((p) => p.kd === kd);
        if (same.length) cand = same;
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
var TEAM_ALIAS, SUFFIX_TEAM, NOISE, fold2, words, nameTokens, hintOf, shiftOf, cached3;
var init_staff_teams = __esm({
  "src/lib/staff-teams.ts"() {
    "use strict";
    init_server_only();
    init_admin();
    TEAM_ALIAS = { HN: "H\u1ED3ng Ng\u1ECDc", "T\u0110Q": "\u0110\xE1 qu\xFD", GB: "Global" };
    SUFFIX_TEAM = { tmdt: "TM\u0110T", store: "SHOP", nlb: "NLB", hlb: "HLB", tav: "TAV", ntd: "NT\u0110", global: "GB", dvl: "\u0110VL" };
    NOISE = /* @__PURE__ */ new Set(["kd1", "kd2", "kd3", "kho", "demo", "test", "admin", "sale", "sales", "nv", "ql", "thi", "van"]);
    fold2 = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
    words = (s) => fold2(s).replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
    nameTokens = (s) => words(s).filter((w) => !NOISE.has(w) && !(w in SUFFIX_TEAM));
    hintOf = (s) => words(s).map((w) => SUFFIX_TEAM[w]).find(Boolean) ?? null;
    shiftOf = (s) => words(s).find((w) => /^kd[123]$/.test(w)) ?? null;
    cached3 = null;
  }
});

// src/lib/spu-data.ts
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
  const canon = canonOf(await loadSpuAliases());
  const [skuSum, stockRaw0, catalog, sold, posts, ownImages, skuOv, ownNames, receipts, excluded] = await Promise.all([
    loadSkuSummary(),
    loadStock(),
    loadCatalog(),
    // ~11.000 dòng: bộ đệm chung chia đoạn 3.000 dòng (mỗi mục < 2 MB)
    loadSold30(since, today, (staff, tags) => isAdsTags(tags) || teamOfTags(tags) === ADS_TEAM ? ADS_TEAM : staffTeam(staff) ?? teamOfTags(tags), teamOfChannel, canon),
    light ? Promise.resolve([]) : loadVideoPosts(today),
    // ~30.000 video gắn mã: bộ đệm chung chia đoạn theo thời gian (nội dung / link / ảnh bìa chỉ nạp khi mở ngăn video — loadVideoDetails)
    loadOwnImages(),
    loadSkuOverrides(),
    loadOwnNames(),
    loadReceipts(),
    loadExcluded()
  ]);
  const stockRaw = stockRaw0.map((s) => ({ ...s, code: canon(s.code) }));
  const splitCodes = new Set([...skuOv.values()].flatMap((c) => [c, c.slice(0, -1)]));
  const sales30 = sold.map;
  const variants = /* @__PURE__ */ new Map();
  for (const k of skuSum) {
    const c = canon(k.code);
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
  for (const k of skuSum) if (k.name && !skuName.has(k.code) && canon(k.code) === k.code) skuName.set(k.code, k.name);
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
      age: Math.max(0, dayDiff(vnDay6(p.published_at), today)),
      views: Number(p.views ?? 0),
      platform: ch ? PLATFORM[ch.platform] ?? "FB" : "FB",
      channel: ch?.name ?? "\u2014",
      team: ch?.team_id ? teamName.get(ch.team_id) ?? null : null
    };
    for (const c of new Set((p.product_codes ?? []).map((x) => canon(spuOf(x))))) (vidsBy.get(c) ?? vidsBy.set(c, []).get(c)).push(vid);
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
async function loadSold30(since, today, teamOfLine, teamOfChannel, canon = (c) => c) {
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
        add(canon(spuOf(g.code)), n, team, g.day);
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
        days.push(vnDay6(r.ordered_at));
        add(canon(spuOf(r.code)), n, team, vnDay6(r.ordered_at));
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
      add(canon(spuOf(r.code)), n, team, r.date);
      qty += n;
      if (team) teamQty += n;
    }
    if (rows.length) return { map: out, byTeam, saleLines, source: "sapo", lines: rows.length, qty, teamQty, from: since, to: null };
  } catch {
  }
  return none;
}
var DAY4, vnDay6, dayDiff, addDays3, PLATFORM, ADS_TEAM, ADS_TAGS, isAdsTags, VIDEO_DAYS, cache, loadSpuRowsLight, videoChunk, recentVideos, olderVideos, skuSummaryCached, IMG_BASE, ownImagesCached, ownNamesCached, excludedCached, isCraftName, receiptsCached, CATALOG_CHUNK, CATALOG_CHUNKS, catalogChunk, stockCached, orderGroupsCached;
var init_spu_data = __esm({
  "src/lib/spu-data.ts"() {
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
    DAY4 = 864e5;
    vnDay6 = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
    dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY4);
    addDays3 = (d, n) => new Date(Date.parse(d) + n * DAY4).toISOString().slice(0, 10);
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

// src/lib/video-daily.ts
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
var missing, dayStr, addDay;
var init_video_daily = __esm({
  "src/lib/video-daily.ts"() {
    "use strict";
    init_server_only();
    init_admin();
    missing = (e) => !!e && (e.code === "PGRST202" || e.code === "42883" || e.code === "42P01" || /could not find the function|does not exist/i.test(e.message ?? ""));
    dayStr = (d) => d.toISOString().slice(0, 10);
    addDay = (s, n) => dayStr(new Date(Date.parse(`${s}T00:00:00Z`) + n * 864e5));
  }
});

// src/lib/team-lines.ts
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
  "src/lib/team-lines.ts"() {
    "use strict";
    init_server_only();
    init_admin();
    isTimeout3 = (m) => /timeout|canceling statement/i.test(m ?? "");
  }
});

// src/lib/spu-summary-build.ts
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
var DAY5, addDays4, normSearch;
var init_spu_summary_build = __esm({
  "src/lib/spu-summary-build.ts"() {
    "use strict";
    DAY5 = 864e5;
    addDays4 = (d, n) => new Date(Date.parse(d) + n * DAY5).toISOString().slice(0, 10);
    normSearch = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
  }
});

// src/lib/spu-winflags.ts
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
    const day = vnDay7(p.published_at);
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
  const canon = canonOf(aliases);
  const sapo = new Map((prod ?? []).filter((p) => p.code && p.sapo_code).map((p) => [String(p.code).toUpperCase(), String(p.sapo_code).toUpperCase()]));
  const saleCode = (c) => canon(sapo.get(c) ?? c);
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
  const salesC = aliases.size ? sales.map((r) => ({ ...r, code: canon(r.code) })) : sales;
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
  const canon = canonOf(await loadSpuAliases());
  const net = /* @__PURE__ */ new Map();
  for (const r of sales) {
    const c = canon(r.code);
    net.set(c, (net.get(c) ?? 0) + Number(r.qty_sold) - Number(r.qty_returned));
  }
  const order = [...net].filter(([, q]) => q >= a.rules.order.qty).map(([c]) => c).sort();
  return { wt: wt.sort(), order, meta };
}
async function loadRollingWin(a) {
  const today = a.today ?? vnDay7((/* @__PURE__ */ new Date()).toISOString());
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
var DAY6, addDays5, vnDay7, cached4, EMPTY_WIN, rollingCached, idsOf, union;
var init_spu_winflags = __esm({
  "src/lib/spu-winflags.ts"() {
    "use strict";
    init_server_only();
    init_next_cache();
    init_admin();
    init_cache_tags();
    init_daily_sales();
    init_spu_alias();
    init_db_gate();
    DAY6 = 864e5;
    addDays5 = (d, n) => new Date(Date.parse(d) + n * DAY6).toISOString().slice(0, 10);
    vnDay7 = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
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

// src/lib/channel-market.ts
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
  "src/lib/channel-market.ts"() {
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

// src/lib/video-win-data.ts
var init_video_win_data = __esm({
  "src/lib/video-win-data.ts"() {
    "use strict";
    init_server_only();
    init_admin();
  }
});

// src/lib/spu-query.ts
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
var spuReadMode;
var init_spu_query = __esm({
  "src/lib/spu-query.ts"() {
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
    spuReadMode = () => process.env.SPU_READ_MODE === "legacy" ? "legacy" : "sql";
  }
});

// src/lib/spu-videos.ts
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
  "src/lib/spu-videos.ts"() {
    "use strict";
  }
});

// src/lib/spu-dash.ts
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
  const vnDay8 = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
  const PLATFORM2 = { facebook: "FB", instagram: "IG", tiktok: "TT" };
  const items = d.alerts.top_videos.map((t) => {
    const ch = chan.get(t.channel_id);
    return { code: t.code, x: { id: t.id, title: "(kh\xF4ng c\xF3 n\u1ED9i dung)", platform: ch ? PLATFORM2[ch.platform] ?? "FB" : "FB", channel: ch?.name ?? "\u2014", team: null, date: vnDay8(t.published_at), views: Number(t.views), url: null, thumb: null } };
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
  "src/lib/spu-dash.ts"() {
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

// src/lib/spu-summary.ts
var spu_summary_exports = {};
__export(spu_summary_exports, {
  checkSpuSummary: () => checkSpuSummary,
  postsChangedSinceSummary: () => postsChangedSinceSummary,
  refreshSpuSummary: () => refreshSpuSummary,
  scheduleSpuSummaryRefresh: () => scheduleSpuSummaryRefresh,
  summaryNeedsRefresh: () => summaryNeedsRefresh
});
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
function scheduleSpuSummaryRefresh() {
  if (process.env.SPU_SUMMARY_REFRESH === "off") return;
  const run = async () => {
    if (running2) {
      again = true;
      return;
    }
    running2 = true;
    try {
      do {
        again = false;
        const r = await refreshSpuSummary();
        if (!r.ok) console.error("l\xE0m m\u1EDBi b\u1EA3ng t\u1ED5ng h\u1EE3p SPU l\u1ED7i:", r.error);
      } while (again);
    } finally {
      running2 = false;
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}
var CHUNK, MIGRATION_MSG, isMissing, running2, again;
var init_spu_summary = __esm({
  "src/lib/spu-summary.ts"() {
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
    running2 = false;
    again = false;
  }
});

// src/lib/sync/index.ts
var index_exports = {};
__export(index_exports, {
  connectTeamPages: () => connectTeamPages,
  extractHashtags: () => extractHashtags,
  retagPosts: () => retagPosts,
  setupChannels: () => setupChannels,
  syncAll: () => syncAll
});
module.exports = __toCommonJS(index_exports);
function toNumber(v) {
  if (typeof v === "number") return v;
  if (v && typeof v === "object") return Object.values(v).reduce((a, b) => a + b, 0);
  return 0;
}
function extractHashtags(text) {
  if (!text) return [];
  const tags = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  return [...new Set(tags.map((t) => t.slice(1).toLowerCase()))];
}
async function log(job, channelId, status, message, startedAt) {
  await sb.core().from("sync_runs").insert({
    job,
    channel_id: channelId,
    status,
    message,
    started_at: startedAt.toISOString(),
    finished_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  bust(TAG.sync);
}
function errMsg(e) {
  return e instanceof Error ? e.message : e?.message ?? JSON.stringify(e);
}
async function setupChannels(userToken, source = "user") {
  const pages = await graphAll("me/accounts", {
    fields: "id,name,access_token,followers_count,instagram_business_account{id,username,name}",
    access_token: userToken
  });
  const seen = { token_source: source, last_seen_at: (/* @__PURE__ */ new Date()).toISOString() };
  const fb = pages.map((p) => ({ id: p.id, platform: "facebook", name: p.name, followers_count: p.followers_count ?? null, ...seen }));
  const ig = pages.filter((p) => p.instagram_business_account).map((p) => ({
    id: p.instagram_business_account.id,
    platform: "instagram",
    name: p.instagram_business_account.name ?? p.instagram_business_account.username ?? p.name,
    username: p.instagram_business_account.username ?? null,
    parent_id: p.id,
    ...seen
  }));
  const upsert = async (rows) => {
    let { error } = await sb.social().from("channels").upsert(rows);
    if (error?.code === "PGRST204") {
      ({ error } = await sb.social().from("channels").upsert(rows.map(({ token_source, last_seen_at, ...r }) => (void token_source, void last_seen_at, r))));
    }
    if (error) throw error;
  };
  await upsert(fb);
  if (ig.length) await upsert(ig);
  bust(TAG.channels);
  for (const p of pages) {
    const { error: tErr } = await sb.social().rpc("save_channel_token", { p_channel_id: p.id, p_token: p.access_token });
    if (tErr) throw tErr;
    if (p.instagram_business_account) {
      await sb.social().rpc("save_channel_token", { p_channel_id: p.instagram_business_account.id, p_token: p.access_token });
    }
  }
  return [...fb, ...ig].map(({ id, platform, name }) => ({ id, platform, name }));
}
async function connectTeamPages(userToken, teamId) {
  const pages = await graphAll("me/accounts", {
    fields: "id,name,access_token,followers_count,instagram_business_account{id,username,name}",
    access_token: userToken
  });
  const ids = pages.flatMap((p) => [p.id, p.instagram_business_account?.id].filter(Boolean));
  const { data: existing, error: eErr } = ids.length ? await sb.social().from("channels").select("id, team_id").in("id", ids) : { data: [], error: null };
  if (eErr) throw eErr;
  const teamOf = new Map((existing ?? []).map((c) => [c.id, c.team_id]));
  const taken = (pageId) => {
    const t = teamOf.get(pageId);
    return !!t && t !== teamId;
  };
  const mine = pages.filter((p) => !taken(p.id));
  const skipped = pages.filter((p) => taken(p.id)).map((p) => ({ name: p.name, teamId: teamOf.get(p.id) }));
  const seen = { token_source: "user", last_seen_at: (/* @__PURE__ */ new Date()).toISOString(), team_id: teamId, is_active: true };
  const fb = mine.map((p) => ({ id: p.id, platform: "facebook", name: p.name, followers_count: p.followers_count ?? null, ...seen }));
  const ig = mine.filter((p) => p.instagram_business_account).map((p) => ({
    id: p.instagram_business_account.id,
    platform: "instagram",
    name: p.instagram_business_account.name ?? p.instagram_business_account.username ?? p.name,
    username: p.instagram_business_account.username ?? null,
    parent_id: p.id,
    ...seen
  }));
  const upsert = async (rows) => {
    let { error } = await sb.social().from("channels").upsert(rows);
    if (error?.code === "PGRST204") {
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
async function activeChannels(platform) {
  const channelsQ = async (cols) => sb.social().from("channels").select(cols).eq("is_active", true).eq("platform", platform);
  let res = await channelsQ("id, platform, name, last_synced_at");
  if (res.error?.code === "42703" || res.error?.code === "PGRST204") res = await channelsQ("id, platform, name");
  const { data: tokens, error: tErr } = await sb.social().rpc("channel_tokens");
  if (res.error) throw res.error;
  if (tErr) throw tErr;
  const tokenOf = new Map(tokens.map((t) => [t.channel_id, t.access_token]));
  return (res.data ?? []).filter((c) => tokenOf.has(c.id)).map((c) => ({ ...c, access_token: tokenOf.get(c.id) }));
}
async function syncChannelDaily(ch, days) {
  const until = /* @__PURE__ */ new Date();
  const byDate = /* @__PURE__ */ new Map();
  const metrics = Object.keys(PAGE_DAILY_COLUMNS);
  for (let offset = 0; offset < days; offset += MAX_RANGE_DAYS) {
    const chunkUntil = new Date(until.getTime() - offset * DAY_MS8);
    const chunkSince = new Date(chunkUntil.getTime() - Math.min(MAX_RANGE_DAYS, days - offset) * DAY_MS8);
    const res = await graph(`${ch.id}/insights`, {
      metric: metrics.join(","),
      period: "day",
      since: isoDate(chunkSince),
      until: isoDate(chunkUntil),
      access_token: ch.access_token
    });
    for (const m of res.data) {
      const col = PAGE_DAILY_COLUMNS[m.name];
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
  for (let i = 0; i < rows.length; i += 1e3) {
    const { error } = await sb.social().from("channel_daily").upsert(rows.slice(i, i + 1e3));
    if (error) throw error;
  }
  return rows.length;
}
async function syncPosts(ch, days) {
  const since = Math.floor((Date.now() - days * DAY_MS8) / 1e3);
  const base = "id,message,created_time,status_type,permalink_url,full_picture";
  const fetchPosts = async (fields) => {
    for (const limit of ["100", "25", "10"]) {
      try {
        return await graphAll(`${ch.id}/published_posts`, { fields, since: String(since), limit, access_token: ch.access_token }, 100);
      } catch (e) {
        if (!(e instanceof GraphError) || e.code !== 1 || limit === "10") throw e;
      }
    }
    return [];
  };
  let withEngagement = true;
  let list;
  try {
    list = await fetchPosts(`${base},comments.summary(true).limit(0),shares`);
  } catch (e) {
    if (!(e instanceof GraphError) || e.code !== 10) throw e;
    withEngagement = false;
    list = await fetchPosts(base);
  }
  const posts = [...new Map(list.map((p) => [p.id, p])).values()];
  if (!posts.length) return 0;
  const stats = /* @__PURE__ */ new Map();
  for (let i = 0; i < posts.length; i += 5) {
    await Promise.all(posts.slice(i, i + 5).map(async (p) => {
      const res = await graph(`${p.id}/insights`, {
        metric: Object.keys(POST_COLUMNS).join(","),
        period: "lifetime",
        // không có period, Meta trả thêm bản "day" (=0) cho vài metric
        access_token: ch.access_token
      });
      const s = {};
      for (const m of res.data.filter((x) => !x.period || x.period === "lifetime")) {
        const col = POST_COLUMNS[m.name];
        if (col) s[col] = toNumber(m.values?.[0]?.value ?? m.total_value?.value);
      }
      stats.set(p.id, s);
    }));
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const rows = posts.map((p) => {
    const s = stats.get(p.id);
    return {
      id: p.id,
      channel_id: ch.id,
      platform: ch.platform,
      published_at: p.created_time,
      kind: kindOf(p.status_type, p.permalink_url),
      message: p.message ?? null,
      permalink_url: p.permalink_url ?? null,
      thumbnail_url: p.full_picture ?? null,
      hashtags: extractHashtags(p.message),
      views: Number(s?.views ?? 0),
      viewers: Number(s?.viewers ?? 0),
      reactions: Number(s?.reactions ?? 0),
      clicks: Number(s?.clicks ?? 0),
      video_views: Number(s?.video_views ?? 0),
      ...withEngagement ? { comments: p.comments?.summary?.total_count ?? 0, shares: p.shares?.count ?? 0 } : {},
      stats_at: now
    };
  });
  const { error } = await sb.social().from("posts").upsert(rows);
  if (error) throw error;
  await snapshotPosts(rows);
  return posts.length;
}
async function refreshCodedPosts(opts) {
  const started = Date.now();
  const olderThan = new Date(Date.now() - opts.olderThanDays * DAY_MS8).toISOString();
  const staleBefore = new Date(Date.now() - opts.staleHours * 36e5).toISOString();
  const { data, error } = await sb.social().from("posts").select("id, channel_id, platform, published_at, views, viewers, reactions, clicks, video_views, thumbnail_url").neq("product_codes", "{}").eq("platform", "facebook").lt("published_at", olderThan).or(`stats_at.is.null,stats_at.lt."${staleBefore}"`).order("stats_at", { ascending: true, nullsFirst: true }).limit(opts.maxPosts);
  if (error) throw error;
  const todo = data ?? [];
  if (!todo.length) return "kh\xF4ng c\xF3 b\xE0i c\u0169 c\u1EA7n l\xE0m m\u1EDBi";
  const tokens = new Map((await activeChannels("facebook")).map((c) => [c.id, c.access_token]));
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const updated = [];
  const touchedIds = [];
  let failed = 0, waiting2 = 0;
  for (let i = 0; i < todo.length; i += 5) {
    if (Date.now() - started > opts.budgetMs) {
      waiting2 = todo.length - i;
      break;
    }
    await Promise.all(todo.slice(i, i + 5).map(async (p) => {
      const base = {
        id: p.id,
        channel_id: p.channel_id,
        platform: p.platform,
        published_at: p.published_at,
        stats_at: now,
        views: Number(p.views ?? 0),
        viewers: Number(p.viewers ?? 0),
        reactions: Number(p.reactions ?? 0),
        clicks: Number(p.clicks ?? 0),
        video_views: Number(p.video_views ?? 0),
        thumbnail_url: p.thumbnail_url ?? null
      };
      const token = tokens.get(base.channel_id);
      if (!token) {
        failed++;
        touchedIds.push(base.id);
        return;
      }
      try {
        const res = await graph(`${base.id}/insights`, {
          metric: Object.keys(POST_COLUMNS).join(","),
          period: "lifetime",
          access_token: token
        });
        const st = {};
        for (const m of res.data.filter((x) => !x.period || x.period === "lifetime")) {
          const col = POST_COLUMNS[m.name];
          if (col) st[col] = toNumber(m.values?.[0]?.value ?? m.total_value?.value);
        }
        const pic = await graph(`${base.id}`, { fields: "full_picture", access_token: token }).catch(() => null);
        updated.push({ ...base, ...st, ...pic?.full_picture ? { thumbnail_url: pic.full_picture } : {} });
      } catch {
        failed++;
        touchedIds.push(base.id);
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
  return `${updated.length}/${todo.length} b\xE0i c\u0169 g\u1EAFn m\xE3 \u0111\u01B0\u1EE3c l\xE0m m\u1EDBi${failed ? `, ${failed} l\u1ED7i` : ""}${waiting2 ? `, c\xF2n ${waiting2} b\xE0i ch\u1EDD l\u1EA7n sau` : ""}`;
}
async function withRetry2(run, tries = 3) {
  for (let n = 1; ; n++) {
    const res = await run();
    if (!res.error || n >= tries || !/timeout|fetch failed|ECONNRESET|50[234]/i.test(res.error.message ?? "")) return res;
    await new Promise((r) => setTimeout(r, 2e3 * n));
  }
}
async function fetchSalesRows(since) {
  const out = [];
  const today = isoDate(/* @__PURE__ */ new Date());
  for (let from = since; from <= today; ) {
    const next = isoDate(new Date(Date.parse(from) + 90 * DAY_MS8));
    const last = next > today;
    if (salesApiEnabled()) {
      out.push(...await fetchApiSales(from, last ? null : next));
      if (last) break;
      from = next;
      continue;
    }
    const call3 = (fn) => withRetry2(() => supabaseOrders().rpc(fn, { p_since: from, p_until: last ? null : next }));
    const missingFn = (e) => !!e && /PGRST202|Could not find the function/i.test(`${e.code ?? ""} ${e.message ?? ""}`);
    let { data, error } = await call3("fb_product_daily_qty_json");
    if (missingFn(error)) ({ data, error } = await call3("fb_product_daily_sales_json"));
    if (error) {
      if (/PGRST202|Could not find the function/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) return fetchSalesRowsPaged(since);
      throw error;
    }
    out.push(...data ?? []);
    if (last) break;
    from = next;
  }
  return out;
}
async function fetchSalesRowsPaged(since) {
  const all = [];
  for (let from = 0; ; from += 1e3) {
    const { data, error } = await withRetry2(() => supabaseOrders().rpc("fb_product_daily_sales", { p_since: since }).order("sale_date").order("product_code").order("page_id").order("channel").range(from, from + 999));
    if (error) throw error;
    all.push(...data);
    if (data.length < 1e3) break;
  }
  return all;
}
async function syncSales(days) {
  const since = isoDate(new Date(Date.now() - days * DAY_MS8));
  const all = await fetchSalesRows(since);
  const { data: ttChannels } = await sb.social().from("channels").select("id, name").eq("platform", "tiktok").eq("is_active", true);
  const ttByName = new Map((ttChannels ?? []).map((c) => [normTikTokName(c.name), c.id]));
  const matched = /* @__PURE__ */ new Map();
  const resolvePage = (pid) => {
    if (!pid.startsWith(TT_NAME_PREFIX)) return pid;
    const id = ttByName.get(pid.slice(TT_NAME_PREFIX.length));
    if (id) matched.set(pid, id);
    return id ?? pid;
  };
  const rows = all.map((r) => ({
    code: r.product_code,
    date: r.sale_date,
    page_id: resolvePage(r.page_id ?? ""),
    channel: r.channel ?? "khac",
    qty_sold: r.qty_sold,
    qty_returned: r.qty_returned
  }));
  for (const [key, id] of matched) {
    await sb.sales().from("daily_sales").update({ page_id: id }).eq("page_id", key).lt("date", since);
    const { error } = await sb.sales().from("daily_sales").delete().eq("page_id", key).gte("date", since);
    if (error) throw error;
  }
  for (let i = 0; i < rows.length; i += 1e3) {
    const { error } = await sb.sales().from("daily_sales").upsert(rows.slice(i, i + 1e3));
    if (error) throw error;
  }
  return rows.length;
}
async function syncCatalog() {
  const all = salesApiEnabled() ? await fetchApiCatalog() : [];
  for (let from = 0; !salesApiEnabled(); from += 1e3) {
    const { data, error } = await withRetry2(() => supabaseOrders().rpc("fb_product_catalog").order("product_code").range(from, from + 999));
    if (error) throw error;
    all.push(...data);
    if (data.length < 1e3) break;
  }
  const rows = all.map((r) => ({ code: r.product_code, name: r.name, image_url: r.image_url, base_masp: r.base_masp, first_seen_at: r.first_seen_at ?? null }));
  for (let i = 0; i < rows.length; i += 1e3) {
    const { error } = await sb.sales().from("catalog").upsert(rows.slice(i, i + 1e3));
    if (error) throw error;
  }
  return rows.length;
}
async function retagPosts() {
  const [{ data: rulesRow }, { data: rnd }, catalog] = await Promise.all([
    sb.core().from("settings").select("value").eq("key", "hashtag_rules").maybeSingle(),
    fetchAll((a, b) => sb.rnd().from("products").select("code").order("id").range(a, b)).then((data) => ({ data })),
    // phân trang: bảng > 1.000 hồ sơ
    fetchAll((a, b) => sb.sales().from("catalog").select("code").order("code").range(a, b))
  ]);
  const rules = { ...DEFAULT_RULES, ...rulesRow?.value ?? {} };
  const known = new Set(catalog.map((c) => c.code));
  for (const r of rnd ?? []) if (r.code) known.add(r.code);
  for (const l of await loadCodeLinks()) known.add(l.sku_code);
  const POST_COLS = "id, channel_id, platform, published_at, views, viewers, reactions, clicks, video_views, hashtags, product_codes, unknown_codes, content_line, concept, staff_code";
  const posts = await fetchAllByKey(
    (after2, limit) => {
      let q = sb.social().from("posts").select(POST_COLS);
      if (after2) q = q.gt("id", after2);
      return q.order("id").limit(limit);
    },
    (r) => r.id,
    () => fetchAll((a, b) => sb.social().from("posts").select(POST_COLS).order("id").range(a, b))
  );
  const manual = /* @__PURE__ */ new Map();
  const { data: links, error: lErr } = await sb.social().from("post_links").select("post_id, product_id");
  if (!lErr && links?.length) {
    const { data: lp } = await sb.rnd().from("products").select("id, code").in("id", [...new Set(links.map((l) => l.product_id))]);
    const codeOf = new Map((lp ?? []).filter((p) => p.code).map((p) => [p.id, String(p.code).toUpperCase()]));
    for (const l of links) {
      const c = codeOf.get(l.product_id);
      if (c) manual.set(l.post_id, [...manual.get(l.post_id) ?? [], c]);
    }
  }
  const { data: mc, error: mcErr } = await sb.social().from("post_codes").select("post_id, code");
  if (!mcErr) for (const m of mc ?? []) manual.set(m.post_id, [...manual.get(m.post_id) ?? [], String(m.code).toUpperCase()]);
  const changed = [];
  for (const p of posts) {
    const t = parseTags(p.hashtags, known, rules);
    for (const c of manual.get(p.id) ?? []) {
      if (!t.product_codes.includes(c)) t.product_codes.push(c);
      t.unknown_codes = t.unknown_codes.filter((u) => u !== c);
    }
    const same = t.content_line === p.content_line && t.concept === p.concept && t.staff_code === p.staff_code && t.product_codes.join() === p.product_codes.join() && t.unknown_codes.join() === p.unknown_codes.join();
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
        ...t
      });
    }
  }
  for (let i = 0; i < changed.length; i += 200) {
    const part = changed.slice(i, i + 200);
    let { error } = await sb.social().from("posts").upsert(part);
    for (let n = 1; n <= 3 && error && /statement timeout/i.test(error.message); n++) {
      await new Promise((r) => setTimeout(r, 1500 * n));
      ({ error } = await sb.social().from("posts").upsert(part));
    }
    if (error) throw error;
  }
  return changed.length;
}
async function syncAll(opts = {}) {
  const { data: cur } = await sb.core().from("settings").select("value").eq("key", SYNC_LOCK).maybeSingle();
  const at = Number(cur?.value?.at ?? 0);
  if (at && Date.now() - at < SYNC_LOCK_TTL_MS) {
    return [{ account: "\u0110\u1ED3ng b\u1ED9", ok: false, message: `\u0110ang c\xF3 m\u1ED9t l\u1EA7n \u0111\u1ED3ng b\u1ED9 kh\xE1c ch\u1EA1y (b\u1EAFt \u0111\u1EA7u ${Math.round((Date.now() - at) / 1e3)} gi\xE2y tr\u01B0\u1EDBc) \u2014 ch\u1EDD n\xF3 xong r\u1ED3i b\u1EA5m l\u1EA1i` }];
  }
  await sb.core().from("settings").upsert({ key: SYNC_LOCK, value: { at: Date.now() } });
  try {
    const t0 = Date.now(), results = await syncAllRun(opts), bad = results.filter((r) => !r.ok);
    if (results.length) await logSystem({
      kind: "sync_all",
      ok: !bad.length,
      summary: `${results.length} b\u01B0\u1EDBc, ${bad.length} l\u1ED7i${bad[0] ? ` \xB7 ${bad[0].account}: ${bad[0].message}` : ""}`,
      detail: { ms: Date.now() - t0, days: opts.days, errors: bad.slice(0, 5).map((r) => ({ account: r.account, message: r.message })) },
      actor: opts.by ?? null
    });
    return results;
  } finally {
    await sb.core().from("settings").delete().eq("key", SYNC_LOCK);
  }
}
async function syncAllRun({ days = 3, postDays = 30, budgetMs = 19e4, concurrency = 4, minAgeMin = 45, heavy = "auto", heavyEveryMin = 180, onBatch } = {}) {
  const startedMs = Date.now();
  const results = [];
  const step = async (job, label, fn, channelId = null, report = true) => {
    const startedAt = /* @__PURE__ */ new Date();
    try {
      const msg = await fn();
      await log(job, channelId, "success", msg, startedAt);
      if (report) results.push({ account: label, ok: true, message: msg });
    } catch (e) {
      await log(job, channelId, "error", errMsg(e), startedAt);
      results.push({ account: label, ok: false, message: errMsg(e) });
    }
  };
  const lastHeavy = await sb.core().from("sync_runs").select("finished_at").eq("job", "evaluate").eq("status", "success").order("finished_at", { ascending: false }).limit(1).maybeSingle();
  const lastHeavyAt = lastHeavy.data?.finished_at ? Date.parse(lastHeavy.data.finished_at) : 0;
  const runHeavy = heavy === true || heavy === "auto" && Date.now() - lastHeavyAt > heavyEveryMin * 6e4;
  if (runHeavy) {
    for (const t of metaTokens()) {
      await step(
        "setup",
        `Danh s\xE1ch Trang (${TOKEN_LABELS[t.source]})`,
        async () => `${(await setupChannels(t.token, t.source)).length} k\xEAnh`,
        `token:${t.source}`,
        false
      );
    }
  }
  const fbToken = await activeChannels("facebook");
  const fbFromApi = await apiFreshFacebook(fbToken.map((c) => c.id));
  const fbAll = fbToken.filter((c) => !fbFromApi.has(c.id));
  if (fbFromApi.size) {
    const { data: recent } = await sb.core().from("sync_runs").select("channel_id, status, started_at").eq("job", "channel").in("channel_id", [...fbFromApi]).order("started_at", { ascending: false }).limit(400);
    const latest = /* @__PURE__ */ new Map();
    for (const r of recent ?? []) if (!latest.has(r.channel_id)) latest.set(r.channel_id, r.status);
    const stamp = (/* @__PURE__ */ new Date()).toISOString();
    const rows = [...latest].filter(([, st]) => st === "error").map(([channel_id]) => ({ job: "channel", channel_id, status: "success", message: "L\u1EA5y video t\u1EEB API (kh\xF4ng \u0111\u1ED3ng b\u1ED9 tr\u1EF1c ti\u1EBFp qua Meta)", started_at: stamp, finished_at: stamp }));
    if (rows.length) await sb.core().from("sync_runs").insert(rows);
  }
  const ttAll = await activeTikTok();
  const ytAll = await activeYouTube();
  const all = [
    ...fbAll.map((ch) => ({
      id: ch.id,
      name: ch.name,
      platform: "facebook",
      last_synced_at: ch.last_synced_at,
      run: async () => {
        const { count } = await sb.social().from("channel_daily").select("*", { count: "exact", head: true }).eq("channel_id", ch.id);
        const isNew = !count;
        const d = await syncChannelDaily(ch, isNew ? Math.max(days, 365) : days);
        const p = await syncPosts(ch, isNew ? Math.max(postDays, 90) : postDays);
        return `${isNew ? "K\xEAnh m\u1EDBi, " : ""}${d} ng\xE0y s\u1ED1 li\u1EC7u, ${p} b\xE0i \u0111\u0103ng`;
      }
    })),
    ...ttAll.map((ch) => ({
      id: ch.id,
      name: ch.name,
      platform: "tiktok",
      last_synced_at: ch.last_synced_at,
      run: async () => {
        const r = await syncTikTokChannel(ch, Math.max(postDays, 30), extractHashtags);
        return `TikTok: ${r.posts} video, +${r.newViews} l\u01B0\u1EE3t xem m\u1EDBi`;
      }
    })),
    ...ytAll.map((ch) => ({
      id: ch.id,
      name: ch.name,
      platform: "youtube",
      last_synced_at: ch.last_synced_at,
      run: async () => {
        const r = await syncYouTubeChannel(ch, Math.max(postDays, 30), extractHashtags);
        return `YouTube: ${r.posts} video, +${r.newViews} l\u01B0\u1EE3t xem m\u1EDBi`;
      }
    }))
  ];
  const ageOk = (c) => !c.last_synced_at || Date.now() - Date.parse(c.last_synced_at) > minAgeMin * 6e4;
  const queue = all.filter(ageOk).sort((x, y) => (x.last_synced_at ? Date.parse(x.last_synced_at) : 0) - (y.last_synced_at ? Date.parse(y.last_synced_at) : 0));
  const eligible = queue.length;
  let done = 0, cut = false;
  const worker = async () => {
    for (; ; ) {
      if (Date.now() - startedMs > budgetMs) {
        cut = true;
        return;
      }
      const ch = queue.shift();
      if (!ch) return;
      await step("channel", ch.name, ch.run, ch.id);
      done++;
      await sb.social().from("channels").update({ last_synced_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", ch.id);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  const left = queue.length;
  results.push({
    account: "\u0110\u1ED3ng b\u1ED9 theo l\xF4",
    ok: true,
    message: `${done}/${eligible} k\xEAnh \u0111\u1EBFn l\u01B0\u1EE3t \u0111\xE3 \u0111\u1ED3ng b\u1ED9${fbFromApi.size ? ` \xB7 ${fbFromApi.size} Page l\u1EA5y video t\u1EEB API (kh\xF4ng \u0111\u1ED3ng b\u1ED9 tr\u1EF1c ti\u1EBFp)` : ""}${left ? ` \xB7 c\xF2n ${left} k\xEAnh ch\u1EDD l\u01B0\u1EE3t sau (b\u1EA5m l\u1EA1i ho\u1EB7c ch\u1EDD l\u1EA7n t\u1EF1 \u0111\u1ED9ng)` : ""}${all.length - eligible > 0 ? ` \xB7 ${all.length - eligible} k\xEAnh c\xF2n m\u1EDBi n\xEAn b\u1ECF qua` : ""}${cut ? " \xB7 d\u1EEBng s\u1EDBm v\xEC h\u1EBFt th\u1EDDi gian" : ""}`
  });
  bustSoft(TAG.sync);
  const heavyWillRun = runHeavy && Date.now() - startedMs <= 215e3;
  if (!heavyWillRun) {
    void Promise.resolve().then(() => (init_spu_summary(), spu_summary_exports)).then(async (m) => {
      if (done > 0 && await m.postsChangedSinceSummary()) {
        bustSoft(TAG.spuData);
        m.scheduleSpuSummaryRefresh();
      }
    }).catch(() => {
    });
  }
  onBatch?.({ left: all.length && "last_synced_at" in all[0] ? left : 0 });
  if (!runHeavy || Date.now() - startedMs > 215e3) {
    pingRnd();
    return results;
  }
  if (process.env.ORDERS_SUPABASE_URL) {
    await step("catalog", "Danh m\u1EE5c s\u1EA3n ph\u1EA9m", async () => `${await syncCatalog()} m\xE3 s\u1EA3n ph\u1EA9m`, null, false);
    await step("sales", "S\u1ED1 b\xE1n (Qlydonhang)", async () => {
      const { count } = await sb.sales().from("daily_sales").select("*", { count: "exact", head: true });
      return `${await syncSales(count ? Math.max(days, 30) : 365)} d\xF2ng s\u1ED1 b\xE1n`;
    });
  }
  await step("retag", "T\xE1ch hashtag", async () => `${await retagPosts()} b\xE0i c\u1EADp nh\u1EADt nh\xE3n`, null, false);
  await step("old_posts", "L\xE0m m\u1EDBi b\xE0i c\u0169 g\u1EAFn m\xE3", async () => {
    const budget = Math.min(7e4, 285e3 - (Date.now() - startedMs) - 45e3);
    if (budget < 8e3) return "b\u1ECF qua (h\u1EBFt th\u1EDDi gian) \u2014 l\xE0m \u1EDF l\u1EA7n sau";
    return refreshCodedPosts({ maxPosts: 600, budgetMs: budget, olderThanDays: postDays, staleHours: 20 });
  }, null, false);
  await step("evaluate", "\u0110\xE1nh gi\xE1 t\u1EF1 \u0111\u1ED9ng", async () => {
    const r = await evaluateAll();
    return `${r.evaluated} m\xE3 \u0111\u01B0\u1EE3c \u0111\xE1nh gi\xE1${r.created ? `, t\u1EF1 t\u1EA1o ${r.created} m\u1EABu` : ""}`;
  });
  await step("metrics", "K\xE9o s\u1ED1 li\u1EC7u m\u1EABu R&D", refreshProductMetrics);
  bustSoft(TAG.spuData);
  void Promise.resolve().then(() => (init_spu_summary(), spu_summary_exports)).then((m) => m.scheduleSpuSummaryRefresh()).catch(() => {
  });
  await sb.core().rpc("prune_sync_runs", { keep_days: 30 });
  await pruneSnapshots();
  pingRnd();
  return results;
}
var DAY_MS8, MAX_RANGE_DAYS, metricDate, isoDate, SYNC_LOCK, SYNC_LOCK_TTL_MS;
var init_index = __esm({
  "src/lib/sync/index.ts"() {
    init_server_only();
    init_code_links();
    init_graph();
    init_tags();
    init_metrics();
    init_platforms();
    init_admin();
    init_api_videos();
    init_engine();
    init_token();
    init_cache_tags();
    init_rnd_ping();
    init_system_log();
    init_rnd_metrics();
    init_sales_api();
    init_tiktok();
    init_youtube();
    init_name();
    init_snapshots();
    DAY_MS8 = 864e5;
    MAX_RANGE_DAYS = 90;
    metricDate = (endTime) => new Date(new Date(endTime).getTime() - DAY_MS8).toISOString().slice(0, 10);
    isoDate = (d) => d.toISOString().slice(0, 10);
    SYNC_LOCK = "sync_lock";
    SYNC_LOCK_TTL_MS = 6 * 6e4;
  }
});
init_index();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  connectTeamPages,
  extractHashtags,
  retagPosts,
  setupChannels,
  syncAll
});
//# sourceMappingURL=sync-bundle.cjs.map
