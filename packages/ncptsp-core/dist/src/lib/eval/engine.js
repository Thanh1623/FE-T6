"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateAll = evaluateAll;
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
const daily_sales_1 = require("@/lib/daily-sales");
const post_views_1 = require("@/lib/post-views");
const views_window_1 = require("@/lib/eval/views-window");
const rules_1 = require("@/lib/eval/rules");
const pipeline_constants_1 = require("@/lib/pipeline-constants");
const tags_1 = require("@/lib/tags");
const code_links_1 = require("@/lib/code-links");
const spu_rules_1 = require("@/lib/spu-rules");
const pipeline_1 = require("@/lib/pipeline");
const rnd_options_1 = require("@/lib/rnd-options");
// Bộ máy tự đánh giá: mỗi mã mẫu có hashtag → WIN / WIN TRAFFIC / FAIL / ĐANG TEST.
// Chạy sau mỗi lần đồng bộ. Phiên test theo mục tiêu (nếu có) ghi đè kết quả tự động.
const DAY = 86_400_000;
const vnDate = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
const shift = (d, n) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const daysIncl = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY) + 1;
// Đọc theo từng nhóm khoá: PostgREST cắt mỗi lượt đọc ở 1.000 dòng (và đường dẫn quá dài khi .in() có hàng nghìn mã).
// Trước đây .in("code", allCodes) trả thiếu khi rnd.products vượt 1.000 mã → mã bị coi là "chưa có" → tự tạo lại → lỗi trùng products_code_key, cả lượt đánh giá thất bại.
async function inChunks(keys, read, size = 200) {
    const out = [];
    for (let i = 0; i < keys.length; i += size * 4) {
        const batch = await Promise.all(Array.from({ length: 4 }, (_, k) => keys.slice(i + k * size, i + (k + 1) * size)).filter((c) => c.length).map((c) => read(c)));
        for (const { data, error } of batch) {
            if (error)
                throw error;
            out.push(...(data ?? []));
        }
    }
    return out;
}
async function evaluateAll() {
    const today = vnDate(new Date());
    const [{ data: settings }, { data: defaults, error: tErr }] = await Promise.all([
        admin_1.sb.core().from("settings").select("value").eq("key", "evaluation").maybeSingle(),
        admin_1.sb.rnd().from("kpi_templates").select("goal_code, rules, match, min_days, min_views").eq("is_default", true).in("goal_code", ["sales", "traffic"]),
    ]);
    if (tErr)
        throw tErr;
    const s = (settings?.value ?? null);
    const salesKpi = defaults?.find((d) => d.goal_code === "sales");
    const trafficKpi = defaults?.find((d) => d.goal_code === "traffic");
    if (!s || !salesKpi || !trafficKpi)
        throw new Error("Thiếu cài đặt đánh giá hoặc mẫu KPI mặc định của Test Sales/Test Traffic");
    // 1. Bài có mã SP đã nhận diện (có trên Sapo hoặc khai báo R&D — xem retagPosts) → gom theo mã
    // Chỉ bài có mã (cardinality > 0 → dùng index GIN) — không kéo cả bảng
    // Theo khoá published_at (chỉ mục posts_coded_time_idx) thay cho OFFSET: mỗi trang quét đúng 1.000 dòng — xem lib/paging.ts
    const EVAL_COLS = "id, channel_id, published_at, kind, product_codes, permalink_url, thumbnail_url, views, viewers, reactions, clicks";
    const posts = await (0, admin_1.fetchAllByKey)((after, limit) => { let q = admin_1.sb.social().from("posts").select(EVAL_COLS).neq("product_codes", "{}"); if (after)
        q = q.gt("published_at", after); return q.order("published_at").order("id").limit(limit); }, (r) => r.published_at, () => (0, admin_1.fetchAll)((a, b) => admin_1.sb.social().from("posts").select(EVAL_COLS).neq("product_codes", "{}").order("published_at").order("id").range(a, b)));
    // Mẫu Media đã gắn mã SPU thương mại: bài #SPU / #mã-test đăng trước ngày mở bán gom về mẫu test (không sinh mẫu tự động trùng);
    // bài từ ngày mở bán trở đi thuộc giai đoạn thương mại → không tính vào đánh giá test (xem lib/code-links)
    const links = await (0, code_links_1.loadCodeLinks)();
    if (links.length)
        for (const p of posts)
            p.product_codes = (0, code_links_1.testPhaseCodes)(p.product_codes, p.published_at, links);
    const byCode = new Map();
    for (const p of posts)
        for (const code of p.product_codes)
            byCode.set(code, [...(byCode.get(code) ?? []), p]);
    // Chỉ nhận mã đúng định dạng của rnd.products (1–4 chữ cái + ≥ 3 số, ràng buộc products_code_check). Mã lạ trên bài đăng (vd TN01, MD64)
    // trước đây làm cả lượt đánh giá lỗi → mọi số liệu / đánh giá đứng yên. Giờ bỏ qua các mã đó.
    for (const c of [...byCode.keys()])
        if (!/^[A-Z]{1,4}[0-9]{3,}$/.test(c))
            byCode.delete(c);
    if (!byCode.size)
        return { evaluated: 0, created: 0 };
    const allCodes = [...byCode.keys()];
    // 2. Mẫu R&D: mã có trên Sapo nhưng chưa có hồ sơ R&D → tự tạo để chấm (tên lấy từ kho)
    const existing = await inChunks(allCodes, (c) => admin_1.sb.rnd().from("products").select("id, code, sapo_code, age_override, status, stage, origin, created_at, entry_source").in("code", c));
    const prodByCode = new Map(existing.map((p) => [p.code, p]));
    const catalog = await inChunks([...new Set([...allCodes, ...existing.map((p) => p.sapo_code).filter(Boolean)])], (c) => admin_1.sb.sales().from("catalog").select("code, name, first_seen_at").in("code", c));
    const cat = new Map(catalog.map((c) => [c.code, c]));
    const missing = allCodes.filter((c) => !prodByCode.has(c));
    if (missing.length) {
        // Chèn BỎ QUA mã đã tồn tại (ON CONFLICT DO NOTHING) rồi đọc lại hồ sơ: một mã trùng (đọc sót, chạy chồng…) từng làm lỗi "products_code_key" và hỏng CẢ lượt đánh giá
        // (3 lần liên tiếp 20/11/2026) — nay chỉ bỏ qua mã đó. Lỗi khác vẫn ném kèm danh sách mã để dễ tìm.
        const { error } = await admin_1.sb.rnd().from("products").upsert(missing.map((code) => ({
            code,
            name: cat.get(code)?.name ?? ((0, tags_1.isTestCode)(code) ? (0, tags_1.testCodeProductName)(code) : `Mẫu ${code}`),
            status: "testing",
            origin: "auto", // rnd.products.origin chỉ nhận manual / auto (products_origin_check) — mã test nhận ra qua dạng mã (isTestCode), không qua origin
        })), { onConflict: "code", ignoreDuplicates: true });
        if (error)
            throw new Error(`${error.message} (mã: ${missing.slice(0, 15).join(", ")}${missing.length > 15 ? "…" : ""})`);
        const made = await inChunks(missing, (c) => admin_1.sb.rnd().from("products").select("id, code, sapo_code, age_override, status, stage, origin, created_at, entry_source").in("code", c));
        for (const p of made)
            prodByCode.set(p.code, p);
    }
    // Mẫu R&D tự sưu tầm (không phải mẫu Media test): chỉ tính video từ khi MẪU ĐÃ CÓ — ngày nhận đơn đặt mẫu sớm nhất; đơn đã Hoàn thành mẫu
    // nhưng chưa ghi ngày nhận → ngày đặt. Đang đặt / chưa hoàn thành → chưa có mẫu thật để test (bài đăng trước đó: ảnh tham khảo, video 3D… không tính).
    // Mẫu chưa có đơn nào (mẫu cũ trước khi có bảng đặt hàng) giữ cách cũ: tính từ ngày sưu tầm.
    const rndSamples = [...prodByCode.values()].filter((p) => p.stage && p.entry_source !== "media");
    const sampleFrom = new Map();
    if (rndSamples.length) {
        const opts = await (0, pipeline_1.getRndOptions)();
        const cancelled = (0, rnd_options_1.flagged)(opts.order_status, "cancel"), doneSt = (0, rnd_options_1.flagged)(opts.order_status, "done");
        const { data: ords } = await admin_1.sb.rnd().from("sample_orders").select("product_id, status, ordered_at, received_at").in("product_id", rndSamples.map((p) => p.id));
        const byP = new Map();
        for (const o of ords ?? [])
            if (!cancelled.includes(o.status))
                byP.set(o.product_id, [...(byP.get(o.product_id) ?? []), o]);
        for (const [pid, os] of byP) {
            const recv = os.map((o) => o.received_at?.slice(0, 10)).filter((x) => !!x).sort()[0];
            const doneOrdered = os.filter((o) => doneSt.includes(o.status) || o.status === "Hoàn thành").map((o) => o.ordered_at?.slice(0, 10)).filter((x) => !!x).sort()[0];
            sampleFrom.set(pid, recv ?? doneOrdered ?? "9999-12-31"); // chưa hoàn thành mẫu → không bài nào được tính
        }
    }
    // Mẫu quy trình: bỏ bài đăng trước ngày sưu tầm (mẫu R&D: trước khi mẫu hoàn thành). Không còn bài nào → chưa test, xoá đánh giá cũ của mã
    const stale = [];
    for (const code of allCodes) {
        const prod = prodByCode.get(code);
        if (!prod) {
            byCode.delete(code);
            continue;
        } // mã vẫn chưa có hồ sơ (hiếm) → bỏ qua lượt này thay vì làm hỏng cả lượt đánh giá
        const base = (0, pipeline_constants_1.trafficFrom)(prod), made = sampleFrom.get(prod.id);
        const from = base && made ? (made > base ? made : base) : base;
        if (!from)
            continue;
        const kept = byCode.get(code).filter((p) => vnDate(p.published_at) >= from);
        if (kept.length)
            byCode.set(code, kept);
        else {
            byCode.delete(code);
            stale.push(code);
        }
    }
    if (stale.length)
        await admin_1.sb.rnd().from("evaluations").delete().in("code", stale);
    const codes = allCodes.filter((c) => byCode.has(c));
    if (!codes.length)
        return { evaluated: 0, created: missing.length };
    // 3. Phiên test theo mục tiêu (ghi đè): phiên gần nhất của mỗi mẫu
    const productIds = [...prodByCode.values()].map((p) => p.id);
    const sessionsRaw = (await inChunks(productIds, (c) => admin_1.sb.rnd().from("test_sessions").select("*").in("product_id", c))).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const sessionOf = new Map();
    for (const ss of (sessionsRaw ?? []))
        if (!sessionOf.has(ss.product_id))
            sessionOf.set(ss.product_id, ss);
    // Kết luận R&D đã gắn với phiên → kết quả phiên cố định theo kết luận
    const sessionIds = [...sessionOf.values()].map((x) => x.id);
    const { data: decided } = sessionIds.length
        ? await admin_1.sb.rnd().from("decisions").select("session_id, result, decided_at").in("session_id", sessionIds).order("decided_at", { ascending: false })
        : { data: [] };
    const sessionResult = new Map();
    for (const d of decided ?? [])
        if (!sessionResult.has(d.session_id))
            sessionResult.set(d.session_id, d.result);
    // 4. Số bán: đủ xa để phủ cả giai đoạn trước video đầu (phân loại mới/cũ)
    const salesCodeOf = (code) => (prodByCode.get(code)?.sapo_code ?? code).toUpperCase();
    const firstDate = (code) => vnDate(byCode.get(code)[0].published_at);
    const earliest = codes.map((c) => shift(firstDate(c), -s.new_lookback_days)).sort()[0];
    const salesCodes = [...new Set(codes.map(salesCodeOf))];
    // Số bán theo ngày dùng chung (lib/daily-sales): file đơn hàng đã nhập + số đồng bộ cho ngày ngoài khoảng file; giữ cả kênh bảo hành như trước
    const sales = (await (0, daily_sales_1.loadDailySales)({ codes: salesCodes, from: earliest, keepWarranty: true, fresh: true }));
    // Cửa sổ 2: N ngày GẦN NHẤT (kết thúc hôm nay). Mã đăng từ lâu mà bỗng đạt KPI trong N ngày này vẫn được ghi nhận;
    // kết quả cuối = tốt hơn của (cửa sổ đầu, cửa sổ gần nhất). Lượt xem của bài cũ = hiệu hai ảnh chụp (social.post_daily),
    // bài cũ chưa đủ lịch sử thì bỏ qua (xem lib/eval/views-window). Số bán tính chính xác theo từng ngày.
    const recentFrom = shift(today, -(s.window_days - 1));
    const recentViews = await (0, post_views_1.codeViewsInRange)(posts, recentFrom, today);
    const WIN_RANK = { win: 4, win_traffic: 3, win_sp: 3, testing: 1, fail: 0 };
    // HAI ĐIỀU KIỆN WIN TRAFFIC:
    //  • SP test (mã test T của luồng Media, mẫu R&D ở P0–P5, hoặc có phiên test): KPI Traffic ở Cài đặt (mặc định ≥ 50.000 lượt xem trong cửa sổ test N ngày, không tính người xem)
    //  • SP đang bán (mọi SPU còn lại, kể cả mẫu R&D đã lên P6): đủ `sell.views` lượt xem (mặc định 100.000) trong `sell.days` ngày (mặc định 3) trên mọi kênh toàn công ty,
    //    xét cả 3 ngày đầu kể từ video đầu tiên lẫn 3 ngày gần nhất; ngưỡng lấy từ "Quy tắc Win" ở Cài đặt (không xét bình luận). Điều kiện Win bán hàng của hai nhóm như nhau.
    const sell = (await (0, spu_rules_1.loadSpuRules)()).win.traffic;
    const sellRule = [{ metric: "views", op: ">=", value: sell.views }];
    const recentFromSell = shift(today, -(sell.days - 1));
    const recentViewsSell = await (0, post_views_1.codeViewsInRange)(posts, recentFromSell, today);
    // 5. Đánh giá từng mã
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
        // Traffic: bài đăng trong cửa sổ (phiên phạm vi Trang → chỉ bài của các Trang đó)
        const inWin = byCode.get(code).filter((p) => {
            const d = vnDate(p.published_at);
            return d >= wStart && d <= wEnd && (session?.sales_scope !== "pages" || session.page_ids.includes(p.channel_id));
        });
        const traffic = inWin.reduce((t, p) => ({
            views: t.views + Number(p.views), viewers: t.viewers + Number(p.viewers),
            reactions: t.reactions + Number(p.reactions), clicks: t.clicks + Number(p.clicks),
        }), { views: 0, viewers: 0, reactions: 0, clicks: 0 });
        // Bán: trong cửa sổ, theo phạm vi (mặc định mọi kênh trừ bảo hành)
        const sc = salesCodeOf(code);
        const inScope = (r) => !session || session.sales_scope === "all" ? r.channel !== "bao_hanh"
            : session.sales_scope === "pages" ? session.page_ids.includes(r.page_id)
                : session.channels.includes(r.channel);
        const winSales = sales.filter((r) => r.code === sc && r.date >= wStart && r.date <= wEnd && inScope(r));
        const qty = winSales.reduce((t, r) => t + r.qty_sold - r.qty_returned, 0);
        const m = (0, rules_1.buildMetrics)({ ...traffic, qty_net: qty, posts: inWin.length, videos: inWin.filter((p) => p.kind === "video" || p.kind === "reel").length });
        // SP test hay SP đang bán (xem chú thích HAI ĐIỀU KIỆN WIN TRAFFIC ở trên)
        const isTest = !!session || (0, tags_1.isTestCode)(code) || (!!product.stage && product.stage !== "p6");
        const sellStart = D, sellEnd = shift(D, sell.days - 1);
        const sellPosts = isTest ? [] : byCode.get(code).filter((p) => { const d = vnDate(p.published_at); return d >= sellStart && d <= sellEnd; });
        const sellFirst = sellPosts.reduce((t, p) => ({ views: t.views + Number(p.views), viewers: t.viewers + Number(p.viewers), reactions: t.reactions + Number(p.reactions), clicks: t.clicks + Number(p.clicks) }), { views: 0, viewers: 0, reactions: 0, clicks: 0 });
        const sellQty = isTest ? 0 : sales.filter((r) => r.code === sc && r.date >= sellStart && r.date <= sellEnd && r.channel !== "bao_hanh").reduce((t, r) => t + r.qty_sold - r.qty_returned, 0);
        const mSell = (0, rules_1.buildMetrics)({ ...sellFirst, qty_net: sellQty, posts: sellPosts.length, videos: sellPosts.filter((p) => p.kind === "video" || p.kind === "reel").length });
        // KPI tự động (luôn tính — dùng cho tín hiệu phụ cả khi có phiên ghi đè)
        const enough = (k) => elapsed >= k.min_days && traffic.views >= k.min_views;
        const trafficMatch = isTest ? trafficKpi.match : "all";
        const trafficEnough = isTest ? enough(trafficKpi) : elapsed >= sell.days;
        const salesChecks = (0, rules_1.checkRules)(salesKpi.rules, m), trafficChecks = isTest ? (0, rules_1.checkRules)(trafficKpi.rules, m) : (0, rules_1.checkRules)(sellRule, mSell);
        // Bán đạt cần đủ lượt xem tối thiểu (chuyển đổi trên vài người xem là nhiễu)
        const salesPass = (0, rules_1.rulesPass)(salesChecks, salesKpi.match) && traffic.views >= salesKpi.min_views;
        const trafficPass = (0, rules_1.rulesPass)(trafficChecks, trafficMatch);
        // Một kiểu test duy nhất: phiên (nếu có) chỉ đặt cửa sổ ngày + phạm vi số bán; kết quả luôn theo cả KPI traffic và KPI bán.
        // Đạt bán → WIN · chỉ đạt traffic → WIN TRAFFIC. Kết luận R&D đã gắn với phiên thì giữ theo kết luận.
        let result = (session && sessionResult.get(session.id)) || (0, rules_1.decideAuto)(salesPass, trafficPass, windowOver);
        let checks = [{ group: "sales", items: salesChecks }, { group: "traffic", items: trafficChecks }];
        // Số liệu / trạng thái KPI của cửa sổ đã tạo ra kết quả (mặc định cửa sổ đầu; cửa sổ gần nhất thắng thì đổi sang)
        let shownM = m, shownSalesChecks = salesChecks, shownSalesPass = salesPass;
        let shownTrafficChecks = trafficChecks;
        let winInfo = { kind: "first", from: wStart, to: wEnd };
        let recentUnknown = 0;
        // SP đang bán thắng bằng traffic ở 3 ngày đầu (không phải bằng bán hàng): số liệu hiển thị là của cửa sổ 3 ngày đó
        if (!isTest && !salesPass && trafficPass) {
            shownM = mSell;
            winInfo = { kind: "first", from: sellStart, to: sellEnd };
        }
        if (!session) {
            const rg = recentViews.get(code) ?? (0, views_window_1.emptyTotals)();
            recentUnknown = rg.unknown;
            const rs = sales.filter((r) => r.code === sc && r.date >= recentFrom && r.date <= today && r.channel !== "bao_hanh");
            const rm = (0, rules_1.buildMetrics)({
                views: rg.views, viewers: rg.viewers, reactions: rg.reactions, clicks: rg.clicks, posts: rg.posts, videos: rg.videos,
                qty_net: rs.reduce((t, r) => t + r.qty_sold - r.qty_returned, 0),
            });
            // Cửa sổ gần nhất của SP đang bán, phần traffic: sell.days ngày tới hôm nay (bán hàng vẫn xét N ngày như SP test)
            const rg3 = recentViewsSell.get(code) ?? (0, views_window_1.emptyTotals)();
            const rm3 = (0, rules_1.buildMetrics)({
                views: rg3.views, viewers: rg3.viewers, reactions: rg3.reactions, clicks: rg3.clicks, posts: rg3.posts, videos: rg3.videos,
                qty_net: sales.filter((r) => r.code === sc && r.date >= recentFromSell && r.date <= today && r.channel !== "bao_hanh").reduce((t, r) => t + r.qty_sold - r.qty_returned, 0),
            });
            const rSalesChecks = (0, rules_1.checkRules)(salesKpi.rules, rm), rTrafficChecks = isTest ? (0, rules_1.checkRules)(trafficKpi.rules, rm) : (0, rules_1.checkRules)(sellRule, rm3);
            const rSalesPass = (0, rules_1.rulesPass)(rSalesChecks, salesKpi.match) && rg.views >= salesKpi.min_views;
            const rTrafficPass = (0, rules_1.rulesPass)(rTrafficChecks, trafficMatch);
            if (rSalesPass || rTrafficPass) {
                const rResult = (0, rules_1.decideAuto)(rSalesPass, rTrafficPass, true);
                if (WIN_RANK[rResult] > WIN_RANK[result]) {
                    const byTraffic = !isTest && !rSalesPass; // SP đang bán thắng bằng traffic: hiển thị số liệu của cửa sổ traffic (sell.days ngày)
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
        // Phân loại mới/cũ tại ngày video đầu D
        const lookFrom = shift(D, -s.new_lookback_days);
        const before = sales.filter((r) => r.code === sc && r.date >= lookFrom && r.date < D && r.channel !== "bao_hanh")
            .reduce((t, r) => t + r.qty_sold - r.qty_returned, 0);
        const firstSeen = cat.get(sc)?.first_seen_at ? vnDate(cat.get(sc).first_seen_at) : null;
        let age, ageReason, ageReliable = true;
        if (product.age_override) {
            age = product.age_override;
            ageReason = "override";
        }
        else if ((0, tags_1.isTestCode)(code) || product.origin === "media") {
            age = "new";
            ageReason = "media_test";
        }
        else if (product.stage || product.origin === "manual") {
            age = "new";
            ageReason = "rnd";
        }
        else if (before > s.new_max_qty) {
            age = "old";
            ageReason = before >= s.old_hot_qty ? "old_hot" : "old_slow";
        }
        else if (firstSeen && firstSeen < shift(D, -s.new_catalog_days)) {
            age = "old";
            ageReason = "old_catalog";
        }
        else if (!firstSeen || firstSeen > D) {
            age = "new";
            ageReason = "not_in_sapo";
        }
        else if (firstSeen >= s.catalog_trusted_from && firstSeen >= shift(D, -s.new_catalog_days)) {
            age = "new";
            ageReason = "new_listing";
        }
        else if (before <= s.new_max_qty) {
            age = "new";
            ageReason = "no_sales";
            ageReliable = lookFrom >= s.history_trusted_from;
        }
        else {
            age = "old";
            ageReason = before >= s.old_hot_qty ? "old_hot" : "old_slow";
        }
        // Dự báo thống kê tới hết cửa sổ (tuyến tính theo nhịp hiện tại)
        let forecast = null;
        if (!windowOver && elapsed > 0 && winInfo.kind === "first") {
            const k = totalDays / elapsed;
            const pm = (0, rules_1.buildMetrics)({ ...traffic, views: traffic.views * k, viewers: traffic.viewers * k, reactions: traffic.reactions * k,
                clicks: traffic.clicks * k, qty_net: qty * k, posts: m.posts, videos: m.videos });
            const pSales = (0, rules_1.rulesPass)((0, rules_1.checkRules)(salesKpi.rules, pm), salesKpi.match) && pm.views >= salesKpi.min_views;
            const pTraffic = isTest ? (0, rules_1.rulesPass)((0, rules_1.checkRules)(trafficKpi.rules, pm), trafficKpi.match)
                : (elapsed < sell.days ? (sellFirst.views * sell.days) / Math.max(elapsed, 1) : sellFirst.views) >= sell.views;
            forecast = { views: Math.round(pm.views), viewers: Math.round(pm.viewers), qty_net: Math.round(pm.qty_net),
                predicted: (0, rules_1.decideAuto)(pSales, pTraffic, true), days_left: totalDays - elapsed };
        }
        // Video hiển thị: của cửa sổ đã tạo ra kết quả (cửa sổ gần nhất → các bài đăng trong N ngày gần nhất)
        const videoSource = winInfo.kind === "recent" ? byCode.get(code).filter((p) => vnDate(p.published_at) >= recentFrom) : inWin;
        const videos = videoSource.map((p) => ({
            id: p.id, channel_id: p.channel_id, date: vnDate(p.published_at), url: p.permalink_url, thumb: p.thumbnail_url,
            views: Number(p.views), viewers: Number(p.viewers),
            ctr: Number(p.views) > 0 ? (Number(p.clicks) / Number(p.views)) * 100 : null,
        })).sort((a, b) => b.views - a.views);
        rows.push({
            code, product_id: product.id, first_post_date: D, window_end: wEnd, days_elapsed: elapsed,
            age, age_reason: ageReason, age_reliable: ageReliable,
            source: session ? "session" : "auto", session_id: session?.id ?? null, result,
            // Điều kiện bán đã đạt nhưng chưa đủ lượt xem tối thiểu → "chưa đủ dữ liệu", không phải "đạt"
            sales_status: shownSalesPass ? "pass" : (0, rules_1.rulesPass)(shownSalesChecks, salesKpi.match) ? "not_enough" : (0, rules_1.groupStatus)(shownSalesChecks, salesKpi.match, enough(salesKpi)),
            traffic_status: (0, rules_1.groupStatus)(shownTrafficChecks, trafficMatch, trafficEnough),
            // window = cửa sổ tạo ra kết quả; first = số liệu cửa sổ đầu (để so sánh); recent_unknown = số bài cũ chưa đủ lịch sử ảnh chụp
            metrics: { ...shownM, window: winInfo, first: { views: m.views, qty_net: m.qty_net }, recent_unknown: recentUnknown }, checks, forecast, videos, evaluated_at: new Date().toISOString(),
        });
        // Mẫu không có phiên test: trạng thái quá trình theo cửa sổ tự động
        if (!session && product.status !== (windowOver ? "ended" : "testing")) {
            await admin_1.sb.rnd().from("products").update({ status: windowOver ? "ended" : "testing" }).eq("id", product.id);
        }
    }
    const { error } = await admin_1.sb.rnd().from("evaluations").upsert(rows);
    if (error)
        throw error;
    await advanceToWin(rows);
    return { evaluated: rows.length, created: missing.length };
}
// Quy trình R&D: mẫu ở P4 mà hệ thống đánh giá Win / Win traffic theo KPI → tự lên P5.
// Mẫu nhận từ luồng Media (đã có kết quả từ trước) vẫn do người duyệt. Lỗi ở đây không làm hỏng đánh giá.
async function advanceToWin(results) {
    const winCodes = results.filter((r) => r.result === "win" || r.result === "win_traffic");
    if (!winCodes.length)
        return;
    const { data, error } = await admin_1.sb.rnd().from("products").select("id, code")
        .in("code", winCodes.map((r) => r.code)).eq("stage", "p4").is("killed_at", null)
        .or("entry_source.is.null,entry_source.neq.media");
    if (error || !data?.length)
        return;
    const at = new Date().toISOString();
    await admin_1.sb.rnd().from("products").update({ stage: "p5", stage_at: at }).in("id", data.map((p) => p.id));
    await admin_1.sb.rnd().from("product_events").insert(data.map((p) => ({
        product_id: p.id, actor_id: null, action: "stage_changed",
        changes: { stage: ["p4", "p5"], note: [null, `Tự động: hệ thống đánh giá ${winCodes.find((r) => r.code === p.code)?.result === "win" ? "WIN" : "WIN TRAFFIC"}`] },
    })));
}
