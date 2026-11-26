"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshSpuSummary = refreshSpuSummary;
exports.checkSpuSummary = checkSpuSummary;
exports.summaryNeedsRefresh = summaryNeedsRefresh;
exports.postsChangedSinceSummary = postsChangedSinceSummary;
exports.scheduleSpuSummaryRefresh = scheduleSpuSummaryRefresh;
require("server-only");
const server_1 = require("next/server");
const admin_1 = require("@/lib/supabase/admin");
const data_1 = require("@/lib/data");
const cache_tags_1 = require("@/lib/cache-tags");
const spu_data_1 = require("@/lib/spu-data");
const video_daily_1 = require("@/lib/video-daily");
const team_lines_1 = require("@/lib/team-lines");
const spu_summary_build_1 = require("@/lib/spu-summary-build");
const system_log_1 = require("@/lib/system-log");
// BẢNG TỔNG HỢP SPU — xem docs/KIEN-TRUC-TONG-HOP-SPU.md (đọc trước khi sửa file này).
// refreshSpuSummary(): tính sẵn từ loadSpuRows() (logic gốc, KHÔNG viết lại) rồi ghi vào sales.spu_summary / spu_sales_daily / spu_video_daily
//   theo từng "lượt" (run_id); ghi xong mới chuyển con trỏ trong sales.spu_summary_meta sang lượt mới, sau đó xoá lượt cũ → người đọc không bao giờ thấy dữ liệu nửa chừng.
// checkSpuSummary(): đối chiếu bảng tổng hợp với kết quả tính trực tiếp (loadSpuRows) để biết hai bên còn khớp không.
const CHUNK = 1000;
const MIGRATION_MSG = "Chưa chạy migration 059 trong Supabase (bảng tổng hợp SPU chưa có)";
const isMissing = (e) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /spu_summary|spu_sales_daily|spu_video_daily/.test(e.message ?? ""));
// Làm mới bảng tổng hợp SPU + ghi nhật ký hệ thống (chạy tự động sau nhập file / đồng bộ / đổi KPI)
async function refreshSpuSummary() {
    const r = await refreshSpuSummaryRun();
    await (0, system_log_1.logSystem)({ kind: "refresh_summary", ok: r.ok, summary: r.ok ? `${r.spus.toLocaleString("vi-VN")} SPU, ${r.salesRows.toLocaleString("vi-VN")} dòng bán, ${r.videoRows.toLocaleString("vi-VN")} dòng video · ${(r.ms / 1000).toFixed(1)} giây` : r.error,
        detail: r.ok ? { spus: r.spus, salesRows: r.salesRows, videoRows: r.videoRows, ms: r.ms } : undefined });
    return r;
}
async function refreshSpuSummaryRun() {
    const t0 = Date.now();
    const db = admin_1.sb.sales();
    // Chưa chạy migration 059 thì dừng NGAY (không tốn một lần nạp dữ liệu nặng rồi mới báo lỗi)
    const probe = await db.from("spu_summary_meta").select("run_id").eq("id", 1).maybeSingle();
    if (probe.error)
        return { ok: false, error: isMissing(probe.error) ? MIGRATION_MSG : probe.error.message };
    const today = (0, data_1.todayVN)();
    void (0, team_lines_1.refreshTeamLines)().catch(() => null); // QLHH: dựng lại bảng tr_lines nếu dữ liệu nguồn đã đổi (migration 093) — chạy song song, không chờ
    // PHA C: video lấy từ sales.video_daily (migration 089 + 090) — không đọc ~32.000 bài đăng. Điều kiện: nạp tăng dần video_daily thành công VÀ hàm fill_summary_videos đã có.
    // Thiếu một trong hai (chưa chạy migration / lỗi) → dùng cách cũ (đọc bài đăng) như trước. Tắt hẳn bằng SPU_VIDEO_SOURCE=posts.
    let useSql = process.env.SPU_VIDEO_SOURCE !== "posts";
    if (useSql) {
        const probe2 = await db.rpc("fill_summary_videos", { p_run: 0 }); // run 0 không có dòng nào → chỉ kiểm tra hàm có tồn tại
        if (probe2.error)
            useSql = false;
    }
    if (useSql) {
        const vd = await (0, video_daily_1.refreshVideoDaily)();
        if (!vd.ok)
            useSql = false;
    }
    const [rows, meta] = useSql ? await (0, spu_data_1.loadSpuRowsLight)().then((x) => [x.rows, x.meta]) : await Promise.all([(0, spu_data_1.loadSpuRows)(), (0, spu_data_1.loadSpuMeta)()]);
    const runId = Date.now(); // mã lượt = thời điểm bắt đầu ghi (tăng dần, không trùng)
    const { summary, sales, videos } = (0, spu_summary_build_1.buildSummaryTables)(rows, today, runId);
    // Không có video nào = tải video bị lỗi (vd timeout lúc đang đồng bộ): KHÔNG ghi đè bảng tổng hợp đang tốt bằng số 0 video (đường SQL kiểm tra sau khi chép video_daily)
    if (!useSql && !videos.length)
        return { ok: false, error: "Không tải được video gắn mã (có thể DB đang bận) — giữ nguyên bảng tổng hợp cũ" };
    const insert = async (table, data) => {
        for (let i = 0; i < data.length; i += CHUNK) {
            const { error } = await db.from(table).insert(data.slice(i, i + CHUNK));
            if (error)
                return error;
        }
        return null;
    };
    let videoRows = videos.length;
    try {
        for (const [table, data] of (useSql ? [["spu_summary", summary], ["spu_sales_daily", sales]] : [["spu_summary", summary], ["spu_sales_daily", sales], ["spu_video_daily", videos]])) {
            const error = await insert(table, data);
            if (error) {
                await Promise.all(["spu_summary", "spu_sales_daily", "spu_video_daily"].map((t) => db.from(t).delete().eq("run_id", runId))); // dọn lượt ghi dở
                return { ok: false, error: isMissing(error) ? MIGRATION_MSG : `Ghi ${table} lỗi: ${error.message}` };
            }
        }
        // Đường SQL: chép video từ sales.video_daily vào lượt vừa ghi + điền video_teams (một lệnh trong database)
        if (useSql) {
            // Chia 6 phần theo băm của mã (migration 091): mỗi lượt gọi xong < 8 giây dù database bận; quá thời gian thì thử lại tối đa 2 lần
            const PARTS = 6;
            let total = 0, failure = "";
            for (let part = 0; part < PARTS && !failure; part++) {
                let res = await db.rpc("fill_summary_videos", { p_run: runId, p_part: part, p_parts: PARTS });
                for (let a = 0; a < 2 && res.error && /timeout/i.test(res.error.message); a++) {
                    await new Promise((r) => setTimeout(r, 1500 * (a + 1)));
                    res = await db.rpc("fill_summary_videos", { p_run: runId, p_part: part, p_parts: PARTS });
                }
                if (res.error)
                    failure = `fill_summary_videos phần ${part + 1}/${PARTS} lỗi: ${res.error.message}`;
                else
                    total += res.data?.rows ?? 0;
            }
            if (failure || !total) {
                await Promise.all(["spu_summary", "spu_sales_daily", "spu_video_daily"].map((t) => db.from(t).delete().eq("run_id", runId))); // dọn lượt ghi dở
                return { ok: false, error: failure || "Bảng video_daily rỗng — giữ nguyên bảng tổng hợp cũ" };
            }
            videoRows = total;
        }
        // Chuyển con trỏ sang lượt mới (một lệnh UPDATE = nguyên tử), rồi xoá các lượt cũ
        const { error: e2 } = await db.from("spu_summary_meta").update({
            run_id: runId, refreshed_at: new Date().toISOString(), duration_ms: Date.now() - t0, spus: summary.length, sales_rows: sales.length, video_rows: videoRows,
            sales_source: meta.salesSource, sales_lines: meta.salesLines, sales_qty: meta.salesQty, sales_from: meta.salesFrom, sales_to: meta.salesTo, skus: meta.skus, team_qty: meta.teamQty,
        }).eq("id", 1);
        if (e2)
            return { ok: false, error: isMissing(e2) ? MIGRATION_MSG : `Chuyển lượt lỗi: ${e2.message}` };
        await Promise.all(["spu_summary", "spu_sales_daily", "spu_video_daily"].map((t) => db.from(t).delete().neq("run_id", runId)));
    }
    catch (e) {
        const err = e;
        return { ok: false, error: isMissing(err) ? MIGRATION_MSG : err.message ?? "Lỗi không rõ" };
    }
    (0, cache_tags_1.bustSoft)(cache_tags_1.TAG.spuData); // bảng tổng hợp vừa đổi lượt → bỏ kết quả hàm SQL đã lưu đệm (spu_dash) để Dashboard thấy số mới
    // Làm nóng đệm để người mở trang đầu tiên sau mỗi lần cập nhật (nhập tồn kho / số bán, đồng bộ traffic) không phải chờ: cờ Win cuốn chiếu + số liệu SPU của Dashboard (spu_dash).
    // CHỈ bộ lọc MẶC ĐỊNH — toàn công ty, không lọc Team, kỳ 30 ngày, thị trường Trong nước (mặc định của cả hai trang). Chọn Team / đổi kỳ / chọn Nước ngoài hay Tất cả thì lần đầu vẫn chậm (cố ý, để giảm tải DB).
    // Tham số phải GIỐNG HỆT trang Dashboard truyền vào (rnd/dashboard/page.tsx) thì mới trúng khoá đệm.
    try {
        const [{ loadSpuRules }, { loadRollingWinByMarket }, { warmDashSpu }, { loadChannelMarkets }, { getAccounts, parseFilters, daysBetween, todayVN }] = await Promise.all([Promise.resolve().then(() => __importStar(require("@/lib/spu-rules"))), Promise.resolve().then(() => __importStar(require("@/lib/spu-winflags"))), Promise.resolve().then(() => __importStar(require("@/lib/spu-dash"))), Promise.resolve().then(() => __importStar(require("@/lib/channel-market"))), Promise.resolve().then(() => __importStar(require("@/lib/data")))]);
        const [rules, markets, accounts] = await Promise.all([loadSpuRules(), loadChannelMarkets(), getAccounts()]);
        const poolIds = accounts.map((a) => a.id);
        const win = await loadRollingWinByMarket({ pageIds: null, poolIds, markets, market: "vn", channels: [], rules: rules.win });
        const f = parseFilters({}), today = todayVN();
        await warmDashSpu({
            today, days: Math.max(1, daysBetween(f.from, f.to)), endAge: Math.max(0, daysBetween(f.to, today) - 1), teams: [],
            pageIds: poolIds.filter((id) => (markets[id] ?? "vn") === "vn"), rules, limit: 8, win,
        });
    }
    catch { /* không làm hỏng lần làm mới */ }
    return { ok: true, runId, spus: summary.length, salesRows: sales.length, videoRows, ms: Date.now() - t0 };
}
// Đối chiếu tổng: số SPU, tổng tồn, tổng có thể bán, tổng bán 30 ngày, tổng dòng bán theo ngày, số video, tổng lượt xem
async function checkSpuSummary() {
    const db = admin_1.sb.sales();
    try {
        const [rows, { data: m, error: em }, sum, sales, vids] = await Promise.all([
            (0, spu_data_1.loadSpuRows)(),
            db.from("spu_summary_meta").select("refreshed_at").eq("id", 1).maybeSingle(),
            (0, admin_1.fetchAll)((a, b) => db.from("v_spu_summary").select("stock_total, avail_by, sold30").order("code").range(a, b)),
            (0, admin_1.fetchAll)((a, b) => db.from("v_spu_sales_daily").select("qty").order("code").order("day").order("team").range(a, b)),
            (0, admin_1.fetchAll)((a, b) => db.from("v_spu_video_daily").select("videos, views").order("code").order("day").order("channel_id").range(a, b)),
        ]);
        if (em)
            return { error: isMissing(em) ? MIGRATION_MSG : em.message };
        const n = (v) => Number(v ?? 0);
        const lines = [
            ["Số SPU", rows.length, sum.length],
            ["Tổng tồn kho", rows.reduce((a, r) => a + Object.values(r.stockBy).reduce((x, y) => x + y, 0), 0), sum.reduce((a, r) => a + n(r.stock_total), 0)],
            ["Tổng có thể bán", rows.reduce((a, r) => a + Object.values(r.availBy ?? {}).reduce((x, y) => x + y, 0), 0), sum.reduce((a, r) => a + Object.values(r.avail_by ?? {}).reduce((x, y) => x + n(y), 0), 0)],
            ["Tổng bán 30 ngày", rows.reduce((a, r) => a + n(r.sold30), 0), sum.reduce((a, r) => a + n(r.sold30), 0)],
            ["Tổng số bán theo ngày", rows.reduce((a, r) => a + r.sales.reduce((x, l) => x + l.qty, 0), 0), sales.reduce((a, r) => a + n(r.qty), 0)],
            ["Số video", rows.reduce((a, r) => a + r.vids.length, 0), vids.reduce((a, r) => a + n(r.videos), 0)],
            ["Tổng lượt xem video", rows.reduce((a, r) => a + r.vids.reduce((x, v) => x + v.views, 0), 0), vids.reduce((a, r) => a + n(r.views), 0)],
        ].map(([name, live, summary]) => ({ name: name, live: live, summary: summary, ok: live === summary }));
        return { ok: lines.every((l) => l.ok), refreshedAt: m?.refreshed_at ?? null, lines };
    }
    catch (e) {
        const err = e; // lỗi của PostgREST là object thường, không phải Error
        return { error: isMissing(err) ? MIGRATION_MSG : err.message ?? "Lỗi không rõ" };
    }
}
// "CHỐT" sau đồng bộ (workflow summary.yml gọi /api/cron/spu-summary?ifchanged=1 sau mỗi lần đồng bộ): làm mới nếu bảng tổng hợp CŨ HƠN dữ liệu nguồn — chưa từng làm mới, bài gắn mã đã đổi,
// hoặc một bước đồng bộ nguồn (danh mục / số bán / tách hashtag / video API) hoàn tất SAU lần làm mới cuối. Đồng bộ chạy trọn vẹn thì tự nó đã làm mới (refreshed_at muộn hơn các bước) → bỏ qua, không tốn thêm CPU database.
// Lý do có: đồng bộ bị cắt giữa chừng (hết thời gian) thì lệnh làm mới ở cuối không bao giờ chạy — 21/11/2026 mã mới L0051 hiện 0 view vì lý do này.
async function summaryNeedsRefresh() {
    try {
        const { data: meta } = await admin_1.sb.sales().from("spu_summary_meta").select("refreshed_at").limit(1).maybeSingle();
        if (!meta?.refreshed_at)
            return { yes: true, reason: "chưa làm mới lần nào" };
        if (await postsChangedSinceSummary())
            return { yes: true, reason: "bài gắn mã đã đổi kể từ lần làm mới" };
        const { data: runs } = await admin_1.sb.core().from("sync_runs").select("job").in("job", ["catalog", "sales", "retag", "videos_api"]).eq("status", "success").gt("finished_at", meta.refreshed_at).limit(1);
        if (runs?.length)
            return { yes: true, reason: `bước đồng bộ "${runs[0].job}" xong sau lần làm mới` };
        return { yes: false, reason: "chưa có gì đổi kể từ lần làm mới" };
    }
    catch {
        return { yes: true, reason: "không kiểm tra được nên làm mới cho chắc" };
    }
}
// Đồng bộ chỉ cần làm mới bảng tổng hợp khi video / bài gắn mã THẬT SỰ có thay đổi kể từ lần làm mới trước
// (bài đăng nào được ghi lại đều có updated_at mới — trigger touch_updated_at). Không đọc được thì coi như có đổi (an toàn: cứ làm mới).
async function postsChangedSinceSummary() {
    try {
        const { data: meta, error: mErr } = await admin_1.sb.sales().from("spu_summary_meta").select("refreshed_at").limit(1).maybeSingle();
        if (mErr || !meta?.refreshed_at)
            return true;
        const { data: last, error: pErr } = await admin_1.sb.social().from("posts").select("updated_at")
            .in("kind", ["video", "reel"]).neq("product_codes", "{}").order("updated_at", { ascending: false }).limit(1).maybeSingle();
        if (pErr)
            return true;
        return !!last?.updated_at && Date.parse(last.updated_at) > Date.parse(meta.refreshed_at);
    }
    catch {
        return true;
    }
}
// Lên lịch làm mới ở NỀN (không làm chậm thao tác của người dùng). Gọi sau mọi thay đổi dữ liệu nguồn: nhập file, đồng bộ, sửa KPI.
// Nhiều lần gọi dồn dập (một lần nhập gọi vài chỗ) gộp thành: chạy 1 lần, và nếu trong lúc chạy có yêu cầu mới thì chạy bù đúng 1 lần nữa.
// SPU_SUMMARY_REFRESH=off để tắt (khi cần).
let running = false, again = false;
function scheduleSpuSummaryRefresh() {
    if (process.env.SPU_SUMMARY_REFRESH === "off")
        return;
    const run = async () => {
        if (running) {
            again = true;
            return;
        }
        running = true;
        try {
            do {
                again = false;
                const r = await refreshSpuSummary();
                if (!r.ok)
                    console.error("làm mới bảng tổng hợp SPU lỗi:", r.error);
            } while (again);
        }
        finally {
            running = false;
        }
    };
    try {
        (0, server_1.after)(run);
    }
    catch {
        void run();
    } // ngoài ngữ cảnh yêu cầu (script, một số đường đồng bộ) thì chạy thẳng
}
