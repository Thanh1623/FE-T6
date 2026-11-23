// Kiểm thử bộ chấm KPI: node scripts/test-rules.mts
import assert from "node:assert/strict";
import { buildMetrics, checkRules, decideAuto, groupStatus, isWinResult, rulesPass } from "../src/lib/eval/rules.ts";

const base = { views: 0, viewers: 0, reactions: 0, clicks: 0, qty_net: 0, posts: 1, videos: 1 };
const sales = [{ metric: "qty_net", op: ">=", value: 20 }, { metric: "conversion", op: ">=", value: 1 }] as const;
const traffic = [{ metric: "views", op: ">=", value: 5000 }, { metric: "viewers", op: ">=", value: 3000 }] as const;
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("✓", name); };

t("tỉ lệ = null khi chưa có người xem (không phải 0%)", () => {
  const m = buildMetrics(base);
  assert.equal(m.conversion, null); assert.equal(m.ctr, null);
  assert.equal(checkRules([...sales], m)[1].pass, false);
});
t("chuyển đổi = SL ÷ người xem × 100", () => {
  assert.equal(buildMetrics({ ...base, viewers: 2000, qty_net: 30 }).conversion, 1.5);
});
t("bán đạt KPI → WIN, kể cả khi traffic chưa đạt và còn trong cửa sổ", () => {
  const m = buildMetrics({ ...base, views: 3000, viewers: 2000, qty_net: 30 });
  const sp = rulesPass(checkRules([...sales], m), "all"), tp = rulesPass(checkRules([...traffic], m), "all");
  assert.equal(sp, true); assert.equal(tp, false);
  assert.equal(decideAuto(sp, tp, false), "win");
});
t("chỉ đạt traffic (bán chưa đạt) → WIN TRAFFIC sớm", () => {
  const m = buildMetrics({ ...base, views: 9000, viewers: 4000, qty_net: 2 });
  const sp = rulesPass(checkRules([...sales], m), "all"), tp = rulesPass(checkRules([...traffic], m), "all");
  assert.equal(sp, false); assert.equal(tp, true);
  assert.equal(decideAuto(sp, tp, false), "win_traffic");
});
t("WIN TRAFFIC đạt thêm bán → nâng lên WIN; không còn WIN SP", () => {
  assert.equal(decideAuto(false, true, false), "win_traffic");
  assert.equal(decideAuto(true, true, false), "win");
  assert.equal(decideAuto(true, false, true), "win");   // bán đạt thì WIN kể cả hết cửa sổ
  for (const [sp, tp, over] of [[true, true, false], [true, false, false], [false, true, false], [false, false, false], [false, false, true]] as const)
    assert.notEqual(decideAuto(sp, tp, over), "win_sp");
});
t("chưa đạt, còn trong cửa sổ → ĐANG TEST, không FAIL", () => assert.equal(decideAuto(false, false, false), "testing"));
t("hết cửa sổ, không đạt vế nào → FAIL; đã win traffic thì không rơi về FAIL", () => {
  assert.equal(decideAuto(false, false, true), "fail");
  assert.equal(decideAuto(false, true, true), "win_traffic");
});
t("isWinResult nhận win / win_traffic (và win_sp cũ trong dữ liệu đã lưu)", () => {
  assert.ok(isWinResult("win") && isWinResult("win_traffic") && isWinResult("win_sp"));
  assert.ok(!isWinResult("fail") && !isWinResult("testing") && !isWinResult(null));
});
t("'any' đạt khi 1 điều kiện đạt", () => {
  const m = buildMetrics({ ...base, views: 6000, viewers: 100 });
  assert.equal(rulesPass(checkRules([...traffic], m), "any"), true);
  assert.equal(rulesPass(checkRules([...traffic], m), "all"), false);
});
t("trạng thái nhóm: partial / weak / not_enough", () => {
  const half = checkRules([...traffic], buildMetrics({ ...base, views: 3000, viewers: 1800 }));
  assert.equal(groupStatus(half, "all", true), "partial");
  const low = checkRules([...traffic], buildMetrics({ ...base, views: 500, viewers: 200 }));
  assert.equal(groupStatus(low, "all", true), "weak");
  assert.equal(groupStatus(low, "all", false), "not_enough");
});
t("điều kiện ≤ (VD tỉ lệ hoàn ≤)", () => {
  const c = checkRules([{ metric: "views", op: "<=", value: 100 }], buildMetrics({ ...base, views: 50 }));
  assert.equal(c[0].pass, true);
});
console.log(`\n${n} ca kiểm thử đạt`);

