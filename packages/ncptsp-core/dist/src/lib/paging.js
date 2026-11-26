"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAGE_SIZE = void 0;
exports.withRetry = withRetry;
exports.fetchAll = fetchAll;
exports.fetchAllByKey = fetchAllByKey;
// Đọc hết các trang kết quả của PostgREST (giới hạn 1.000 dòng / lượt). Tách riêng khỏi supabase/admin để kiểm thử độc lập (scripts/test-paging.mts).
exports.PAGE_SIZE = 1000;
// Đọc hết mọi trang kết quả (PostgREST giới hạn 1000 dòng/lần). Tải song song từng lượt PARALLEL trang (nhanh hơn ~3 lần so với từng trang một); gặp trang chưa đầy là hết
const PARALLEL = 6;
// Database đang bận (đồng bộ, làm mới bảng tổng hợp chạy cùng lúc) có thể huỷ truy vấn: "canceling statement due to statement timeout" (mã 57014) → thử lại trang đó
// tối đa 3 lần, nghỉ dần, thay vì làm hỏng cả bước đồng bộ.
const isTimeout = (e) => !!e && typeof e === "object" && (e.code === "57014" || /statement timeout/i.test(String(e.message ?? "")));
async function withRetry(run) {
    let res = await run();
    for (let n = 1; n <= 3 && res.error && isTimeout(res.error); n++) {
        await new Promise((r) => setTimeout(r, 1500 * n));
        res = await run();
    }
    return res;
}
const PAGE = exports.PAGE_SIZE;
async function fetchAll(build) {
    // Trang đầu chạy RIÊNG: bảng nhỏ (< 1.000 dòng, đa số các lần gọi) chỉ tốn 1 lượt thay vì PARALLEL lượt — trước đây 5 trang rỗng vẫn mỗi trang
    // một lượt gọi hàm + một giao dịch PostgREST + một lần quét DB. Bảng lớn chỉ tốn thêm đúng 1 lượt chờ ở đầu.
    const first = await withRetry(() => build(0, PAGE - 1));
    if (first.error)
        throw first.error;
    const out = [...(first.data ?? [])];
    if (!first.data || first.data.length < PAGE)
        return out;
    for (let i = PAGE;; i += PAGE * PARALLEL) {
        const batch = await Promise.all(Array.from({ length: PARALLEL }, (_, k) => withRetry(() => build(i + k * PAGE, i + k * PAGE + PAGE - 1))));
        for (const { data, error } of batch) {
            if (error)
                throw error;
            out.push(...(data ?? []));
            if (!data || data.length < PAGE)
                return out;
        }
    }
}
// Đọc hết theo KHOÁ thay cho OFFSET. OFFSET sâu bắt DB quét rồi bỏ mọi dòng phía trước nên đọc cả bảng lớn tốn bình phương số trang
// (đo trên social.posts: trang thứ 21 = 6,6 giây; cùng 1.000 dòng theo khoá = 0,16 giây; plan quét chỉ mục đúng 1.000 dòng).
// `build(after, limit)`: dựng truy vấn đã SẮP THEO KHOÁ (rồi theo cột phụ cho ổn định thứ tự), nếu after != null thì lọc `khoá > after`,
// và `.limit(limit)`. Lọc / sắp xếp phải gọi theo thứ tự: select → bộ lọc → order → limit.
// Khoá không cần duy nhất, nhưng mỗi nhóm trùng khoá phải NHỎ HƠN 1 trang: nhóm cuối của mỗi trang bị bỏ rồi đọc lại trọn ở trang kế
// (không sót, không trùng). Nhóm ≥ 1 trang (hiện không xảy ra: ≤ 4 bài cùng thời điểm) → không tiến được → chạy `fallback` (đường OFFSET cũ),
// tuyệt đối không trả thiếu dòng. Đọc tuần tự (con trỏ phụ thuộc trang trước) nhưng mỗi trang rẻ nên tổng thời gian không chậm hơn.
async function fetchAllByKey(build, keyOf, fallback) {
    const out = [];
    let after = null;
    for (;;) {
        const cur = after;
        const res = await withRetry(() => build(cur, PAGE));
        if (res.error)
            throw res.error;
        const rows = res.data ?? [];
        if (rows.length < PAGE) {
            out.push(...rows);
            return out;
        }
        const lastKey = keyOf(rows[rows.length - 1]);
        let keep = rows.length;
        while (keep > 0 && keyOf(rows[keep - 1]) === lastKey)
            keep--; // bỏ nhóm cuối (có thể còn dở)
        if (keep === 0)
            return fallback();
        for (let i = 0; i < keep; i++)
            out.push(rows[i]);
        after = keyOf(rows[keep - 1]);
    }
}
