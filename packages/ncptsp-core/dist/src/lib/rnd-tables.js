"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CANCEL_LABEL = exports.START_LABEL = void 0;
exports.loadContext = loadContext;
exports.approvedTable = approvedTable;
exports.collectionTable = collectionTable;
exports.designTable = designTable;
exports.ordersTable = ordersTable;
exports.mediaTable = mediaTable;
exports.marketStats = marketStats;
exports.trafficTable = trafficTable;
exports.winTable = winTable;
exports.effectTable = effectTable;
const order_cost_1 = require("@/lib/order-cost");
require("server-only");
const admin_1 = require("@/lib/supabase/admin");
const daily_sales_1 = require("@/lib/daily-sales");
const rnd_code_stats_1 = require("@/lib/rnd-code-stats");
const roles_1 = require("@/lib/roles");
const session_1 = require("@/lib/session");
const rnd_1 = require("@/lib/rnd");
const pipeline_1 = require("@/lib/pipeline");
const pipeline_constants_1 = require("@/lib/pipeline-constants");
const rnd_options_1 = require("@/lib/rnd-options");
const data_1 = require("@/lib/eval/data");
const rnd_score_1 = require("@/lib/rnd-score");
const kpi_constants_1 = require("@/lib/kpi-constants");
// Dựng cột + dòng cho từng bảng R&D (Sưu tầm → 3D → Đặt hàng → Media → Traffic → Duyệt Win → Hiệu quả).
// Mỗi bảng dùng chung 1 bản ghi mẫu (rnd.products); cột ★ là tra cứu từ bảng khác.
const DAY = 86_400_000;
const vnDate = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));
const days = (from, to) => from ? Math.max(0, Math.round((Date.parse((to ?? new Date().toISOString()).slice(0, 10)) - Date.parse(from.slice(0, 10))) / DAY)) : null;
// Chi tiết KPI hệ thống chấm: "✓ Lượt xem 25.000 / 20.000" — mỗi chỉ tiêu 1 dòng
const kpiLines = (e) => e.checks.flatMap((g) => g.items.map((c) => {
    const m = kpi_constants_1.KPI_METRICS[c.metric];
    const f = (v) => (v === null ? "—" : m?.unit === "%" ? `${(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%` : v.toLocaleString("vi-VN", { maximumFractionDigits: 0 }));
    return `${c.pass ? "✓" : "○"} ${m?.label ?? c.metric} ${f(c.actual)} / ${c.op === "<=" ? "≤" : ""}${f(c.target)}`;
})).join("\n");
// Mọi dữ liệu dùng chung cho các bảng (1 lần / request)
async function loadContext(user) {
    const [{ data: items, error }, { data: design }, { data: orders }, { data: media }, { data: evCodes }, people, teams, options, scoreCards, scoreCfg] = await Promise.all([
        admin_1.sb.rnd().from("products").select("*").not("stage", "is", null).order("created_at", { ascending: false }),
        admin_1.sb.rnd().from("design_tasks").select("*"),
        admin_1.sb.rnd().from("sample_orders").select("*").order("created_at", { ascending: false }),
        admin_1.sb.rnd().from("media_requests").select("*").order("created_at", { ascending: false }),
        admin_1.sb.rnd().from("evaluations").select("code"), // mã đã có bài / video gắn mã = đã lên video
        (0, pipeline_1.getAllProfiles)(),
        (0, pipeline_1.getTeams)(),
        (0, pipeline_1.getRndOptions)(),
        (0, rnd_score_1.loadCards)(), // bảng chấm điểm mẫu sưu tầm (null = chưa chạy migration 065)
        (0, rnd_score_1.loadScoreCfg)(),
    ]);
    if (error)
        throw error;
    const products = (items ?? []);
    const paths = [
        ...products.flatMap((p) => p.image_paths), ...(design ?? []).flatMap((d) => d.image_paths),
        ...(media ?? []).flatMap((m) => m.photo_paths),
    ];
    const unique = [...new Set(paths)];
    const [signed, thumbs] = await Promise.all([(0, rnd_1.signImages)(unique), (0, rnd_1.signThumbs)(unique)]);
    const imgs = (ps) => ps.filter((p) => signed[p]).map((p) => ({ path: p, url: signed[p], ...(thumbs[p] ? { thumb: thumbs[p] } : {}) }));
    const all = people.map((p) => ({ id: p.id, name: p.full_name, role: (0, roles_1.normalizeRole)(p.role), active: p.is_active, team: p.team_id ?? null }));
    return {
        user, options, teams, scoreCards, scoreCfg,
        products, byId: new Map(products.map((p) => [p.id, p])),
        design: new Map((design ?? []).map((d) => [d.product_id, d])),
        orders: (orders ?? []), media: (media ?? []),
        posted: new Set((evCodes ?? []).map((e) => e.code)),
        imgs,
        people: all.map(({ id, name }) => ({ id, name })),
        peopleOf: (roles) => all.filter((p) => p.active && roles.includes(p.role)).map(({ id, name }) => ({ id, name })),
        // Thành viên của team PT Sản Phẩm (team phát triển sản phẩm = R&D): người phụ trách source ở bảng Hoàn thành mẫu
        rndTeamPeople: (() => { const t = teams.find((x) => x.name === pipeline_constants_1.RND_TEAM_NAME)?.id; return all.filter((p) => p.active && !!t && p.team === t).map(({ id, name }) => ({ id, name })); })(),
        teamPeople: teams.map((t) => ({ id: t.id, name: t.name })),
        productPick: products.filter((p) => p.stage !== "p0" && !p.killed_at).map((p) => ({ id: p.id, name: `${p.st_code} · ${p.name}` })),
    };
}
const editable = (c) => ({ ...c, editable: true });
// "Giai đoạn hiện tại": mốc + công đoạn / trạng thái bên trong mốc. CỘT DÙNG CHUNG cho mọi bảng R&D (phaseCol): mẫu đang ở đâu trong cả quy trình —
// khác với cột trạng thái RIÊNG của từng bảng (Trạng thái vẽ 3D, Duyệt source…) chỉ nói về công việc của bước đó.
function phaseOf(ctx, p) {
    if (p.killed_at)
        return "Đã hủy";
    if (p.stage === "p0")
        return "P0 · Danh sách sưu tầm";
    if (p.stage === "p1")
        return "P1 · Chờ sản xuất";
    // Mốc THỰC TẾ theo dữ liệu (mẫu nhập từ file / sửa tay có thể đứng sau mốc đã lưu): đơn đã hoàn thành → ít nhất P3; source quay đã được duyệt Đạt → P4
    const done = (0, rnd_options_1.flagged)(ctx.options.order_status, "done");
    const mine = ctx.media.filter((m) => m.product_id === p.id);
    const hand = mine.filter((m) => !(0, pipeline_constants_1.isCraftOnly)(m.request_type));
    const src = hand.length ? hand : mine; // chỉ có yêu cầu "Quay chế tác" (đã nhập tay) thì coi đó là source của mẫu
    let stage = p.stage;
    if (stage === "p2" && ctx.orders.some((o) => o.product_id === p.id && done.includes((0, rnd_options_1.normOrderStatus)(o.status))))
        stage = "p3";
    if (stage === "p3" && src.length && src.every((m) => m.status === "done" || m.approval === "pass"))
        stage = "p4"; // source xong (Hoàn thành) → P4
    if (stage === "p2") {
        const cancelled = (0, rnd_options_1.flagged)(ctx.options.order_status, "cancel"), draft = (0, rnd_options_1.draftStatuses)(ctx.options.order_status);
        const live = ctx.orders.filter((o) => o.product_id === p.id && !cancelled.includes(o.status));
        if (ctx.design.get(p.id)?.status !== "done" && !live.length)
            return "P2 · Đang vẽ 3D";
        if (!live.length || live.every((o) => draft.includes((0, rnd_options_1.normOrderStatus)(o.status))))
            return "P2 · Chờ đặt hàng"; // chưa có đơn nào đã đặt xưởng (3D đạt → đơn nháp)
        return "P2 · Đang sản xuất"; // có ít nhất 1 đơn đã đặt xưởng
    }
    if (stage === "p3")
        return "P3 · Chưa quay source";
    if (stage === "p4")
        return p.code && ctx.posted.has(p.code) ? "P4 · Đã lên video" : "P4 · Chưa lên video";
    if (p.stage === "p5")
        return "P5 · Win";
    return "P6 · Thương mại hoá";
}
const stCol = { key: "st_code", label: "Mã ST", type: "text", width: 110, hint: "Mã sưu tầm — do hệ thống cấp khi thêm mẫu, theo mẫu suốt quy trình (khác mã SPU chỉ có khi mẫu lên bán)" };
const phaseCol = { key: "phase", label: "Giai đoạn hiện tại", type: "badge", options: pipeline_constants_1.PHASE_OPTS, width: 180, hint: "Mẫu đang ở bước nào của cả quy trình (P0 → P6) — giống nhau ở mọi bảng; dùng để lọc mẫu đang ở bước này" };
const lookup = (c) => ({ ...c, lookup: true });
// Trường của bản ghi mẫu sửa được ở mọi bảng (lưu vào bản ghi gốc → bảng nào cũng thấy giá trị mới)
const PRODUCT_EDIT = ["team", "name", "images", "ref_url", "material", "stone", "group"];
const canWorkOn = (u, p) => (0, session_1.isRndEditor)(u) || p.created_by === u.id;
// ===================================================================================== ĐÃ DUYỆT (P1)
// Mẫu đã duyệt chờ R&D chủ động chọn mẫu nào đi sản xuất trước: đổi "Trạng thái" → "Bắt đầu sản xuất" → sang P2.
exports.START_LABEL = "Bắt đầu sản xuất";
exports.CANCEL_LABEL = "Hủy"; // chọn ở bảng Đã duyệt → dừng mẫu (kill) ngay tại bước chờ sản xuất
const START_OPTS = [{ value: "Chờ sản xuất", color: 3 }, { value: exports.START_LABEL, color: 2 }, { value: exports.CANCEL_LABEL, color: 8 }];
function approvedTable(ctx) {
    const { user } = ctx;
    const cols = [
        stCol,
        phaseCol,
        editable({ key: "start", label: "Trạng thái", type: "select", options: START_OPTS, width: 150, action: true, hint: "Chọn “Bắt đầu sản xuất” → mẫu sang P2 (công đoạn đầu: Vẽ 3D); chọn “Hủy” → dừng mẫu" }),
        editable({ key: "images", label: "Ảnh SP", type: "images", imageKind: "product" }),
        lookup({ key: "images_3d", label: "Ảnh 3D", type: "images" }), // chỉ xem (ảnh do người vẽ 3D tải ở bảng Vẽ 3D): thẻ thư viện có nút chuyển Ảnh SP ↔ Ảnh 3D
        editable({ key: "name", label: "Tên SP", type: "text", width: 240 }),
        { key: "approved_at", label: "Ngày duyệt mẫu ST", type: "date", hint: "Ngày mẫu được duyệt ở bước sưu tầm (P0)" },
        { key: "waiting", label: "Chờ", type: "number", suffix: " ngày", width: 90, hint: "Số ngày đã duyệt mà chưa bắt đầu sản xuất" },
        editable({ key: "product_group", label: "Nhóm SP", type: "select", options: pipeline_constants_1.GROUP_OPTS, width: 110, hint: "Nhẫn / dây chuyền / lắc… — dùng để lọc và gom nhóm báo cáo" }),
        editable({ key: "material", label: "Chất liệu", type: "select", options: ctx.options.material, width: 130 }),
        editable({ key: "stone", label: "Loại đá", type: "multi", options: ctx.options.stone }),
        editable({ key: "team_id", label: "Team", type: "person", people: ctx.teamPeople, width: 130 }),
        { key: "created_by", label: "Người sưu tầm", type: "person", people: ctx.people, hint: "Người thêm mẫu vào danh sách sưu tầm (P0)" },
    ];
    // Mọi mẫu ĐÃ QUA bước duyệt (P1 trở đi), không chỉ mẫu đang đứng ở P1: mẫu đã sang bước sau hiện kèm mốc hiện tại, không sửa được cột Trạng thái
    const rows = ctx.products.filter((p) => p.stage && p.stage !== "p0").map((p) => ({
        id: p.id, href: `/rnd/${p.id}`, muted: !!p.killed_at,
        edit: p.stage === "p1" && !p.killed_at && ((0, session_1.isRndEditor)(user) || p.created_by === user.id || (0, session_1.canApprove)(user, p.team_id)) ? ["start"] : [],
        cells: {
            phase: phaseOf(ctx, p),
            // mẫu đã đi tiếp = đã bắt đầu sản xuất; đang ở bước nào xem cột Giai đoạn hiện tại
            st_code: p.st_code, start: p.killed_at ? exports.CANCEL_LABEL : p.stage === "p1" ? "Chờ sản xuất" : exports.START_LABEL,
            images: ctx.imgs(p.image_paths), images_3d: ctx.imgs(ctx.design.get(p.id)?.image_paths ?? []), name: p.name, approved_at: p.approved_at,
            waiting: p.stage === "p1" ? days(p.approved_at, null) : null, product_group: p.product_group ? pipeline_constants_1.PRODUCT_GROUPS[p.product_group] : null,
            material: p.material, stone: p.stone, team_id: p.team_id, created_by: p.created_by,
        },
    }));
    return { cols, rows };
}
// ===================================================================================== SƯU TẦM
function collectionTable(ctx) {
    const { user, options: o } = ctx;
    const cols = [
        stCol,
        editable({ key: "approval", label: "Duyệt mẫu ST", type: "select", options: pipeline_constants_1.APPROVAL_OPTS, width: 130, action: true, noteKey: "approval_note" }),
        editable({ key: "approved_at", label: "Ngày duyệt mẫu ST", type: "date", hint: "Quản lý / trưởng team sửa được (mẫu đã duyệt)" }),
        editable({ key: "created_at", label: "Ngày ST", type: "date", hint: "Ngày sưu tầm — cũng là mốc bắt đầu tính traffic của mẫu" }),
        editable({ key: "ref_url", label: "Link video/sản phẩm", type: "link" }),
        editable({ key: "ref_platform", label: "Nguồn", type: "select", options: o.ref_platform, width: 120 }),
        editable({ key: "images", label: "Ảnh SP", type: "images", imageKind: "product" }),
        lookup({ key: "images_3d", label: "Ảnh 3D", type: "images" }), // chỉ xem (ảnh do người vẽ 3D tải ở bảng Vẽ 3D): thẻ thư viện có nút chuyển Ảnh SP ↔ Ảnh 3D
        editable({ key: "name", label: "Tên SP", type: "text", width: 240 }),
        editable({ key: "ref_metrics", label: "Chỉ số", type: "longtext", width: 170 }),
        editable({ key: "price_ref", label: "Giá tham khảo", type: "money" }),
        editable({ key: "source_status", label: "Source", type: "select", options: o.source_status, width: 130 }),
        editable({ key: "line", label: "Dòng SP", type: "multi", options: o.line }),
        editable({ key: "product_group", label: "Nhóm SP", type: "select", options: pipeline_constants_1.GROUP_OPTS, width: 110, hint: "Nhẫn / dây chuyền / lắc… — dùng để lọc và gom nhóm báo cáo" }),
        editable({ key: "material", label: "Chất liệu", type: "select", options: o.material, width: 130 }),
        editable({ key: "stone", label: "Loại đá", type: "multi", options: o.stone }),
        phaseCol,
        { key: "created_by", label: "Người sưu tầm", type: "person", people: ctx.people, hint: "Người thêm mẫu vào danh sách sưu tầm (P0)" },
        editable({ key: "expected_cost", label: "Giá vốn dự kiến", type: "money", sum: true }),
        editable({ key: "expected_price", label: "Giá bán dự kiến", type: "money" }),
        editable({ key: "kill_reason", label: "Lý do kill", type: "select", options: o.kill_reason, width: 150 }),
        { key: "sample_received", label: "Ngày ra mẫu", type: "date" },
        { key: "sample_days", label: "Thời gian ra mẫu", type: "number", suffix: " ngày", width: 120 },
        editable({ key: "team_id", label: "Team", type: "person", people: ctx.teamPeople, width: 130 }),
        lookup({ key: "code", label: "SPU", type: "text", width: 100 }),
        ...(ctx.scoreCards ? [lookup({ key: "score", label: "Điểm", type: "number", width: 80, hint: "Điểm chấm BM23 (thang 100, trung bình các người chấm). Chấm mù: chỉ thấy khi bạn đã chấm (Quản lý / trưởng team luôn thấy)" })] : []),
    ];
    const cardsOf = new Map();
    for (const c of ctx.scoreCards ?? []) {
        const l = cardsOf.get(c.product_id);
        if (l)
            l.push(c);
        else
            cardsOf.set(c.product_id, [c]);
    }
    const rows = ctx.products.map((p) => {
        const sc = ctx.scoreCards && p.stage === "p0" ? (0, rnd_score_1.rowScoreFor)(user, p.team_id, cardsOf.get(p.id) ?? [], ctx.scoreCfg) : null;
        const received = ctx.orders.filter((x) => x.product_id === p.id && x.received_at).map((x) => x.received_at).sort()[0] ?? null;
        const own = (0, session_1.isRndEditor)(user) || p.created_by === user.id;
        const approver = (0, session_1.canApprove)(user, p.team_id);
        // Ngày duyệt: chỉ người duyệt / R&D sửa
        const edit = own
            ? approver || (0, session_1.isRndEditor)(user) ? "all" : cols.filter((c) => c.editable && c.key !== "approved_at").map((c) => c.key)
            : approver ? ["approval", "kill_reason", "approved_at"] : [];
        return {
            id: p.id, href: `/rnd/${p.id}`, muted: !!p.killed_at, edit, del: (0, pipeline_constants_1.canDeleteProduct)(user, p), ...(sc ? { score: sc.row } : {}),
            cells: {
                score: sc ? sc.score : null,
                st_code: p.st_code, approval: p.approval ? pipeline_constants_1.APPROVAL_TO_LABEL[p.approval] : null, approved_at: p.approved_at, created_at: p.created_at,
                ref_url: p.ref_url, ref_platform: p.ref_platform, images: ctx.imgs(p.image_paths), images_3d: ctx.imgs(ctx.design.get(p.id)?.image_paths ?? []), name: p.name, ref_metrics: p.ref_metrics,
                price_ref: p.price_ref, source_status: p.source_status ?? null,
                line: p.line, product_group: p.product_group ? pipeline_constants_1.PRODUCT_GROUPS[p.product_group] : null, material: p.material, stone: p.stone,
                phase: phaseOf(ctx, p), created_by: p.created_by, expected_cost: p.expected_cost, expected_price: p.expected_price,
                kill_reason: p.killed_at ? p.kill_reason : null,
                sample_received: received, sample_days: received ? days(p.approved_at, received) : null,
                team_id: p.team_id, code: p.code,
            },
        };
    });
    return { cols, rows };
}
// ===================================================================================== THIẾT KẾ 3D
function designTable(ctx) {
    const { user } = ctx;
    const designers = ctx.peopleOf(["design3d", "rnd", "admin"]);
    const cols = [
        stCol,
        phaseCol,
        editable({ key: "team", label: "Team", type: "person", people: ctx.teamPeople, width: 120, hint: "Team phụ trách mẫu (sửa ở đây sẽ đổi cho mọi bảng)" }),
        editable({ key: "received", label: "Ngày nhận việc vẽ 3D", type: "datetime", hint: "Thời điểm mẫu được chuyển sang bước vẽ 3D (tự ghi khi mẫu vào P2)" }),
        editable({ key: "name", label: "Tên SP", type: "text", width: 220 }),
        editable({ key: "images", label: "Ảnh SP", type: "images", imageKind: "product" }),
        editable({ key: "ref_url", label: "Link mẫu tham khảo", type: "link", hint: "Link ảnh / video mẫu gốc người sưu tầm đưa vào — dùng làm tham chiếu khi vẽ" }),
        editable({ key: "images_3d", label: "Ảnh 3D", type: "images", imageKind: "design", hint: "Ảnh bản vẽ 3D do người vẽ tải lên — dùng làm bìa thẻ ở bảng này" }),
        editable({ key: "file_url", label: "File 3D", type: "link", hint: "Link file thiết kế 3D (ai cũng xem được, dùng khi đặt xưởng)" }),
        editable({ key: "assignee_id", label: "Người vẽ", type: "person", people: designers, hint: "Người được giao vẽ 3D — chỉ người này và R&D sửa được ảnh / file / trạng thái vẽ" }),
        editable({ key: "draw_status", label: "Trạng thái vẽ 3D", type: "select", options: pipeline_constants_1.DRAW_OPTS, width: 140, hint: "Tiến độ của NGƯỜI VẼ: Chưa vẽ → Đang vẽ → Hoàn thành. Chọn Hoàn thành thì chuyển sang chờ duyệt" }),
        editable({ key: "review", label: "Duyệt 3D", type: "select", options: pipeline_constants_1.REVIEW_OPTS, width: 120, action: true, noteKey: "review_note", hint: "Quản lý / trưởng team duyệt bản vẽ. Chọn “Đạt” → tự tạo đơn đặt mẫu và mẫu sang bước Đặt hàng; “Sửa lại” → trả về người vẽ (bắt buộc ghi lý do)" }),
        editable({ key: "note", label: "Ghi chú", type: "longtext", width: 200, hint: "Ghi chú của người vẽ về bản thiết kế" }),
        editable({ key: "review_note", label: "Nhận xét duyệt", type: "longtext", width: 200, hint: "Lý do người duyệt yêu cầu sửa lại — người vẽ đọc ở đây" }),
        editable({ key: "done_at", label: "Ngày hoàn thành 3D", type: "date", hint: "Ngày bản vẽ được duyệt Đạt" }),
        { key: "days", label: "Thời gian vẽ", type: "number", suffix: " ngày", width: 110, hint: "Từ ngày nhận việc đến ngày hoàn thành (chưa xong: tính tới hôm nay)" },
        lookup({ key: "creator", label: "Người sưu tầm", type: "person", people: ctx.people, hint: "Người thêm mẫu vào danh sách sưu tầm (P0) — khác “Người vẽ” của bước này" }),
    ];
    const rows = [...ctx.design.values()].flatMap((d) => {
        const p = ctx.byId.get(d.product_id);
        if (!p || p.stage === "p0" || p.stage === "p1")
            return []; // mẫu chờ bắt đầu sản xuất ở bảng Đã duyệt (P1)
        const mine = d.assignee_id === user.id;
        const reviewer = (0, session_1.isRndEditor)(user) || (0, session_1.canApprove)(user, p.team_id);
        const edit = [
            ...(canWorkOn(user, p) ? ["assignee_id", ...PRODUCT_EDIT] : []),
            ...(mine || (0, session_1.isRndEditor)(user) ? ["images_3d", "file_url", "draw_status", "note"] : []),
            ...(reviewer ? ["review", "review_note", "note"] : []),
            ...((0, session_1.isRndEditor)(user) ? ["received", "done_at"] : []),
        ];
        return [{
                id: p.id, href: `/rnd/${p.id}`, muted: !!p.killed_at, edit, del: (0, session_1.isRndEditor)(user),
                cells: {
                    phase: phaseOf(ctx, p),
                    st_code: p.st_code, team: p.team_id, received: d.created_at, name: p.name, images: ctx.imgs(p.image_paths), ref_url: p.ref_url,
                    images_3d: ctx.imgs(d.image_paths), file_url: d.file_url, assignee_id: d.assignee_id,
                    draw_status: (0, pipeline_constants_1.drawLabel)(d.status),
                    review: d.status === "review" ? "Chờ duyệt" : d.status === "done" ? "Đạt" : d.status === "redo" ? "Sửa lại" : null,
                    note: d.note, review_note: d.review_note, done_at: d.done_at, days: days(d.created_at, d.done_at), creator: p.created_by,
                },
            }];
    });
    return { cols, rows };
}
// ===================================================================================== THEO DÕI ĐẶT HÀNG
async function ordersTable(ctx) {
    const { user, options: o } = ctx;
    const ids = ctx.orders.map((x) => String(x.id));
    const logs = ids.length ? await (0, admin_1.fetchAll)((a, b) => admin_1.sb.rnd().from("status_log").select("entity_id, value, at").eq("entity", "order").in("entity_id", ids).order("at").range(a, b)) : [];
    const steps = o.order_status.filter((s) => s.flag !== "cancel" && s.flag !== "done" && s.flag !== "draft");
    const showCost = (0, session_1.isRndEditor)(user) || (0, session_1.canSeeProfit)(user);
    const cols = [
        stCol,
        phaseCol,
        lookup({ key: "code", label: "SPU", type: "text", width: 100 }),
        editable({ key: "name", label: "Tên SP", type: "text", width: 220 }),
        // Chi phí SX đứng trước Trạng thái: trên thẻ thư viện, ô nhập chi phí nằm phía trên các nút trạng thái
        ...(showCost ? [editable({ key: "cost", label: "Chi phí SX / chiếc", type: "money", sum: true, action: true, hint: "ĐƠN GIÁ mỗi chiếc do xưởng báo — hệ thống nhân với Số lượng để ra Thành tiền. Nhập tổng cả đơn sẽ làm báo cáo chi phí sai" })] : []),
        editable({ key: "status", label: "Trạng thái đơn", type: "select", options: o.order_status, width: 140, action: true, nextOnly: true, hint: "Tiến độ đơn đặt mẫu: Đặt hàng → Chốt đúc → Hoàn thành. Chọn “Hoàn thành” → tự tạo yêu cầu quay và mẫu sang P3. Chỉ chọn được bước kế tiếp" }),
        editable({ key: "ordered_at", label: "Ngày đặt hàng", type: "date", hint: "Ngày gửi đơn cho xưởng — kỳ của báo cáo Chi phí test tính theo ngày này" }),
        editable({ key: "expected_at", label: "Ngày dự kiến hoàn thành", type: "date", width: 130, hint: "Ngày xưởng hẹn giao mẫu" }),
        editable({ key: "received_at", label: "Ngày nhận hàng", type: "date", hint: "Ngày nhận mẫu thật từ xưởng" }),
        editable({ key: "qty", label: "Số lượng", type: "number", width: 90, sum: true, hint: "Số chiếc đặt trong đơn — nhân với Chi phí SX / chiếc để ra Thành tiền (để trống tính là 1)" }),
        editable({ key: "unit", label: "Đơn vị tính", type: "select", options: o.unit, width: 110, hint: "Chiếc / bộ / đôi…" }),
        ...(showCost ? [
            editable({ key: "cost_other", label: "Chi phí khác", type: "money", sum: true, hint: "Khoản phát sinh của CẢ ĐƠN (vận chuyển, khuôn, đá…) — không nhân với số lượng" }),
            { key: "cost_total", label: "Thành tiền", type: "money", width: 120, sum: true, hint: "Tự tính: Chi phí SX / chiếc × Số lượng + Chi phí khác (số lượng trống tính là 1). Đây là số đưa vào các báo cáo chi phí." },
        ] : []),
        editable({ key: "price", label: "Giá bán của đơn", type: "money", hint: "Giá bán ghi trên đơn đặt mẫu này — khác “Giá bán dự kiến” của mẫu ở các bảng sau" }),
        editable({ key: "note", label: "Ghi chú đơn", type: "text", width: 160 }),
        editable({ key: "supplier", label: "Nhà cung cấp", type: "select", options: o.supplier, width: 120, hint: "Xưởng / nhà cung cấp nhận đơn" }),
        editable({ key: "images", label: "Ảnh SP", type: "images", imageKind: "product" }),
        lookup({ key: "images_3d", label: "Ảnh 3D", type: "images" }), // chỉ xem (ảnh do người vẽ 3D tải ở bảng Vẽ 3D): thẻ thư viện có nút chuyển Ảnh SP ↔ Ảnh 3D
        editable({ key: "file_3d", label: "File 3D", type: "link", hint: "Link file 3D của mẫu (lấy từ bảng Sản xuất mẫu) — gửi kèm cho xưởng" }),
        editable({ key: "material", label: "Chất liệu", type: "select", options: o.material, width: 120 }),
        editable({ key: "stone", label: "Loại đá", type: "multi", options: o.stone }),
        editable({ key: "color", label: "Màu sắc", type: "multi", options: o.color, hint: "Màu của đơn này (vàng trắng, vàng hồng…) — có thể khác giữa các đơn của cùng mẫu" }),
        editable({ key: "weight_chi", label: "Trọng lượng (chỉ)", type: "number", width: 110, hint: "Trọng lượng vàng / bạc của mẫu, đơn vị chỉ" }),
        editable({ key: "size", label: "Size", type: "text", width: 90, hint: "Cỡ mẫu đặt (ni nhẫn, độ dài dây…)" }),
        { key: "sx_days", label: "Thời gian SX", type: "number", suffix: " ngày", width: 110, hint: "Từ ngày đặt tới ngày nhận (chưa nhận: tới hôm nay)" },
        ...steps.map((s) => ({ key: `step:${s.value}`, label: `TG ${s.value}`, type: "number", suffix: " ngày", width: 120, hint: `Số ngày ở trạng thái "${s.value}"` })),
        { key: "created_by", label: "Người tạo đơn", type: "person", people: [{ id: "auto", name: "Tự động" }, ...ctx.people], hint: "Người tạo đơn đặt mẫu này (“Tự động” = đơn do hệ thống tạo khi 3D được duyệt Đạt)" },
        { key: "updated_at", label: "Thời gian cập nhật", type: "datetime", hint: "Lần sửa gần nhất của đơn này" },
        { key: "team_id", label: "Team", type: "person", people: ctx.teamPeople, width: 120, hint: "Team của mẫu — dùng để lọc" },
        { key: "collector", label: "Người sưu tầm", type: "person", people: ctx.people, hint: "Người sưu tầm mẫu — dùng để lọc" },
    ];
    const byOrder = new Map();
    for (const l of logs)
        byOrder.set(l.entity_id, [...(byOrder.get(l.entity_id) ?? []), l]);
    const rows = ctx.orders.flatMap((x) => {
        const p = ctx.byId.get(x.product_id);
        if (!p)
            return [];
        const hist = byOrder.get(String(x.id)) ?? [];
        const stepDays = {};
        for (const s of steps) {
            let ms = 0;
            hist.forEach((h, i) => { if ((0, rnd_options_1.normOrderStatus)(h.value) === s.value)
                ms += Date.parse(hist[i + 1]?.at ?? new Date().toISOString()) - Date.parse(h.at); });
            stepDays[`step:${s.value}`] = hist.some((h) => (0, rnd_options_1.normOrderStatus)(h.value) === s.value) ? Math.round((ms / DAY) * 10) / 10 : null;
        }
        const cancelled = (0, rnd_options_1.flagged)(o.order_status, "cancel").includes(x.status);
        return [{
                id: String(x.id), pid: p.id, href: `/rnd/${p.id}`, muted: cancelled || !!p.killed_at, edit: (0, session_1.isRndEditor)(user) ? "all" : [], del: (0, session_1.isRndEditor)(user),
                cells: {
                    phase: phaseOf(ctx, p),
                    st_code: p.st_code, code: p.code, name: p.name, status: (0, rnd_options_1.normOrderStatus)(x.status), ordered_at: x.ordered_at, expected_at: x.expected_at,
                    received_at: x.received_at, qty: x.qty, unit: x.unit, cost: x.cost, cost_other: x.cost_other, cost_total: (0, order_cost_1.orderCost)(x), price: x.price, note: x.note,
                    supplier: x.supplier, images: ctx.imgs(p.image_paths), images_3d: ctx.imgs(ctx.design.get(p.id)?.image_paths ?? []), file_3d: ctx.design.get(p.id)?.file_url ?? null,
                    material: p.material, stone: p.stone, color: x.color, weight_chi: x.weight_chi, size: x.size,
                    sx_days: cancelled ? null : days(x.ordered_at, x.received_at), ...stepDays,
                    created_by: x.created_by ?? "auto", updated_at: x.updated_at, team_id: p.team_id, collector: p.created_by,
                },
            }];
    });
    return { cols, rows };
}
// ===================================================================================== MEDIA
function mediaTable(ctx) {
    const { user, options: o } = ctx;
    const medias = ctx.peopleOf(["media", "rnd", "admin"]);
    const cols = [
        stCol,
        phaseCol,
        editable({ key: "code", label: "SPU", type: "text", width: 100, hint: "Gắn mã SPU (hashtag) — dùng khi đăng video" }),
        editable({ key: "received_at", label: "Ngày nhận việc quay", type: "datetime", hint: "Thời điểm media nhận yêu cầu quay (tự ghi khi đơn đặt mẫu Hoàn thành)" }),
        editable({ key: "deadline", label: "Deadline", type: "date" }),
        editable({ key: "photos", label: "Ảnh chụp SP", type: "images", imageKind: "media" }),
        editable({ key: "images", label: "Ảnh SP", type: "images", imageKind: "product" }),
        editable({ key: "images_3d", label: "Ảnh 3D", type: "images", imageKind: "design" }),
        editable({ key: "name", label: "Tên SP", type: "text", width: 220 }),
        // Yêu cầu nội dung / Duyệt source đã bỏ: mọi yêu cầu mặc định là "Quay sản phẩm"; báo "Hoàn thành" (có link drive) là source xong → mẫu sang P4
        editable({ key: "note", label: "Ghi chú", type: "longtext", width: 180 }),
        editable({ key: "status", label: "Trạng thái xử lý", type: "select", options: pipeline_constants_1.MEDIA_STATUS_OPTS, width: 140, action: true, dropdown: true }),
        editable({ key: "drive_url", label: "Link drive file media", type: "link", width: 220 }),
        editable({ key: "assignee_id", label: "Người phụ trách", type: "person", people: ctx.rndTeamPeople, action: true }), // chỉ thành viên team PT Sản Phẩm
        editable({ key: "done_at", label: "Ngày hoàn thành Source", type: "date", width: 130 }),
        editable({ key: "lead_id", label: "Trưởng nhóm media", type: "person", people: medias }),
        { key: "created_by", label: "Người tạo yêu cầu", type: "person", people: [{ id: "auto", name: "Tự động" }, ...ctx.people], hint: "Người tạo yêu cầu quay (“Tự động” = hệ thống tạo khi đơn đặt mẫu Hoàn thành)" },
        { key: "team_id", label: "Team", type: "person", people: ctx.teamPeople, width: 120, hint: "Team của mẫu — dùng để lọc" },
        { key: "collector", label: "Người sưu tầm", type: "person", people: ctx.people, hint: "Người sưu tầm mẫu — dùng để lọc" },
    ];
    const rows = ctx.media.flatMap((m) => {
        const p = ctx.byId.get(m.product_id);
        if (!p)
            return [];
        const editor = (0, session_1.isRndEditor)(user), lead = m.lead_id === user.id, mine = m.assignee_id === user.id;
        const reviewer = editor || (0, session_1.canApprove)(user, p.team_id) || lead;
        const edit = [
            ...(editor || lead ? ["code", "deadline", "assignee_id", "received_at", "done_at"] : []),
            ...(editor ? ["lead_id"] : []),
            ...(editor || lead || mine ? ["note", "drive_url", "status", "photos"] : []),
            ...(canWorkOn(user, p) ? ["images", "images_3d", ...PRODUCT_EDIT] : []),
        ];
        return [{
                id: String(m.id), pid: p.id, href: `/rnd/${p.id}`, muted: !!p.killed_at, edit, del: editor || lead,
                cells: {
                    phase: phaseOf(ctx, p),
                    st_code: p.st_code, code: p.code, received_at: m.received_at, deadline: m.deadline, photos: ctx.imgs(m.photo_paths),
                    images: ctx.imgs(p.image_paths), images_3d: ctx.imgs(ctx.design.get(p.id)?.image_paths ?? []), name: p.name,
                    note: m.note,
                    status: m.status === "todo" ? "Chờ xử lý" : m.status === "doing" ? "Đang quay" : "Hoàn thành", drive_url: m.drive_url ?? p.source_url ?? null, // chưa nhập link drive riêng thì hiện kho Source của mẫu (ô "Link source" ở trang chi tiết)
                    assignee_id: m.assignee_id,
                    done_at: m.done_at, lead_id: m.lead_id, created_by: m.created_by ?? "auto", team_id: p.team_id, collector: p.created_by,
                },
            }];
    });
    return { cols, rows };
}
// Số liệu thị trường theo mã: bài gắn hashtag (views, tương tác, video) + số bán Qlydonhang trong [from, to]
// (from trống = từ bài đầu tiên; to trống = tới hôm nay)
async function marketStats(codes) {
    const out = new Map();
    if (!codes.length)
        return out;
    // Số liệu bài theo mã do DATABASE tính sẵn (migration 057); chưa có hàm thì kéo bài về cộng như cũ
    const dbStats = await (0, rnd_code_stats_1.rndCodeStats)(codes.map((c) => ({ id: c.id, codes: [c.code], from: c.from ?? null, to: c.to ?? null })));
    if (dbStats) {
        for (const c of codes) {
            const r = dbStats.get(c.id);
            out.set(c.id, {
                first: r?.first ?? null, videos: r?.videos ?? 0, views: r?.views ?? 0, engagement: r ? r.reactions + r.comments + r.shares : 0,
                topUrl: r?.topUrl ?? null, sold: 0, returned: 0, viewers: r?.viewers ?? 0, clicks: r?.clicks ?? 0, trendPct: null,
            });
        }
    }
    else {
        const posts = await (0, admin_1.fetchAll)((a, b) => admin_1.sb.social().from("posts").select("channel_id, product_codes, published_at, kind, views, viewers, clicks, reactions, comments, shares, permalink_url")
            .overlaps("product_codes", codes.map((c) => c.code)).order("published_at").range(a, b));
        for (const c of codes) {
            const mine = posts.filter((p) => {
                const d = vnDate(p.published_at);
                return p.product_codes.includes(c.code) && (!c.from || d >= c.from) && (!c.to || d <= c.to);
            });
            const top = [...mine].sort((a, b) => Number(b.views) - Number(a.views))[0];
            out.set(c.id, {
                first: mine[0] ? vnDate(mine[0].published_at) : null, videos: mine.filter((p) => p.kind === "video" || p.kind === "reel").length,
                views: mine.reduce((t, p) => t + Number(p.views), 0),
                engagement: mine.reduce((t, p) => t + Number(p.reactions) + Number(p.comments ?? 0) + Number(p.shares ?? 0), 0),
                topUrl: top?.permalink_url ?? null, sold: 0, returned: 0,
                viewers: mine.reduce((t, p) => t + Number(p.viewers), 0), clicks: mine.reduce((t, p) => t + Number(p.clicks), 0), trendPct: null,
            });
        }
    }
    const salesCodes = [...new Set(codes.map((c) => (c.sapo ?? c.code).toUpperCase()))];
    const today = vnDate(new Date().toISOString());
    const dayAgo = (n) => new Date(Date.parse(today) - n * DAY).toISOString().slice(0, 10);
    const firsts = [...out.values()].map((s) => s.first).filter(Boolean).sort();
    const earliest = firsts[0] ? (firsts[0] < dayAgo(13) ? firsts[0] : dayAgo(13)) : null; // phủ cả 14 ngày gần nhất cho xu hướng
    if (earliest) {
        const sales = await (0, daily_sales_1.loadDailySales)({ codes: salesCodes, from: earliest }); // file đơn hàng đã nhập + số đồng bộ cho ngày ngoài khoảng file
        for (const c of codes) {
            const s = out.get(c.id);
            const from = c.from ?? s.first;
            if (!from)
                continue;
            let last7 = 0, prev7 = 0;
            for (const r of sales) {
                if (r.code !== (c.sapo ?? c.code).toUpperCase())
                    continue;
                const net = Number(r.qty_sold) - Number(r.qty_returned);
                if (r.date >= dayAgo(6))
                    last7 += net;
                else if (r.date >= dayAgo(13))
                    prev7 += net;
            }
            s.trendPct = prev7 > 0 ? ((last7 - prev7) / prev7) * 100 : null;
            for (const r of sales) {
                if (r.code !== (c.sapo ?? c.code).toUpperCase() || r.date < from || (c.to && r.date > c.to))
                    continue;
                s.sold += Number(r.qty_sold);
                s.returned += Number(r.qty_returned);
            }
        }
    }
    return out;
}
async function tailRows(ctx, stages) {
    const list = ctx.products.filter((p) => stages.includes(p.stage));
    const [{ data: decs }, { data: evs }] = await Promise.all([
        list.length
            ? admin_1.sb.rnd().from("current_decisions").select("product_id, result, suggested, decided_at, decided_by").in("product_id", list.map((p) => p.id))
            : { data: [] },
        list.some((p) => p.code)
            ? admin_1.sb.rnd().from("evaluations").select("code, result, first_post_date, window_end, days_elapsed, sales_status, traffic_status, checks, forecast, evaluated_at, metrics").in("code", list.map((p) => p.code).filter(Boolean))
            : { data: [] },
    ]);
    // Cửa sổ lấy số liệu = cửa sổ ĐÃ CHO RA kết quả đánh giá (7 ngày đầu, hoặc 7 ngày gần nhất nếu cửa sổ đó tốt hơn) để số trên bảng khớp với kết quả
    const win = new Map((evs ?? []).map((e) => {
        const w = e.metrics?.window;
        return [e.code, w?.from && w?.to ? { from: w.from, to: w.to } : { from: e.first_post_date, to: e.window_end }];
    }));
    return {
        list,
        dec: new Map((decs ?? []).map((d) => [d.product_id, d])),
        ev: new Map((evs ?? []).map((e) => [e.code, e.result])),
        // Bản đánh giá đầy đủ của hệ thống (cập nhật mỗi lần đồng bộ)
        evFull: new Map((evs ?? []).map((e) => [e.code, e])),
        // Đề xuất hệ thống đã đổi SAU khi duyệt kết luận (VD đã FAIL nhưng video trong cửa sổ test viral muộn)
        drift: (p) => {
            const d = decs?.find((x) => x.product_id === p.id), e = p.code ? evs?.find((x) => x.code === p.code) : undefined;
            // Chỉ báo khi đề xuất đổi so với lúc duyệt (cố ý chọn khác đề xuất kèm lý do thì không báo)
            return d && e && e.result !== "testing" && e.result !== d.result && e.result !== d.suggested ? `⚠ Đã duyệt ${pipeline_constants_1.RESULT_TO[d.result]}, đề xuất mới ${pipeline_constants_1.RESULT_TO[e.result]}` : null;
        },
        // Cửa sổ test giống bộ máy đánh giá → số trên bảng khớp với đề xuất; chưa có đánh giá → từ ngày sưu tầm
        window: (p) => ({
            id: p.id, code: p.code, sapo: p.sapo_code, ...(win.get(p.code) ?? { from: (0, pipeline_constants_1.trafficFrom)(p), to: null }),
        }),
    };
}
async function trafficTable(ctx) {
    const { user, options: o } = ctx;
    // Mọi mẫu trong quy trình (từ P2) ĐÃ CÓ BÀI ĐĂNG đều hiện ở đây, không chỉ mẫu đã chuyển sang P4 — mẫu đăng video sớm (khi còn ở P2 / P3) vẫn cần theo dõi traffic; cột "Mốc" cho biết mẫu đang ở bước nào
    const { list: all, dec, evFull, window, drift } = await tailRows(ctx, ["p2", "p3", "p4", "p5", "p6"]);
    const stats = await marketStats(all.filter((p) => p.code).map(window));
    // Chỉ mẫu ĐÃ LÊN VIDEO (có bài gắn hashtag mã, hoặc hệ thống đã có bản đánh giá). Mẫu chưa đăng vẫn ở bảng Hoàn thành mẫu.
    const list = all.filter((p) => p.code && (stats.get(p.id)?.first || evFull.has(p.code)));
    const mediaDone = (pid) => ctx.media.filter((m) => m.product_id === pid && m.done_at).map((m) => m.done_at).sort().at(-1) ?? null;
    // Số liệu TRỌN ĐỜI của mã (mọi bài gắn mã, không giới hạn cửa sổ test) — các cột Views / Số video / SL bán chỉ tính trong cửa sổ test (7 ngày) nên nhỏ hơn thực tế nhiều
    const life = await (0, rnd_code_stats_1.rndCodeStats)(list.map((p) => ({ id: p.id, codes: [p.code] })));
    // Thứ tự cột = thứ tự trường trên thẻ thư viện (thẻ Vừa hiện 5 trường đầu, Lớn 8): số traffic + đánh giá hệ thống lên trước
    const cols = [
        stCol,
        lookup({ key: "code", label: "SPU", type: "text", width: 100 }),
        editable({ key: "images", label: "Ảnh SP", type: "images", imageKind: "product" }),
        lookup({ key: "images_3d", label: "Ảnh 3D", type: "images" }), // chỉ xem (ảnh do người vẽ 3D tải ở bảng Vẽ 3D): thẻ thư viện có nút chuyển Ảnh SP ↔ Ảnh 3D
        editable({ key: "name", label: "Tên SP", type: "text", width: 220 }),
        { key: "suggested", label: "Đề xuất hệ thống", type: "badge", options: pipeline_constants_1.RESULT_OPTS, width: 130, hint: "Hệ thống tự chấm theo KPI mỗi lần đồng bộ" },
        phaseCol,
        { key: "test_day", label: "Tiến độ test", type: "text", width: 120, hint: "Ngày thứ mấy / số ngày cửa sổ test (tính từ video đầu tiên)" },
        { key: "all_views", label: "Tổng views", type: "number", sum: true, hint: "TRỌN ĐỜI: tổng lượt xem mọi video gắn mã, mọi Page / kênh, từ video đầu tiên đến nay (không giới hạn cửa sổ test)" },
        { key: "all_videos", label: "Tổng video", type: "number", width: 90, sum: true, hint: "TRỌN ĐỜI: số video gắn mã đã đăng, mọi Page / kênh" },
        { key: "views", label: "Views test", type: "number", sum: true, hint: "Chỉ trong cửa sổ test (7 ngày đầu hoặc 7 ngày gần nhất) — số dùng để chấm KPI; tổng cả vòng đời xem cột Tổng views" },
        { key: "viewers", label: "Người xem", type: "number", sum: true, hint: "Tổng người xem các video trong cửa sổ (chỉ Facebook có số này). KPI Traffic đạt khi lượt xem hoặc người xem đủ ngưỡng ở Cài đặt" },
        { key: "sold", label: "SL bán test", type: "number", sum: true, hint: "Tự động: SL bán trong cửa sổ test — cùng số hệ thống dùng để đề xuất (Qlydonhang)" },
        { key: "videos", label: "Video test", type: "number", width: 90, sum: true, hint: "Chỉ video đăng trong cửa sổ test; tổng cả vòng đời xem cột Tổng video" },
        { key: "kpi_status", label: "Đánh giá KPI", type: "text", width: 200, hint: "Trạng thái nhóm KPI bán hàng / traffic" },
        { key: "forecast", label: "Dự báo cuối kỳ", type: "badge", options: pipeline_constants_1.RESULT_OPTS, width: 120, hint: "Ước tính kết quả khi hết cửa sổ test nếu giữ tốc độ hiện tại" },
        { key: "first_post", label: "Ngày đăng video", type: "date", hint: "Tự động: bài đầu tiên gắn hashtag mã (từ ngày sưu tầm)" },
        { key: "kpi_detail", label: "Chi tiết KPI", type: "longtext", width: 240, hint: "Từng chỉ tiêu: thực tế / mục tiêu (✓ = đạt)" },
        { key: "engagement", label: "Tương tác", type: "number", sum: true },
        { key: "returned", label: "SL hoàn/huỷ", type: "number", sum: true, hint: "SL hoàn / huỷ trong cửa sổ test" },
        { key: "video_url", label: "Link video", type: "link", hint: "Tự động: video nhiều view nhất" },
        { key: "evaluated_at", label: "Hệ thống cập nhật", type: "datetime", hint: "Lần chấm gần nhất (sau mỗi lần đồng bộ)" },
        { key: "received", label: "Ngày xong source", type: "date", hint: "Ngày media báo Hoàn thành source (yêu cầu quay gần nhất của mẫu)" },
        editable({ key: "expected_cost", label: "Giá vốn dự kiến", type: "money" }),
        editable({ key: "expected_price", label: "Giá bán dự kiến", type: "money" }),
        editable({ key: "group", label: "Nhóm SP", type: "select", options: pipeline_constants_1.GROUP_OPTS, width: 100, hint: "Cùng dữ liệu với cột Nhóm SP ở bảng Sưu tầm" }),
        editable({ key: "traffic_owner", label: "Người phụ trách traffic", type: "person", people: ctx.peopleOf(["rnd", "admin", "media"]), hint: "Người theo dõi hiệu quả traffic của mẫu — khác “Người phụ trách” quay source ở bảng Hoàn thành mẫu" }),
        editable({ key: "customer_feedback", label: "Khách hàng phản hồi", type: "longtext", width: 200 }),
        editable({ key: "ads_cost", label: "Chi phí Ads", type: "money", sum: true }),
        { key: "drift", label: "Cảnh báo", type: "text", width: 220, hint: "Đề xuất hệ thống khác kết luận đã duyệt → xem lại ở bảng Win" },
        editable({ key: "traffic_review", label: "Đánh giá traffic", type: "select", options: o.review, width: 130, action: true, hint: "Nhận định của người phụ trách về hiệu quả traffic trong lúc test — khác “Đánh giá hiệu quả” ở bảng Thương mại hoá (đánh giá sau 30 ngày mở bán)" }),
        editable({ key: "traffic_note", label: "Ghi chú", type: "longtext", width: 180 }),
        { key: "decided_at", label: "Ngày duyệt kết luận", type: "date", hint: "Ngày duyệt kết luận Win / thương mại hoá" },
        { key: "decided_by", label: "Người duyệt", type: "person", people: ctx.people },
        { key: "team_id", label: "Team", type: "person", people: ctx.teamPeople, width: 120, hint: "Team của mẫu — dùng để lọc" },
        { key: "collector", label: "Người sưu tầm", type: "person", people: ctx.people, hint: "Người sưu tầm mẫu — dùng để lọc" },
    ];
    const rows = list.map((p) => {
        const s = stats.get(p.id);
        const d = dec.get(p.id);
        const e = p.code ? evFull.get(p.code) : undefined;
        const span = e ? days(e.first_post_date, e.window_end) + 1 : null;
        const edit = (0, session_1.isRndEditor)(user) || p.traffic_owner === user.id ? "all" : [];
        return {
            id: p.id, href: `/rnd/${p.id}`, muted: !!p.killed_at, edit,
            cells: {
                phase: phaseOf(ctx, p),
                st_code: p.st_code, code: p.code, images: ctx.imgs(p.image_paths), images_3d: ctx.imgs(ctx.design.get(p.id)?.image_paths ?? []), name: p.name,
                suggested: e ? pipeline_constants_1.RESULT_TO[e.result] : null,
                test_day: e ? (e.metrics?.window?.kind === "recent" ? `${days(e.metrics.window.from, e.metrics.window.to) + 1} ngày gần nhất` : e.days_elapsed >= span ? `Xong (${span} ngày)` : `Ngày ${e.days_elapsed + 1}/${span}`) : "Chờ hệ thống chấm",
                views: s?.views ?? 0, viewers: s?.viewers ?? 0, sold: s ? s.sold - s.returned : 0, videos: s?.videos ?? 0,
                all_views: life?.get(p.id)?.views ?? s?.views ?? 0, all_videos: life?.get(p.id)?.videos ?? s?.videos ?? 0,
                kpi_status: e ? `Bán: ${data_1.STATUS_TEXT[e.sales_status] ?? e.sales_status} · Traffic: ${data_1.STATUS_TEXT[e.traffic_status] ?? e.traffic_status}` : null,
                forecast: e?.forecast && e.result === "testing" ? pipeline_constants_1.RESULT_TO[e.forecast.predicted] ?? null : null,
                first_post: e?.first_post_date ?? s?.first ?? null, kpi_detail: e ? kpiLines(e) || null : null,
                engagement: s?.engagement ?? 0,
                returned: s?.returned ?? 0, video_url: s?.topUrl ?? null, evaluated_at: e?.evaluated_at ?? null, received: mediaDone(p.id),
                expected_cost: p.expected_cost, expected_price: p.expected_price, group: p.product_group ? pipeline_constants_1.PRODUCT_GROUPS[p.product_group] : null,
                traffic_owner: p.traffic_owner ?? null, customer_feedback: p.customer_feedback ?? null, ads_cost: p.ads_cost ?? null,
                drift: drift(p), traffic_review: p.traffic_review ?? null, traffic_note: p.traffic_note ?? null, decided_at: d?.decided_at ?? null, decided_by: d?.decided_by ?? null,
                team_id: p.team_id, collector: p.created_by,
            },
        };
    });
    return { cols, rows };
}
async function winTable(ctx) {
    const { user, options: o } = ctx;
    const showCost = (0, session_1.isRndEditor)(user) || (0, session_1.canSeeProfit)(user);
    const { list: staged, dec, ev, evFull, window, drift } = await tailRows(ctx, ["p4", "p5", "p6"]);
    // Bảng Win chỉ gồm mẫu đã Win (P5) và mẫu đã duyệt thương mại hoá (P6). Mẫu còn ở P4 (đang đăng video, chưa đạt) nằm ở bảng Đăng video;
    // riêng mẫu Media đã được R&D chấp nhận vào ở P4 (không tự lên P5) hoặc mẫu P4 mà hệ thống đã đề xuất WIN vẫn hiện để duyệt
    const list = staged.filter((p) => p.stage !== "p4" || p.entry_source === "media" || (!!p.code && ["win", "win_traffic", "win_sp"].includes(ev.get(p.code) ?? "")));
    const stats = await marketStats(list.filter((p) => p.code).map(window));
    const cols = [
        stCol,
        lookup({ key: "code", label: "SPU", type: "text", width: 100 }),
        editable({ key: "images", label: "Ảnh SP", type: "images", imageKind: "product" }),
        lookup({ key: "images_3d", label: "Ảnh 3D", type: "images" }), // chỉ xem (ảnh do người vẽ 3D tải ở bảng Vẽ 3D): thẻ thư viện có nút chuyển Ảnh SP ↔ Ảnh 3D
        editable({ key: "name", label: "Tên SP", type: "text", width: 220 }),
        { key: "sold", label: "SL bán test", type: "number", sum: true, hint: "SL bán trong cửa sổ test, toàn công ty: mọi kênh bán (trừ bảo hành)" },
        { key: "views", label: "Views test", type: "number", sum: true, hint: "Lượt xem trong cửa sổ test, toàn công ty: mọi Page / kênh" },
        { key: "engagement", label: "Tương tác", type: "number", sum: true },
        // Số liệu để BOD duyệt thương mại hoá (chỉ đọc). Thứ tự = độ ưu tiên: thẻ thư viện chỉ lấy vài trường đầu nên thẻ gọn
        { key: "conversion", label: "Chuyển đổi", type: "number", suffix: "%", width: 100, hint: "SL bán thuần ÷ người xem trong cửa sổ test" },
        { key: "return_rate", label: "Tỉ lệ hoàn", type: "number", suffix: "%", width: 90, hint: "SL hoàn ÷ SL bán trong cửa sổ test" },
        { key: "trend", label: "Xu hướng 7 ngày", type: "number", suffix: "%", width: 110, hint: "SL bán thuần 7 ngày gần nhất so với 7 ngày trước đó (dương = đang tăng)" },
        { key: "margin", label: "Biên LN dự kiến", type: "number", suffix: "%", width: 110, hint: "(Giá bán − Giá vốn) ÷ Giá bán, theo giá nhập ở cột Giá vốn / Giá bán" },
        ...(showCost ? [{ key: "test_cost", label: "Chi phí test", type: "money", width: 120, hint: "Chi phí làm mẫu (Chi phí SX × số lượng + Chi phí khác của các đơn đặt mẫu) + Chi phí Ads" }] : []),
        { key: "test_day", label: "Tiến độ test", type: "text", width: 120, hint: "Ngày thứ mấy / số ngày cửa sổ test (tính từ video đầu tiên)" },
        { key: "kpi_status", label: "Đánh giá KPI", type: "text", width: 200, hint: "Trạng thái nhóm KPI bán hàng / traffic" },
        { key: "line", label: "Dòng SP", type: "multi", options: o.line, width: 110 },
        { key: "material", label: "Chất liệu", type: "select", options: o.material, width: 110 },
        { key: "stone", label: "Loại đá", type: "multi", options: o.stone, width: 130 },
        { key: "group", label: "Nhóm SP", type: "select", options: pipeline_constants_1.GROUP_OPTS, width: 100 },
        { key: "team", label: "Team", type: "text", width: 130, hint: "Team phụ trách mẫu" },
        { key: "videos", label: "Video test", type: "number", width: 90, sum: true, hint: "Số video / reel đăng trong cửa sổ test" },
        { key: "viewers", label: "Người xem", type: "number", sum: true },
        { key: "ctr", label: "CTR", type: "number", suffix: "%", width: 80, hint: "Lượt nhấp ÷ lượt xem" },
        ...(showCost ? [{ key: "sample_cost", label: "Chi phí làm mẫu", type: "money", width: 120, hint: "Tổng Chi phí SX × số lượng + Chi phí khác của các đơn đặt mẫu" }] : []),
        { key: "source_url", label: "Link source", type: "link", width: 140, hint: "Kho Source của mẫu (chưa có → link drive media đã nhập)" },
        { key: "ref_url", label: "Link mẫu tham khảo", type: "link", width: 140 },
        editable({ key: "customer_feedback", label: "Khách hàng phản hồi", type: "longtext", width: 200 }),
        editable({ key: "expected_cost", label: "Giá vốn dự kiến", type: "money" }),
        editable({ key: "expected_price", label: "Giá bán dự kiến", type: "money" }),
        editable({ key: "ads_cost", label: "Chi phí Ads", type: "money", sum: true }),
        { key: "first_post", label: "Ngày đăng video", type: "date", hint: "Bài đầu tiên gắn hashtag mã — mốc để lọc theo tháng" },
        { key: "suggested", label: "Đề xuất hệ thống", type: "badge", options: pipeline_constants_1.RESULT_OPTS, width: 130 },
        { key: "drift", label: "Cảnh báo", type: "text", width: 220, hint: "Đề xuất đổi sau khi duyệt. Mẫu đã FAIL vẫn duyệt lại được → chọn WIN / WIN TRAFFIC để mở lại" },
        editable({ key: "traffic_note", label: "Ghi chú duyệt", type: "longtext", width: 200, hint: "Bắt buộc khi chọn khác đề xuất" }),
        editable({ key: "decision", label: "Duyệt thương mại hoá", type: "select", options: pipeline_constants_1.COMMERCIAL_OPTS, width: 170, action: true, noteKey: "traffic_note",
            hint: "Win do hệ thống tự chấm. Quản lý / trưởng team duyệt tay: thương mại hoá → P6, không → dừng mẫu" }),
        editable({ key: "win_qty", label: "SL duyệt sản xuất", type: "number", width: 120 }),
        { key: "decided_by", label: "Người duyệt", type: "person", people: ctx.people },
        { key: "decided_at", label: "Ngày duyệt kết luận", type: "date", hint: "Ngày duyệt kết luận Win / thương mại hoá" },
        { key: "collector", label: "Người sưu tầm", type: "person", people: ctx.people, hint: "Người sưu tầm mẫu — dùng để lọc" },
    ];
    const sampleCost = (pid) => ctx.orders.filter((x) => x.product_id === pid).reduce((t, x) => t + (0, order_cost_1.orderCost)(x), 0);
    const rows = list.map((p) => {
        const s = stats.get(p.id);
        const d = dec.get(p.id);
        const approver = (0, session_1.canApprove)(user, p.team_id);
        const warn = drift(p);
        return {
            id: p.id, href: `/rnd/${p.id}`, muted: !!p.killed_at && !warn,
            edit: [...(approver && (!p.killed_at || warn) ? ["decision", "win_qty"] : []), ...(approver || (0, session_1.isRndEditor)(user) ? ["traffic_note"] : []),
                ...(canWorkOn(user, p) ? PRODUCT_EDIT : []),
                ...((0, session_1.isRndEditor)(user) || p.traffic_owner === user.id ? ["customer_feedback", "expected_cost", "expected_price", "ads_cost"] : [])],
            cells: {
                st_code: p.st_code, code: p.code, images: ctx.imgs(p.image_paths), images_3d: ctx.imgs(ctx.design.get(p.id)?.image_paths ?? []), name: p.name, sold: s?.sold ?? 0, views: s?.views ?? 0,
                line: p.line, material: p.material, stone: p.stone, group: p.product_group ? pipeline_constants_1.PRODUCT_GROUPS[p.product_group] : null,
                team: ctx.teams.find((t) => t.id === p.team_id)?.name ?? null, collector: p.created_by,
                margin: p.expected_cost && p.expected_price ? Math.round(((p.expected_price - p.expected_cost) / p.expected_price) * 1000) / 10 : null,
                conversion: s && s.viewers > 0 ? Math.round(((s.sold - s.returned) / s.viewers) * 10000) / 100 : null,
                return_rate: s && s.sold > 0 ? Math.round((s.returned / s.sold) * 1000) / 10 : null,
                trend: s?.trendPct == null ? null : Math.round(s.trendPct),
                viewers: s?.viewers ?? 0, ctr: s && s.views > 0 ? Math.round((s.clicks / s.views) * 10000) / 100 : null,
                test_cost: showCost ? (sampleCost(p.id) + (p.ads_cost ?? 0)) || null : null,
                sample_cost: showCost ? sampleCost(p.id) || null : null,
                source_url: p.source_url ?? ctx.media.find((m) => m.product_id === p.id && m.drive_url)?.drive_url ?? null, ref_url: p.ref_url ?? null,
                test_day: p.code && evFull.get(p.code) ? (() => { const e = evFull.get(p.code), span = days(e.first_post_date, e.window_end) + 1; return e.days_elapsed >= span ? `Xong (${span} ngày)` : `Ngày ${e.days_elapsed + 1}/${span}`; })() : "Chờ hệ thống chấm",
                videos: s?.videos ?? 0,
                kpi_status: p.code && evFull.get(p.code) ? (() => { const e = evFull.get(p.code); return `Bán: ${data_1.STATUS_TEXT[e.sales_status] ?? e.sales_status} · Traffic: ${data_1.STATUS_TEXT[e.traffic_status] ?? e.traffic_status}`; })() : null,
                engagement: s?.engagement ?? 0, customer_feedback: p.customer_feedback ?? null, expected_cost: p.expected_cost,
                expected_price: p.expected_price, ads_cost: p.ads_cost ?? null,
                first_post: (p.code ? evFull.get(p.code)?.first_post_date : null) ?? s?.first ?? null,
                suggested: p.code && ev.get(p.code) ? pipeline_constants_1.RESULT_TO[ev.get(p.code)] : null, drift: warn, traffic_note: p.traffic_note ?? null,
                decision: d ? (d.result === "fail" ? pipeline_constants_1.COMMERCIAL_NO : p.stage === "p6" ? pipeline_constants_1.COMMERCIAL_YES : null) : null, // đã duyệt cũ nhưng mẫu chưa ở P6 → để trống, bấm lại "Thương mại hoá" sẽ đưa sang P6 win_qty: p.win_qty, decided_by: d?.decided_by ?? null, decided_at: d?.decided_at ?? null,
            },
        };
    });
    return { cols, rows };
}
async function effectTable(ctx) {
    const { user, options: o } = ctx;
    const { list } = await tailRows(ctx, ["p6"]);
    const addDays = (d, n) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
    const stats = await marketStats(list.filter((p) => p.code).map((p) => {
        const from = p.launch_date ?? (p.stage_at ? vnDate(p.stage_at) : null);
        return { id: p.id, code: p.code, sapo: p.sapo_code, from: from ?? (0, pipeline_constants_1.trafficFrom)(p), to: from ? addDays(from, 29) : null };
    }));
    // Số liệu video đã lên: tổng mọi video gắn mã của mẫu từ ngày sưu tầm đến nay (tự cập nhật mỗi lần đồng bộ) — không phụ thuộc Ngày mở bán
    const videoStats = await marketStats(list.filter((p) => p.code).map((p) => ({ id: p.id, code: p.code, sapo: p.sapo_code, from: (0, pipeline_constants_1.trafficFrom)(p), to: null })));
    const cols = [
        stCol,
        phaseCol,
        editable({ key: "launch_date", label: "Ngày mở bán", type: "date" }),
        { key: "review_date", label: "Ngày đánh giá", type: "date", hint: "Ngày mở bán + 30" },
        lookup({ key: "code", label: "SPU", type: "text", width: 100 }),
        editable({ key: "images", label: "Ảnh SP", type: "images", imageKind: "product" }),
        lookup({ key: "images_3d", label: "Ảnh 3D", type: "images" }), // chỉ xem (ảnh do người vẽ 3D tải ở bảng Vẽ 3D): thẻ thư viện có nút chuyển Ảnh SP ↔ Ảnh 3D
        editable({ key: "name", label: "Tên SP", type: "text", width: 220 }),
        { key: "sold_all", label: "SL bán (từ khi đăng)", type: "number", sum: true, hint: "Tổng SL bán từ ngày sưu tầm / video đầu đến nay (trừ bảo hành) — tự cập nhật theo số bán đồng bộ" },
        { key: "sold", label: "SL bán 30 ngày", type: "number", sum: true, hint: "30 ngày từ Ngày mở bán" },
        { key: "returned", label: "SL hoàn/huỷ", type: "number", sum: true },
        { key: "videos", label: "Số video (từ khi đăng)", type: "number", sum: true, hint: "Số video đã lên (gắn mã SPU), từ khi đăng đến nay — tự cập nhật" },
        { key: "views", label: "Views (từ khi đăng)", type: "number", sum: true, hint: "Tổng lượt xem các video đã lên, từ khi đăng đến nay — tự cập nhật" },
        { key: "engagement", label: "Tương tác", type: "number", sum: true, hint: "Tổng cảm xúc + bình luận + chia sẻ của các video đã lên — tự cập nhật" },
        editable({ key: "customer_feedback", label: "Khách hàng phản hồi", type: "longtext", width: 200 }),
        editable({ key: "expected_cost", label: "Giá vốn dự kiến", type: "money" }),
        editable({ key: "expected_price", label: "Giá bán dự kiến", type: "money" }),
        editable({ key: "ads_cost", label: "Chi phí Ads", type: "money", sum: true }),
        editable({ key: "lifecycle_review", label: "Đánh giá hiệu quả", type: "select", options: o.review, width: 130, action: true }),
        editable({ key: "lifecycle_note", label: "Ghi chú đánh giá", type: "longtext", width: 200, hint: "Ghi chú khi đánh giá hiệu quả vòng đời của mẫu" }),
        lookup({ key: "win_qty", label: "SL duyệt sản xuất", type: "number", width: 120 }),
        { key: "team_id", label: "Team", type: "person", people: ctx.teamPeople, width: 120, hint: "Team của mẫu — dùng để lọc" },
        { key: "collector", label: "Người sưu tầm", type: "person", people: ctx.people, hint: "Người sưu tầm mẫu — dùng để lọc" },
    ];
    const rows = list.map((p) => {
        const s = stats.get(p.id), v = videoStats.get(p.id);
        const from = p.launch_date ?? (p.stage_at ? vnDate(p.stage_at) : null);
        return {
            id: p.id, href: `/rnd/${p.id}`, edit: (0, session_1.isRndEditor)(user) || (0, session_1.canApprove)(user, p.team_id) ? "all" : [],
            cells: {
                phase: phaseOf(ctx, p),
                st_code: p.st_code, launch_date: p.launch_date ?? null, review_date: from ? addDays(from, 30) : null, code: p.code,
                images: ctx.imgs(p.image_paths), images_3d: ctx.imgs(ctx.design.get(p.id)?.image_paths ?? []), name: p.name, sold: s?.sold ?? 0, returned: s?.returned ?? 0,
                sold_all: v?.sold ?? 0, videos: v?.videos ?? 0, views: v?.views ?? 0,
                engagement: v?.engagement ?? 0, customer_feedback: p.customer_feedback ?? null, expected_cost: p.expected_cost,
                expected_price: p.expected_price, ads_cost: p.ads_cost ?? null,
                lifecycle_review: p.lifecycle_review ?? null, lifecycle_note: p.lifecycle_note ?? null, win_qty: p.win_qty,
                team_id: p.team_id, collector: p.created_by,
            },
        };
    });
    return { cols, rows };
}