// ---------- Bộ tách hashtag ----------
const { parseTags, categoryOf, isTestCode } = await import("../src/lib/tags.ts");
const known = new Set(["D0008", "MD0033", "K0002", "L0035", "C500021"]);
t("tách đủ 4 loại tag theo caption mẫu", () => {
  const r = parseTags(["k301", "a1", "c", "md0033", "trangsuc"], known);
  assert.deepEqual(r, { product_codes: ["MD0033"], unknown_codes: [], content_line: "A1", concept: "old", staff_code: "K301" });
});
t("#K301 là nhân sự, #K0002 là mã kiềng", () => {
  const r = parseTags(["k301", "k0002"], known);
  assert.equal(r.staff_code, "K301"); assert.deepEqual(r.product_codes, ["K0002"]);
});
t("mã dạng hợp lệ nhưng chưa khai báo → unknown, không phải mã SP", () => {
  const r = parseTags(["rd001", "d0008", "moissanite"], known);
  assert.deepEqual(r.product_codes, ["D0008"]); assert.deepEqual(r.unknown_codes, ["RD001"]);
});
t("#M = concept mới; #a6 không phải tuyến; #C500021 là mã charm", () => {
  const r = parseTags(["m", "a6", "c500021"], known);
  assert.equal(r.concept, "new"); assert.equal(r.content_line, null); assert.deepEqual(r.product_codes, ["C500021"]);
});
t("nhiều mã trong 1 bài, bỏ trùng", () => {
  assert.deepEqual(parseTags(["d0008", "l0035", "d0008"], known).product_codes, ["D0008", "L0035"]);
});
t("loại hàng theo chữ cái đầu", () => {
  const p = { M: "Mặt dây", D: "Dây chuyền", K: "Kiềng" };
  assert.equal(categoryOf("MD0033", p), "Mặt dây"); assert.equal(categoryOf("K0002", p), "Kiềng"); assert.equal(categoryOf("X1234", p), null);
});
t("#MD0002 gõ thừa M → D0002 khi chỉ D0002 có thật", () => {
  const k = new Set(["D0002", "MD0033"]);
  const r = parseTags(["md0002", "md0033"], k);
  assert.deepEqual(r.product_codes, ["D0002", "MD0033"]); assert.deepEqual(r.unknown_codes, []);
});
t("#MD0002 và #D0002 cùng bài → 1 mã; không có bản bỏ M → vẫn là mã lạ", () => {
  assert.deepEqual(parseTags(["md0002", "d0002"], new Set(["D0002"])).product_codes, ["D0002"]);
  assert.deepEqual(parseTags(["md0099"], new Set(["D0002"])).unknown_codes, ["MD0099"]);
});
t("mã test T + loại hàng + số: hợp lệ dù chưa có trên Sapo / R&D", () => {
  const r = parseTags(["tn0001", "tb0003", "tk0004", "k301"], known);
  assert.deepEqual(r.product_codes, ["TN0001", "TB0003", "TK0004"]); assert.deepEqual(r.unknown_codes, []); assert.equal(r.staff_code, "K301");
  assert.equal(isTestCode("TN0001"), true); assert.equal(isTestCode("D0008"), false);
});
// ---------- Sản phẩm / video tiềm năng ----------
const { productPotential, videoPotential, videoThresholds } = await import("../src/lib/eval/potential.ts");
const ev = (o: Record<string, unknown>) => ({ result: "testing", traffic_status: "weak", sales_status: "weak", forecast: null, ...o }) as never;
t("sản phẩm tiềm năng: dự báo WIN = cao; gần đạt 1 vế = vừa; WIN TRAFFIC + bán gần đạt = cao", () => {
  assert.equal(productPotential(ev({ forecast: { predicted: "win" } }))?.level, "high");
  assert.equal(productPotential(ev({ traffic_status: "partial" }))?.level, "mid");
  assert.equal(productPotential(ev({ result: "win_traffic", sales_status: "partial" }))?.level, "high");
});
t("không tiềm năng: FAIL, đã WIN đủ, hoặc đang test mà cả 2 vế yếu", () => {
  assert.equal(productPotential(ev({ result: "fail", traffic_status: "partial" })), null);
  assert.equal(productPotential(ev({ result: "win", sales_status: "pass" })), null);
  assert.equal(productPotential(ev({})), null);
});
t("video tiềm năng: top 25% lượt xem (ngưỡng theo tập video), CTR cao khi đủ xem", () => {
  const vids = Array.from({ length: 20 }, (_, i) => ({ views: 1000 + i * 1000, ctr: 1 }));
  const th = videoThresholds(vids);
  assert.ok(videoPotential({ views: 20000, ctr: 1 }, th)); assert.equal(videoPotential({ views: 2000, ctr: 1 }, th), null);
  assert.equal(videoPotential({ views: 100, ctr: 9 }, th), null);   // CTR cao nhưng quá ít lượt xem → không tính
});
// ---------- TikTok: số liệu ngày = chênh lệch cộng dồn ----------
const { dailyDelta, followDelta } = await import("../src/lib/tiktok/delta.ts");
t("TikTok: chỉ tính phần tăng thêm; video cũ lần đầu thấy chỉ làm mốc; video mới (<48h) tính toàn bộ", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  const prev = new Map([["tt:1", { views: 100, reactions: 10, comments: 1, shares: 1 }]]);
  const vids = [
    { id: "tt:1", createdSec: now / 1000 - 5 * 86400, views: 150, reactions: 12, comments: 1, shares: 3 },   // +50 xem, +4 tương tác
    { id: "tt:2", createdSec: now / 1000 - 30 * 86400, views: 9999, reactions: 99, comments: 9, shares: 9 },  // cũ, chưa có mốc → bỏ
    { id: "tt:3", createdSec: now / 1000 - 3600, views: 400, reactions: 20, comments: 2, shares: 1 },         // mới → tính hết
  ];
  const d = dailyDelta(prev, vids, now);
  assert.equal(d.views, 450); assert.equal(d.engagements, 4 + 23);
});
t("TikTok: số liệu giảm (xoá bình luận…) không tạo số âm; follow tăng / giảm", () => {
  const now = Date.now();
  const d = dailyDelta(new Map([["a", { views: 10, reactions: 5, comments: 5, shares: 5 }]]), [{ id: "a", createdSec: now / 1000, views: 8, reactions: 1, comments: 1, shares: 1 }], now);
  assert.deepEqual(d, { views: 0, engagements: 0 });
  assert.deepEqual(followDelta(100, 130), { gained: 30, lost: 0 }); assert.deepEqual(followDelta(100, 90), { gained: 0, lost: 10 });
  assert.deepEqual(followDelta(null, 90), { gained: 0, lost: 0 });
});
const { normTikTokName, TT_NAME_PREFIX } = await import("../src/lib/tiktok/name.ts");
t("tên tài khoản TikTok: chuẩn hoá để ghép tag tiktok_business_<tên> với tên kênh", () => {
  assert.equal(normTikTokName("  HuyK -  Thợ Chế Tác "), "huyk - thợ chế tác");
  assert.equal(normTikTokName("HuyK - Thợ Chế Tác"), normTikTokName("huyk - thợ  chế tác"));
  assert.equal(TT_NAME_PREFIX, "ttn:");
});
const { trendOf } = await import("../src/lib/trend.ts");
t("xu hướng view: tăng thêm mỗi ngày = chênh lệch cộng dồn; tăng / giảm / ổn định; thiếu dữ liệu", () => {
  const snaps = (v: number[]) => v.map((views, i) => ({ date: `2026-10-${String(1 + i).padStart(2, "0")}`, views }));
  const up = trendOf(snaps([0, 10, 30, 70, 150, 310]));   // gain 10,20,40,80,160
  assert.equal(up.direction, "up"); assert.equal(up.days.length, 5); assert.equal(up.days.at(-1)!.gain, 160);
  const down = trendOf(snaps([0, 160, 240, 280, 300, 310]));
  assert.equal(down.direction, "down");
  assert.equal(trendOf(snaps([0, 100, 200, 300, 400])).direction, "flat");
  assert.equal(trendOf(snaps([5])).direction, "none"); assert.equal(trendOf([]).days.length, 0);
  // thiếu 1 ngày đồng bộ: chia đều phần tăng cho các ngày thiếu
  const gap = trendOf([{ date: "2026-10-01", views: 0 }, { date: "2026-10-03", views: 100 }]);
  assert.deepEqual(gap.days.map((d) => d.gain), [50, 50]);
});

