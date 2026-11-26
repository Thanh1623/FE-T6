"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllProfiles = exports.inVnRange = exports.entryDate = void 0;
exports.getTeams = getTeams;
exports.getPeople = getPeople;
exports.listPipeline = listPipeline;
exports.getPipelineDetail = getPipelineDetail;
exports.myQueue = myQueue;
exports.myQueueCount = myQueueCount;
exports.pipelineStats = pipelineStats;
exports.getRndOptions = getRndOptions;
exports.channelCoverage = channelCoverage;
require("server-only");
const cache_1 = require("next/cache");
const admin_1 = require("@/lib/supabase/admin");
const cache_tags_1 = require("@/lib/cache-tags");
const tags_1 = require("@/lib/tags");
const code_links_1 = require("@/lib/code-links");
const session_1 = require("@/lib/session");
const rnd_options_1 = require("@/lib/rnd-options");
const pipeline_constants_1 = require("@/lib/pipeline-constants");
// Ngày vào luồng R&D: mẫu sưu tầm = ngày tạo; mẫu đưa vào từ luồng Media = ngày team chấp nhận
const entryDate = (p) => p.entry_source === "media" && p.media_review_at ? p.media_review_at : p.created_at;
exports.entryDate = entryDate;
const inRange = (iso, from, to) => {
    const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
    return d >= from && d <= to;
};
exports.inVnRange = inRange;
// Cache dùng chung (xoá khi sửa team — bust(TAG.teams))
const allTeams = (0, cache_1.unstable_cache)(async () => {
    const { data, error } = await admin_1.sb.core().from("teams").select("id, name, is_active").order("name");
    if (error)
        throw error;
    return data;
}, ["teams"], { tags: [cache_tags_1.TAG.teams], revalidate: 3600 });
async function getTeams(activeOnly = false) {
    const all = await allTeams();
    return activeOnly ? all.filter((t) => t.is_active) : all;
}
// Mọi hồ sơ (gồm cả đã khoá — để hiện tên người cũ). Cache dùng chung (xoá khi sửa người dùng — bust(TAG.profiles))
exports.getAllProfiles = (0, cache_1.unstable_cache)(async () => {
    const { data, error } = await admin_1.sb.core().from("profiles").select("id, full_name, role, is_active, team_id").order("full_name");
    if (error)
        throw error;
    return data;
}, ["profiles-basic", "v2"], { tags: [cache_tags_1.TAG.profiles], revalidate: 3600 });
async function getPeople(roles) {
    let q = admin_1.sb.core().from("profiles").select("id, full_name, role, team_id, is_team_lead").eq("is_active", true).order("full_name");
    if (roles)
        q = q.in("role", roles);
    const { data, error } = await q;
    if (error)
        throw error;
    return data;
}
// Danh sách mẫu thuộc quy trình (có stage), kèm tình trạng việc 3D / mẫu / media
async function listPipeline(f = {}) {
    const eqs = {};
    if (f.team)
        eqs.team_id = f.team;
    if (f.mine)
        eqs.created_by = f.mine;
    const { data, error } = await admin_1.sb.rnd().from("products").select("*").not("stage", "is", null).match(eqs)
        .filter("killed_at", f.killed ? "not.is" : "is", null).order("updated_at", { ascending: false });
    if (error)
        throw error;
    const items = data;
    const ids = items.map((i) => i.id);
    if (!ids.length)
        return [];
    const [{ data: design }, { data: media }, { data: samples }] = await Promise.all([
        admin_1.sb.rnd().from("design_tasks").select("product_id, status, assignee_id").in("product_id", ids),
        admin_1.sb.rnd().from("media_requests").select("product_id, approval").in("product_id", ids),
        admin_1.sb.rnd().from("sample_orders").select("product_id, status, supplier, created_at").in("product_id", ids).order("created_at", { ascending: false }),
    ]);
    const names = await (0, session_1.profileNames)([
        ...items.map((i) => i.created_by), ...(design ?? []).map((d) => d.assignee_id),
    ]);
    const nm = (id) => (id ? names.get(id) ?? null : null);
    const dBy = new Map((design ?? []).map((d) => [d.product_id, { status: d.status, assignee: nm(d.assignee_id) }]));
    const mBy = new Map();
    for (const m of media ?? []) {
        const c = mBy.get(m.product_id) ?? { total: 0, passed: 0 };
        c.total += 1;
        if (m.approval === "pass")
            c.passed += 1;
        mBy.set(m.product_id, c);
    }
    const sBy = new Map();
    for (const s of samples ?? [])
        if (!sBy.has(s.product_id))
            sBy.set(s.product_id, { status: (0, rnd_options_1.normOrderStatus)(s.status), supplier: s.supplier });
    return items.map((i) => ({
        ...i, creator: nm(i.created_by), design: dBy.get(i.id) ?? null, media: mBy.get(i.id) ?? null, sample: sBy.get(i.id) ?? null,
    }));
}
async function getPipelineDetail(id) {
    const [{ data: design }, { data: media }, { data: samples }] = await Promise.all([
        admin_1.sb.rnd().from("design_tasks").select("*").eq("product_id", id).maybeSingle(),
        admin_1.sb.rnd().from("media_requests").select("*").eq("product_id", id).order("created_at"),
        admin_1.sb.rnd().from("sample_orders").select("*").eq("product_id", id).order("created_at"),
    ]);
    return { design: design ?? null, media: (media ?? []), samples: (samples ?? []) };
}
async function myQueue(u) {
    const products = async (ids) => {
        if (!ids.length)
            return new Map();
        const { data } = await admin_1.sb.rnd().from("products").select("*").in("id", ids);
        return new Map(data.map((p) => [p.id, p]));
    };
    const entry = (p, what, when, tone) => p && !p.killed_at ? [{ id: p.id, st_code: p.st_code, code: p.code, name: p.name, what, when, tone }] : [];
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
    const group = (title, items, passive = false) => (items.length ? [{ title, items, ...(passive ? { passive } : {}) }] : []);
    const isLead = u.role === "admin" || u.is_team_lead, isRnd = u.role === "admin" || u.role === "rnd";
    // Trưởng team: mẫu của team mình + mẫu chưa gắn team
    const scoped = () => {
        const q = admin_1.sb.rnd().from("products").select("*");
        const mine = [u.team_id, u.team2_id].filter(Boolean).map((t) => `team_id.eq.${t}`); // team chính + team 2
        return u.role === "admin" ? q : q.or([...mine, "team_id.is.null"].join(","));
    };
    // Các nhóm việc độc lập → chạy SONG SONG (mỗi truy vấn ~100ms; chạy nối tiếp từng mất ~1,7s mỗi lần tải trang)
    // Người được giao vẽ 3D / quay source
    const assigned = async () => {
        const [{ data: myDesign }, { data: myMedia }] = await Promise.all([
            admin_1.sb.rnd().from("design_tasks").select("product_id, status, review_note").eq("assignee_id", u.id).in("status", ["todo", "doing", "redo"]),
            admin_1.sb.rnd().from("media_requests").select("product_id, request_type, status, deadline, approval, review_note").eq("assignee_id", u.id).neq("status", "done"),
        ]);
        const own = await products([...(myDesign ?? []), ...(myMedia ?? [])].map((t) => t.product_id));
        return [
            ...group("Vẽ 3D được giao", (myDesign ?? []).flatMap((t) => entry(own.get(t.product_id), t.status === "redo" ? `Sửa lại 3D: ${t.review_note ?? ""}` : t.status === "doing" ? "Đang vẽ 3D" : "Vẽ 3D", null, t.status === "redo" ? "warn" : undefined))),
            ...group("Yêu cầu quay video được giao (bảng Hoàn thành mẫu)", (myMedia ?? []).flatMap((t) => entry(own.get(t.product_id), t.approval === "redo" ? `Sửa lại ${t.request_type}: ${t.review_note ?? ""}` : `${t.status === "doing" ? "Đang làm" : "Cần làm"}: ${t.request_type}`, t.deadline, t.deadline && t.deadline < today ? "bad" : t.approval === "redo" ? "warn" : undefined))),
        ];
    };
    // Duyệt mẫu sưu tầm: Quản lý / trưởng team
    const pending = async () => {
        if (!isLead)
            return [];
        const { data: pend } = await scoped().eq("approval", "pending").is("killed_at", null);
        return group("Chờ bạn duyệt mẫu", (pend ?? []).flatMap((p) => entry(p, "Duyệt mẫu sưu tầm", p.updated_at)));
    };
    // P4 đã có đề xuất của hệ thống nhưng chưa xác nhận + đề xuất đổi sau khi đã duyệt
    // (gồm cả mẫu đã FAIL/kill — VD video trong cửa sổ test viral muộn). Gộp 1 lượt đọc P4/P5.
    const results = async () => {
        if (!isLead)
            return [];
        const { data } = await scoped().in("stage", ["p4", "p5"]);
        const all = (data ?? []);
        const withCode = all.filter((p) => p.code);
        const [{ data: decs }, { data: evs }] = withCode.length ? await Promise.all([
            admin_1.sb.rnd().from("current_decisions").select("product_id, result, suggested").in("product_id", withCode.map((p) => p.id)),
            admin_1.sb.rnd().from("evaluations").select("code, result").in("code", withCode.map((p) => p.code)),
        ]) : [{ data: [] }, { data: [] }];
        const res = new Map((evs ?? []).map((e) => [e.code, e.result]));
        const label = (r) => pipeline_constants_1.RESULT_TO[r] ?? "FAIL";
        const decided = new Set((decs ?? []).map((d) => d.product_id));
        const ready = all.filter((p) => !p.killed_at).flatMap((p) => {
            const r = p.code ? res.get(p.code) : undefined;
            if (p.stage === "p5")
                return decided.has(p.id) ? [] : entry(p, `Hệ thống đánh giá ${label(r ?? "win")} — duyệt thương mại hoá (P6)`);
            return p.stage === "p4" && r && r !== "testing" ? entry(p, `Hệ thống đề xuất ${label(r)} — xác nhận kết quả`) : [];
        });
        const drifted = withCode.flatMap((p) => {
            const d = decs?.find((x) => x.product_id === p.id), e = evs?.find((x) => x.code === p.code);
            if (!d || !e || e.result === "testing" || e.result === d.result || e.result === d.suggested)
                return [];
            return [{ id: p.id, st_code: p.st_code, code: p.code, name: p.name, tone: "warn",
                    what: `Đã duyệt ${label(d.result)}, hệ thống nay đề xuất ${label(e.result)} — xem lại ở bảng Win` }];
        });
        return [...group("Chờ bạn duyệt kết quả / thương mại hoá", ready), ...group("Đề xuất đổi sau kết luận", drifted)];
    };
    // Luồng Media: mẫu Media tự test (không qua R&D, mẫu mới) đạt WIN, team chưa quyết định → báo Quản lý / R&D / trưởng team
    const mediaWins = async () => {
        if (!(isRnd || u.is_team_lead))
            return [];
        const { data: wins } = await admin_1.sb.rnd().from("evaluations")
            .select("code, result, product_id, product:products(name, stage, media_review, created_by)")
            .in("result", ["win", "win_traffic", "win_sp"]).eq("age", "new").not("product_id", "is", null);
        return group("🔔 Media test WIN — chờ team xem xét", (wins ?? []).filter((w) => w.product && !w.product.stage && !w.product.media_review && (0, tags_1.isSystemTestCode)(w.code, w.product.created_by)) // chỉ mã test TẠO TRÊN HỆ THỐNG (có người tạo); mã đồ da TX… / hồ sơ tự sinh không tính
            .map((w) => ({ id: w.product_id, st_code: null, code: w.code, name: w.product.name,
            what: `Media test ${pipeline_constants_1.RESULT_TO[w.result] ?? w.result} — xem xét đưa vào quy trình R&D (Dashboard › Luồng Media)` })));
    };
    // Luồng Media: mã test do CHÍNH MÌNH tạo (Media / R&D / Quản lý) — việc của người tạo mã ở từng bước
    //   chưa đăng video → đăng video gắn #mã · WIN → chờ R&D xem xét (theo dõi) · đã được đưa vào R&D → theo dõi điểm vào
    const myTestCodes = async () => {
        const { data: ps } = await admin_1.sb.rnd().from("products").select("id, code, name, stage, created_at, media_review, media_review_at, killed_at, created_by").eq("created_by", u.id).like("code", "T%").is("killed_at", null).order("created_at", { ascending: false }).limit(300);
        const mine = (ps ?? []).filter((p) => (0, tags_1.isSystemTestCode)(p.code, p.created_by));
        if (!mine.length)
            return [];
        const [{ data: evs }, links] = await Promise.all([
            admin_1.sb.rnd().from("evaluations").select("code, result, metrics").in("code", mine.map((p) => p.code)),
            (0, code_links_1.loadCodeLinks)(),
        ]);
        const ev = new Map((evs ?? []).map((e) => [e.code, e]));
        const linked = new Set(links.map((l) => l.product_id));
        const row = (p, what, when, tone) => ({ id: p.id, st_code: null, code: p.code, name: p.name, what, when, tone });
        const noVideo = mine.filter((p) => !p.stage && !p.media_review && !Number(ev.get(p.code)?.metrics?.videos ?? 0));
        const winWait = mine.filter((p) => !p.stage && !p.media_review && ["win", "win_traffic", "win_sp"].includes(ev.get(p.code)?.result ?? ""));
        const taken = mine.filter((p) => p.stage && p.media_review === "accepted");
        return [
            ...group("Mã test chưa đăng video", noVideo.map((p) => row(p, `Đăng video gắn #${p.code} để hệ thống bắt đầu chấm KPI`, p.created_at))),
            ...group("Mã test đã WIN — chờ R&D xem xét", winWait.map((p) => row(p, `Media test ${pipeline_constants_1.RESULT_TO[ev.get(p.code).result] ?? "WIN"} — R&D / trưởng team đang xem xét đưa vào quy trình`)), true),
            ...group("Mã test đã được đưa vào R&D", taken.map((p) => row(p, `R&D đã nhận (${p.stage === "p4" ? "vào thẳng P4" : "làm lại từ P1"})${linked.has(p.id) ? "" : " · chờ gắn mã SPU khi mở bán"}`, p.media_review_at)), true),
        ];
    };
    // R&D / Quản lý: mẫu Media đã đưa vào quy trình nhưng chưa gắn mã SPU thương mại + ngày mở bán (gắn ở trang Mã SPU test)
    const linkSku = async () => {
        if (!isRnd)
            return [];
        const { data: ps } = await admin_1.sb.rnd().from("products").select("id, code, name, stage, media_review_at, created_by").eq("media_review", "accepted").like("code", "T%").is("killed_at", null).limit(500);
        const taken = (ps ?? []).filter((p) => p.stage && (0, tags_1.isSystemTestCode)(p.code, p.created_by));
        if (!taken.length)
            return [];
        const linked = new Set((await (0, code_links_1.loadCodeLinks)()).map((l) => l.product_id));
        return group("Gắn mã SPU + ngày mở bán (mẫu từ luồng Media)", taken.filter((p) => !linked.has(p.id)).map((p) => ({
            id: p.id, st_code: null, code: p.code, name: p.name, when: p.media_review_at, href: "/rnd/test-codes",
            what: "Khi mở bán: gắn mã SPU Sapo + ngày mở bán (trang Mã SPU test)"
        })));
    };
    // R&D / Quản lý: duyệt 3D, duyệt source
    const reviews = async () => {
        if (!isRnd)
            return [];
        const [{ data: dReview }, { data: mReview }] = await Promise.all([
            admin_1.sb.rnd().from("design_tasks").select("product_id, submitted_at").eq("status", "review"),
            admin_1.sb.rnd().from("media_requests").select("product_id, done_at").eq("approval", "pending"),
        ]);
        const rv = await products([...(dReview ?? []), ...(mReview ?? [])].map((t) => t.product_id));
        return group("Chờ duyệt 3D / source", [
            ...(dReview ?? []).flatMap((t) => entry(rv.get(t.product_id), "Duyệt bản 3D", t.submitted_at)),
            ...(mReview ?? []).flatMap((t) => entry(rv.get(t.product_id), "Duyệt source media", t.done_at)),
        ]);
    };
    // Quản lý: mọi mẫu đang chờ bước kế tiếp; R&D: mẫu mình sưu tầm
    const nextSteps = async () => {
        if (!isRnd)
            return [];
        const [{ data: stuck }, { data: d }, { data: m }] = await Promise.all([
            admin_1.sb.rnd().from("products").select("*").in("stage", ["p1", "p2", "p3", "p4"]).is("killed_at", null)
                .match(u.role === "admin" ? {} : { created_by: u.id }),
            // Bản ghi do luật tự động tạo ra nhưng chưa ai nhận (chưa giao người vẽ / người phụ trách media)
            admin_1.sb.rnd().from("design_tasks").select("product_id").is("assignee_id", null).neq("status", "done"),
            admin_1.sb.rnd().from("media_requests").select("product_id").is("assignee_id", null).neq("status", "done"),
        ]);
        const noDesigner = new Set((d ?? []).map((x) => x.product_id)), noMedia = new Set((m ?? []).map((x) => x.product_id));
        return group("Cần làm bước tiếp theo", (stuck ?? []).flatMap((p) => p.stage === "p1" ? entry(p, "Bấm “Bắt đầu sản xuất” (trang mẫu)", p.stage_at)
            : p.stage === "p2" && noDesigner.has(p.id) ? entry(p, "Giao người vẽ 3D (bảng Sản xuất mẫu)", p.stage_at)
                : p.stage === "p3" && noMedia.has(p.id) ? entry(p, "Giao người quay video trên tay (bảng Hoàn thành mẫu)", p.stage_at)
                    : (p.stage === "p3" || p.stage === "p4") && !p.code ? entry(p, "Gắn mã SPU trước khi đăng video (bảng Hoàn thành mẫu)", p.stage_at)
                        : []));
    };
    const drafts = async () => {
        if (!isRnd)
            return [];
        const { data: rejected } = await admin_1.sb.rnd().from("products").select("*").eq("created_by", u.id).in("approval", ["draft", "rejected"]).is("killed_at", null);
        return group("Mẫu sưu tầm của bạn", (rejected ?? []).flatMap((p) => entry(p, p.approval === "rejected" ? `Không duyệt: ${p.approval_note ?? ""}` : "Nháp — chưa gửi duyệt", p.updated_at, p.approval === "rejected" ? "warn" : undefined)));
    };
    // Thứ tự nhóm giữ như cũ
    const canTest = u.role === "admin" || u.role === "rnd" || u.role === "media";
    return (await Promise.all([assigned(), pending(), results(), mediaWins(), reviews(), nextSteps(), linkSku(), canTest ? myTestCodes() : [], drafts()])).flat();
}
async function myQueueCount(u) {
    try {
        return (await myQueue(u)).reduce((n, g) => n + (g.passive ? 0 : g.items.length), 0);
    }
    catch {
        return 0; // chưa chạy migration 015
    }
}
async function pipelineStats(from, to) {
    const { data, error } = await admin_1.sb.rnd().from("products")
        .select("id, created_by, team_id, stage, product_group, killed_at, approved_at, created_at, entry_source, media_review_at")
        .not("stage", "is", null);
    if (error)
        throw error;
    const items = data.filter((p) => inRange((0, exports.entryDate)(p), from, to));
    const ids = items.map((i) => i.id);
    const { data: samples } = ids.length
        ? await admin_1.sb.rnd().from("sample_orders").select("product_id, received_at").in("product_id", ids).not("received_at", "is", null)
        : { data: [] };
    const received = new Map();
    for (const s of samples ?? [])
        if (!received.has(s.product_id) || s.received_at < received.get(s.product_id))
            received.set(s.product_id, s.received_at);
    const [names, teams] = await Promise.all([(0, session_1.profileNames)(items.map((i) => i.created_by)), getTeams()]);
    const teamName = new Map(teams.map((t) => [t.id, t.name]));
    const order = [...pipeline_constants_1.STAGES];
    const blank = (key, name, team) => ({
        key, name, team, total: 0, killed: 0, sampleDays: null, _days: [],
        reached: Object.fromEntries(pipeline_constants_1.STAGES.map((s) => [s, 0])),
        groups: { gmv: 0, traffic: 0, profit: 0, return: 0 },
    });
    const people = new Map(), byTeam = new Map();
    for (const i of items) {
        const tName = i.team_id ? teamName.get(i.team_id) ?? null : null;
        const rows = [
            // nhân viên tách theo từng team (1 người có thể sưu tầm cho nhiều team)
            people.get(`${i.team_id ?? "-"}|${i.created_by ?? "?"}`)
                ?? blank(`${i.team_id ?? "-"}|${i.created_by ?? "?"}`, i.created_by ? names.get(i.created_by) ?? "?" : "?", tName ?? "Chưa gắn team"),
            byTeam.get(i.team_id ?? "-") ?? blank(i.team_id ?? "-", tName ?? "Chưa gắn team", null),
        ];
        people.set(rows[0].key, rows[0]);
        byTeam.set(rows[1].key, rows[1]);
        const idx = order.indexOf(i.stage);
        const days = i.approved_at && received.get(i.id)
            ? Math.max(0, Math.round((Date.parse(received.get(i.id)) - Date.parse(i.approved_at.slice(0, 10))) / 86_400_000)) : null;
        for (const r of rows) {
            r.total += 1;
            for (let k = 1; k <= idx; k++)
                r.reached[order[k]] += 1; // đã đạt mốc P0..Px
            if (i.killed_at)
                r.killed += 1;
            if (i.product_group)
                r.groups[i.product_group] += 1;
            if (days !== null)
                r._days.push(days);
        }
    }
    const finish = (m) => [...m.values()]
        .map(({ _days, ...r }) => ({ ...r, sampleDays: _days.length ? _days.reduce((a, b) => a + b, 0) / _days.length : null }))
        .sort((a, b) => b.total - a.total);
    return { people: finish(people), teams: finish(byTeam), total: items.length };
}
// ---------- Danh sách lựa chọn (Cấu hình) ----------
// Cache dùng chung (xoá khi lưu Cấu hình — bust(TAG.rndOptions))
const rndOptionsRaw = (0, cache_1.unstable_cache)(async () => {
    const { data } = await admin_1.sb.core().from("settings").select("value").eq("key", "rnd_options").maybeSingle();
    return data?.value ?? {};
}, ["rnd-options"], { tags: [cache_tags_1.TAG.rndOptions], revalidate: 3600 });
async function getRndOptions() {
    const o = { ...rnd_options_1.DEFAULT_OPTIONS, ...(await rndOptionsRaw()) };
    // Cấu hình cũ chưa có đơn nháp: "Đặt hàng" (trạng thái đầu, chưa đặt xưởng) đọc thành "Chưa đặt"; chưa có thì thêm vào đầu danh sách
    // Tên cũ → tên mới (Chốt đúc → Đã đặt hàng, Hoàn thành → Hoàn thành mẫu) cho tới khi chạy migration 096
    const hadDraft = o.order_status.some((x) => x.flag === "draft");
    const list = o.order_status.map((x) => (!hadDraft && x.value === "Đặt hàng" ? { value: rnd_options_1.DRAFT_ORDER, color: 18, flag: "draft" } : { ...x, value: (0, rnd_options_1.normOrderStatus)(x.value) }));
    o.order_status = list.some((x) => x.flag === "draft") ? list : [{ value: rnd_options_1.DRAFT_ORDER, color: 18, flag: "draft" }, ...list];
    return o;
}
async function channelCoverage(codes) {
    const { data: chans } = await admin_1.sb.social().from("channels").select("id, name, platform").eq("is_active", true).order("platform").order("name");
    const channels = (chans ?? []);
    const posted = new Map();
    if (!codes.length)
        return { channels, posted };
    const posts = await (0, admin_1.fetchAll)((a, b) => admin_1.sb.social().from("posts").select("channel_id, product_codes").overlaps("product_codes", codes).order("id").range(a, b));
    for (const p of posts)
        for (const c of p.product_codes)
            if (codes.includes(c))
                posted.set(c, (posted.get(c) ?? new Set()).add(p.channel_id));
    return { channels, posted };
}
