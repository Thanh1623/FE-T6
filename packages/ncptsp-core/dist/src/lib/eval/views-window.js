"use strict";
// Lượt xem / người xem / tương tác của 1 bài TRONG MỘT KHOẢNG NGÀY — hàm thuần (không đọc DB), dùng chung máy chủ + kiểm thử.
//
// Facebook / TikTok chỉ trả số CỘNG DỒN của bài, nên:
//   • bài ĐĂNG TRONG kỳ: toàn bộ số cộng dồn tính đến cuối kỳ (mốc đầu = 0);
//   • bài ĐĂNG TRƯỚC kỳ: số cộng dồn cuối kỳ − số cộng dồn ngay trước kỳ — cần ảnh chụp (social.post_daily). Chưa có ảnh chụp đủ gần → null
//     ("chưa đủ lịch sử"), KHÔNG đoán (tránh coi cả số tích luỹ nhiều tháng là "tăng trong 7 ngày").
// Lai (hybrid): bài mới luôn có số; bài cũ có số khi đã chụp đủ lịch sử, thiếu thì bỏ qua và được đếm vào `unknown`.
Object.defineProperty(exports, "__esModule", { value: true });
exports.emptyTotals = exports.shiftDay = void 0;
exports.gainInRange = gainInRange;
exports.addGain = addGain;
const DAY = 86_400_000;
const shiftDay = (d, n) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
exports.shiftDay = shiftDay;
const gapDays = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const sub = (a, b) => ({
    views: Math.max(0, a.views - b.views), viewers: Math.max(0, a.viewers - b.viewers),
    reactions: Math.max(0, a.reactions - b.reactions), clicks: Math.max(0, a.clicks - b.clicks),
});
const ZERO = { views: 0, viewers: 0, reactions: 0, clicks: 0 };
function gainInRange(a) {
    const lag = a.maxLag ?? 4;
    if (a.pubDay > a.to)
        return null; // đăng sau kỳ
    // Mốc cuối kỳ: kỳ chạm hôm nay → số hiện tại; kỳ đã qua → ảnh chụp gần nhất (không có thì xấp xỉ bằng số hiện tại, ghi exact=false)
    let end, exact = true;
    if (a.to >= a.today)
        end = a.cur;
    else if (a.end && gapDays(a.end.day, a.to) <= lag)
        end = a.end;
    else {
        end = a.cur;
        exact = false;
    }
    // Mốc đầu kỳ
    if (a.pubDay >= a.from)
        return { ...sub(end, ZERO), exact };
    const base = a.base && gapDays(a.base.day, (0, exports.shiftDay)(a.from, -1)) <= lag ? a.base : null;
    if (!base)
        return null;
    return { ...sub(end, base), exact };
}
const emptyTotals = () => ({ ...ZERO, posts: 0, videos: 0, unknown: 0, approx: 0 });
exports.emptyTotals = emptyTotals;
// Cộng dồn kết quả của nhiều bài. g = null → bài cũ chưa đủ lịch sử (đếm vào unknown)
function addGain(t, g, opts) {
    if (opts.published) {
        t.posts += 1;
        if (opts.video)
            t.videos += 1;
    }
    if (!g) {
        t.unknown += 1;
        return;
    }
    t.views += g.views;
    t.viewers += g.viewers;
    t.reactions += g.reactions;
    t.clicks += g.clicks;
    if (!g.exact)
        t.approx += 1;
}