// ---------- Lượt xem trong kỳ (lib/eval/views-window) ----------
import { addGain, emptyTotals, gainInRange } from "../src/lib/eval/views-window.ts";
const c = (views: number, viewers = 0) => ({ views, viewers, reactions: 0, clicks: 0 });
const snap = (day: string, views: number) => ({ day, ...c(views) });
t("bài đăng TRONG kỳ: lấy cả số cộng dồn (mốc đầu = 0)", () => {
  const g = gainInRange({ pubDay: "2026-10-05", from: "2026-10-03", to: "2026-10-09", today: "2026-10-09", cur: c(500) })!;
  assert.equal(g.views, 500); assert.equal(g.exact, true);
});
t("video đăng từ lâu bỗng nổi: lượt xem trong kỳ = cuối kỳ − trước kỳ", () => {
  const g = gainInRange({ pubDay: "2026-07-01", from: "2026-10-03", to: "2026-10-09", today: "2026-10-09",
    cur: c(15_000), base: snap("2026-10-02", 3_000) })!;
  assert.equal(g.views, 12_000);
});
t("bài cũ chưa có ảnh chụp trước kỳ → null (không coi cả số tích luỹ là tăng trong kỳ)", () => {
  assert.equal(gainInRange({ pubDay: "2026-07-01", from: "2026-10-03", to: "2026-10-09", today: "2026-10-09", cur: c(15_000) }), null);
});
t("ảnh chụp trước kỳ quá cũ (> 4 ngày) bị bỏ", () => {
  assert.equal(gainInRange({ pubDay: "2026-07-01", from: "2026-10-03", to: "2026-10-09", today: "2026-10-09", cur: c(15_000), base: snap("2026-09-20", 3_000) }), null);
  assert.equal(gainInRange({ pubDay: "2026-07-01", from: "2026-10-03", to: "2026-10-09", today: "2026-10-09", cur: c(15_000), base: snap("2026-09-30", 3_000) })!.views, 12_000);
});
t("kỳ đã qua: dùng ảnh chụp cuối kỳ; thiếu thì xấp xỉ bằng số hiện tại (exact = false)", () => {
  const ok = gainInRange({ pubDay: "2026-07-01", from: "2026-09-01", to: "2026-09-07", today: "2026-10-09", cur: c(15_000), base: snap("2026-08-31", 1_000), end: snap("2026-09-07", 4_000) })!;
  assert.equal(ok.views, 3_000); assert.equal(ok.exact, true);
  const approx = gainInRange({ pubDay: "2026-09-02", from: "2026-09-01", to: "2026-09-07", today: "2026-10-09", cur: c(15_000) })!;
  assert.equal(approx.views, 15_000); assert.equal(approx.exact, false);
});
t("bài đăng sau kỳ không tính; số giảm không âm", () => {
  assert.equal(gainInRange({ pubDay: "2026-10-10", from: "2026-10-03", to: "2026-10-09", today: "2026-10-09", cur: c(5) }), null);
  assert.equal(gainInRange({ pubDay: "2026-07-01", from: "2026-10-03", to: "2026-10-09", today: "2026-10-09", cur: c(100), base: snap("2026-10-02", 300) })!.views, 0);
});
t("cộng dồn nhiều bài: đếm bài đăng trong kỳ, video, bài cũ chưa đủ lịch sử", () => {
  const tt = emptyTotals();
  addGain(tt, { ...c(100), exact: true }, { published: true, video: true });
  addGain(tt, { ...c(50), exact: true }, { published: false, video: true });
  addGain(tt, null, { published: false, video: true });
  assert.deepEqual([tt.views, tt.posts, tt.videos, tt.unknown], [150, 1, 1, 1]);
});
console.log(`${n} ca kiểm thử đạt (gồm bộ tách hashtag)`);
